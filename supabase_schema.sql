-- =========================================================
-- 手抄聖經系統 - Supabase PostgreSQL 資料庫綱要 (Schema)
-- 支援 $0 免費方案、Row-Level Security 與交易鎖定
--
-- 本檔案可重複執行（皆使用 IF NOT EXISTS / OR REPLACE）。
-- 請於 Supabase Dashboard → SQL Editor 貼上整段執行一次即可。
-- =========================================================

-- 1. 建立認領主表 (Claims)
--    只有「已確認 (confirmed)」的認領才會寫進這張表；
--    尚未點信確認的 pending 狀態不落地，仍沿用無狀態 Token 設計。
CREATE TABLE IF NOT EXISTS public.claims (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  token TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  email TEXT,                            -- 選填：留空代表該會友之後無法自助查詢/取消，只能靠 Token 連結
  chapters TEXT[] NOT NULL,              -- 例如: ARRAY['gen_1', 'gen_2']（bookId 一律小寫）
  fellowship TEXT,                       -- 選填：所屬團契，僅供後台辨識/搜尋用，不參與任何邏輯判斷
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),   -- 原始送出認領申請的時間
  confirmed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), -- 認領確認時間（單步驟流程下與 created_at 幾乎同時）
  is_submitted BOOLEAN NOT NULL DEFAULT FALSE,
  submitted_at TIMESTAMPTZ,
  reminder_count INT NOT NULL DEFAULT 0,
  last_reminded_at TIMESTAMPTZ,
  canceled_at TIMESTAMPTZ                -- 非 NULL 代表已被自助退選或後台全釋出（見下方說明）
);

-- 舊版本表格若已存在但沒有這些欄位，補上去（重複執行安全）
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS canceled_at TIMESTAMPTZ;
ALTER TABLE public.claims ADD COLUMN IF NOT EXISTS fellowship TEXT;
-- Email 改為選填：若既有資料庫的 email 欄位還是 NOT NULL，這裡放寬限制（重複執行安全）
ALTER TABLE public.claims ALTER COLUMN email DROP NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claims_email_lower ON public.claims (lower(email));

-- 2. 建立個別章節鎖定表 (確保每個章節全球唯一不可重複認領)
--    chapter_key 為 PRIMARY KEY，即使應用層邏輯有 bug，
--    資料庫層仍會用 UNIQUE constraint 擋下任何重複插入。
CREATE TABLE IF NOT EXISTS public.claimed_chapters (
  chapter_key TEXT PRIMARY KEY,          -- 例如: 'gen_1'
  claim_id UUID NOT NULL REFERENCES public.claims(id) ON DELETE CASCADE,
  claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_submitted BOOLEAN NOT NULL DEFAULT FALSE, -- 該「一章」的紙本稿紙是否已經繳交（顆粒度為章，非整筆認領）
  submitted_at TIMESTAMPTZ
);

-- 舊版本表格若已存在但沒有這兩欄，補上去（重複執行安全）
ALTER TABLE public.claimed_chapters ADD COLUMN IF NOT EXISTS is_submitted BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE public.claimed_chapters ADD COLUMN IF NOT EXISTS submitted_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_claimed_chapters_claim_id ON public.claimed_chapters (claim_id);

-- 註：claims.is_submitted / claims.submitted_at 這兩欄（見上方 claims 表定義）是舊版「整筆認領一起繳交」
-- 的殘留欄位，自後台新增「章節收件」頁籤後已不再是真相來源，一律改看 claimed_chapters.is_submitted
-- （見 api/_supabase.js 的 hydrateClaim）。保留舊欄位不刪，純粹是避免無謂的破壞性 migration；
-- 新程式碼不應該再讀寫這兩欄。

-- 3. 確認認領：原子交易 (Atomic Transaction to Prevent Race Conditions)
--    在同一個資料庫交易內完成「上限檢查 → 章節搶占檢查 → 寫入 claims →
--    寫入 claimed_chapters」，任何一步失敗全部復原（ROLLBACK）。
--    claimed_chapters 的 PRIMARY KEY 是最後一道防線：即使兩個請求
--    幾乎同時通過了上面的檢查，INSERT 階段仍只有一個會成功。
--    註：不做「同一人限認領一次」的防呆（不管用 Email 或姓名比對）——
--    活動只辦三週、規模小，這類防呆的誤傷成本（同名同姓被誤擋）比漏防的
--    成本還高，刻意不做，只保留「單次最多 3 章」的硬限制。
--
--    這個函式曾經改過參數列（加入 p_fellowship）。PostgreSQL 的
--    CREATE OR REPLACE FUNCTION 只有在「參數列完全相同」時才會真的取代舊版本，
--    參數列一變就會變成多一個多載（overload），新舊兩個版本同時留在資料庫裡，
--    之後呼叫時 PostgreSQL 會因為分不出該用哪一個而報錯。這裡明確刪除舊參數列
--    的版本，確保重複執行這份 schema 之後資料庫裡永遠只剩一個版本。
DROP FUNCTION IF EXISTS public.confirm_claim_atomic(TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ);
DROP FUNCTION IF EXISTS public.confirm_claim_atomic(TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT);

