import { getSupabase, hydrateClaim, setCors } from './_supabase.js';
import { generateToken } from './_token.js';
import { generateClaimConfirmationEmail, validateEmail } from '../src/js/emailService.js';
import { church, isClaimingClosed } from '../src/js/churchInfo.js';
import { normalizeChapters } from './_validate.js';
import { getMailConfig, createMailTransport } from './_mailer.js';
import { getBaseUrl, getSenderName, getClientIp } from './_config.js';
import crypto from 'node:crypto';
import { rateLimitHit } from './_rate_limit.js';

// 速率限制（B3）：同一 IP 每小時最多送出幾次認領請求（失敗的也算），
// 同一個收件信箱 24 小時內最多寄幾封確認信（超過仍會認領成功，只是不寄信）。
// 數字偏寬鬆是因為教會 Wi-Fi 下很多人共用同一個 IP；有需要請在 church.config.js 調整。
const CLAIMS_PER_IP_PER_HOUR = church.claimRateLimitPerIpPerHour ?? 30;
const EMAILS_PER_ADDRESS_PER_DAY = church.emailsPerAddressPerDay ?? 5;

/** 記一次並檢查是否超過上限。資料庫出錯時放行（寧可少擋也不要讓會友無法認領），但留下 log。 */
async function overLimit(key, windowSeconds, max) {
  if (process.env.DISABLE_RATE_LIMIT === '1') return false; // 只給負載測試用，正式環境不要設定
  try {
    return (await rateLimitHit(key, windowSeconds)) > max;
  } catch (e) {
    console.error('[claim-request] 速率限制計數失敗，略過檢查:', e.message);
    return false;
  }
}

/**
 * 單步驟認領：會友填表送出的當下，直接完成資料庫原子交易並正式鎖定章節，
 * 不再需要「寄驗證信 → 點連結才算數」的雙重確認。信件只作為事後提醒之用，
 * Email 本身也改為選填——沒填信箱的人一樣能認領成功，只是事後無法自助查詢/取消。
 */
