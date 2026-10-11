import { church, dates, esc, locationsEmailHtml, manuscriptPaperPath } from './churchInfo.js';

/**
 * 手抄聖經 郵件服務範本（教會名稱、日期、收件地點皆來自 church.config.js）
 * 送出表單即完成認領（單步驟流程），這裡的信件一律是「事後提醒/收據」，
 * 不含任何需要點擊才能完成認領的按鈕。
 */

function formatChapterListHtml(chapters) {
  return chapters.map(ch => {
    return `<li style="margin-bottom: 6px;">
      <strong style="color: #101828;">${esc(ch.bookName)}</strong> 第 ${esc(ch.chapter)} 章 
      <span style="color: #475467; font-size: 0.9em; background: #eaecf0; padding: 2px 6px; border-radius: 4px; margin-left: 4px;">
        共 ${esc(ch.verses)} 節 ｜ 約需 ${esc(ch.estimatedPages || 1)} 面稿紙（AI 預估）
      </span>
    </li>`;
  }).join('');
}

function formatChapterListText(chapters) {
  return chapters.map(ch => `• ${ch.bookName} 第 ${ch.chapter} 章（共 ${ch.verses} 節，約需 ${ch.estimatedPages || 1} 面稿紙，AI 預估）`).join('\n');
}

/**
 * 產生「認領成功提醒信」——送出表單當下就已經正式完成認領，
 * 這封信純粹是提醒/收據用途，沒有任何需要點擊才能生效的按鈕。
 */