CREATE OR REPLACE FUNCTION public.confirm_claim_atomic(
  p_token TEXT,
  p_name TEXT,
  p_email TEXT,
  p_chapters TEXT[],
  p_created_at TIMESTAMPTZ DEFAULT NOW(),
  p_fellowship TEXT DEFAULT NULL,
  p_max_chapters INT DEFAULT 3          -- 每人上限，由後端依 church.config.js 傳入
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing public.claims%ROWTYPE;
  v_claim_id UUID;
  v_ch TEXT;
  v_conflicts TEXT[] := ARRAY[]::TEXT[];
BEGIN
  IF p_chapters IS NULL OR array_length(p_chapters, 1) IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', '缺少章節資料');
  END IF;

  IF array_length(p_chapters, 1) > p_max_chapters THEN
    RETURN jsonb_build_object('success', false, 'error', '每位會友最多只能認領 ' || p_max_chapters || ' 章');
  END IF;

  -- 該筆 token 若已經處理過（正常情況下不會發生，因為 token 是送出當下才產生的，
  -- 但保留這段防呆：避免同一請求因網路重試被意外處理兩次時整筆重複寫入）：
  --   還在有效狀態 → 直接回傳既有紀錄（冪等）
  --   已被取消過（canceled_at 有值）→ 明確拒絕，不能拿舊 token 復活一筆已取消的認領
  SELECT * INTO v_existing FROM public.claims WHERE token = p_token;
  IF FOUND THEN
    IF v_existing.canceled_at IS NOT NULL THEN
      RETURN jsonb_build_object('success', false, 'error', '這個認領連結先前已被取消，如需重新認領，請回到首頁重新選擇章節。');
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'already_confirmed', true,
      'claim_id', v_existing.id,
      'name', v_existing.name,
      'email', v_existing.email,
      'chapters', v_existing.chapters,
      'created_at', v_existing.created_at,
      'confirmed_at', v_existing.confirmed_at
    );
  END IF;

  -- 逐一檢查章節是否已被搶占，收集「所有」衝突章節（不是抓到第一個就提早回傳），
  -- 讓呼叫端可以一次知道要從畫面上移除哪幾章，不用一章一章重試。
  FOREACH v_ch IN ARRAY p_chapters LOOP
    IF EXISTS (SELECT 1 FROM public.claimed_chapters WHERE chapter_key = v_ch) THEN
      v_conflicts := array_append(v_conflicts, v_ch);
    END IF;
  END LOOP;

  IF array_length(v_conflicts, 1) > 0 THEN
    RETURN jsonb_build_object('success', false, 'error', '章節已被其他會友認領', 'conflict_keys', v_conflicts);
  END IF;

  -- 寫入認領主表
  INSERT INTO public.claims (token, name, email, chapters, fellowship, created_at, confirmed_at)
  VALUES (p_token, p_name, NULLIF(trim(p_email), ''), p_chapters, NULLIF(trim(p_fellowship), ''), p_created_at, NOW())
  RETURNING id INTO v_claim_id;

  -- 鎖定各章節（PRIMARY KEY 衝突時會拋例外，被下方 EXCEPTION 捕捉並整筆回滾——
  -- 這是真正「兩人同時送出」撞在一起時的最後防線，上面的檢查只能擋掉大部分情況）
  FOREACH v_ch IN ARRAY p_chapters LOOP
    INSERT INTO public.claimed_chapters (chapter_key, claim_id)
    VALUES (v_ch, v_claim_id);
  END LOOP;

  RETURN jsonb_build_object('success', true, 'claim_id', v_claim_id);
