import { getSupabase, hydrateClaim, setCors, fetchAllRows } from './_supabase.js';

/**
 * 公開端點，任何人不用登入都能打——只回傳「章節認領/繳交狀態」，絕對不能包含
 * 姓名/Email/token 等個資。如果這裡回傳 hydrateClaim() 的完整結果（含每個人的 token，
 * 等同自助查詢/退選的密碼），任何人打開 DevTools 看一眼回應就能拿到所有人的姓名/Email，
 * 還能用別人的 token 去取消別人的認領。
 * 需要姓名/Email/token 的後台名單/CSV/催件，改走有 requireAdminAuth 保護的
 * api/admin/claims.js；自助查詢改走只回傳單筆的 api/my-claim.js。
 * 這裡刻意用「白名單只挑 chapters 欄位」而不是「黑名單刪掉幾個欄位」，避免
 * hydrateClaim() 未來加新欄位時，這裡忘記一起補刪而外洩。
 */
export default async function handler(req, res) {
  setCors(res);
  // 認領/繳交狀態隨時會變，禁止瀏覽器或中間層快取，避免會友看到舊的「未繳交」
  res.setHeader('Cache-Control', 'no-store');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  try {
    const supabase = getSupabase();
    // claims／claimed_chapters 兩張表都用 fetchAllRows() 分頁撈到底，不能直接 .select()，
    // 否則超過 1,000 筆會被 PostgREST 無聲截斷（見 fetchAllRows 註解）。
    const [data, chapterRows] = await Promise.all([
      fetchAllRows(() => supabase
        .from('claims')
        .select('*')
        .is('canceled_at', null)
        .order('confirmed_at', { ascending: false })),
      fetchAllRows(() => supabase
        .from('claimed_chapters')
        .select('chapter_key, is_submitted, submitted_at'))
    ]);

    // 繳交顆粒度是「章」，存在 claimed_chapters 表，跟 claims 表分開查再組合起來
    // （見 hydrateClaim 的說明）。
    const submissionMap = new Map(
      (chapterRows || []).map(r => [r.chapter_key, { is_submitted: r.is_submitted, submitted_at: r.submitted_at }])
    );

    const publicClaims = (data || []).map(row => {
      const { chapters } = hydrateClaim(row, submissionMap);
      return { chapters };
    });

    return res.status(200).json({ claims: publicClaims });
  } catch (err) {
    console.error('[api/claims] 讀取失敗:', err);
    return res.status(500).json({ claims: [], error: '系統忙碌中，請稍後再試一次。' });
  }
}