export function generateClaimConfirmationEmail({ name, email, fellowship, chapters, token, baseUrl = 'http://localhost:5173' }) {
  const totalVerses = chapters.reduce((sum, ch) => sum + (ch.verses || 0), 0);
  const totalPages = chapters.reduce((sum, ch) => sum + (ch.estimatedPages || 1), 0);
  const pdfDownloadUrl = `${baseUrl}${manuscriptPaperPath}`;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <title>【${church.churchName}】手抄聖經認領成功通知</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', sans-serif; background-color: #f1f5f9; padding: 24px 12px; margin: 0; color: #101828;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">

    <!-- 頁首 Header -->
    <div style="background: linear-gradient(135deg, #101828 0%, #1D2939 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
      <p style="margin: 0 0 6px 0; font-size: 13px; letter-spacing: 1.5px; color: #F6EADE; font-weight: 600;">${esc(church.churchName)}・手抄聖經事工</p>
      <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; letter-spacing: 0.5px; color: #ffffff;">🎉 認領成功通知</h1>
      <p style="margin: 0; font-size: 13.5px; opacity: 0.88; color: #D0D5DD;">${esc(church.tagline)}</p>
    </div>

    <!-- 內文 Content -->
    <div style="padding: 26px 24px;">
      <p style="font-size: 16px; margin-top: 0;">平安，親愛的 <strong>${esc(name)}</strong>${fellowship ? `（${esc(fellowship)}）` : ''}：</p>
      <p style="font-size: 14.5px; color: #334155; line-height: 1.7;">
        感謝您熱心參與${esc(church.churchName)}全本手抄聖經事工！您剛才在線上選擇的章節<strong>已經正式認領成功</strong>，這封信作為提醒與存查用，也<strong>建議您截圖或拍照保存</strong>這封信、或記下所認領的書卷章數：
      </p>

      <!-- 認領章節清單 -->
      <div style="background: #f8fafc; border-left: 4px solid #BA2400; padding: 16px 18px; border-radius: 6px; margin: 18px 0; border: 1px solid #e2e8f0; border-left-width: 4px;">
        <h3 style="margin: 0 0 10px 0; font-size: 15px; color: #101828;">📖 您已認領的章節（共 ${chapters.length} 章，約需 ${totalPages} 面稿紙，AI 預估）：</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 14.5px; line-height: 1.8; color: #1e293b;">
          ${formatChapterListHtml(chapters)}
        </ul>
        <div style="margin-top: 10px; font-size: 13px; color: #64748b; border-top: 1px dashed #cbd5e1; padding-top: 8px;">
          📊 總計：${totalVerses} 節 ｜ 預估需使用 <strong>約 ${totalPages} 面專用稿紙</strong>（AI 預估，僅供參考）
        </div>
      </div>

      <!-- 抄寫重要注意事項 -->
      <h3 style="margin: 24px 0 10px 0; font-size: 15.5px; color: #101828; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">
        📌 抄寫提醒與規則
      </h3>
      <ol style="padding-left: 20px; font-size: 14px; color: #334155; margin: 0 0 18px 0; line-height: 1.8;">
        <li><strong>聖經譯本規範：</strong>一律請使用<strong>【和合本】（CUV）</strong>聖經版本抄寫。</li>
        <li><strong>筆具限制：</strong>請一律使用<strong>黑色或藍色筆</strong>抄寫。</li>
        <li><strong>書寫與列印：</strong>使用系統提供的專用稿紙檔案，<strong>70 磅紙張</strong>，<strong>列印為雙面</strong>，<strong>由上到下，由右到左</strong>書寫。</li>
        <li><strong>換章規則：</strong>以章為單位，每章抄寫完後，<strong>下一章請從新的一張稿紙開始</strong>。</li>
        <li><strong>截稿日期：</strong>請您務必在 <strong style="color: #BA2400;">${dates.deadlineLong}前</strong>抄寫完畢並繳交。${esc(church.overdueNotice)}</li>
      </ol>

      <!-- 稿紙下載卡片 -->
      <div style="text-align: center; margin: 20px 0; padding: 16px; background: #FDFBF7; border: 1px dashed #D0D5DD; border-radius: 8px;">
        <p style="margin: 0 0 8px 0; font-weight: 700; font-size: 14px; color: #101828;">📄 專用稿紙下載</p>
        <a href="${pdfDownloadUrl}" download="${esc(church.manuscriptPaperFile)}" target="_blank" style="display: inline-block; background: #101828; color: #ffffff; text-decoration: none; padding: 8px 20px; border-radius: 6px; font-size: 13px; font-weight: 600;">
          📥 下載「${esc(church.manuscriptPaperFile)}」
        </a>
      </div>

      <!-- 日後查詢或退選專屬連結 -->
      <div style="background: #ffffff; border: 1px solid #D0D5DD; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
        <p style="margin: 0 0 6px 0; font-weight: 700; font-size: 13.5px; color: #101828;">🔍 日後查詢或退選專屬連結：</p>
        <p style="margin: 0; font-size: 13px; color: #475467; word-break: break-all; line-height: 1.6;">
          若日後需查詢認領狀態、稿紙面數或進行退選，可隨時點擊此連結：<br>
          <a href="${baseUrl}/?token=${encodeURIComponent(token)}#my-claims" style="color: #BA2400; font-weight: 600;">${baseUrl}/?token=${encodeURIComponent(token)}#my-claims</a><br>
          <span style="color: #98A2B3;">請妥善保存這封信——這個連結是您日後查詢/取消認領唯一的方式。</span>
        </p>
      </div>

      <!-- 收件地點與時間 -->
      ${locationsEmailHtml()}
    </div>

    <!-- 頁尾 Footer -->
    <div style="background: #f8fafc; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
      ${esc(church.churchName)} 敬上
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `【${church.churchName}】手抄聖經認領成功通知 - ${name} 平安（此為提醒信，認領已生效）`,
    html,
    text: `平安 ${name}：\n\n感謝您參與${church.churchName}手抄聖經事工！您的認領已經正式生效，章節為：\n${formatChapterListText(chapters)}\n總計約需 ${totalPages} 面專用稿紙。\n\n日後查詢/取消請點此連結：\n${baseUrl}/?token=${encodeURIComponent(token)}#my-claims\n\n重要提醒：\n1. 譯本規範：一律使用【和合本】聖經抄寫\n2. 筆具限制：一律使用黑色或藍色筆\n3. 截稿日期：${dates.deadlineSlash}（${church.overdueNotice}）\n\n${church.churchName} 敬上`
  };
}