EXCEPTION
  WHEN unique_violation THEN
    -- 真正撞在資料庫寫入那一刻：回頭查一次，把「p_chapters 裡實際上現在已經
    -- 被鎖定的章節」整理出來回傳，呼叫端才能知道具體是哪幾章要移除重選。
    SELECT ARRAY(
      SELECT chapter_key FROM public.claimed_chapters WHERE chapter_key = ANY(p_chapters)
    ) INTO v_conflicts;
    RETURN jsonb_build_object('success', false, 'error', '章節已被其他會友搶先認領', 'conflict_keys', v_conflicts);
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;

-- 4. 釋出章節：原子交易（管理員後台單章 / 全釋出共用）
--    p_chapters 為 NULL 時代表釋出該筆認領的「全部」章節。
--    全釋出時不整筆刪除 claims，而是設定 canceled_at 當作墓碑（tombstone）：
--    章節照樣立刻從 claimed_chapters 移除、開放給其他人認領，但保留這筆紀錄，
--    讓當初寄出的確認信連結之後點擊會被明確拒絕，而不是把舊連結變成
--    「永遠可以復原認領」的按鈕（這是先前發生過的真實 bug）。
CREATE OR REPLACE FUNCTION public.release_claim_chapters(
  p_claim_id UUID,
  p_chapters TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim public.claims%ROWTYPE;
  v_remaining TEXT[];
  v_to_remove TEXT[];
BEGIN
  SELECT * INTO v_claim FROM public.claims WHERE id = p_claim_id AND canceled_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '找不到該筆認領紀錄，或已被取消過');
  END IF;

  v_to_remove := COALESCE(p_chapters, v_claim.chapters);

  DELETE FROM public.claimed_chapters
  WHERE claim_id = p_claim_id AND chapter_key = ANY(v_to_remove);

  SELECT ARRAY(
    SELECT unnest(v_claim.chapters)
    EXCEPT
    SELECT unnest(v_to_remove)
  ) INTO v_remaining;

  IF v_remaining IS NULL OR array_length(v_remaining, 1) IS NULL THEN
    UPDATE public.claims SET canceled_at = NOW() WHERE id = p_claim_id;
    RETURN jsonb_build_object('success', true, 'deleted_claim', true);
  END IF;

  UPDATE public.claims SET chapters = v_remaining WHERE id = p_claim_id;
  RETURN jsonb_build_object('success', true, 'deleted_claim', false, 'remaining_chapters', v_remaining);
END;
$$;

