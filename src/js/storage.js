/**
 * 手抄聖經 儲存與認領狀態管理
 * 單步驟認領（送出即生效）與後端 Supabase 持久化同步
 *
 * 設計原則：Supabase（透過 /api/* 後端）是唯一的真相來源 (Single Source of Truth)。
 * localStorage 只作為「畫面尚未同步完成前」的顯示用暫存快取，
 * 任何會影響章節認領狀態的操作（送出申請／確認／取消／釋出／切換繳交）
 * 一律以後端 API 的回應為準；API 失敗就是失敗，不會假裝成功並只寫在本機
 * （否則會做出「這台裝置看得到、其他人看不到」的幽靈資料，過去就是這樣壞掉的）。
 */

import { church } from './churchInfo.js';

// localStorage 快取的版本號。公開端點 /api/claims 只回傳章節狀態，快取的內容也只有章節狀態；
// 舊版本號（v2）的快取格式含有個資，init() 會主動刪除，避免殘留在瀏覽器裡。
const STORAGE_KEY = 'hand_copied_bible_claims_v3';
const LEGACY_STORAGE_KEY_V2 = 'hand_copied_bible_claims_v2';
const ADMIN_PIN_STORAGE_KEY = 'hand_copied_bible_admin_pin';

export class StorageService {
  constructor() {
    this.claims = [];
    // 後台專用的完整名單（含姓名/Email/token），只在管理員登入、呼叫 syncAdminClaims()
    // 後才會有內容，且刻意只存在記憶體、不寫進 localStorage——個資沒必要在裝置上留存。
    this.adminClaims = [];
    // 公開清單最近一次「成功」向後端同步的時間（ms，僅存記憶體）與最近一次嘗試是否失敗，
    // 供畫面顯示「資料更新時間」；失敗時 this.claims 只是 localStorage 的舊快取。
    this.lastSyncedAt = null;
    this.lastSyncFailed = false;
    this.init();
  }

  // ---- 管理員 PIN 碼（登入狀態）----
  // 正確答案只存在伺服器端環境變數 ADMIN_PIN，這裡存的是「使用者剛剛輸入、
  // 已經被伺服器驗證過一次」的值，之後每次呼叫後台 API 都夾帶當 x-admin-pin
  // header，讓伺服器每一次請求都重新驗證一次（見 api/_admin_auth.js）。
  getStoredAdminPin() {
    if (typeof sessionStorage === 'undefined') return null;
    return sessionStorage.getItem(ADMIN_PIN_STORAGE_KEY) || null;
  }

