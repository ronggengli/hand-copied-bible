import { BIBLE_BOOKS, getChapterMeta, estimatePageCount } from '../data/bibleData.js';
import { storageService } from './storage.js';
import { AdminModule } from './admin.js';
import { validateEmail } from './emailService.js';
import { triggerConfetti } from './confetti.js';
import { church, dates, locationsInlineText } from './churchInfo.js';

const MAX_CHAPTERS = church.maxChaptersPerPerson;

/**
 * HTML 跳脫工具：在把任何使用者可控字串插入 innerHTML 前，必須先過這支函式。
 * 防止 Stored XSS：攻擊者把惡意 HTML 標籤（如 <img onerror=...>）寫進 name/
 * fellowship/email 欄位，後台同工開啟名冊時觸發腳本執行。
 */
const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// DOM 快取
const elements = {
  navClaim: document.getElementById('btn-nav-claim'),
  navMyClaim: document.getElementById('btn-nav-myclaim'),
  navAdmin: document.getElementById('btn-nav-admin'),

  sectionClaim: document.getElementById('section-claim'),
  sectionMyClaim: document.getElementById('section-myclaim'),
  sectionAdmin: document.getElementById('section-admin'),
  sectionVerifiedSuccess: document.getElementById('section-verified-success'),
  
  // 慶祝專屬頁面
  celebrationCardContent: document.getElementById('celebration-card-content'),
  btnCopySuccessLink: document.getElementById('btn-copy-success-link'),
  btnBackHome: document.getElementById('btn-back-home'),
  
  booksContainer: document.getElementById('books-container'),
  overallProgressBar: document.getElementById('overall-progress-bar'),
  overallProgressStats: document.getElementById('overall-progress-stats'),
  submittedProgressBar: document.getElementById('submitted-progress-bar'),
  submittedProgressStats: document.getElementById('submitted-progress-stats'),
  categoryTabGroup: document.getElementById('category-tab-group'),
  claimStatusTabGroup: document.getElementById('claim-status-tab-group'),
  bookSearchInput: document.getElementById('book-search-input'),
  
  // 選擇困難隨機按鈕
  btnLucky1: document.getElementById('btn-lucky-1'),
  btnLucky2: document.getElementById('btn-lucky-2'),
  btnLucky3: document.getElementById('btn-lucky-3'),

  // 浮動購物車
  floatingCart: document.getElementById('floating-cart'),
  cartSelectedCount: document.getElementById('cart-selected-count'),
  claimSelectedList: document.getElementById('claim-selected-list'),
  btnClearSelected: document.getElementById('btn-clear-selected'),
  btnOpenClaimModal: document.getElementById('btn-open-claim-modal'),

  // 認領填表 Modal
  modalClaim: document.getElementById('modal-claim'),
  modalClaimClose: document.getElementById('modal-claim-close'),
  modalSelectedSummary: document.getElementById('modal-selected-summary'),
  formClaim: document.getElementById('form-claim'),
  claimName: document.getElementById('claim-name'),
  claimEmail: document.getElementById('claim-email'),
  claimFellowship: document.getElementById('claim-fellowship'),
  emailErrorHint: document.getElementById('email-error-hint'),
  btnSubmitClaim: document.getElementById('btn-submit-claim'),

  // 驗證成功 Modal (Verified Modal，目前流程未使用，保留 DOM 供未來擴充)
  modalVerified: document.getElementById('modal-verified'),
  modalVerifiedClose: document.getElementById('modal-verified-close'),
  btnCloseVerifiedModal: document.getElementById('btn-close-verified-modal'),
  verifiedModalDesc: document.getElementById('verified-modal-desc'),
  verifiedDetails: document.getElementById('verified-details'),

  // 我的認領查詢
  tokenSearchInput: document.getElementById('token-search-input'),
  btnSearchToken: document.getElementById('btn-search-token'),
  myClaimContainer: document.getElementById('my-claim-container'),

  // 管理後台
  adminLoginForm: document.getElementById('admin-login-form'),
  adminPinInput: document.getElementById('admin-pin-input'),
  adminDashboard: document.getElementById('admin-dashboard'),
  adminStatsGrid: document.getElementById('admin-stats-grid'),
  adminFilterStatus: document.getElementById('admin-filter-status'),
  adminSearchInput: document.getElementById('admin-search-input'),
  adminClaimsTbody: document.getElementById('admin-claims-tbody'),
  btnAdminBatchRemind: document.getElementById('btn-admin-batch-remind'),
  btnAdminExportCsv: document.getElementById('btn-admin-export-csv'),
  btnAdminResetData: document.getElementById('btn-admin-reset-data'),
  btnAdminLogout: document.getElementById('btn-admin-logout'),

  // 後台頁籤：名單管理 / 章節收件
  adminTabGroup: document.getElementById('admin-tab-group'),
  adminPanelRoster: document.getElementById('admin-panel-roster'),
  adminPanelChapters: document.getElementById('admin-panel-chapters'),
  adminBooksContainer: document.getElementById('admin-books-container'),
  adminChapterCategoryTabGroup: document.getElementById('admin-chapter-category-tab-group'),
  adminChapterSearchInput: document.getElementById('admin-chapter-search-input'),

  // 信件預覽 Modal & 記錄列表
  modalEmailPreview: document.getElementById('modal-email-preview'),
  emailModalClose: document.getElementById('email-modal-close'),
  emailModalSubject: document.getElementById('email-modal-subject'),
  emailModalTo: document.getElementById('email-modal-to'),
  emailModalFrame: document.getElementById('email-modal-frame'),
  emailLogsList: document.getElementById('email-logs-list'),

  toastContainer: document.getElementById('toast-container')
};

// 狀態
let currentCategory = 'all';
let currentSearchKeyword = '';
let currentClaimFilter = 'all'; // 'all' | 'unclaimed' | 'claimed'
let selectedChapters = []; // [{ bookId, bookName, chapter, verses, estimatedPages }]
let lastSentEmailLog = null;

// 後台「章節收件」頁籤的篩選狀態（跟公開認領頁籤的 currentCategory/currentSearchKeyword 分開，
// 兩邊互不干擾）
let adminChapterCategory = 'all';
let adminChapterSearchKeyword = '';

// renderAdminSection() 內有兩次 await（向後端重新拉取最新資料），若連續快速點擊多個
// 「標記已收件」按鈕，會同時觸發多個 renderAdminSection() 呼叫，網路回應到達的順序
// 不保證跟觸發順序一致。用遞增序號擋掉「較晚觸發、但較早跑完」的過期結果去覆蓋畫面，
// 否則會出現：某幾章明明標記成功（toast 顯示成功），畫面卻沒變成已收件的詭異現象。
let adminRenderSeq = 0;

// 後台「章節收件」格子正在儲存中的章節（chapter_key）。重新渲染網格時要靠它還原「儲存中」外觀，
// 並且擋掉儲存期間的重複點擊：過去沒有任何回饋，同工以為沒成功就再點一次，第二下會變成「取消標記」。
const savingChapterKeys = new Set();

// 後台「名單」頁各個按鈕（繳交徽章／釋出／催件）正在處理中的動作，用途跟 savingChapterKeys 相同：
// 處理期間按鈕顯示忙碼文字、游標變禁止符號、擋掉重複點擊（催件重複點會重複寄信）。
const busyActionKeys = new Set();

function applyBusy(btn, text) {
  if (!btn || btn.classList.contains('is-busy')) return;
  btn.dataset.idleHtml = btn.innerHTML;
  btn.classList.add('is-busy');
  btn.setAttribute('aria-busy', 'true');
  btn.textContent = text;
}

function clearBusy(btn) {
  if (!btn || !btn.classList.contains('is-busy')) return;
  if (btn.dataset.idleHtml !== undefined) btn.innerHTML = btn.dataset.idleHtml;
  btn.classList.remove('is-busy');
  btn.removeAttribute('aria-busy');
  delete btn.dataset.idleHtml;
}

