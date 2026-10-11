import { getSupabase, setCors } from './_supabase.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { token, chapters } = req.body || {};
  if (!token) return res.status(400).json({ success: false, error: '缺少驗證碼' });

  // chapters 為選填：不傳代表整筆全部取消（沿用舊行為）；
  // 傳入 [{bookId, chapter}, ...] 則只取消其中列出的章節，其餘章節維持認領狀態。
  const chapterKeys = Array.isArray(chapters) && chapters.length > 0
    ? chapters.map(c => `${(c.bookId || '').toLowerCase()}_${c.chapter}`)
    : null;

  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('cancel_claim_by_token', {
      p_token: token,
      p_chapters: chapterKeys
    });
    if (error) throw error;

    if (!data.success) {
      return res.status(404).json({ success: false, error: data.error });
    }

    return res.status(200).json({
      success: true,
      fullyCanceled: !!data.fully_canceled,
      canceledClaim: data.canceled_claim,
      remainingChapters: data.remaining_chapters
    });
  } catch (err) {
    console.error('[cancel-claim] 取消失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }
}
