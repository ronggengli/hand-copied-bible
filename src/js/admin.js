/**
 * 手抄聖經 管理員後台管理模組 (Admin Dashboard)
 */

import { TOTAL_CHAPTERS } from '../data/bibleData.js';
import { storageService } from './storage.js';
import { generateReminderEmail, sendEmail } from './emailService.js';

export class AdminModule {
  constructor({ onStateChange, showToast }) {
    this.onStateChange = onStateChange;
    this.showToast = showToast;
    this.filterStatus = 'all'; // 'all' | 'pending' | 'submitted'
    this.searchKeyword = '';
  }

  isAuthenticated() {
    return !!storageService.getStoredAdminPin();
  }

  // PIN 碼正確與否改由伺服器驗證（見 api/admin/verify-pin.js），
  // 不再由前端拿寫死的字串比對——那組字串本來就會被打包進使用者
  // 瀏覽器下載的 bundle.js，寫死在前端等於直接公開。
  async login(pin) {
    return await storageService.verifyAdminPin(pin);
  }

  logout() {
    storageService.clearStoredAdminPin();
  }

  // 後台 API 回傳 401（PIN 逾期/錯誤）時統一呼叫這支：踢回登入畫面並提示，
  // 而不是讓畫面停在「看起來已登入、但操作全部失敗」的詭異狀態。
  handleAuthExpired() {
    this.logout();
    if (this.showToast) this.showToast('管理員通行碼已逾期或錯誤，請重新登入。', 'error');
    if (this.onStateChange) this.onStateChange();
  }

  setFilterStatus(status) {
    this.filterStatus = status;
  }

  setSearchKeyword(kw) {
    this.searchKeyword = kw;
  }

  // 取得統計數據
  getStatistics() {
    const claims = storageService.getAllClaims();
    const claimedMap = storageService.getClaimedChapterMap();
    const totalClaimedChapters = claimedMap.size;

    // 繳交顆粒度是「章」，逐章累計，不能再用「整筆認領是否 submitted」乘上章數估算
    // （同一人的 3 章可能只交回 1 章）。
    let submittedChapters = 0;
    let pendingSubmissionClaims = 0;

    for (const claim of claims) {
      const claimSubmittedCount = claim.chapters.filter(ch => ch.submitted).length;
      submittedChapters += claimSubmittedCount;
      if (claimSubmittedCount < claim.chapters.length) {
        pendingSubmissionClaims++;
      }
    }

    const claimedPercentage = ((totalClaimedChapters / TOTAL_CHAPTERS) * 100).toFixed(1);
    const submittedPercentage = totalClaimedChapters > 0
      ? ((submittedChapters / totalClaimedChapters) * 100).toFixed(1)
      : '0.0';

    return {
      totalClaimedChapters,
      claimedPercentage,
      submittedChapters,
      submittedPercentage,
      pendingSubmissionClaims,
      totalPeople: claims.length,
      totalRemainingChapters: TOTAL_CHAPTERS - totalClaimedChapters
    };
  }