/**
 * 鎖定某個按鈕直到 fn 完成。用 id 重新找按鈕是因為處理期間名單可能已被重新渲染（舊的 DOM 元素已失效）。
 */
async function runLocked(key, btnId, busyText, fn) {
  if (busyActionKeys.has(key)) return;
  busyActionKeys.add(key);
  applyBusy(document.getElementById(btnId), busyText);
  try {
    return await fn();
  } finally {
    busyActionKeys.delete(key);
    clearBusy(document.getElementById(btnId));
  }
}

// Toast 提示（sticky=true 時不會自動消失，需點擊關閉；用於「儲存失敗」這類不能讓人漏看的訊息）
export function showToast(message, type = 'info', { sticky = false } = {}) {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerText = sticky ? `${message}\n（點此關閉）` : message;
  elements.toastContainer.appendChild(toast);
  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  };
  if (sticky) {
    toast.style.cursor = 'pointer';
    toast.addEventListener('click', dismiss);
  } else {
    setTimeout(dismiss, 3500);
  }
}

// 模組實例化
const adminModule = new AdminModule({
  // 回傳 Promise：讓「章節收件」格子能等到畫面真的更新完才解除「儲存中」
  onStateChange: async () => {
    renderBooks();
    updateOverallProgress();
    await renderAdminSection();
  },
  showToast
});

/**
 * 監聽信件發送以更新預覽
 */
window.addEventListener('bible_email_sent', (e) => {
  lastSentEmailLog = e.detail;
  renderEmailLogs();
});

/**
 * 頁面導航切換
 */
function switchView(viewName) {
  const heroBanner = document.querySelector('.hero-banner');
  const noticeSection = document.querySelector('.notice-section');

  const views = [
    { name: 'claim', nav: elements.navClaim, sec: elements.sectionClaim },
    { name: 'myclaim', nav: elements.navMyClaim, sec: elements.sectionMyClaim },
    { name: 'admin', nav: elements.navAdmin, sec: elements.sectionAdmin },
    { name: 'verified-success', nav: null, sec: elements.sectionVerifiedSuccess }
  ];

  // 慶祝專屬頁面隱藏首頁大 Banner 與提醒卡片；管理員後台則只隱藏「抄寫重要提醒與繳交須知」
  // （那是給會友抄經用的須知，管理員後台不需要），大 Banner／進度條照樣保留。
  if (viewName === 'verified-success') {
    if (heroBanner) heroBanner.style.display = 'none';
    if (noticeSection) noticeSection.style.display = 'none';
  } else if (viewName === 'admin') {
    if (heroBanner) heroBanner.style.display = 'block';
    if (noticeSection) noticeSection.style.display = 'none';
  } else {
    if (heroBanner) heroBanner.style.display = 'block';
    if (noticeSection) noticeSection.style.display = 'block';
  }

  views.forEach(v => {
    if (v.name === viewName) {
      if (v.nav) v.nav.classList.add('active');
      if (v.sec) v.sec.style.display = 'block';
    } else {
      if (v.nav) v.nav.classList.remove('active');
      if (v.sec) v.sec.style.display = 'none';
    }
  });

  if (viewName === 'admin') renderAdminSection();
  if (viewName === 'claim') renderBooks();
}

/**
 * 渲染全聖經進度條
 */
function updateOverallProgress() {
  const total = 1189;
  const claimedMap = storageService.getClaimedChapterMap();
  const claimedCount = claimedMap.size;
  const pct = ((claimedCount / total) * 100).toFixed(1);

  elements.overallProgressBar.style.width = `${pct}%`;
  elements.overallProgressStats.innerText = `${claimedCount} / ${total} 章 (${pct}%)`;

  // 已經繳交進度：分母跟主進度條一致（全書 1189 章），連動後台「章節收件」頁籤的標記結果
  let submittedCount = 0;
  claimedMap.forEach(info => { if (info.submitted) submittedCount++; });
  const submittedPct = ((submittedCount / total) * 100).toFixed(1);

  if (elements.submittedProgressBar) elements.submittedProgressBar.style.width = `${submittedPct}%`;
  if (elements.submittedProgressStats) elements.submittedProgressStats.innerText = `${submittedCount} / ${total} 章 (${submittedPct}%)`;
}

/**
 * 渲染 66 卷書與章節格子
 */
