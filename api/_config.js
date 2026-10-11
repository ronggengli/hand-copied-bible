import { church } from '../src/js/churchInfo.js';

/**
 * 信件連結使用的網站網址。
 * 優先順序：BASE_URL 環境變數 → Vercel 提供的正式網域 → 請求的 Host header。
 * 過去只用 Host header，攻擊者可偽造 Host，讓教會寄出的信裡連結指向別的網站，所以只當最後備援。
 */
export function getBaseUrl(req) {
  if (process.env.BASE_URL) return process.env.BASE_URL.replace(/\/+$/, '');
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  const host = (req && req.headers && req.headers.host) || 'localhost:5173';
  const proto = host.startsWith('localhost') ? 'http' : 'https';
  return `${proto}://${host}`;
}

export function getSenderName() {
  return process.env.SENDER_NAME || church.senderName;
}

export function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return String(xff).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}
