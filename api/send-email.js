import { getMailConfig, createMailTransport } from './_mailer.js';
import { requireAdminAuth } from './_admin_auth.js';
import { setCors } from './_supabase.js';
import { getSenderName } from './_config.js';

/**
 * 這支端點目前唯一的呼叫來源是後台「催件信」功能（src/js/admin.js 的
 * sendReminder / batchSendReminders）。會友自己認領章節時的「認領成功通知信」
 * 是在 api/claim-request.js 裡用驗證過的資料庫資料、在伺服器端直接組信、
 * 直接呼叫 nodemailer 寄出，完全不會經過這支公開端點。
 *
 * 這支端點過去完全沒有驗證，等於任何人都能拿教會真正的 Gmail 帳號、冒用
 * 教會的寄件人身分，寄任意內容到任意信箱（釣魚信/
 * 濫發垃圾信的等級）。現在既然唯一合法呼叫者是後台催件功能，直接整支
 * 用管理員驗證擋住即可，不影響會友端的認領流程。
 */
export default async function handler(req, res) {
  setCors(res);

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }
  if (!(await requireAdminAuth(req, res))) return;

  const { to, subject, html, text } = req.body || {};

  if (!to || !subject) {
    return res.status(400).json({ success: false, error: '缺少收件人或主旨' });
  }

  const mail = getMailConfig();
  const senderName = getSenderName();

  if (!mail.configured) {
    console.log(`[模擬發信] 收件人: ${to} ｜ 主旨: ${subject}`);
    return res.json({ success: true, mode: 'mock', message: '已記錄發信內容' });
  }

  try {
    const transporter = createMailTransport(mail);

    const info = await transporter.sendMail({
      from: `"${senderName}" <${mail.from}>`,
      to,
      subject,
      text,
      html
    });

    console.log(`✉️ [Vercel API] 信件已成功寄出至 ${to} (MessageId: ${info.messageId})`);
    return res.json({ success: true, mode: 'smtp', messageId: info.messageId });
  } catch (error) {
    console.error('❌ [Vercel API] 發信失敗:', error);
    return res.status(500).json({ success: false, error: '寄信失敗，請檢查寄信信箱設定或稍後再試。' });
  }
}