/**
 * 產生「截稿進度提醒信」
 */
export function generateReminderEmail({ name, email, chapters, token, baseUrl = 'http://localhost:5173' }) {
  const totalPages = chapters.reduce((sum, ch) => sum + (ch.estimatedPages || 1), 0);
  const magicLink = `${baseUrl}/?token=${encodeURIComponent(token)}#my-claims`;
  const pdfDownloadUrl = `${baseUrl}${manuscriptPaperPath}`;

  const html = `<!DOCTYPE html>
<html lang="zh-TW">
<head>
  <meta charset="utf-8">
  <title>【${church.churchName}】手抄聖經繳交進度提醒</title>
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans TC', sans-serif; background-color: #f1f5f9; padding: 24px 12px; margin: 0; color: #101828;">
  <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.08); border: 1px solid #e2e8f0;">
    
    <div style="background: linear-gradient(135deg, #78350f 0%, #451a03 100%); color: #ffffff; padding: 26px 24px; text-align: center;">
      <p style="margin: 0 0 6px 0; font-size: 13px; letter-spacing: 1.5px; color: #fde68a; font-weight: 600;">${esc(church.churchName)}・手抄聖經事工</p>
      <h1 style="margin: 0 0 6px 0; font-size: 22px; font-weight: 700; color: #ffffff;">截稿進度溫馨提醒</h1>
      <p style="margin: 0; font-size: 13.5px; opacity: 0.9; color: #fef3c7;">繳交截止日：${dates.deadlineLong}</p>
    </div>

    <div style="padding: 26px 24px;">
      <p style="font-size: 16px; margin-top: 0;">平安，親愛的 <strong>${esc(name)}</strong>：</p>
      <p style="font-size: 14.5px; color: #334155; line-height: 1.7;">
        手抄聖經繳交截止日即將到來（<strong>${dates.deadlineLong}</strong>），特別寄信關心您目前的抄寫進度：
      </p>
      <div style="background: #FFF5F5; border-left: 4px solid #BA2400; padding: 10px 14px; border-radius: 6px; margin: 12px 0 16px 0; font-size: 13.5px; color: #991B1B; line-height: 1.6;">
        ⚠️ <strong>重要提醒：</strong>${esc(church.overdueNotice)}
      </div>

      <div style="background: #FEF0C7; border-left: 4px solid #B54708; padding: 14px 18px; border-radius: 6px; margin: 18px 0;">
        <h3 style="margin: 0 0 8px 0; font-size: 15px; color: #78350f;">📖 您認領的抄寫章節（約需 ${totalPages} 面稿紙，AI 預估）：</h3>
        <ul style="margin: 0; padding-left: 20px; font-size: 14.5px; line-height: 1.8; color: #1e293b;">
          ${formatChapterListHtml(chapters)}
        </ul>
      </div>

      <p style="font-size: 14.5px; color: #334155; line-height: 1.7;">
        提醒您：抄寫時請務必使用<strong>【和合本】聖經版本</strong>與<strong>黑色或藍色筆</strong>。若您已經抄寫完畢，請記得將手抄稿送至收件處：
      </p>

      ${locationsEmailHtml()}

      <p style="font-size: 13.5px; color: #64748b; line-height: 1.6;">
        若您因時間困難<strong>無法如期完成</strong>，請不用擔心，您可透過下方專屬連結點選取消認領，同工將即時釋出章節讓其他會友接力完成：
      </p>

      <div style="text-align: center; margin: 20px 0;">
        <a href="${magicLink}" target="_blank" style="display: inline-block; background: #e2e8f0; color: #101828; text-decoration: none; padding: 9px 22px; border-radius: 6px; font-size: 13.5px; font-weight: 700;">
          🔗 前往查看 / 自助取消認領
        </a>
      </div>

      <div style="text-align: center; margin-top: 10px;">
        <a href="${pdfDownloadUrl}" download target="_blank" style="font-size: 13px; color: #BA2400; text-decoration: none; font-weight: 600;">
          📄 下載專用稿紙（${esc(church.manuscriptPaperFile)}）
        </a>
      </div>
    </div>

    <div style="background: #f8fafc; padding: 14px; text-align: center; font-size: 12px; color: #64748b; border-top: 1px solid #e2e8f0;">
      ${esc(church.churchName)} 敬上
    </div>
  </div>
</body>
</html>`;

  return {
    subject: `【${church.churchName}】手抄聖經繳交進度提醒 - ${name}`,
    html,
    text: `平安 ${name}：\n\n手抄聖經繳交截止日即將到來（${dates.deadlineSlash}），特別提醒您關心抄寫進度。\n${church.overdueNotice}\n請使用【和合本】聖經與黑色/藍色筆抄寫。\n若需退選請點此連結：${magicLink}\n\n${church.churchName} 敬上`
  };
}