export default async function handler(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

  if (isClaimingClosed()) {
    return res.status(403).json({ success: false, error: '認領已截止，謝謝您的參與。' });
  }

  if (await overLimit(`claim:${getClientIp(req)}`, 3600, CLAIMS_PER_IP_PER_HOUR)) {
    return res.status(429).json({ success: false, error: '送出次數過多，請稍後再試。' });
  }

  const { name, email, fellowship } = req.body || {};

  if (typeof name !== 'string' || !name.trim()) {
    return res.status(400).json({ success: false, error: '缺少必要欄位' });
  }
  if (email != null && typeof email !== 'string') {
    return res.status(400).json({ success: false, error: '電子郵件格式不正確' });
  }
  if (fellowship != null && typeof fellowship !== 'string') {
    return res.status(400).json({ success: false, error: '所屬團契格式不正確' });
  }
  // 長度上限：防止超長 payload 被塞進資料庫
  if (name.trim().length > 50) {
    return res.status(400).json({ success: false, error: '姓名不可超過 50 個字元' });
  }
  if ((fellowship || '').trim().length > 50) {
    return res.status(400).json({ success: false, error: '所屬團契不可超過 50 個字元' });
  }
  const trimmedName = name.trim();
  const trimmedEmail = (email || '').trim();
  if (trimmedEmail.length > 254) {
    return res.status(400).json({ success: false, error: '電子郵件過長' });
  }

  // Email 選填，但只要有填就要符合格式（避免打錯字的信箱事後完全查不到、也收不到提醒信）
  if (trimmedEmail) {
    const emailCheck = validateEmail(trimmedEmail);
    if (!emailCheck.valid) {
      return res.status(400).json({ success: false, error: emailCheck.error });
    }
  }

  // 章節資料由伺服器查表重建，不採用前端送來的書卷名稱／節數（見 api/_validate.js）
  const normalized = normalizeChapters(req.body && req.body.chapters, church.maxChaptersPerPerson);
  if (!normalized.ok) {
    return res.status(400).json({ success: false, error: normalized.error });
  }
  const chapterObjs = normalized.chapters;
  const chapterKeys = chapterObjs.map(c => `${c.bookId}_${c.chapter}`);
  const token = generateToken();

  // 直接呼叫資料庫原子交易：章節搶占檢查與寫入在同一個交易內完成，送出當下就正式認領成功
  let claimRow;
  try {
    const supabase = getSupabase();
    const { data, error } = await supabase.rpc('confirm_claim_atomic', {
      p_token: token,
      p_name: trimmedName,
      p_email: trimmedEmail || null,
      p_chapters: chapterKeys,
      p_fellowship: (fellowship || '').trim() || null,
      p_max_chapters: church.maxChaptersPerPerson
    });

    if (error) throw error;

    if (!data.success) {
      // 章節衝突：把資料庫回傳的 conflict_keys 轉成前端看得懂的格式，
      // 讓畫面能自動把衝突的章節從已選清單移除，不用使用者自己意識到要取消勾選
      const conflictChapters = (data.conflict_keys || [])
        .map(key => chapterObjs.find(c => `${c.bookId}_${c.chapter}` === key))
        .filter(Boolean);

      if (conflictChapters.length > 0) {
        return res.status(409).json({
          success: false,
          error: `${trimmedName}平安，您所選擇的經文已經被其他弟兄姊妹認領，煩請重新勾選。謝謝。`,
          conflictChapters
        });
      }
      return res.status(400).json({ success: false, error: data.error });
    }

    const { data: row } = await supabase
      .from('claims')
      .select('*')
      .eq('token', token)
      .single();
    claimRow = row ? hydrateClaim(row) : null;
  } catch (err) {
    console.error('[claim-request] 資料庫寫入失敗:', err);
    return res.status(500).json({ success: false, error: '系統忙碌中，請稍後再試一次。' });
  }

  // 認領已經正式成功，接下來寄提醒信是「錦上添花」——沒填信箱就跳過，
  // 信寄失敗也不影響認領本身已經成功這件事。
  if (!trimmedEmail) {
    return res.status(200).json({ success: true, claim: claimRow, token, emailSent: false });
  }

  const baseUrl = getBaseUrl(req);
  const { subject, html } = generateClaimConfirmationEmail({ name: trimmedName, email: trimmedEmail, fellowship: (fellowship || '').trim(), chapters: chapterObjs, token, baseUrl });

  // 同一個收件信箱短時間內不重複寄太多封，避免被拿來轟炸別人的信箱、耗盡 Gmail 每日額度
  if (await overLimit(`mail:${crypto.createHash('sha256').update(trimmedEmail.toLowerCase()).digest('hex').slice(0, 32)}`, 86400, EMAILS_PER_ADDRESS_PER_DAY)) {
    return res.status(200).json({ success: true, claim: claimRow, token, emailSent: false, mailError: 'rate_limited' });
  }

  const mail = getMailConfig();
  const emailPreview = { to: trimmedEmail, subject, html };

  if (!mail.configured) {
    console.error('[claim-request] 缺少 MAIL_USER / MAIL_PASS 環境變數，無法寄出提醒信');
    return res.status(200).json({ success: true, claim: claimRow, token, emailSent: false, mailError: 'missing_smtp_env', emailPreview });
  }

  try {
    const transporter = createMailTransport(mail);

    await transporter.sendMail({
      from: `"${getSenderName()}" <${mail.from}>`,
      to: trimmedEmail,
      subject,
      html
    });

    return res.status(200).json({ success: true, claim: claimRow, token, emailSent: true, emailPreview });
  } catch (err) {
    console.error('Nodemailer Error:', err);
    return res.status(200).json({ success: true, claim: claimRow, token, emailSent: false, mailError: 'send_failed', emailPreview });
  }
}
