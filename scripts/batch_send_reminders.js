import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSupabase, fetchAllRows, hydrateClaim } from '../api/_supabase.js';
import { generateReminderEmail } from '../src/js/emailService.js';
import { getMailConfig, createMailTransport } from '../api/_mailer.js';
import { getSenderName } from '../api/_config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logFilePath = path.join(__dirname, 'batch_remind.log');

function log(message) {
  const timestamp = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
  const line = `[${timestamp}] ${message}`;
  console.log(line);
  fs.appendFileSync(logFilePath, line + '\n', 'utf8');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  log('====================================================');
  log('🚀 啟動手抄聖經繳交進度提醒信安全批次寄送程序');
  log('====================================================');

  const mail = getMailConfig();
  const senderName = getSenderName();
  const baseUrl = (process.env.BASE_URL || '').replace(/\/+$/, '');
  // 預設每封信間隔 30 秒（可在執行時自訂，例如 REMINDER_INTERVAL_SECONDS=20）
  const intervalSeconds = parseInt(process.env.REMINDER_INTERVAL_SECONDS || '30', 10);
  const isDryRun = process.env.DRY_RUN === 'true';

  if (!baseUrl) {
    log('❌ 錯誤：缺少 BASE_URL（你的網站網址，催件信裡的連結會用到，例如 https://your-church-bible.vercel.app）');
    process.exit(1);
  }

  if (!mail.configured) {
    log('❌ 錯誤：缺少寄信憑證（MAIL_USER / MAIL_PASS）');
    process.exit(1);
  }

  const supabase = getSupabase();

  const transporter = createMailTransport(mail);

  // 驗證 SMTP 憑證連線
  try {
    log('正在驗證 SMTP 連線狀態...');
    await transporter.verify();
    log(`✓ SMTP 連線驗證成功（寄件帳號：${mail.user}）`);
  } catch (err) {
    log(`❌ SMTP 連線失敗：${err.message}`);
    process.exit(1);
  }

  // 撈取尚未退選的有效認領紀錄與章節繳交狀態（分頁撈到底避免超過 1,000 筆被截斷）
  log('正在從資料庫取得完整認領名單與繳交狀態...');
  const [claimsData, chapterRows] = await Promise.all([
    fetchAllRows(() =>
      supabase
        .from('claims')
        .select('*')
        .is('canceled_at', null)
        .order('confirmed_at', { ascending: true })
    ),
    fetchAllRows(() =>
      supabase
        .from('claimed_chapters')
        .select('chapter_key, is_submitted, submitted_at')
    )
  ]);

  const submissionMap = new Map(
    (chapterRows || []).map((r) => [r.chapter_key, { is_submitted: r.is_submitted, submitted_at: r.submitted_at }])
  );

  // 展開完整認領物件
  const allHydratedClaims = (claimsData || []).map((row) => hydrateClaim(row, submissionMap));

  const rawClaimsMap = new Map(claimsData.map((r) => [r.id, r]));

  // 篩選出：尚未全數繳交、且有留 Email 的認領
  const pendingClaims = allHydratedClaims.filter((c) => {
    return !c.submitted && c.email && c.email.trim().length > 0;
  });

  // 防重複：曾經寄過提醒的認領（last_reminded_at 有值）一律不再提醒（以「認領/章節」為單位，非以人為單位）
  const unremindedClaims = pendingClaims.filter((c) => !rawClaimsMap.get(c.id)?.last_reminded_at);
  log(`📊 資料庫分析：共有 ${allHydratedClaims.length} 筆有效認領，待繳交且有 Email 者 ${pendingClaims.length} 筆，排除曾提醒過的 ${pendingClaims.length - unremindedClaims.length} 筆後剩 ${unremindedClaims.length} 筆。`);

  // 依 Email 合併：同一人多筆認領只寄一封，且只列出「尚未繳交」的章節
  const groups = new Map();
  for (const c of unremindedClaims) {
    const key = c.email.trim().toLowerCase();
    if (!groups.has(key)) groups.set(key, { email: c.email.trim(), names: [], claims: [], chapters: [] });
    const g = groups.get(key);
    g.claims.push(c);
    if (c.name && !c.name.includes('@') && !g.names.includes(c.name)) g.names.push(c.name);
    g.chapters.push(...c.chapters.filter((ch) => !ch.submitted));
  }
  const targetsToSend = [...groups.values()]
    .filter((g) => g.chapters.length > 0)
    .map((g) => ({
      name: g.names.join('、') || g.email,
      email: g.email,
      chapters: g.chapters,
      token: g.claims[0].token,
      claimIds: g.claims.map((c) => c.id)
    }));

  log(`📬 依 Email 合併後，共需寄送 ${targetsToSend.length} 封。`);

  if (targetsToSend.length === 0) {
    log('🎉 目前沒有需要寄送的會友！');
    return;
  }

  const totalEstTimeMin = Math.round((targetsToSend.length * intervalSeconds) / 60);
  log(`⏱️ 預計寄送數量：${targetsToSend.length} 封`);
  log(`⏱️ 安全寄送間隔：每封間隔 ${intervalSeconds} 秒（預計耗時約 ${totalEstTimeMin} 分鐘）`);

  if (isDryRun) {
    log('🔍 [DRY_RUN 測試模式] 僅檢查名單，不實際發信與寫入資料庫：');
    targetsToSend.forEach((c, idx) => {
      log(`  [${idx + 1}] ${c.name} (${c.email}) - ${c.claimIds.length} 筆認領 - 未繳: ${c.chapters.map((ch) => `${ch.bookName}第${ch.chapter}章`).join('、')}`);
    });
    log('DRY_RUN 測試完成。');
    return;
  }

  let successCount = 0;
  let failCount = 0;

  for (let i = 0; i < targetsToSend.length; i++) {
    const claim = targetsToSend[i];
    const index = i + 1;
    const chaptersText = claim.chapters.map((ch) => `${ch.bookName}第${ch.chapter}章`).join('、');
    log(`[${index}/${targetsToSend.length}] 準備發送給 ${claim.name} (${claim.email}) [${chaptersText}] ...`);

    try {
      const emailData = generateReminderEmail({
        name: claim.name,
        email: claim.email,
        chapters: claim.chapters,
        token: claim.token,
        baseUrl
      });

      await transporter.sendMail({
        from: `"${senderName}" <${mail.from}>`,
        to: claim.email,
        subject: emailData.subject,
        html: emailData.html,
        text: emailData.text
      });

      // 寄送成功後，即時更新 Supabase 記錄（記錄最後催件時間與次數，防止任何情況下重複發送）
      // 合併寄送時，這封信涵蓋的每一筆認領都要標記
      const nowIso = new Date().toISOString();
      for (const id of claim.claimIds) {
        const raw = rawClaimsMap.get(id);
        const { error: updErr } = await supabase
          .from('claims')
          .update({ last_reminded_at: nowIso, reminder_count: ((raw && raw.reminder_count) || 0) + 1 })
          .eq('id', id);
        if (updErr) log(`  ⚠️ 已寄出但寫入提醒紀錄失敗 (claim ${id}): ${updErr.message}`);
      }

      successCount++;
      log(`  ✓ 已成功送達：${claim.name} (${claim.email})`);
    } catch (sendErr) {
      failCount++;
      log(`  ❌ 發送失敗 [${claim.name} - ${claim.email}]: ${sendErr.message}`);
    }

    // 若不是最後一封，等待安全間隔時間
    if (i < targetsToSend.length - 1) {
      await sleep(intervalSeconds * 1000);
    }
  }

  log('====================================================');
  log(`🏁 批次寄送作業完成！成功: ${successCount} 封，失敗: ${failCount} 封`);
  log('====================================================');
}

main().catch((err) => {
  log(`💥 程式發生未預期異常終止: ${err.stack || err.message}`);
  process.exit(1);
});