/**
 * 檢查電子郵件信箱格式是否正確
 * @param {string} email
 * @returns {{ valid: boolean, error?: string, suggestion?: string }}
 */
export function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return { valid: false, error: '請輸入電子郵件信箱' };
  }
  const cleanEmail = email.trim();
  // 嚴格標準 Email 正則表達式
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(cleanEmail)) {
    return { valid: false, error: '電子郵件信箱格式不正確（請確認是否包含 @ 與完整網域名稱）' };
  }

  // 常見拼字錯誤防呆提醒
  const domain = cleanEmail.split('@')[1].toLowerCase();
  const commonTypos = {
    'gamil.com': 'gmail.com',
    'gmai.com': 'gmail.com',
    'gmial.com': 'gmail.com',
    'yahoo.com.tw': 'yahoo.com.tw',
    'yaho.com': 'yahoo.com',
    'hotmial.com': 'hotmail.com'
  };

  if (commonTypos[domain] && commonTypos[domain] !== domain) {
    return {
      valid: false,
      error: `信箱網域似乎拼錯了（您輸入了 @${domain}，是否為 @${commonTypos[domain]}？）`,
      suggestion: `${cleanEmail.split('@')[0]}@${commonTypos[domain]}`
    };
  }

  return { valid: true };
}

/**
 * 寄送信件（呼叫後端 API 並記錄）
 */
export async function sendEmail({ to, subject, html, text, adminPin }) {
  const emailLog = {
    id: 'mail_' + Date.now(),
    to,
    subject,
    html,
    text,
    sentAt: new Date().toISOString()
  };

  if (typeof localStorage !== 'undefined') {
    const logs = JSON.parse(localStorage.getItem('hand_copied_bible_email_logs') || '[]');
    logs.unshift(emailLog);
    if (logs.length > 50) logs.pop();
    localStorage.setItem('hand_copied_bible_email_logs', JSON.stringify(logs));
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('bible_email_sent', { detail: emailLog }));
  }

  try {
    // /api/send-email 目前只給後台催件功能用，需要帶管理員 PIN 碼（見 api/_admin_auth.js）
    const response = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-admin-pin': adminPin || '' },
      body: JSON.stringify({ to, subject, html, text })
    });
    if (response.status === 401) {
      return { success: false, unauthorized: true, emailLog };
    }
    if (response.ok) {
      const data = await response.json();
      return { success: true, mode: data.mode, messageId: data.messageId, emailLog };
    }
    return { success: false, emailLog };
  } catch (err) {
    console.warn('後端發信 API 呼叫失敗', err);
    return { success: false, emailLog };
  }
}