function renderBooks() {
  const claimedMap = storageService.getClaimedChapterMap();
  const selectedKeySet = new Set(selectedChapters.map(c => `${c.bookId}_${c.chapter}`));

  let filtered = BIBLE_BOOKS;
  if (currentCategory !== 'all') {
    filtered = filtered.filter(b => b.testament.toLowerCase() === currentCategory.toLowerCase());
  }
  if (currentSearchKeyword) {
    const kw = currentSearchKeyword.toLowerCase();
    filtered = filtered.filter(b => 
      b.name.toLowerCase().includes(kw) || 
      (b.short && b.short.toLowerCase().includes(kw)) ||
      b.id.toLowerCase().includes(kw)
    );
  }

  elements.booksContainer.innerHTML = '';

  if (filtered.length === 0) {
    elements.booksContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        找不到符合「${esc(currentSearchKeyword)}」的聖經書卷。
      </div>
    `;
    return;
  }

  filtered.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';
    card.id = `book-card-${book.id.toLowerCase()}`;

    const totalCh = book.chapters ? book.chapters.length : 1;

    // 書卷頭部
    let claimedInBook = 0;
    let submittedInBook = 0;
    for (let c = 1; c <= totalCh; c++) {
      const info = claimedMap.get(`${book.id.toLowerCase()}_${c}`);
      if (info) {
        claimedInBook++;
        if (info.submitted) submittedInBook++;
      }
    }

    // 依認領狀態篩選決定要顯示的章節清單
    const chaptersToShow = [];
    for (let c = 1; c <= totalCh; c++) {
      const key = `${book.id.toLowerCase()}_${c}`;
      const isClaimed = claimedMap.has(key);
      if (currentClaimFilter === 'unclaimed' && isClaimed) continue;
      if (currentClaimFilter === 'claimed' && !isClaimed) continue;
      chaptersToShow.push(c);
    }

    // 篩選後沒有任何章節要顯示，則跳過此書卷
    if (chaptersToShow.length === 0) return;

    const header = document.createElement('div');
    header.className = 'book-card-header';
    header.innerHTML = `
      <div>
        <span class="book-name">${book.name}</span>
        <span class="book-testament-badge ${book.testament.toLowerCase()}">${book.testament.toUpperCase() === 'OT' ? '舊約' : '新約'}</span>
      </div>
      <div class="book-meta">
        ${claimedInBook}/${totalCh} 章已認領 <span style="opacity: 0.7;">(${submittedInBook}/${claimedInBook} 章已收件)</span>
      </div>
    `;
    card.appendChild(header);

    // 章節網格
    const grid = document.createElement('div');
    grid.className = 'chapter-grid';

    for (const ch of chaptersToShow) {
      const key = `${book.id.toLowerCase()}_${ch}`;
      const claimInfo = claimedMap.get(key);
      const isClaimed = !!claimInfo;
      const isSubmitted = !!(claimInfo && claimInfo.submitted);
      const isSelected = selectedKeySet.has(key);
      const { verses, estimatedPages } = getChapterMeta(book.id, ch);

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = `chapter-btn ${isClaimed ? 'claimed' : ''} ${isSubmitted ? 'submitted' : ''} ${isSelected ? 'selected' : ''}`;
      btn.title = isSubmitted
        ? `${book.name} 第 ${ch} 章（共 ${verses} 節，約需 ${estimatedPages} 面稿紙，AI 預估）已收件`
        : `${book.name} 第 ${ch} 章（共 ${verses} 節，約需 ${estimatedPages} 面稿紙，AI 預估）`;
      
      btn.innerHTML = `
        <span class="chapter-num">${ch}</span>
        <span class="chapter-verses">${verses}節・${estimatedPages}面(估)</span>
      `;


      if (isClaimed) {
        btn.disabled = true;
      } else {
        btn.addEventListener('click', () => toggleChapterSelection(book, ch, verses, estimatedPages));
      }

      grid.appendChild(btn);
    }

    card.appendChild(grid);
    elements.booksContainer.appendChild(card);
  });

  updateOverallProgress();
  updateFloatingCart();
}

/**
 * 切換章節選取 (每人最多 MAX_CHAPTERS 章，見 church.config.js)
 */
function toggleChapterSelection(book, chapter, verses, estimatedPages) {
  const bId = book.id.toLowerCase();
  const index = selectedChapters.findIndex(c => c.bookId.toLowerCase() === bId && c.chapter === chapter);

  if (index !== -1) {
    selectedChapters.splice(index, 1);
  } else {
    if (selectedChapters.length >= MAX_CHAPTERS) {
      showToast(`每人最多限認領 ${MAX_CHAPTERS} 章。若欲更換，請先點擊已選章節取消選取。`, 'warning');
      return;
    }
    selectedChapters.push({
      bookId: bId,
      bookName: book.name,
      chapter,
      verses,
      estimatedPages
    });
  }

  renderBooks();
}

/**
 * 🎲 隨機選章功能（讓電腦幫我選 1, 2, 3 章）
 */
function luckyPickChapters(count) {
  const claimedMap = storageService.getClaimedChapterMap();
  const availablePool = [];

  // 收集全聖經 1,189 章中所有未被認領的章節
  for (const book of BIBLE_BOOKS) {
    const totalCh = book.chapters ? book.chapters.length : 1;
    for (let ch = 1; ch <= totalCh; ch++) {
      const key = `${book.id.toLowerCase()}_${ch}`;
      if (!claimedMap.has(key)) {
        const { verses, estimatedPages } = getChapterMeta(book.id, ch);
        availablePool.push({
          bookId: book.id.toLowerCase(),
          bookName: book.name,
          chapter: ch,
          verses,
          estimatedPages
        });
      }
    }
  }

  if (availablePool.length === 0) {
    showToast('全本聖經 1,189 章已全數被認領完畢！感謝主的恩典！', 'info');
    return;
  }

  const pickCount = Math.min(count, availablePool.length, MAX_CHAPTERS);
  for (let i = availablePool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availablePool[i], availablePool[j]] = [availablePool[j], availablePool[i]];
  }

  selectedChapters = availablePool.slice(0, pickCount);
  renderBooks();

  const names = selectedChapters.map(c => `${c.bookName} 第 ${c.chapter} 章`).join('、');
  showToast(`🎲 電腦已為您隨機挑選 ${pickCount} 章：${names}！`, 'success');

  // 直接跳出填寫資料並送出認領彈窗
  setTimeout(() => {
    openClaimModal();
  }, 250);
}

/**
 * 更新底部懸浮認領選取列
 */
function updateFloatingCart() {
  if (!selectedChapters || selectedChapters.length === 0) {
    elements.floatingCart.style.display = 'none';
    elements.floatingCart.classList.remove('active');
    return;
  }

  elements.floatingCart.style.display = 'flex';
  elements.floatingCart.classList.add('active');
  elements.cartSelectedCount.innerText = selectedChapters.length;

  const totalVerses = selectedChapters.reduce((sum, c) => sum + (c.verses || 0), 0);
  const totalPages = selectedChapters.reduce((sum, c) => sum + (c.estimatedPages || 1), 0);

  const listText = selectedChapters.map(c => `【${c.bookName} 第 ${c.chapter} 章】`).join(' ');
  elements.claimSelectedList.innerHTML = `${listText} <span style="opacity: 0.85; font-size: 12px; margin-left: 6px;">(${totalVerses} 節・約 ${totalPages} 面稿紙，AI 預估)</span>`;
}

/**
 * 打開認領資料填寫彈窗
 */
function openClaimModal() {
  if (selectedChapters.length === 0) {
    showToast(`請先點選 1 至 ${MAX_CHAPTERS} 個欲認領的聖經章節`, 'warning');
    return;
  }

  // 開啟彈窗時暫時隱藏底部懸浮列，避免手機畫面遮擋
  elements.floatingCart.style.display = 'none';

  const totalVerses = selectedChapters.reduce((sum, c) => sum + (c.verses || 0), 0);
  const totalPages = selectedChapters.reduce((sum, c) => sum + (c.estimatedPages || 1), 0);

  let html = `<ul style="margin: 0; padding-left: 20px; font-size: 14.5px; line-height: 1.8;">`;
  selectedChapters.forEach(c => {
    html += `<li><strong>${esc(c.bookName)}</strong> 第 ${esc(c.chapter)} 章 <span style="color: #64748b; font-size: 0.9em;">(共 ${c.verses} 節，約需 ${c.estimatedPages || 1} 面稿紙，AI 預估)</span></li>`;
  });
  html += `</ul>`;
  html += `<div style="margin-top: 10px; font-size: 13px; color: #475467; border-top: 1px dashed #D0D5DD; padding-top: 8px;">
    📊 總計：${selectedChapters.length} 章 ｜ 共 ${totalVerses} 節 ｜ 預估約需 <strong>${totalPages} 面 A4 300字專用稿紙</strong>（AI 預估，僅供參考）
  </div>`;

  elements.modalSelectedSummary.innerHTML = html;
  elements.emailErrorHint.style.display = 'none';
  elements.modalClaim.style.display = 'flex';
  elements.claimName.focus();
}

function closeClaimModal() {
  elements.modalClaim.style.display = 'none';
  updateFloatingCart();
}

/**
 * 顯示表單內的紅底錯誤提示
 */
function showClaimFormError(message) {
  elements.emailErrorHint.innerHTML = message;
  elements.emailErrorHint.style.display = 'block';
  elements.emailErrorHint.style.background = '#FEE4E2';
  elements.emailErrorHint.style.color = '#B42318';
  elements.emailErrorHint.style.border = '1px solid #FDA29B';
  elements.emailErrorHint.style.borderRadius = '8px';
  elements.emailErrorHint.style.padding = '10px 14px';
  elements.emailErrorHint.style.marginTop = '10px';
}

/**
 * 送出認領表單：單步驟流程，送出當下即正式完成認領（不需再點信件連結）。
 * Email 為選填，信件僅作為事後提醒之用。
 */
async function handleClaimSubmit(e) {
  e.preventDefault();
  const name = elements.claimName.value.trim();
  const email = elements.claimEmail.value.trim();
  const fellowship = elements.claimFellowship.value.trim();

  if (!name) {
    showToast('請輸入姓名', 'warning');
    return;
  }

  // Email 選填，但只要有填就要驗證格式
  if (email) {
    const emailVal = validateEmail(email);
    if (!emailVal.valid) {
      elements.emailErrorHint.innerText = emailVal.error;
      elements.emailErrorHint.style.display = 'block';
      if (emailVal.suggestion) {
        elements.emailErrorHint.innerHTML += `<br><a href="#" id="use-email-suggest" style="color: #BA2400; text-decoration: underline;">點此改為：${esc(emailVal.suggestion)}</a>`;
        document.getElementById('use-email-suggest')?.addEventListener('click', (ev) => {
          ev.preventDefault();
          elements.claimEmail.value = emailVal.suggestion;
          elements.emailErrorHint.style.display = 'none';
        });
      }
      return;
    }
  }

  elements.btnSubmitClaim.disabled = true;
  elements.btnSubmitClaim.innerText = '正在送出認領...';

  const result = await storageService.requestClaim({
    name,
    email,
    fellowship,
    chapters: [...selectedChapters]
  });

  elements.btnSubmitClaim.disabled = false;
  elements.btnSubmitClaim.innerText = '✅ 送出認領（立即完成）';

  if (!result.success) {
    // 章節衝突：後端已指出具體是哪幾章被搶走，直接從已選清單移除，
    // 讓使用者不用自己意識到要取消勾選，改完章節就能直接再送出一次
    if (result.conflictChapters && result.conflictChapters.length > 0) {
      const conflictKeys = new Set(result.conflictChapters.map(c => `${(c.bookId || '').toLowerCase()}_${c.chapter}`));
      selectedChapters = selectedChapters.filter(c => !conflictKeys.has(`${c.bookId.toLowerCase()}_${c.chapter}`));
      renderBooks();
      // 衝突的章節都被移除後可能一章都不剩，這種情況直接關掉彈窗讓使用者從頭重選，
      // 避免彈窗留著一份跟 selectedChapters 對不上的過期摘要
      if (selectedChapters.length > 0) {
        openClaimModal();
      } else {
        elements.modalClaim.style.display = 'none';
      }
    }
    showClaimFormError(`⚠️ ${result.error}`);
    showToast(result.error || '認領失敗，請稍後再試', 'error');
    return;
  }

  // 記住剛才這封信自己的預覽內容（僅供「預覽發送信件」按鈕使用，不寫入任何共用紀錄）
  lastSentEmailLog = result.emailPreview || null;

  // 關閉填表彈窗，直接切換至慶祝頁面（不再需要等信件點擊確認）
  elements.modalClaim.style.display = 'none';
  renderCelebrationPage(result.claim, result.emailSent);

  // 清空選取
  selectedChapters = [];
  elements.claimName.value = '';
  elements.claimEmail.value = '';
  elements.claimFellowship.value = '';
  renderBooks();
}

/**
 * 渲染認領成功慶祝頁面（表單送出成功後直接呼叫，不再需要透過信件連結觸發）
 */
function renderCelebrationPage(claim, emailSent) {
  const totalVerses = claim.chapters.reduce((sum, c) => sum + (c.verses || 0), 0);
  const totalPages = claim.chapters.reduce((sum, c) => sum + (c.estimatedPages || 1), 0);

  switchView('verified-success');

  const reminderNoticeHtml = emailSent
    ? `📧 系統已寄送電子郵件提醒至您的信箱，也<strong>鼓勵您截圖、拍照或記下</strong>所認領的書卷章數。`
    : `⚠️ <strong>您未填寫電子郵件信箱，系統無法寄送提醒信，之後也無法自助查詢或取消認領。</strong>請務必<strong>截圖、拍照或記下</strong>所認領的書卷章數！`;

  elements.celebrationCardContent.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1px solid var(--border); padding-bottom: 16px; margin-bottom: 18px;">
      <div>
        <h2 style="font-size: 20px; color: var(--brand-dark); margin: 0 0 4px 0;">${esc(claim.name)} 平安</h2>
        ${claim.email ? `<p style="margin: 0; font-size: 13.5px; color: var(--text-muted);">${esc(claim.email)}</p>` : ''}
      </div>
      <span class="badge badge-submitted" style="font-size: 13px; padding: 4px 12px;">✓ 已正式確認認領</span>
    </div>

    <h3 style="font-size: 16px; color: #101828; margin: 0 0 10px 0;">📖 您所認領的抄寫章節：</h3>
    <ul style="margin: 0 0 16px 0; padding-left: 20px; line-height: 1.9; font-size: 15px;">
      ${claim.chapters.map(c => `<li><strong>${esc(c.bookName)}</strong> 第 ${esc(c.chapter)} 章 <span style="color: var(--text-muted); font-size: 0.9em;">(共 ${c.verses} 節 ｜ 約需 ${c.estimatedPages || 1} 面稿紙，AI 預估)</span></li>`).join('')}
    </ul>

    <div style="background: #F8F9FA; border-radius: var(--radius-md); padding: 14px 16px; font-size: 13.5px; color: #334155; line-height: 1.7; border-left: 4px solid var(--brand-red); margin-bottom: 14px;">
      📊 <strong>總計：</strong>共 ${claim.chapters.length} 章、${totalVerses} 節 ｜ 預估需使用 <strong>約 ${totalPages} 面專用稿紙</strong>（AI 預估，僅供參考）<br>
      📌 <strong>抄寫提醒：</strong>一律請使用<strong>【和合本】</strong>聖經版本與<strong>黑色或藍色筆</strong>抄寫，並於 <strong>${dates.deadlineSlash} 前</strong>送至指定收件處（${esc(locationsInlineText())}）。${esc(church.overdueNotice)}
    </div>

    <div style="background: #FFFAEB; border: 1px solid #FEDF89; border-radius: var(--radius-md); padding: 12px 16px; font-size: 13.5px; color: #7A5B00; line-height: 1.6;">
      ${reminderNoticeHtml}
      ${emailSent && lastSentEmailLog ? `<br><button type="button" id="btn-preview-celebration-email" style="margin-top: 8px; border: none; background: none; color: #BA2400; font-weight: 600; text-decoration: underline; cursor: pointer; padding: 0; font-size: 13px;">👁️ 預覽剛才寄出的提醒信</button>` : ''}
    </div>
  `;

  document.getElementById('btn-preview-celebration-email')?.addEventListener('click', () => {
    if (lastSentEmailLog) openEmailPreview(lastSentEmailLog);
  });

  // 綁定複製連結與返回按鈕
  const queryLink = `${window.location.origin}/?token=${claim.token}#my-claims`;
  elements.btnCopySuccessLink.onclick = () => {
    navigator.clipboard.writeText(queryLink);
    showToast('已成功複製您的專屬查詢/退選連結！', 'success');
  };
  elements.btnBackHome.onclick = () => {
    switchView('claim');
  };

  // 💥 施放慶祝彩帶與煙火特效！
  setTimeout(() => {
    triggerConfetti();
  }, 200);

  showToast('🎉 恭喜！您已正式完成手抄聖經認領！', 'success');
}

/**
 * 處理 URL 帶有 ?token=xxx 的查詢捷徑（提醒信裡「查詢/退選」連結會帶這個參數）
 */
async function checkUrlTokenQuery() {
  const urlParams = new URLSearchParams(window.location.search);
  const token = urlParams.get('token');
  if (token) {
    switchView('myclaim');
    elements.tokenSearchInput.value = token;
    searchMyClaims(token);
  }
}

/**
 * 查詢我的認領（支援 Token、完整驗證連結或 Email 信箱查詢）
 */
async function searchMyClaims(tokenQuery) {
  let query = (tokenQuery || elements.tokenSearchInput.value).trim();
  if (query.includes('token=')) {
    const match = query.match(/token=([^&#\s]+)/);
    if (match) query = match[1];
  }

  if (!query) {
    showToast('請輸入您認領時填寫的電子郵件信箱（或確認信中的專屬連結／驗證碼）', 'warning');
    return;
  }

  // 伺服器端過濾查詢，只回傳這一筆——不會把全教會的資料下載到瀏覽器
  const lookupRes = await storageService.lookupMyClaim(query);
  if (!lookupRes.success) {
    showToast(lookupRes.error, 'error');
    return;
  }

  const claim = lookupRes.claim;
  if (!claim) {
    elements.myClaimContainer.innerHTML = `
      <div style="background: #ffffff; padding: 36px; border-radius: var(--radius-lg); border: 1px solid var(--border); text-align: center;">
        <div style="font-size: 40px; margin-bottom: 10px;">🔍</div>
        <h3 style="margin-bottom: 8px; color: var(--brand-dark);">查無此認領記錄</h3>
        <p style="color: var(--text-muted); font-size: 14px; line-height: 1.6;">
          找不到「${esc(query)}」的認領記錄。<br>
          請確認您輸入的<strong>認領時填寫的電子郵件信箱</strong>、<strong>確認信中的完整連結</strong>或<strong>專屬代碼 (Token)</strong>是否正確。
        </p>
      </div>
    `;
    return;
  }

  const totalPages = claim.chapters.reduce((sum, c) => sum + (c.estimatedPages || 1), 0);

  // 繳交狀態顆粒度是「章」，這裡的頂部徽章要能呈現「部分已繳交」，不能只有全有全無兩態
  let topBadgeClass = 'badge-pending';
  let topBadgeText = '⏳ 抄寫中 (未交件)';
  if (claim.status === 'confirmed') {
    if (claim.submitted) {
      topBadgeClass = 'badge-submitted';
      topBadgeText = '✓ 已繳交';
    } else if (claim.partiallySubmitted) {
      topBadgeClass = 'badge-partial';
      topBadgeText = `部分已繳交 (${claim.submittedCount}/${claim.chapters.length})`;
    }
  } else {
    topBadgeText = '✉️ 待點擊驗證';
  }

  elements.myClaimContainer.innerHTML = `
    <div style="background: #ffffff; padding: 28px; border-radius: var(--radius-lg); border: 1px solid var(--border); box-shadow: var(--shadow-md); max-width: 650px; margin: 0 auto;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 18px; border-bottom: 1px solid var(--border); padding-bottom: 14px;">
        <div>
          <h3 style="font-size: 18px; margin: 0 0 4px 0;">${esc(claim.name)} 平安</h3>
          <p style="margin: 0; font-size: 13px; color: var(--text-muted);">${esc(claim.email)}</p>
        </div>
        <span class="badge ${topBadgeClass}">${topBadgeText}</span>
      </div>

      <h4 style="font-size: 15px; margin: 0 0 6px 0;">📖 您認領的章節（約需 ${totalPages} 面稿紙，AI 預估）：</h4>
      ${claim.chapters.length > 1 ? `
        <p style="font-size: 12.5px; color: var(--text-muted); margin: 0 0 10px 0;">
          只想放棄部分章節嗎？勾選後點擊「取消所選章節」即可，其餘章節不受影響。
        </p>
      ` : ''}
      <div style="margin: 0 0 18px 0; display: flex; flex-direction: column; gap: 8px;">
        ${claim.chapters.map(c => `
          <label style="display: flex; align-items: center; gap: 10px; padding: 10px 12px; border: 1px solid ${c.submitted ? '#6CE9A6' : 'var(--border)'}; background: ${c.submitted ? 'var(--success-bg)' : 'transparent'}; border-radius: 8px; cursor: pointer; font-size: 14px;">
            ${claim.chapters.length > 1 ? `<input type="checkbox" class="claim-chapter-checkbox" data-bookid="${c.bookId}" data-chapter="${c.chapter}" style="width: 16px; height: 16px; flex-shrink: 0;">` : ''}
            <span><strong>${esc(c.bookName)}</strong> 第 ${esc(c.chapter)} 章 <span style="color: var(--text-muted); font-size: 0.9em;">(共 ${c.verses} 節，約需 ${c.estimatedPages || 1} 面稿紙，AI 預估)</span> ${c.submitted ? '<span style="color: var(--success); font-weight: 700; font-size: 0.85em;">✓ 已收件</span>' : ''}</span>
          </label>
        `).join('')}
      </div>

      <div style="display: flex; gap: 10px; flex-wrap: wrap;">
        <a href="/A4%20300%E5%AD%97%E7%A8%BF%E7%B4%99.pdf" download="A4 300字稿紙.pdf" class="pdf-download-btn" style="flex: 1; text-align: center;">
          📥 下載專用 A4 稿紙
        </a>
        ${claim.chapters.length > 1 ? `
          <button type="button" class="btn-secondary" id="btn-cancel-selected-chapters" style="color: var(--danger); border-color: rgba(220,38,38,0.3);" disabled>
            ✕ 取消所選章節
          </button>
        ` : ''}
        <button type="button" class="btn-secondary" id="btn-cancel-my-claim" style="color: var(--danger); border-color: rgba(220,38,38,0.3);">
          ✕ 取消全部認領
        </button>
      </div>
    </div>
  `;

  const checkboxes = Array.from(document.querySelectorAll('.claim-chapter-checkbox'));
  const btnCancelSelected = document.getElementById('btn-cancel-selected-chapters');

  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      if (btnCancelSelected) btnCancelSelected.disabled = !checkboxes.some(c => c.checked);
    });
  });

  btnCancelSelected?.addEventListener('click', async () => {
    const selected = checkboxes
      .filter(cb => cb.checked)
      .map(cb => ({ bookId: cb.dataset.bookid, chapter: Number(cb.dataset.chapter) }));
    if (selected.length === 0) return;

    if (confirm(`確定要取消這 ${selected.length} 個章節嗎？取消後將即時釋出供其他會友挑選，其餘章節維持原狀。`)) {
      const res = await storageService.cancelClaim(claim.token, selected);
      if (!res.success) {
        showToast(res.error || '取消章節失敗，請稍後再試', 'error');
        return;
      }
      showToast(`已成功取消 ${selected.length} 個章節，已即時釋出！`, 'success');
      renderBooks();
      updateOverallProgress();
      if (res.fullyCanceled) {
        elements.myClaimContainer.innerHTML = '';
      } else {
        searchMyClaims(claim.token);
      }
    }
  });

  document.getElementById('btn-cancel-my-claim')?.addEventListener('click', async () => {
    if (confirm(`確定要取消認領這 ${claim.chapters.length} 個章節嗎？取消後章節將即時釋出供其他會友挑選。`)) {
      const res = await storageService.cancelClaim(claim.token);
      if (!res.success) {
        showToast(res.error || '取消認領失敗，請稍後再試', 'error');
        return;
      }
      showToast('已成功取消認領，章節已即時釋出！', 'success');
      elements.myClaimContainer.innerHTML = '';
      renderBooks();
      updateOverallProgress();
    }
  });
}