  setStoredAdminPin(pin) {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(ADMIN_PIN_STORAGE_KEY, pin);
    }
  }

  clearStoredAdminPin() {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(ADMIN_PIN_STORAGE_KEY);
    }
  }

  // 呼叫伺服器驗證 PIN 碼是否正確；成功才把它存起來供後續請求使用
  async verifyAdminPin(pin) {
    try {
      const res = await fetch('/api/admin/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        return { success: false, error: (data && data.error) || '管理員通行碼錯誤，請重新輸入。' };
      }
      this.setStoredAdminPin(pin);
      return { success: true };
    } catch (e) {
      console.error('[storage.verifyAdminPin] API 呼叫異常:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  // 後台 API 一律要帶這組 header，集中在這裡組出來避免每個呼叫點各寫一次
  adminHeaders() {
    return { 'Content-Type': 'application/json', 'x-admin-pin': this.getStoredAdminPin() || '' };
  }

  init() {
    if (typeof localStorage !== 'undefined') {
      try {
        // 主動清掉舊版本的快取（舊格式含姓名/Email/token），不是單純換個 key 名稱不讀就算了。
        localStorage.removeItem(LEGACY_STORAGE_KEY_V2);
        const saved = localStorage.getItem(STORAGE_KEY);
        this.claims = saved ? JSON.parse(saved) : [];
      } catch (e) {
        this.claims = [];
      }
    }
  }

  /**
   * 與後端 API 同步全教會即時認領清單（公開端點，只有章節認領/繳交狀態，
   * 不含任何姓名/Email/token——後台名單/CSV/催件所需的完整資料改用
   * syncAdminClaims()；自助查詢改用 lookupMyClaim()）
   */
  async syncWithBackend() {
    try {
      // cache: 'no-store'：確保瀏覽器不會拿 HTTP 快取的舊回應充數
      const res = await fetch('/api/claims', { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        if (data && Array.isArray(data.claims)) {
          this.claims = data.claims;
          this.lastSyncedAt = Date.now();
          this.lastSyncFailed = false;
          this.saveLocal();
          return this.claims;
        }
      }
    } catch (e) {
      console.warn('[storage] 無法連線至伺服器，暫時顯示上次同步的快取資料', e);
    }
    this.lastSyncFailed = true;
    return this.claims;
  }

  /**
   * 管理員專用：向 PIN 保護的 /api/admin/claims 同步完整名單（含姓名/Email/token）。
   * 刻意不寫入 localStorage（見建構子註解），只存在這個物件的記憶體裡。
   */
  async syncAdminClaims() {
    try {
      const res = await fetch('/api/admin/claims', { headers: this.adminHeaders() });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        return { unauthorized: true, error: (data && data.error) || '管理員通行碼錯誤或已逾期。' };
      }
      if (!res.ok || !data || !Array.isArray(data.claims)) {
        return { success: false, error: (data && data.error) || '讀取管理員名單失敗，請稍後再試一次。' };
      }
      this.adminClaims = data.claims;
      return { success: true, claims: this.adminClaims };
    } catch (e) {
      console.error('[storage.syncAdminClaims] API 呼叫異常:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  saveLocal() {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.claims));
    }
  }

  /**
   * 取得已正式確認認領的章節清單 Map（公開網格用，資料來自不含個資的 this.claims）
   * Key: "bookId_chapter" (e.g. "gen_1") -> { submitted }
   * 注意：submitted 是「這一章」自己的繳交狀態（來自 claimed_chapters），
   * 不是整筆認領的狀態——同一人認領的 3 章可能繳交進度各自不同。
   */
  getClaimedChapterMap() {
    const map = new Map();
    for (const claim of this.claims) {
      for (const ch of claim.chapters) {
        const bId = (ch.bookId || '').toLowerCase();
        const key = `${bId}_${ch.chapter}`;
        map.set(key, { submitted: !!ch.submitted });
      }
    }
    return map;
  }

  /**
   * 跟 getClaimedChapterMap() 一樣，但資料來自 this.adminClaims（含姓名），
   * 供後台「章節收件」網格的 tooltip 顯示「認領人：xxx」用。呼叫前務必先
   * syncAdminClaims() 成功過，否則會拿到空 Map。
   */
  getAdminClaimedChapterMap() {
    const map = new Map();
    for (const claim of this.adminClaims) {
      for (const ch of claim.chapters) {
        const bId = (ch.bookId || '').toLowerCase();
        const key = `${bId}_${ch.chapter}`;
        map.set(key, {
          claimId: claim.id,
          name: claim.name,
          submitted: !!ch.submitted
        });
      }
    }
    return map;
  }

  /**
   * 送出認領申請：單步驟流程，送出當下由後端直接完成資料庫原子交易並正式鎖定章節，
   * 不再有「先寄驗證信、後點連結確認」的中間狀態。
   */
  async requestClaim({ name, email, fellowship, chapters }) {
    if (!chapters || chapters.length === 0) {
      return { success: false, error: '請至少選擇 1 個章節進行認領。' };
    }
    if (chapters.length > church.maxChaptersPerPerson) {
      return { success: false, error: `每位弟兄姊妹最多限認領 ${church.maxChaptersPerPerson} 章，請調整選取的章節數量。` };
    }

    try {
      const res = await fetch('/api/claim-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, email, fellowship, chapters })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        return {
          success: false,
          error: (data && data.error) || '送出認領申請失敗，請稍後再試一次。',
          conflictChapters: data && data.conflictChapters
        };
      }
      await this.syncWithBackend();
      return {
        success: true,
        claim: data.claim,
        token: data.token,
        emailSent: !!data.emailSent,
        emailPreview: data.emailPreview
      };
    } catch (e) {
      console.error('[storage.requestClaim] API 呼叫失敗:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  /**
   * 自助退選 / 取消認領
   * @param {string} token
   * @param {Array<{bookId:string, chapter:number}>} [chapters] 不傳代表整筆全部取消；
   *   傳入部分章節則只取消這幾章，其餘章節維持認領狀態。
   */
  async cancelClaim(token, chapters) {
    try {
      const res = await fetch('/api/cancel-claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, chapters })
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data || !data.success) {
        return { success: false, error: (data && data.error) || '找不到對應的認領記錄或已取消。' };
      }
      await this.syncWithBackend();
      return {
        success: true,
        fullyCanceled: !!data.fullyCanceled,
        canceledClaim: data.canceledClaim,
        remainingChapters: data.remainingChapters
      };
    } catch (e) {
      console.error('[storage.cancelClaim] API 呼叫失敗:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  /**
   * 根據 Token 或 Email 查詢認領記錄。改成呼叫 /api/my-claim 讓伺服器端做過濾，
   * 只回傳這一筆——絕對不要改成「把所有人的姓名/Email/token 整包下載到瀏覽器再用 JS 比對」，
   * 那等於把全部個資公開給任何打開 DevTools 的人。
   * 若貼上的是完整查詢連結，先在這裡提取 token 參數，呼叫端不用自己處理。
   */
  async lookupMyClaim(query) {
    if (!query) return { success: false, error: '請輸入查詢內容' };
    let clean = query.trim();
    if (clean.includes('token=')) {
      const match = clean.match(/token=([^&#\s]+)/);
      if (match) clean = match[1];
    }

    try {
      const res = await fetch(`/api/my-claim?q=${encodeURIComponent(clean)}`);
      const data = await res.json().catch(() => null);
      if (res.status === 404) {
        return { success: true, claim: null };
      }
      if (!res.ok || !data || !data.success) {
        return { success: false, error: (data && data.error) || '查詢失敗，請稍後再試一次。' };
      }
      return { success: true, claim: data.claim };
    } catch (e) {
      console.error('[storage.lookupMyClaim] API 呼叫異常:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  /**
   * 管理員在「章節收件」頁籤標記/取消標記單一章節已繳交（顆粒度是章，不是整筆認領）
   */
  async toggleChapterSubmission(bookId, chapter, nextSubmitted) {
    try {
      const res = await fetch('/api/admin/toggle-chapter-submission', {
        method: 'POST',
        headers: this.adminHeaders(),
        body: JSON.stringify({ bookId, chapter, submitted: nextSubmitted })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        return { success: false, unauthorized: true, error: (data && data.error) || '管理員通行碼錯誤或已逾期。' };
      }
      if (!res.ok || !data || !data.success) {
        return { success: false, error: (data && data.error) || '更新繳交狀態失敗，請稍後再試一次。' };
      }
      await this.syncWithBackend();
      return { success: true, submitted: data.submitted };
    } catch (e) {
      console.error('[storage.toggleChapterSubmission] API 呼叫異常:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  /**
   * 管理員在名單表格「批次」切換某人整筆認領（所有章節）的繳交狀態
   */
  async toggleSubmission(claimId) {
    const claim = this.adminClaims.find(c => c.id === claimId);
    const nextSubmitted = claim ? !claim.submitted : true;
    const current = claim ? claim.submitted : false;

    try {
      const res = await fetch('/api/admin/toggle-submission', {
        method: 'POST',
        headers: this.adminHeaders(),
        body: JSON.stringify({ claimId, submitted: nextSubmitted })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        return { success: false, submitted: current, unauthorized: true, error: (data && data.error) || '管理員通行碼錯誤或已逾期。' };
      }
      if (!res.ok || !data || !data.success) {
        console.error('[storage.toggleSubmission] API 失敗:', data && data.error);
        return { success: false, submitted: current, error: (data && data.error) || '更新繳交狀態失敗，請稍後再試一次。' };
      }
      await this.syncWithBackend();
      return { success: true, submitted: data.submitted };
    } catch (e) {
      console.error('[storage.toggleSubmission] API 呼叫異常:', e);
      return { success: false, submitted: current, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  /**
   * 管理員釋出特定認領人的特定章節 (或全部章節)
   */
  async releaseChapter(claimId, bookId, chapter) {
    try {
      const res = await fetch('/api/release-chapter', {
        method: 'POST',
        headers: this.adminHeaders(),
        body: JSON.stringify({ claimId, bookId, chapter })
      });
      const data = await res.json().catch(() => null);
      if (res.status === 401) {
        return { success: false, unauthorized: true, error: (data && data.error) || '管理員通行碼錯誤或已逾期。' };
      }
      if (!res.ok || !data || !data.success) {
        return { success: false, error: (data && data.error) || '釋出章節失敗，請稍後再試一次。' };
      }
      await this.syncWithBackend();
      return { success: true };
    } catch (e) {
      console.error('[storage.releaseChapter] API 呼叫異常:', e);
      return { success: false, error: '無法連線至伺服器，請確認網路連線後再試一次。' };
    }
  }

  // 後台用：完整名單（含姓名/Email/token），資料來自 syncAdminClaims()。
  getAllClaims() {
    return [...this.adminClaims];
  }
}

export const storageService = new StorageService();