-- 5. 自助退選：依 Token 釋出（會友「查詢 / 修改認領」頁使用）
--    p_chapters 為 NULL 時代表整筆全部取消；有值時只取消其中列出的章節，
--    其餘章節維持認領狀態不受影響。跟 release_claim_chapters 一樣，
--    整筆取消時用 canceled_at 做墓碑，不整列刪除，理由同上。
CREATE OR REPLACE FUNCTION public.cancel_claim_by_token(
  p_token TEXT,
  p_chapters TEXT[] DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim public.claims%ROWTYPE;
  v_remaining TEXT[];
  v_to_remove TEXT[];
BEGIN
  SELECT * INTO v_claim FROM public.claims WHERE token = p_token AND canceled_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', '找不到對應的認領記錄，或已被取消過');
  END IF;

  v_to_remove := COALESCE(p_chapters, v_claim.chapters);

  DELETE FROM public.claimed_chapters
  WHERE claim_id = v_claim.id AND chapter_key = ANY(v_to_remove);

  SELECT ARRAY(
    SELECT unnest(v_claim.chapters)
    EXCEPT
    SELECT unnest(v_to_remove)
  ) INTO v_remaining;

  IF v_remaining IS NULL OR array_length(v_remaining, 1) IS NULL THEN
    UPDATE public.claims SET canceled_at = NOW() WHERE id = v_claim.id;
    RETURN jsonb_build_object(
      'success', true,
      'fully_canceled', true,
      'canceled_claim', jsonb_build_object(
        'id', v_claim.id, 'name', v_claim.name, 'email', v_claim.email,
        'chapters', v_to_remove, 'token', v_claim.token
      )
    );
  END IF;

  UPDATE public.claims SET chapters = v_remaining WHERE id = v_claim.id;
  RETURN jsonb_build_object(
    'success', true,
    'fully_canceled', false,
    'canceled_chapters', v_to_remove,
    'remaining_chapters', v_remaining
  );
END;
$$;

-- 6. 啟用 Row Level Security (RLS)
--    應用程式一律透過後端 API 使用 service role 金鑰存取，天生繞過 RLS；
--    以下政策只在「萬一有人直接用 anon 金鑰打 REST API」時提供最低限度防護。
ALTER TABLE public.claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.claimed_chapters ENABLE ROW LEVEL SECURITY;

-- 前端完全不直接連 Supabase（所有存取走 /api/*，後端用 service role 金鑰），所以 anon 不需要任何讀取權。
-- 舊版曾開放 claimed_chapters 給 anon SELECT，但該表含 claim_id，拿到 anon key 的人可藉此讀出所有 claim_id，
-- 再直接呼叫 release_claim_chapters 把別人的認領全部釋出，等於繞過 ADMIN_PIN。這裡把舊政策刪掉，並且不再建立。
DROP POLICY IF EXISTS "Public can view claimed chapters" ON public.claimed_chapters;

-- claims 表同樣不開放 anon 直接讀取（內含姓名 / 信箱），一律經由後端 API 存取。

-- 6b. 收回 SECURITY DEFINER 函式的執行權限
--     PostgreSQL 預設把新函式的 EXECUTE 給 PUBLIC，Supabase 的 anon / authenticated 角色因此都能
--     直接用 REST (/rest/v1/rpc/...) 呼叫這三支，且函式以 owner 權限執行、繞過 RLS。
--     只留給後端使用的 service_role。
REVOKE EXECUTE ON FUNCTION public.confirm_claim_atomic(TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, INT) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.release_claim_chapters(UUID, TEXT[]) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.cancel_claim_by_token(TEXT, TEXT[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_claim_atomic(TEXT, TEXT, TEXT, TEXT[], TIMESTAMPTZ, TEXT, INT) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_claim_chapters(UUID, TEXT[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_claim_by_token(TEXT, TEXT[]) TO service_role;

-- 7. 後台繳交狀態操作紀錄（只增不改）
--    每次「標記已繳交 / 取消標記 / 釋出章節」都留一筆，用來追查「明明標記了卻變回未繳交」這類問題。
--    不加外鍵：認領被刪除或釋出後，紀錄仍要保留。寫入失敗不影響主流程（見 api/_audit.js）。
--    啟用 RLS 且不建立任何 policy：anon 金鑰完全讀不到，只有後端 service role 能存取。
CREATE TABLE IF NOT EXISTS public.submission_audit_log (
  id BIGSERIAL PRIMARY KEY,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  action TEXT NOT NULL,          -- 'toggle_chapter'（章節收件頁籤）/ 'toggle_batch'（名單頁徽章批次）/ 'release'（釋出章節）
  chapter_key TEXT,              -- 例如 'psa_80'
  claim_id UUID,
  claimant_name TEXT,
  old_value BOOLEAN,             -- 操作前是否已繳交
  new_value BOOLEAN,             -- 操作後是否已繳交（release 為 NULL）
  ip TEXT,
  user_agent TEXT,
  note TEXT
);
CREATE INDEX IF NOT EXISTS idx_audit_chapter_key ON public.submission_audit_log (chapter_key, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON public.submission_audit_log (created_at DESC);
ALTER TABLE public.submission_audit_log ENABLE ROW LEVEL SECURITY;

-- 8. 速率限制計數（後台 PIN 失敗鎖定用）
--    Vercel Serverless 的記憶體不會跨容器共用，所以失敗次數必須存在資料庫才能真的鎖得住。
--    固定時間窗：window_start 起算超過 p_window_seconds 就重新計數。
--    啟用 RLS 且不建立任何 policy；函式只授權給 service_role。
CREATE TABLE IF NOT EXISTS public.rate_limits (
  key TEXT PRIMARY KEY,                  -- 例如 'pin:203.0.113.5'
  count INT NOT NULL DEFAULT 0,
  window_start TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.rate_limits ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.rate_limit_hit(p_key TEXT, p_window_seconds INT)
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  INSERT INTO public.rate_limits AS r (key, count, window_start)
  VALUES (p_key, 1, NOW())
  ON CONFLICT (key) DO UPDATE SET
    count = CASE WHEN r.window_start < NOW() - make_interval(secs => p_window_seconds) THEN 1 ELSE r.count + 1 END,
    window_start = CASE WHEN r.window_start < NOW() - make_interval(secs => p_window_seconds) THEN NOW() ELSE r.window_start END
  RETURNING r.count INTO v_count;
  RETURN v_count;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.rate_limit_hit(TEXT, INT) TO service_role;
