/**
 * 後台「繳交狀態」操作紀錄（submission_audit_log）。
 *
 * 目的：遇到「明明標記為已繳交，事後卻變回未繳交」這類問題時能追查。資料庫本身只存最後結果
 * （取消標記時還會把 submitted_at 清成空值），沒有這張表就無從得知是誰、什麼時候、從哪裡、怎麼改的。
 * 這張表只增不改，每次標記／取消標記／釋出章節都留一筆。
 *
 * 重要：寫紀錄「絕對不能」影響主要功能。紀錄寫入失敗（例如資料表還沒建立）只會在伺服器 log
 * 印出錯誤，不會讓標記繳交的操作跟著失敗。
 */

/** 取得呼叫端來源資訊（IP / 瀏覽器），用來事後辨識是哪一台裝置操作的 */
export function getClientMeta(req) {
  const fwd = req.headers['x-forwarded-for'];
  const ip = (Array.isArray(fwd) ? fwd[0] : (fwd || '')).split(',')[0].trim()
    || (req.socket && req.socket.remoteAddress)
    || null;
  const ua = String(req.headers['user-agent'] || '').slice(0, 300) || null;
  return { ip, user_agent: ua };
}

/**
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 * @param {Array<object>} rows 欄位見 supabase_schema.sql 的 submission_audit_log
 */
export async function logAudit(supabase, rows) {
  try {
    if (!rows || rows.length === 0) return;
    const { error } = await supabase.from('submission_audit_log').insert(rows);
    if (error) console.error('[audit] 寫入操作紀錄失敗（不影響主要操作）:', error.message);
  } catch (e) {
    console.error('[audit] 寫入操作紀錄發生例外（不影響主要操作）:', e && e.message);
  }
}
