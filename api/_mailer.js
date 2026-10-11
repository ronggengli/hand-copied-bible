/**
 * 寄信設定。預設用 Gmail；設定 SMTP_HOST 後可改用任何支援 SMTP 的信箱服務
 * （教會自己的網域信箱、Outlook/Microsoft 365、Zoho、SendGrid SMTP 等）。
 *
 * 環境變數：
 *   MAIL_USER / MAIL_PASS   登入帳號與密碼（舊名稱 GMAIL_USER / GMAIL_PASS 仍可用）
 *   SMTP_HOST               有填就走一般 SMTP；沒填則使用 Gmail
 *   SMTP_PORT               預設 587（STARTTLS）；465 會自動使用 SSL
 *   SMTP_SECURE             'true' 強制使用 SSL
 *   MAIL_FROM               寄件信箱位址，預設與 MAIL_USER 相同
 */
import nodemailer from 'nodemailer';

export function getMailConfig() {
  const user = (process.env.MAIL_USER || process.env.GMAIL_USER || '').trim();
  const pass = process.env.MAIL_PASS || process.env.GMAIL_PASS || '';
  const host = (process.env.SMTP_HOST || '').trim();
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const secure = process.env.SMTP_SECURE === 'true' || port === 465;
  const from = (process.env.MAIL_FROM || '').trim() || user;
  return { user, pass, host, port, secure, from, configured: !!(user && pass) };
}

export function createMailTransport(cfg = getMailConfig()) {
  if (cfg.host) {
    return nodemailer.createTransport({
      host: cfg.host,
      port: cfg.port,
      secure: cfg.secure,
      auth: { user: cfg.user, pass: cfg.pass }
    });
  }
  // Gmail 的應用程式密碼顯示時帶空格，貼上時常連空格一起貼進來，這裡一律去掉
  return nodemailer.createTransport({
    service: 'gmail',
    auth: { user: cfg.user, pass: cfg.pass.replace(/\s+/g, '') }
  });
}
