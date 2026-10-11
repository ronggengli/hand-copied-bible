import { getSupabase, setCors } from '../_supabase.js';
import { requireAdminAuth } from '../_admin_auth.js';
import { logAudit, getClientMeta } from '../_audit.js';

/**
 * 後台名單表格用的「批次」繳交狀態切換：一次把某人整筆認領底下的「所有」章節
 * 都標記為已繳交／未繳交。真正的繳交狀態存在 claimed_chapters（顆粒度是章，
 * 見 toggle-chapter-submission.js 與 supabase_schema.sql 的說明），這支不再寫
 * claims.is_submitted（該欄位已是不用的殘留欄位）。
 * 若這個人的章節本來就有部分已繳交、部分未繳交，呼叫這支等於「一次補齊/一次重置全部」，
 * 個別章節請改到後台「章節收件」頁籤逐一標記。
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdminAuth(req, res))) return;

  const { claimId, submitted } = req.body || {};
  if (!claimId) {
    return res.status(400).json({ success: false, error: '缺少 claimId' });
  }

  try {
    const supabase = getSupabase();

    const { data: before } = await supabase
      .from('claimed_chapters')
      .select('chapter_key, is_submitted')
      .eq('claim_id', claimId);
    const { data: claimRow } = await supabase.from('claims').select('name').eq('id', claimId).maybeSingle();

    const { data, error } = await supabase
      .from('claimed_chapters')
      .update({
        is_submitted: !!submitted,
        submitted_at: submitted ? new Date().toISOString() : null
      })
      .eq('claim_id', claimId)
      .select('chapter_key');

    if (error) throw error;
    if (!data || data.length === 0) {
      return res.status(404).json({ success: false, error: '找不到該認領紀錄底下的任何章節' });
    }

    const meta = getClientMeta(req);
    await logAudit(supabase, (before || []).map((b) => ({
      action: 'toggle_batch',
      chapter_key: b.chapter_key,
      claim_id: claimId,
      claimant_name: claimRow ? claimRow.name : null,
      old_value: b.is_submitted,
      new_value: !!submitted,
      ...meta
    })));

    return res.status(200).json({ success: true, submitted: !!submitted, updatedChapters: data.length });
  } catch (err) {
    console.error('[toggle-submission] 更新失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }
}
