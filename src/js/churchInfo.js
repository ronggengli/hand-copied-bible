/**
 * 從 church.config.js 衍生出頁面與信件要用的字串。
 * 前端（Vite 打包）與後端 API（Vercel Serverless）共用同一份，所以這裡不能用瀏覽器專用的 API。
 */
import config from '../../church.config.js';

export const church = config;

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

/** 回傳 { y, m, d }；格式不符（例如預設的 XXXX-XX-XX）回傳 null */
function parseYmd(s) {
  const m = YMD.exec(String(s));
  return m ? { y: m[1], m: String(parseInt(m[2], 10)), d: String(parseInt(m[3], 10)) } : null;
}

const start = parseYmd(config.eventStart);
const end = parseYmd(config.deadline);

/** 尚未填入真實截止日（仍是佔位符） */
export const deadlineIsPlaceholder = !end;

const PH = { y: 'XXXX', m: 'XX', d: 'XX' };
const s0 = start || PH;
const e0 = end || PH;

export const dates = {
  deadlineLong: `${e0.y} 年 ${e0.m} 月 ${e0.d} 日`,
  deadlineMd: `${e0.m} 月 ${e0.d} 日`,
  deadlineSlash: `${e0.y}/${e0.m}/${e0.d}`,
  eventRange: `${s0.y} 年 ${s0.m} 月 ${s0.d} 日至 ${e0.m} 月 ${e0.d} 日`
};

/** 截止日當天 23:59:59（設定的時區）之後算逾期 */
export function isPastDeadline(now = new Date()) {
  if (deadlineIsPlaceholder) return false;
  const endOfDeadline = new Date(`${config.deadline}T23:59:59${config.timezoneOffset}`);
  return now.getTime() > endOfDeadline.getTime();
}

export function isClaimingClosed(now = new Date()) {
  return !!config.closeClaimsAfterDeadline && isPastDeadline(now);
}

/** 稿紙 PDF 在網站上的路徑（檔名含中文，必須編碼） */
export const manuscriptPaperPath = `/${encodeURIComponent(config.manuscriptPaperFile)}`;

/** 一行文字版的收件處，例如「教會服務台（一樓大廳）」 */
export function locationsInlineText() {
  return config.dropoffLocations
    .map(l => `${l.name}${l.note || ''}`)
    .join(' / ');
}

/** 網頁「收件地點及時間」卡片內的地點清單 */
export function locationsCardsHtml() {
  return config.dropoffLocations.map(l => `
                <div class="location-item">
                  <div class="loc-badge">${esc(l.name)}</div>
                  <div class="loc-time">
                    ${(l.schedule || []).map(s => esc(s)).join('<br>\n                    ')}
                    ${l.note ? `<br><span class="loc-sub">${esc(l.note)}</span>` : ''}
                  </div>
                </div>`).join('');
}

/** 信件內「收件地點與時間」區塊 */
export function locationsEmailHtml() {
  const items = config.dropoffLocations.map((l, i) => `
          <div style="flex: 1 1 180px;${i > 0 ? ' border-left: 1px solid #e2e8f0; padding-left: 20px;' : ''}">
            <strong style="color: #101828;">${esc(l.name)}</strong><br>
            ${(l.schedule || []).map(s => esc(s)).join('<br>')}${l.note ? `<br>
            <span style="color: #64748b; font-size: 12.5px;">${esc(l.note)}</span>` : ''}
          </div>`).join('');
  return `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px;">
        <h4 style="margin: 0 0 10px 0; font-size: 14px; color: #101828;">📍 收件地點與時間：</h4>
        <div style="display: flex; flex-wrap: wrap; gap: 20px; font-size: 13.5px; color: #475467; line-height: 1.7;">${items}
        </div>
      </div>`;
}
