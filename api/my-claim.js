import { getSupabase, hydrateClaim, setCors } from './_supabase.js';

/**
 * 自助查詢「我的認領」——依 Email 或 Token 伺服器端過濾，只回傳「這一筆」，
 * 不像舊版那樣把整張 claims 表（含所有人的姓名/Email/token）下載到瀏覽器再前端比對。
 *
 * 沿用現有 UI 一個輸入框同時接受 token 或 email 的行為，用同一個 q 參數，
 * 先當 token 查一次、查不到再當 email 查一次。email 走 ilike 做大小寫不敏感比對，
 * 使用者輸入要先跳脫 % / _ / \ 這些 ilike 萬用字元，避免被拿來查出非預期的比對結果。
 */
function escapeLike(s) {
  return s.replace(/[%_\\]/g, m => `\\${m}`);
}

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method Not Allowed' });

  const q = ((req.query && req.query.q) || '').toString().trim();
  if (!q) {
    return res.status(400).json({ success: false, error: '請輸入查詢內容' });
  }

  try {
    const supabase = getSupabase();

    let row = null;
    const byToken = await supabase
      .from('claims')
      .select('*')
      .eq('token', q)
      .is('canceled_at', null)
      .maybeSingle();
    if (byToken.error) throw byToken.error;
    row = byToken.data;

    if (!row) {
      const byEmail = await supabase
        .from('claims')
        .select('*')
        .ilike('email', escapeLike(q))
        .is('canceled_at', null)
        .maybeSingle();
      if (byEmail.error) throw byEmail.error;
      row = byEmail.data;
    }

    if (!row) {
      return res.status(404).json({ success: false, error: '查無此認領記錄' });
    }

    const { data: chapterRows, error: chapterErr } = await supabase
      .from('claimed_chapters')
      .select('chapter_key, is_submitted, submitted_at')
      .in('chapter_key', row.chapters || []);
    if (chapterErr) throw chapterErr;

    const submissionMap = new Map(
      (chapterRows || []).map(r => [r.chapter_key, { is_submitted: r.is_submitted, submitted_at: r.submitted_at }])
    );

    return res.status(200).json({ success: true, claim: hydrateClaim(row, submissionMap) });
  } catch (err) {
    console.error('[api/my-claim] 查詢失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }
}
