/**
 * 共用 Supabase Server Client（僅供 api/*.js 後端使用，絕不可讓 SUPABASE_SECRET_KEY 流向前端）
 */
import { createClient } from '@supabase/supabase-js';
import ws from 'ws';
import { parseChapterKey, estimatePageCount } from '../src/data/bibleData.js';

let cachedClient = null;

export function getSupabase() {
  if (cachedClient) return cachedClient;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error('缺少 SUPABASE_URL 或 SUPABASE_SECRET_KEY 環境變數，請確認 Vercel 專案設定。');
  }

  cachedClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // Vercel 的 Node.js Runtime 目前是 Node 20，沒有原生 WebSocket，
    // supabase-js 建立 client 時仍會嘗試初始化 Realtime（即使我們完全沒用到訂閱功能），
    // 沒有這個 polyfill 會讓每一次 getSupabase() 直接拋例外、所有 API 全部 500。
    realtime: { transport: ws }
  });
  return cachedClient;
}

/**
 * Supabase／PostgREST 預設每次查詢最多只回傳 1,000 筆，超過就會被「無聲截斷」
 * （不會報錯，query 直接回傳前 1,000 筆，且沒有 ORDER BY 時是哪 1,000 筆完全不保證）。
 *
 * 這支 app 全本聖經共 1,189 章，claimed_chapters／claims 兩張表的筆數只會隨認領進度
 * 持續增加，一定會超過這條線。超過後，被截斷的那些章節即使後台標記已收件、也成功寫入資料庫，
 * 列表重新查詢時仍會「消失」、畫面顯示又變回未收件，看起來像隨機發生的怪異 bug。
 *
 * 所以任何「撈全表」的查詢都必須用這支分頁到底，不能直接 .select() 了事。
 *
 * @param {() => import('@supabase/supabase-js').PostgrestFilterBuilder} buildQuery -
 *   回傳「還沒呼叫 .range()」的 query builder（可以自己先接 .select()/.eq()/.order() 等），
 *   這支每一頁都會重新呼叫一次，各自接上對應的 .range()。
 */
export async function fetchAllRows(buildQuery, pageSize = 1000) {
  const allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery().range(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    allRows.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return allRows;
}

/**
 * 把資料庫的 chapters (TEXT[] of 'bookId_chapter' key) 展開成前端需要的完整章節物件，
 * 並把整筆 claims row 轉換成前端沿用已久的資料格式（駝峰命名、status/confirmed 等欄位）。
 *
 * @param {object} row - claims 資料表的一列
 * @param {Map<string, {is_submitted: boolean, submitted_at: string|null}>} [submissionMap] -
 *   chapter_key -> claimed_chapters 的繳交狀態。繳交顆粒度是「章」，不是「整筆認領」，
 *   所以每個 chapter 都要各自查表，不能沿用舊版 row.is_submitted（那是整筆認領共用一個布林值的殘留欄位，
 *   已不是真相來源，見 supabase_schema.sql 的說明）。呼叫端沒傳就視為全部未繳交。
 */
export function hydrateClaim(row, submissionMap = new Map()) {
  const chapters = (row.chapters || []).map(key => {
    const { bookId, chapter, bookName, verses } = parseChapterKey(key);
    const sub = submissionMap.get(key);
    return {
      bookId,
      bookName,
      chapter,
      verses,
      estimatedPages: estimatePageCount(verses),
      submitted: !!(sub && sub.is_submitted),
      submittedAt: (sub && sub.submitted_at) || null
    };
  });

  const submittedCount = chapters.filter(c => c.submitted).length;
  const submittedTimestamps = chapters.filter(c => c.submittedAt).map(c => c.submittedAt).sort();

  return {
    id: row.id,
    name: row.name,
    email: row.email || '',
    fellowship: row.fellowship || '',
    chapters,
    token: row.token,
    status: 'confirmed',
    createdAt: row.created_at,
    confirmedAt: row.confirmed_at,
    // 整筆認領層級的繳交狀態，現在是從章節層級「聚合」出來的，不是資料庫欄位：
    // 全部章節都繳交了才算 submitted=true；0 章繳交是 submitted=false；
    // 介於中間則 partiallySubmitted=true，畫面上要能呈現「部分已繳交」，不能只有全有全無兩態。
    submitted: chapters.length > 0 && submittedCount === chapters.length,
    partiallySubmitted: submittedCount > 0 && submittedCount < chapters.length,
    submittedCount,
    // 整筆最近一次章節繳交時間（供 CSV 匯出參考用），沒有任何章節繳交過就是 null
    submittedAt: submittedTimestamps.length ? submittedTimestamps[submittedTimestamps.length - 1] : null,
    reminderCount: row.reminder_count || 0,
    lastRemindedAt: row.last_reminded_at
  };
}

/**
 * 前端與 API 同網域，不需要跨網域存取，所以不送 Access-Control-Allow-Origin
 * （瀏覽器預設會擋掉別的網站對這些 API 的跨網域呼叫）。保留這個函式名稱是為了讓各支 handler 不用改。
 */
export function setCors(_res) {}