/**
 * 渲染管理員後台
 */
async function renderAdminSection() {
  if (!adminModule.isAuthenticated()) {
    elements.adminLoginForm.style.display = 'block';
    elements.adminDashboard.style.display = 'none';
    return;
  }

  // 標記這次呼叫的序號；若在這兩個 await 期間又有更新的 renderAdminSection() 被觸發
  // （例如連續快速標記好幾章），代表這次資料已經過期，跑完也不能再去動畫面。
  const mySeq = ++adminRenderSeq;

  // 先同步後端最新數據庫（公開章節摘要 + 管理員專用完整名單）
  await storageService.syncWithBackend();
  const adminRes = await storageService.syncAdminClaims();

  if (mySeq !== adminRenderSeq) return; // 已經有更新的呼叫在跑，這次過期結果不畫

  if (adminRes.unauthorized) {
    adminModule.handleAuthExpired();
    return;
  }

  // 信件發送記錄內含會友姓名/信箱等個資，只在管理員登入後才渲染
  renderEmailLogs();

  elements.adminLoginForm.style.display = 'none';
  elements.adminDashboard.style.display = 'block';

  // 渲染統計卡片
  const stats = adminModule.getStatistics();
  elements.adminStatsGrid.innerHTML = `
    <div class="stat-card">
      <div class="stat-value">${stats.totalClaimedChapters}</div>
      <div class="stat-label">已確認認領章數 (${stats.claimedPercentage}%)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--success);">${stats.submittedChapters}</div>
      <div class="stat-label">已完成繳交章數 (${stats.submittedPercentage}%)</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: #B54708;">${stats.pendingSubmissionClaims}</div>
      <div class="stat-label">尚未繳交者人數</div>
    </div>
    <div class="stat-card">
      <div class="stat-value" style="color: var(--brand-red);">${stats.totalPeople}</div>
      <div class="stat-label">參與認領總人數</div>
    </div>
  `;

  // 渲染清單表格
  const claims = adminModule.getFilteredClaims();
  elements.adminClaimsTbody.innerHTML = '';

  if (claims.length === 0) {
    elements.adminClaimsTbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">尚無符合條件的認領記錄</td></tr>`;
  }

  claims.forEach(claim => {
    const tr = document.createElement('tr');
    const createdDate = new Date(claim.createdAt).toLocaleDateString('zh-TW', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });

    // 每章各自標示已收件/待收件（顆粒度是章，同一人的章節可能繳交進度不一）
    const chaptersHtml = `
      <div style="display: flex; flex-wrap: wrap; gap: 6px;">
        ${claim.chapters.map(c => `
          <span style="display: inline-flex; align-items: center; gap: 6px; background: ${c.submitted ? 'var(--success-bg)' : '#F8F9FA'}; border: 1px solid ${c.submitted ? '#6CE9A6' : '#D0D5DD'}; padding: 3px 8px; border-radius: 6px; font-size: 12.5px;">
            <span>${c.submitted ? '<span style="color: var(--success); font-weight: 800;">✓</span> ' : ''}<strong>${esc(c.bookName)}</strong> ${esc(c.chapter)}章 <span style="color: #64748b; font-size: 0.9em;">(${c.verses}節/約${c.estimatedPages||1}面(估))</span></span>
            <button type="button" id="btn-release-ch-${esc(claim.id)}-${esc(c.bookId)}-${esc(c.chapter)}" class="btn-release-single-ch" data-claimid="${esc(claim.id)}" data-bookid="${esc(c.bookId)}" data-bookname="${esc(c.bookName)}" data-chapter="${esc(c.chapter)}" title="釋出此章節" style="border: none; background: #FEE4E2; color: #B42318; border-radius: 4px; cursor: pointer; font-weight: bold; font-size: 11px; padding: 1px 5px; line-height: 1.2;">✕ 釋出</button>
          </span>
        `).join('')}
      </div>
    `;

    // 整體繳交狀態徽章：全部章節都繳交／部分章節繳交／完全尚未繳交 三態
    // （個別章節的收件請到「章節收件」頁籤逐章標記；這顆按鈕是批次「全部完成/全部重置」的捷徑）
    let subBadgeClass = 'badge-pending';
    let subBadgeText = '⏳ 抄寫中';
    let subBadgeTitle = '點擊：一次把此人所有章節標記為已繳交';
    if (claim.submitted) {
      subBadgeClass = 'badge-submitted';
      subBadgeText = '✓ 已繳交';
      subBadgeTitle = '點擊：一次把此人所有章節重置為尚未繳交';
    } else if (claim.partiallySubmitted) {
      subBadgeClass = 'badge-partial';
      subBadgeText = `部分已繳交 (${claim.submittedCount}/${claim.chapters.length})`;
      subBadgeTitle = '點擊：一次把此人「所有」章節標記為已繳交；個別章節請至「章節收件」頁籤逐章標記';
    }

    tr.innerHTML = `
      <td><strong>${esc(claim.name)}</strong></td>
      <td><span style="font-size: 12.5px; color: var(--text-muted);">${esc(claim.fellowship || '－')}</span></td>
      <td><span style="font-size: 12.5px; color: var(--text-muted);">${esc(claim.email || '（未填寫）')}</span></td>
      <td>${chaptersHtml}</td>
      <td style="font-size: 12px; color: var(--text-muted);">${createdDate}</td>
      <td>
        <button type="button" class="badge ${subBadgeClass}" style="cursor: pointer; border: none;" id="btn-toggle-sub-${esc(claim.id)}" title="${esc(subBadgeTitle)}">
          ${subBadgeText}
        </button>
      </td>
      <td>
        <div style="display: flex; gap: 6px;">
          <button type="button" class="btn-table-action" id="btn-remind-${esc(claim.id)}" title="${esc(claim.email ? '寄送進度提醒信' : '此會友未填寫信箱，無法寄送')}" ${claim.email ? '' : 'disabled style="opacity:0.4; cursor:not-allowed;"'}>✉️ 催件</button>
          <button type="button" class="btn-table-action" id="btn-release-all-${esc(claim.id)}" title="釋出該認領人全部章節" style="color: var(--danger); border-color: rgba(220,38,38,0.3);">🗑️ 全釋出</button>
        </div>
      </td>
    `;

    elements.adminClaimsTbody.appendChild(tr);

    // 名單在處理期間被重新渲染時，把仍在處理中的按鈕還原成「處理中」外觀
    [
      [`toggle:${claim.id}`, `btn-toggle-sub-${claim.id}`, '儲存中…'],
      [`release-all:${claim.id}`, `btn-release-all-${claim.id}`, '處理中…'],
      [`remind:${claim.id}`, `btn-remind-${claim.id}`, '寄送中…']
    ].forEach(([k, bid, text]) => {
      if (busyActionKeys.has(k)) applyBusy(tr.querySelector(`#${CSS.escape(bid)}`), text);
    });
    tr.querySelectorAll('.btn-release-single-ch').forEach(btn => {
      if (busyActionKeys.has(`release:${btn.id}`)) applyBusy(btn, '處理中…');
    });

    // 釋出單一章節按鈕
    tr.querySelectorAll('.btn-release-single-ch').forEach(btn => {
      btn.addEventListener('click', async () => {
        const { claimid, bookid, bookname, chapter } = btn.dataset;
        const key = `release:${btn.id}`;
        if (busyActionKeys.has(key)) return;
        if (!confirm(`確定要為【${claim.name}】釋出【${bookname} 第 ${chapter} 章】嗎？\n\n釋出後該章節將立即回歸未認領清單，供其他會友重新挑選。`)) return;
        await runLocked(key, btn.id, '處理中…', async () => {
          const res = await adminModule.releaseChapter(claimid, bookid, chapter);
          if (!res.success) {
            if (!res.unauthorized) showToast(`【${claim.name}】釋出【${bookname} 第 ${chapter} 章】失敗！${res.error || ''}`, 'error', { sticky: true });
            return;
          }
          showToast(`已成功為 ${claim.name} 釋出【${bookname} 第 ${chapter} 章】！`, 'success');
          await renderAdminSection();
          renderBooks();
          updateOverallProgress();
        });
      });
    });

    // 釋出全部章節按鈕
    tr.querySelector(`#btn-release-all-${claim.id}`)?.addEventListener('click', async () => {
      const key = `release-all:${claim.id}`;
      if (busyActionKeys.has(key)) return;
      if (!confirm(`確定要為【${claim.name}】釋出認領的所有 ${claim.chapters.length} 個章節嗎？\n\n釋出後章節將全數回歸未認領清單。`)) return;
      await runLocked(key, `btn-release-all-${claim.id}`, '處理中…', async () => {
        const res = await adminModule.releaseChapter(claim.id);
        if (!res.success) {
          if (!res.unauthorized) showToast(`【${claim.name}】全部釋出失敗！${res.error || ''}`, 'error', { sticky: true });
          return;
        }
        showToast(`已成功釋出 ${claim.name} 的所有章節！`, 'success');
        await renderAdminSection();
        renderBooks();
        updateOverallProgress();
      });
    });

    // 切換繳交按鈕（成功才變色；失敗用不會自動消失的訊息提醒，不再誤報成功）
    tr.querySelector(`#btn-toggle-sub-${claim.id}`)?.addEventListener('click', () => {
      runLocked(`toggle:${claim.id}`, `btn-toggle-sub-${claim.id}`, '儲存中…', async () => {
        // toggleSubmitted 內部會等畫面（名單、章節網格、進度）全部更新完才回傳
        const res = await adminModule.toggleSubmitted(claim.id);
        if (!res.success) {
          if (!res.unauthorized) showToast(`【${claim.name}】標記失敗，尚未儲存！${res.error || '請稍後再試一次。'}`, 'error', { sticky: true });
          return;
        }
        showToast(`已將 ${claim.name} 標記為「${res.submitted ? '已繳交' : '尚未繳交'}」`, 'success');
      });
    });

    // 個別催件按鈕（處理中鎖定，避免重複點擊重複寄信）
    tr.querySelector(`#btn-remind-${claim.id}`)?.addEventListener('click', () => {
      runLocked(`remind:${claim.id}`, `btn-remind-${claim.id}`, '寄送中…', async () => {
        await adminModule.sendReminder(claim);
        showToast(`已寄送進度提醒信給 ${claim.name}！`, 'success');
      });
    });
  });

  renderAdminChaptersGrid();
}

