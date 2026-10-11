import { getSupabase, hydrateClaim, setCors, fetchAllRows } from '../_supabase.js';
import { requireAdminAuth } from '../_admin_auth.js';

/**
 * 後台專用的完整認領名單（含姓名/Email/token）。
 *
 * 公開端點 api/claims.js 只回傳章節認領/繳交狀態、不含任何個資（見該檔案的說明），但後台
 * 名單表格、CSV 匯出、催件寄信都真的需要姓名/Email/token，所以這支保留完整資料，
 * 改用 requireAdminAuth 擋住，只有帶正確 x-admin-pin header 的請求才能讀取。
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdminAuth(req, res))) return;

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

    const submissionMap = new Map(
      (chapterRows || []).map(r => [r.chapter_key, { is_submitted: r.is_submitted, submitted_at: r.submitted_at }])
    );

    return res.status(200).json({ claims: (data || []).map(row => hydrateClaim(row, submissionMap)) });
  } catch (err) {
    console.error('[api/admin/claims] 讀取失敗:', err);
    return res.status(500).json({ claims: [], error: '系統忙碌中，請稍後再試一次。' });
  }
}