  // 取得篩選與搜尋後的名單
  getFilteredClaims() {
    let list = storageService.getAllClaims();

    if (this.filterStatus === 'pending') {
      list = list.filter(c => !c.submitted);
    } else if (this.filterStatus === 'submitted') {
      list = list.filter(c => c.submitted);
    }

    if (this.searchKeyword) {
      const kw = this.searchKeyword.toLowerCase();
      list = list.filter(c =>
        c.name.toLowerCase().includes(kw) ||
        (c.email && c.email.toLowerCase().includes(kw)) ||
        (c.fellowship && c.fellowship.toLowerCase().includes(kw)) ||
        c.chapters.some(ch => ch.bookName.toLowerCase().includes(kw))
      );
    }

    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  // 批次切換某筆認領（全部章節）的繳交狀態。回傳完整結果（含 success / error），
  // 讓呼叫端能分辨「真的成功」與「失敗」，不會在失敗時還顯示已標記成功。
  async toggleSubmitted(claimId) {
    const res = await storageService.toggleSubmission(claimId);
    if (res.unauthorized) {
      this.handleAuthExpired();
      return res;
    }
    // 等畫面真的更新完才回傳，呼叫端才能維持「儲存中」鎖定到最後一刻
    if (this.onStateChange) await this.onStateChange();
    return res;
  }

  // 「章節收件」頁籤：切換單一章節的繳交狀態
  async toggleChapterSubmitted(bookId, chapter, nextSubmitted) {
    const res = await storageService.toggleChapterSubmission(bookId, chapter, nextSubmitted);
    if (res.unauthorized) {
      this.handleAuthExpired();
      return res;
    }
    // 等畫面真的更新完才回傳，呼叫端才能維持「儲存中」鎖定到最後一刻
    if (this.onStateChange) await this.onStateChange();
    return res;
  }

  // 釋出特定章節
  async releaseChapter(claimId, bookId, chapter) {
    const res = await storageService.releaseChapter(claimId, bookId, chapter);
    if (res.unauthorized) {
      this.handleAuthExpired();
      return res;
    }
    if (this.onStateChange) this.onStateChange();
    return res;
  }

  // 發送催件信
  async sendReminder(claim) {
    const baseUrl = typeof window !== 'undefined' ? window.location.origin : '';
    const emailData = generateReminderEmail({
      name: claim.name,
      email: claim.email,
      chapters: claim.chapters,
      token: claim.token,
      baseUrl
    });

    const res = await sendEmail({
      to: claim.email,
      subject: emailData.subject,
      html: emailData.html,
      text: emailData.text,
      adminPin: storageService.getStoredAdminPin()
    });
    if (res.unauthorized) this.handleAuthExpired();
    return res;
  }

  // 批次催件（沒填信箱的會友沒有信箱可寄，直接跳過，不計入寄送成功數）
  async batchSendReminders() {
    const pendingClaims = storageService.getAllClaims().filter(c => !c.submitted && c.email);
    let sentCount = 0;
    for (const claim of pendingClaims) {
      const res = await this.sendReminder(claim);
      if (res.unauthorized) break; // 通行碼已逾期，後面繼續寄也一定會失敗，提早停止
      if (res.success) sentCount++;
    }
    return sentCount;
  }

  // 匯出 CSV / Excel
  exportToCSV() {
    const claims = storageService.getAllClaims();
    if (claims.length === 0) {
      if (this.showToast) this.showToast('目前尚無認領資料可匯出', 'info');
      return;
    }

    const headers = ['認領ID', '會友姓名', '所屬團契', '電子郵件', '認領章節(各章繳交狀態)', '認領章數', '已繳交章數', '認領時間', '整體繳交狀態', '最近繳交時間', '專屬Token'];

    // CSV 公式注入防護：儲存格以 = + - @ 開頭時，Excel 會當成公式執行，前面補一個單引號讓它當純文字
    const cell = v => {
      let t = String(v ?? '');
      if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
      return `"${t.replace(/"/g, '""')}"`;
    };

    const rows = claims.map(c => {
      // 繳交顆粒度是「章」，每章各自標註已繳交/未繳交，不能只看整筆的單一狀態
      const chaptersText = c.chapters.map(ch => `${ch.bookName} 第 ${ch.chapter} 章(${ch.verses}節・${ch.estimatedPages||1}面・${ch.submitted ? '已繳交' : '未繳交'})`).join('; ');
      const overallStatus = c.submitted ? '已繳交' : (c.partiallySubmitted ? `部分已繳交(${c.submittedCount}/${c.chapters.length})` : '尚未繳交');
      return [
        cell(c.id),
        cell(c.name),
        cell(c.fellowship),
        cell(c.email),
        cell(chaptersText),
        c.chapters.length,
        c.submittedCount || 0,
        `"${new Date(c.createdAt).toLocaleString('zh-TW')}"`,
        cell(overallStatus),
        c.submittedAt ? `"${new Date(c.submittedAt).toLocaleString('zh-TW')}"` : '""',
        cell(c.token)
      ];
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
    if (typeof document !== 'undefined') {
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.setAttribute('href', url);
      link.setAttribute('download', `手抄聖經認領名冊_${new Date().toISOString().slice(0, 10)}.csv`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  }
}