/**
 * 渲染後台「章節收件」頁籤：66 卷書 x 章節網格，跟公開認領頁籤同一套視覺，
 * 但互動改成「標記/取消標記已收件」，而不是「挑選認領」。
 * 三態：未認領（灰、不可點）／已認領待收件（琥珀色，可點標記）／已收件（綠色，可點取消）。
 */
function renderAdminChaptersGrid() {
  if (!elements.adminBooksContainer) return;

  // 這裡要顯示認領人姓名（tooltip），改用含姓名的管理員專用 Map，
  // 資料來自 syncAdminClaims()（見 renderAdminSection()）。
  const claimedMap = storageService.getAdminClaimedChapterMap();

  let filtered = BIBLE_BOOKS;
  if (adminChapterCategory !== 'all') {
    filtered = filtered.filter(b => b.testament.toLowerCase() === adminChapterCategory.toLowerCase());
  }
  if (adminChapterSearchKeyword) {
    const kw = adminChapterSearchKeyword.toLowerCase();
    filtered = filtered.filter(b =>
      b.name.toLowerCase().includes(kw) ||
      (b.short && b.short.toLowerCase().includes(kw)) ||
      b.id.toLowerCase().includes(kw)
    );
  }

  elements.adminBooksContainer.innerHTML = '';

  if (filtered.length === 0) {
    elements.adminBooksContainer.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-muted);">
        找不到符合「${adminChapterSearchKeyword}」的聖經書卷。
      </div>
    `;
    return;
  }

  filtered.forEach(book => {
    const card = document.createElement('div');
    card.className = 'book-card';

    const totalCh = book.chapters ? book.chapters.length : 1;
    const bId = book.id.toLowerCase();

    let claimedInBook = 0;
    let submittedInBook = 0;
    for (let c = 1; c <= totalCh; c++) {
      const info = claimedMap.get(`${bId}_${c}`);
      if (info) {
        claimedInBook++;
        if (info.submitted) submittedInBook++;
      }
    }

    const header = document.createElement('div');
    header.className = 'book-card-header';
    header.innerHTML = `
      <div>
        <span class="book-name">${book.name}</span>
        <span class="book-testament-badge ${book.testament.toLowerCase()}">${book.testament.toUpperCase() === 'OT' ? '舊約' : '新約'}</span>
      </div>
      <div class="book-meta">
        ${submittedInBook}/${claimedInBook} 章已收件 <span style="opacity: 0.7;">(共認領 ${claimedInBook}/${totalCh} 章)</span>
      </div>
    `;
    card.appendChild(header);

    const grid = document.createElement('div');
    grid.className = 'chapter-grid';

    for (let ch = 1; ch <= totalCh; ch++) {
      const key = `${bId}_${ch}`;
      const info = claimedMap.get(key);
      const { verses, estimatedPages } = getChapterMeta(book.id, ch);

      const btn = document.createElement('button');
      btn.type = 'button';

      if (!info) {
        btn.className = 'chapter-btn admin-unclaimed';
        btn.disabled = true;
        btn.title = `${book.name} 第 ${ch} 章：尚未被任何人認領`;
      } else if (info.submitted) {
        btn.className = 'chapter-btn admin-submitted';
        btn.title = `${book.name} 第 ${ch} 章（認領人：${info.name}）已收件，點擊可取消標記`;
      } else {
        btn.className = 'chapter-btn admin-pending';
        btn.title = `${book.name} 第 ${ch} 章（認領人：${info.name}）尚未收件，點擊標記為已收件`;
      }

      const isSaving = savingChapterKeys.has(key);
      if (isSaving) {
        btn.className = 'chapter-btn admin-saving ' + (info && info.submitted ? 'admin-submitted' : 'admin-pending');
      }

      btn.innerHTML = `
        <span class="chapter-num">${ch}</span>
        <span class="chapter-verses">${isSaving ? '儲存中…' : `${verses}節・${estimatedPages}面(估)`}</span>
      `;


      if (info) {
        btn.addEventListener('click', async () => {
          // 這一章正在儲存：忽略重複點擊（游標已是禁止符號）
          if (savingChapterKeys.has(key)) return;

          const nextSubmitted = !info.submitted;
          savingChapterKeys.add(key);
          btn.classList.add('admin-saving');
          const versesEl = btn.querySelector('.chapter-verses');
          if (versesEl) versesEl.textContent = '儲存中…';

          let res;
          try {
            // 這個 await 會一路等到後端寫入完成、畫面重新渲染完畢才回來
            res = await adminModule.toggleChapterSubmitted(book.id, ch, nextSubmitted);
          } finally {
            savingChapterKeys.delete(key);
          }

          if (!res.success) {
            // 失敗：還原這一格的外觀，並用不會自動消失的訊息提醒，避免同工漏看以為已標記成功
            renderAdminChaptersGrid();
            // 通行碼逾期時 adminModule 已經自己彈過提示、踢回登入畫面，這裡不用重複顯示
            if (!res.unauthorized) {
              showToast(`【${book.name} 第 ${ch} 章】標記失敗，尚未儲存！${res.error || '請稍後再試一次。'}`, 'error', { sticky: true });
            }
            return;
          }

          // 成功：重畫網格（此時已解除儲存中，格子會以新的顏色呈現、游標恢復正常）
          renderAdminChaptersGrid();
          showToast(`${book.name} 第 ${ch} 章 已標記為「${nextSubmitted ? '✓ 已收件' : '尚未收件'}」`, 'success');
        });
      }

      grid.appendChild(btn);
    }

    card.appendChild(grid);
    elements.adminBooksContainer.appendChild(card);
  });
}

/**
 * 渲染系統信件記錄列表
 */
function renderEmailLogs() {
  const logs = JSON.parse(localStorage.getItem('hand_copied_bible_email_logs') || '[]');
  elements.emailLogsList.innerHTML = '';

  if (logs.length === 0) {
    elements.emailLogsList.innerHTML = `
      <div style="text-align: center; color: var(--text-muted); padding: 40px; background: #ffffff; border-radius: var(--radius-lg); border: 1px solid var(--border);">
        尚無寄出記錄。當會友送出認領或管理員催件時，信件將自動記錄於此。
      </div>
    `;
    return;
  }

  logs.forEach(log => {
    const card = document.createElement('div');
    card.className = 'email-log-item';
    const sentTime = new Date(log.sentAt).toLocaleString('zh-TW');

    card.innerHTML = `
      <div class="email-log-header">
        <span class="email-log-subject">${esc(log.subject)}</span>
        <span class="email-log-time">${sentTime}</span>
      </div>
      <div class="email-log-to">收件人：<strong>${esc(log.to)}</strong></div>
      <button type="button" class="btn-secondary" style="font-size: 12.5px; padding: 5px 12px; margin-top: 8px;">
        👁️ 點此查看信件 HTML 排版
      </button>
    `;

    card.querySelector('button')?.addEventListener('click', () => {
      openEmailPreview(log);
    });

    elements.emailLogsList.appendChild(card);
  });
}

/**
 * 開啟信件預覽 Modal
 */
function openEmailPreview(emailLog) {
  elements.emailModalSubject.innerText = emailLog.subject;
  elements.emailModalTo.innerText = `收件人：${emailLog.to}`;
  elements.modalEmailPreview.style.display = 'flex';

  // 信件內容含會友輸入的資料：用 srcdoc + sandbox（見 index.html）隔離，裡面的任何腳本都不會執行
  elements.emailModalFrame.srcdoc = emailLog.html;
}

/**
 * 事件綁定初始化
 */
function initEvents() {
  // 導航切換
  elements.navClaim.addEventListener('click', () => switchView('claim'));
  elements.navMyClaim.addEventListener('click', () => switchView('myclaim'));
  elements.navAdmin.addEventListener('click', () => switchView('admin'));

  // 🎲 選擇困難隨機幫我選按鈕
  elements.btnLucky1.addEventListener('click', () => luckyPickChapters(1));
  elements.btnLucky2.addEventListener('click', () => luckyPickChapters(2));
  elements.btnLucky3.addEventListener('click', () => luckyPickChapters(3));
  // 超過每人上限的隨機按鈕沒有意義，直接隱藏
  if (MAX_CHAPTERS < 2) elements.btnLucky2.style.display = 'none';
  if (MAX_CHAPTERS < 3) elements.btnLucky3.style.display = 'none';

  // 書卷分類篩選
  elements.categoryTabGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    elements.categoryTabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentCategory = btn.dataset.category;
    renderBooks();
  });

  // 認領狀態篩選
  elements.claimStatusTabGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    elements.claimStatusTabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentClaimFilter = btn.dataset.claimStatus;
    renderBooks();
  });

  // 書卷搜尋
  elements.bookSearchInput.addEventListener('input', (e) => {
    currentSearchKeyword = e.target.value.trim();
    renderBooks();
  });

  // 購物車按鈕
  elements.btnClearSelected.addEventListener('click', () => {
    selectedChapters = [];
    renderBooks();
    showToast('已清空所選章節', 'info');
  });

  elements.btnOpenClaimModal.addEventListener('click', openClaimModal);
  elements.modalClaimClose.addEventListener('click', closeClaimModal);
  elements.modalClaim.addEventListener('click', (e) => {
    if (e.target === elements.modalClaim) closeClaimModal();
  });
  elements.formClaim.addEventListener('submit', handleClaimSubmit);

  // 已驗證成功 Modal
  elements.modalVerifiedClose.addEventListener('click', () => elements.modalVerified.style.display = 'none');
  elements.btnCloseVerifiedModal.addEventListener('click', () => elements.modalVerified.style.display = 'none');

  // 我的認領查詢
  elements.btnSearchToken.addEventListener('click', () => searchMyClaims());
  elements.tokenSearchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') searchMyClaims();
  });

  // 管理員登入：PIN 碼改由伺服器驗證（見 storage.verifyAdminPin），所以這裡是非同步的
  elements.adminLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const pin = elements.adminPinInput.value.trim();
    const btnSubmit = elements.adminLoginForm.querySelector('button[type="submit"]');
    if (btnSubmit) btnSubmit.disabled = true;

    const result = await adminModule.login(pin);

    if (btnSubmit) btnSubmit.disabled = false;

    if (result.success) {
      elements.adminPinInput.value = '';
      showToast('管理員登入成功！', 'success');
      renderAdminSection();
    } else {
      showToast(result.error || '管理員通行碼錯誤，請重新輸入', 'error');
    }
  });

  // 管理後台篩選與搜尋
  elements.adminFilterStatus.addEventListener('change', (e) => {
    adminModule.setFilterStatus(e.target.value);
    renderAdminSection();
  });
  elements.adminSearchInput.addEventListener('input', (e) => {
    adminModule.setSearchKeyword(e.target.value);
    renderAdminSection();
  });

  // 後台頁籤切換：名單管理 / 章節收件
  elements.adminTabGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    elements.adminTabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    const tab = btn.dataset.adminTab;
    elements.adminPanelRoster.style.display = tab === 'roster' ? 'block' : 'none';
    elements.adminPanelChapters.style.display = tab === 'chapters' ? 'block' : 'none';
  });

  // 章節收件頁籤：書卷分類篩選
  elements.adminChapterCategoryTabGroup.addEventListener('click', (e) => {
    const btn = e.target.closest('.tab-btn');
    if (!btn) return;
    elements.adminChapterCategoryTabGroup.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    adminChapterCategory = btn.dataset.category;
    renderAdminChaptersGrid();
  });

  // 章節收件頁籤：書卷搜尋
  elements.adminChapterSearchInput.addEventListener('input', (e) => {
    adminChapterSearchKeyword = e.target.value.trim();
    renderAdminChaptersGrid();
  });

  // 管理後台一鍵催件
  elements.btnAdminBatchRemind.addEventListener('click', async () => {
    const stats = adminModule.getStatistics();
    if (stats.pendingSubmissionClaims === 0) {
      showToast('目前所有會友皆已繳交完畢，無需發送催件信！', 'info');
      return;
    }
    if (confirm(`確定要一鍵發送催件提醒信給 ${stats.pendingSubmissionClaims} 位尚未繳交的會友嗎？`)) {
      const count = await adminModule.batchSendReminders();
      showToast(`已成功批次發送催件提醒信給 ${count} 位會友！`, 'success');
    }
  });

  // 管理後台匯出 CSV
  elements.btnAdminExportCsv.addEventListener('click', () => {
    adminModule.exportToCSV();
    showToast('已成功匯出認領清單 CSV / Excel 檔案！', 'success');
  });

  // 管理後台重新整理
  elements.btnAdminResetData.addEventListener('click', async () => {
    await storageService.syncWithBackend();
    await renderAdminSection();
    renderBooks();
    showToast('已同步最新認領數據', 'success');
  });

  // 管理後台登出
  elements.btnAdminLogout.addEventListener('click', () => {
    adminModule.logout();
    renderAdminSection();
    showToast('已安全登出管理後台', 'info');
  });

  // 信件預覽關閉
  elements.emailModalClose.addEventListener('click', () => {
    elements.modalEmailPreview.style.display = 'none';
  });

  // 背景點擊關閉
  [elements.modalClaim, elements.modalVerified, elements.modalEmailPreview].forEach(modal => {
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  });
}

// ---- 公開清單自動同步 ----
// 手機把分頁切到背景再切回來，或從 bfcache 還原時，瀏覽器會原封不動還原頁面、
// initApp() 不會重跑，會友就一直看到舊的「未繳交」（實機測試已重現）。
// 所以分頁回到前景時要主動重抓；距離上次嘗試太近就略過，避免頻繁切換一直打 API。
const AUTO_SYNC_MIN_INTERVAL_MS = 30 * 1000;
let lastSyncAttemptAt = 0;
let publicSyncInFlight = false;

function formatSyncTime(ts) {
  const d = new Date(ts);
  const pad = n => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function renderSyncStatus() {
  const box = document.getElementById('sync-status');
  const text = document.getElementById('sync-status-text');
  if (!box || !text) return;
  const { lastSyncedAt, lastSyncFailed } = storageService;
  box.classList.toggle('is-stale', lastSyncFailed);
  if (lastSyncFailed) {
    text.textContent = lastSyncedAt
      ? `⚠ 無法連線更新，目前顯示的是 ${formatSyncTime(lastSyncedAt)} 的資料`
      : '⚠ 無法連線至伺服器，目前顯示的可能是舊資料';
  } else if (lastSyncedAt) {
    text.textContent = `資料更新時間：${formatSyncTime(lastSyncedAt)}`;
  }
}

async function refreshPublicData({ force = false } = {}) {
  if (publicSyncInFlight) return;
  if (!force && Date.now() - lastSyncAttemptAt < AUTO_SYNC_MIN_INTERVAL_MS) return;
  publicSyncInFlight = true;
  lastSyncAttemptAt = Date.now();
  const btn = document.getElementById('btn-sync-refresh');
  if (btn) btn.disabled = true;
  try {
    await storageService.syncWithBackend();
    renderBooks();
    renderSyncStatus();
  } finally {
    publicSyncInFlight = false;
    if (btn) btn.disabled = false;
  }
}

function initAutoSync() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') refreshPublicData();
  });
  // 從 bfcache 還原的頁面不會觸發 DOMContentLoaded，只會觸發 pageshow(persisted)
  window.addEventListener('pageshow', (e) => {
    if (e.persisted) refreshPublicData();
  });
  const btn = document.getElementById('btn-sync-refresh');
  if (btn) btn.addEventListener('click', () => refreshPublicData({ force: true }));
}

// 應用程式進入點
async function initApp() {
  initEvents();
  initAutoSync();
  lastSyncAttemptAt = Date.now();
  await storageService.syncWithBackend();
  renderBooks();
  updateOverallProgress();
  renderSyncStatus();
  checkUrlTokenQuery();
}

document.addEventListener('DOMContentLoaded', initApp);
