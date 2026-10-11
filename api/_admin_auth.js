/**
 * 後台管理員 API 的伺服器端驗證。
 *
 * PIN 碼只存在伺服器端環境變數 ADMIN_PIN（Vercel 環境變數 + 本機 .env.local，
 * 兩者都不會進到瀏覽器會下載的檔案，也不會進 git）。前端登入時呼叫
 * /api/admin/verify-pin 請伺服器驗證，登入成功後每次呼叫後台 API 都在
 * x-admin-pin header 帶上 PIN 碼，由 requireAdminAuth() 在每支後台 API 裡驗證。
 *
 * 暴力破解防護：verify-pin 與所有後台 API「共用同一套」失敗計數（同一個來源 IP
 * 在 FAIL_WINDOW_SECONDS 內錯 MAX_FAILURES 次就鎖定）。計數存在 Supabase
 * （api/_rate_limit.js），不受 Serverless 換容器影響。過去鎖定只做在 verify-pin、
 * 而且存在單一容器的記憶體裡，直接對其他後台 API 換 x-admin-pin header 猜就能繞過。
 * 若計數資料表不存在或資料庫暫時出錯，退回單一容器記憶體計數並記錄錯誤，
 * 避免資料庫故障讓整個後台無法登入。
 */
import crypto from 'node:crypto';
import { rateLimitCount, rateLimitHit, rateLimitReset } from './_rate_limit.js';

const MAX_FAILURES = 5;
const FAIL_WINDOW_SECONDS = 15 * 60;

// 資料庫不可用時的備援計數：Map<ip, { count, windowStart }>
const memoryFailures = new Map();

function getClientIp(req) {
  const xff = req.headers['x-forwarded-for'];
  if (xff) return xff.split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function pinMatches(provided, expected) {
  const a = crypto.createHash('sha256').update(String(provided)).digest();
  const b = crypto.createHash('sha256').update(String(expected)).digest();
  return crypto.timingSafeEqual(a, b);
}

function memoryCount(ip) {
  const rec = memoryFailures.get(ip);
  if (!rec || Date.now() - rec.windowStart > FAIL_WINDOW_SECONDS * 1000) return 0;
  return rec.count;
}

function memoryHit(ip) {
  const fresh = memoryCount(ip) === 0;
  const rec = fresh ? { count: 0, windowStart: Date.now() } : memoryFailures.get(ip);
  rec.count += 1;
  memoryFailures.set(ip, rec);
  return rec.count;
}

/**
 * 驗證 PIN 並套用失敗鎖定。
 * @returns {Promise<{ ok: true } | { ok: false, status: number, error: string }>}
 */
export async function checkAdminPin(req, provided) {
  const expected = process.env.ADMIN_PIN;
  if (!expected) {
    // 伺服器忘記設定環境變數時，一律視為拒絕而不是放行
    console.error('[admin-auth] 環境變數 ADMIN_PIN 未設定，拒絕所有後台請求');
    return { ok: false, status: 500, error: '系統管理員通行碼尚未設定，請聯繫技術人員。' };
  }

  const ip = getClientIp(req);
  const key = `pin:${ip}`;
  let dbOk = true;

  let failures;
  try {
    failures = await rateLimitCount(key, FAIL_WINDOW_SECONDS);
  } catch (e) {
    dbOk = false;
    console.error('[admin-auth] 讀取失敗計數失敗，改用記憶體計數:', e.message);
    failures = memoryCount(ip);
  }
  if (failures >= MAX_FAILURES) {
    console.warn(`[admin-auth] IP ${ip} 鎖定中`);
    return { ok: false, status: 429, error: '登入嘗試次數過多，請稍後再試。' };
  }

  if (provided && pinMatches(provided, expected)) {
    if (failures > 0) {
      if (dbOk) await rateLimitReset(key).catch(() => {});
      memoryFailures.delete(ip);
    }
    return { ok: true };
  }

  // 沒帶 PIN（例如尚未登入就打開頁面）不算一次猜測，只有「帶了但錯誤」才計數
  if (provided) {
    try {
      if (!dbOk) throw new Error('db unavailable');
      await rateLimitHit(key, FAIL_WINDOW_SECONDS);
    } catch {
      memoryHit(ip);
    }
    console.warn(`[admin-auth] IP ${ip} PIN 錯誤`);
  }
  return { ok: false, status: 401, error: '管理員通行碼錯誤或已逾期，請重新登入管理後台。' };
}

export async function requireAdminAuth(req, res) {
  const result = await checkAdminPin(req, req.headers['x-admin-pin']);
  if (result.ok) return true;
  res.status(result.status).json({ success: false, error: result.error });
  return false;
}
