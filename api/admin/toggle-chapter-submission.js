import { getSupabase, setCors } from '../_supabase.js';
import { requireAdminAuth } from '../_admin_auth.js';
import { logAudit, getClientMeta } from '../_audit.js';

/**
 * 後台「章節收件」頁籤專用：標記/取消標記「單一章節」的稿紙已收件。
 * 顆粒度是章（claimed_chapters.chapter_key），跟 toggle-submission.js 那支「整筆認領批次切換」
 * 是兩件事，兩者都會寫同一張表，只是條件不同（this: 單一 chapter_key；那支: 整個 claim_id）。
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdminAuth(req, res))) return;

  const { bookId, chapter, submitted } = req.body || {};
  if (!bookId || chapter === undefined || chapter === null) {
    return res.status(400).json({ success: false, error: '缺少 bookId 或 chapter' });
  }

  const chapterKey = `${String(bookId).toLowerCase()}_${parseInt(chapter, 10)}`;

  try {
    const supabase = getSupabase();

    // 先讀出「操作前」的狀態，紀錄才能呈現是從什麼變成什麼
    const { data: before } = await supabase
      .from('claimed_chapters')
      .select('claim_id, is_submitted')
      .eq('chapter_key', chapterKey)
      .maybeSingle();

    const { data, error } = await supabase
      .from('claimed_chapters')
      .update({
        is_submitted: !!submitted,
        submitted_at: submitted ? new Date().toISOString() : null
      })
      .eq('chapter_key', chapterKey)
      .select('chapter_key, is_submitted')
      .maybeSingle();

    if (error) throw error;
    if (!data) {
      return res.status(404).json({ success: false, error: '此章節尚未被認領，無法標記繳交狀態。' });
    }

    let claimantName = null;
    if (before && before.claim_id) {
      const { data: c } = await supabase.from('claims').select('name').eq('id', before.claim_id).maybeSingle();
      claimantName = c ? c.name : null;
    }
    await logAudit(supabase, [{
      action: 'toggle_chapter',
      chapter_key: chapterKey,
      claim_id: before ? before.claim_id : null,
      claimant_name: claimantName,
      old_value: before ? before.is_submitted : null,
      new_value: data.is_submitted,
      ...getClientMeta(req)
    }]);

    return res.status(200).json({ success: true, chapterKey: data.chapter_key, submitted: data.is_submitted });
  } catch (err) {
    console.error('[toggle-chapter-submission] 更新失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }
}
