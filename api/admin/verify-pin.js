import { setCors } from '../_supabase.js';
import { checkAdminPin } from '../_admin_auth.js';

/**
 * 後台登入畫面呼叫這支 API 驗證 PIN 碼是否正確。正確的 PIN 碼只存在伺服器端
 * 環境變數 ADMIN_PIN，這支 API 只回傳「對/錯」，不會把正確答案回傳給前端。
 * 失敗鎖定與其他後台 API 共用同一套計數，見 api/_admin_auth.js。
 *
 * 驗證成功後，前端會把剛剛輸入的 PIN 存在 sessionStorage，之後每次呼叫其他
 * 後台 API 都夾帶同一組值當作 x-admin-pin header。
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  const { pin } = req.body || {};
  const result = await checkAdminPin(req, typeof pin === 'string' ? pin : '');
  if (!result.ok) {
    return res.status(result.status).json({ success: false, error: result.error });
  }
  return res.status(200).json({ success: true });
}
