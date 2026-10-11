import { getSupabase, setCors } from './_supabase.js';
import { requireAdminAuth } from './_admin_auth.js';
import { logAudit, getClientMeta } from './_audit.js';

export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
  if (!(await requireAdminAuth(req, res))) return;

  const { claimId, bookId, chapter } = req.body || {};
  if (!claimId) {
    return res.status(400).json({ success: false, error: '缺少 claimId' });
  }

  const chapterKeys = (bookId && chapter !== undefined)
    ? [`${bookId.toLowerCase()}_${parseInt(chapter, 10)}`]
    : null;

  try {
    const supabase = getSupabase();

    // 釋出會把 claimed_chapters 那列直接刪掉（連繳交狀態一起消失），所以先拍下快照再執行
    let snapshotQuery = supabase.from('claimed_chapters').select('chapter_key, is_submitted').eq('claim_id', claimId);
    if (chapterKeys) snapshotQuery = snapshotQuery.in('chapter_key', chapterKeys);
    const { data: before } = await snapshotQuery;
    const { data: claimRow } = await supabase.from('claims').select('name').eq('id', claimId).maybeSingle();

    const { data, error } = await supabase.rpc('release_claim_chapters', {
      p_claim_id: claimId,
      p_chapters: chapterKeys
    });
    if (error) throw error;

    if (!data.success) {
      return res.status(404).json({ success: false, error: data.error });
    }

    const meta = getClientMeta(req);
    await logAudit(supabase, (before || []).map((b) => ({
      action: 'release',
      chapter_key: b.chapter_key,
      claim_id: claimId,
      claimant_name: claimRow ? claimRow.name : null,
      old_value: b.is_submitted,
      new_value: null,
      ...meta
    })));

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('[release-chapter] 釋出失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }
}
