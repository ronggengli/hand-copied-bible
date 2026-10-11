/**
 * 手抄聖經認領系統 自動化測試
 *
 * 這份測試直接呼叫 /api/*.js 的正式 handler 函式（跟 Vercel 正式環境
 * 部署的是同一份程式碼），並且真的打到 Supabase 資料庫，而不是像舊版測試那樣
 * 透過瀏覽器限定的相對路徑 fetch('/api/...')。
 *
 * 執行前請確認 .env.local 已設定 SUPABASE_URL / SUPABASE_SECRET_KEY，
 * 且最新版 supabase_schema.sql 已在 Supabase 專案執行過（single-step-claim
 * 分支把「送出即完成認領」的邏輯合併進 claim-request.js，confirm-claim.js
 * 已移除；資料庫改為 email 選填、拿掉同一人重複認領的防呆，只保留單次最多 3 章）。
 * 測試使用的姓名/信箱/章節皆為明顯的測試假資料（zztest_ 開頭章節、
 * 不會與真實會友資料衝突），並在結束時自動清除。
 */

import fs from 'fs';
import path from 'path';

// 讀取 .env.local（若尚未由外部環境注入 SUPABASE_URL 等變數）
function loadDotEnvLocal() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) return;
  const content = fs.readFileSync(envPath, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadDotEnvLocal();

// 測試專用開關（正式環境絕對不要設定）：接受 zztest 假書卷、關閉認領速率限制
process.env.ALLOW_TEST_BOOKS = '1';
process.env.DISABLE_RATE_LIMIT = '1';

import { BIBLE_BOOKS, getChapterMeta, parseChapterKey } from '../src/data/bibleData.js';
import { validateEmail } from '../src/js/emailService.js';
import { generateStatelessToken, decodeStatelessToken } from '../api/_token.js';
import { getSupabase } from '../api/_supabase.js';
import claimsHandler from '../api/claims.js';
import adminClaimsHandler from '../api/admin/claims.js';
import myClaimHandler from '../api/my-claim.js';
import claimRequestHandler from '../api/claim-request.js';
import cancelHandler from '../api/cancel-claim.js';
import releaseHandler from '../api/release-chapter.js';
import toggleHandler from '../api/admin/toggle-submission.js';
import toggleChapterHandler from '../api/admin/toggle-chapter-submission.js';

/** 用最小的 req/res shim 直接呼叫 Vercel serverless handler（跟正式環境同一份程式碼） */
async function callHandler(handler, body, headers = {}) {
  const req = { method: 'POST', body, headers };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(data) { jsonBody = data; return this; },
    end(data) { if (data) { try { jsonBody = JSON.parse(data); } catch (e) { jsonBody = data; } } }
  };
  await handler(req, res);
  return { status: statusCode, body: jsonBody };
}

/** 後台 API 一律要帶管理員 PIN 碼 header 才會放行（見 api/_admin_auth.js） */
function adminHeaders() {
  return { 'x-admin-pin': process.env.ADMIN_PIN };
}

/**
 * 測試斷言需要 id/token/email 等完整欄位，這些已經從公開的 claimsHandler 拿掉了
 * （見 api/claims.js 開頭註解），所以改呼叫後台專用的 api/admin/claims.js，帶真實 PIN。
 */
async function getAllClaims() {
  const req = { method: 'GET', headers: adminHeaders() };
  let jsonBody = null;
  const res = { setHeader() {}, status() { return this; }, json(data) { jsonBody = data; } };
  await adminClaimsHandler(req, res);
  return jsonBody.claims || [];
}

/** 帶 query string 的 GET handler（callHandler 只支援 POST body，claims.js/my-claim.js 需要另外的 shim） */
async function callGetHandler(handler, query = {}, headers = {}) {
  const req = { method: 'GET', query, headers };
  let statusCode = 200;
  let jsonBody = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(data) { jsonBody = data; return this; }
  };
  await handler(req, res);
  return { status: statusCode, body: jsonBody };
}

const testId = Date.now();
const cleanupClaimTokens = [];

async function cleanup() {
  for (const token of cleanupClaimTokens) {
    try { await callHandler(cancelHandler, { token }); } catch (e) { /* best-effort */ }
  }
}

try {
  console.log('🧪 開始執行手抄聖經系統自動化測試...\n');

  // 1. 驗證聖經資料庫與稿紙面數計算
  console.log('1. 驗證聖經資料庫 (66 卷書、1,189 章) 與 300字稿紙面數預估');
  if (BIBLE_BOOKS.length !== 66) throw new Error(`書卷總數應為 66，目前為 ${BIBLE_BOOKS.length}`);

  let totalChapters = 0;
  BIBLE_BOOKS.forEach(b => totalChapters += (b.chapters ? b.chapters.length : 0));
  if (totalChapters !== 1189) throw new Error(`總章數應為 1189，目前為 ${totalChapters}`);

  const gen1Meta = getChapterMeta('gen', 1);
  if (gen1Meta.verses !== 31) throw new Error('創世記第1章節數應為 31');
  if (gen1Meta.estimatedPages !== 4) throw new Error(`創世記第1章預估面數應為 4，目前為 ${gen1Meta.estimatedPages}`);

  const psa119Meta = getChapterMeta('psa', 119);
  if (psa119Meta.verses !== 176) throw new Error('詩篇第119篇節數應為 176');
  if (psa119Meta.estimatedPages < 20) throw new Error('詩篇第119篇稿紙面數估算異常');

  console.log('   ✓ 聖經 66 卷 1,189 章與稿紙面數計算驗證通過！\n');

  // 1b. parseChapterKey 必須能還原真實書卷資料
  console.log('1b. 驗證 parseChapterKey 大小寫還原（確認頁與後台顯示資料的來源）');
  const parsedGen1 = parseChapterKey('gen_1');
  if (parsedGen1.bookName !== '創世記') throw new Error(`parseChapterKey('gen_1') 書卷名稱應為 創世記，實際為 ${parsedGen1.bookName}`);
  if (parsedGen1.verses !== 31) throw new Error(`parseChapterKey('gen_1') 節數應為 31，實際為 ${parsedGen1.verses}`);
  const parsedPsa119 = parseChapterKey('psa_119');
  if (parsedPsa119.bookName !== '詩篇') throw new Error(`parseChapterKey('psa_119') 書卷名稱應為 詩篇，實際為 ${parsedPsa119.bookName}`);
  console.log('   ✓ parseChapterKey 正確還原真實書卷名稱與節數！\n');

  // 2. 驗證 Email 格式嚴格檢查（Email 本身選填，但只要有填就要符合格式）
  console.log('2. 驗證電子郵件信箱檢查功能 (validateEmail)');
  if (validateEmail('').valid !== false) throw new Error('空信箱應驗證失敗（由呼叫端決定要不要略過，不是 validateEmail 本身放行空字串）');
  if (validateEmail('test.com').valid !== false) throw new Error('缺少 @ 應驗證失敗');
  if (validateEmail('test@').valid !== false) throw new Error('缺少網域應驗證失敗');
  if (validateEmail('test@gamil.com').valid !== false) throw new Error('常見 typo gamil.com 應觸發提示');
  if (validateEmail('user@gmail.com').valid !== true) throw new Error('正常信箱應驗證成功');
  console.log('   ✓ 電子郵件信箱防呆與格式檢查驗證通過！\n');

  // 3. 驗證無狀態 Token 編碼／解碼往返
  console.log('3. 驗證無狀態自包含 Token 編碼／解碼');
  const sampleChapters = [{ bookId: 'gen', bookName: '創世記', chapter: 1, verses: 31, estimatedPages: 4 }];
  const sampleToken = generateStatelessToken('測試員', 'roundtrip@example.com', sampleChapters);
  const decoded = decodeStatelessToken(sampleToken);
  if (!decoded || decoded.email !== 'roundtrip@example.com') throw new Error('Token 編碼／解碼往返失敗');
  console.log('   ✓ Token 編碼／解碼往返驗證通過！\n');

  // 4. 驗證 claim-request 單步驟認領（送出當下直接完成資料庫原子交易，不再需要 confirm-claim）
  console.log('4. 驗證 claim-request 單步驟認領 (confirm_claim_atomic)');

  // 4a. 超過 3 章應被拒絕
  const overChapters = ['1', '2', '3', '4'].map(n => ({
    bookId: `zztest${testId}`, bookName: '測試書卷', chapter: Number(n), verses: 10, estimatedPages: 1
  }));
  const overRes = await callHandler(claimRequestHandler, { name: '測試-超過三章', email: `over.${testId}@example.com`, chapters: overChapters });
  if (overRes.body.success) throw new Error('超過 3 章應被拒絕');
  console.log('   ✓ 超過 3 章限制防呆生效！');

  // 4b. 正常送出即正式認領成功（含所屬團契欄位）
  const normalChapters = [
    { bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 101, verses: 25, estimatedPages: 3 },
    { bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 102, verses: 23, estimatedPages: 3 }
  ];
  const email1 = `wang.${testId}@example.com`;
  const claimRes1 = await callHandler(claimRequestHandler, { name: '王小明(測試)', email: email1, fellowship: '恩典團契', chapters: normalChapters });
  if (!claimRes1.body.success) throw new Error('正常送出應直接認領成功: ' + claimRes1.body.error);
  const token1 = claimRes1.body.token;
  cleanupClaimTokens.push(token1);
  const claim1 = claimRes1.body.claim;
  if (!claim1 || claim1.status !== 'confirmed') throw new Error('送出後狀態應為 confirmed（單步驟流程沒有 pending 這個中間狀態）');
  if (claim1.fellowship !== '恩典團契') throw new Error(`所屬團契應正確寫入並回傳，實際為「${claim1.fellowship}」`);

  let allClaims = await getAllClaims();
  if (!allClaims.some(c => c.token === token1)) throw new Error('送出後應可在 /api/admin/claims 立即查到該筆紀錄');
  console.log('   ✓ 送出表單當下即正式寫入資料庫，含所屬團契欄位！');

  // 4b2. 個資保護驗證：公開端點 /api/claims 不應該回傳任何個資，只有章節認領/繳交狀態
  console.log('4b2. 驗證公開端點 /api/claims 不洩漏姓名/Email/token');
  const publicClaimsRes = await callGetHandler(claimsHandler, {});
  const publicClaim1 = publicClaimsRes.body.claims.find(c =>
    c.chapters && c.chapters.some(ch => ch.bookId === `zztest${testId}` && ch.chapter === 101)
  );
  if (!publicClaim1) throw new Error('公開端點應該還是能看到該筆認領的章節（只是不含個資）');
  if (publicClaim1.name !== undefined || publicClaim1.email !== undefined || publicClaim1.token !== undefined || publicClaim1.id !== undefined) {
    throw new Error('公開端點 /api/claims 不應該回傳 name/email/token/id 任何一項');
  }
  console.log('   ✓ 公開端點只回傳章節認領/繳交狀態，個資已不再曝光！');

  // 4b3. 後台專用端點 /api/admin/claims 一樣要伺服器端驗證 PIN，才能拿到含個資的完整資料
  console.log('4b3. 驗證後台端點 /api/admin/claims 需要正確的管理員 PIN');
  const adminClaimsNoAuth = await callGetHandler(adminClaimsHandler, {});
  if (adminClaimsNoAuth.status !== 401) throw new Error(`/api/admin/claims 沒帶 PIN 應回傳 401，實際為 ${adminClaimsNoAuth.status}`);

  const adminClaimsWrongAuth = await callGetHandler(adminClaimsHandler, {}, { 'x-admin-pin': 'not-the-real-pin' });
  if (adminClaimsWrongAuth.status !== 401) throw new Error(`/api/admin/claims 帶錯 PIN 應回傳 401，實際為 ${adminClaimsWrongAuth.status}`);

  const adminClaimsOk = await callGetHandler(adminClaimsHandler, {}, adminHeaders());
  const adminClaim1 = adminClaimsOk.body.claims.find(c => c.token === token1);
  if (!adminClaim1 || adminClaim1.name !== '王小明(測試)' || adminClaim1.email !== email1) {
    throw new Error('帶正確 PIN 呼叫 /api/admin/claims 應該能拿到完整含姓名/Email 的資料');
  }
  console.log('   ✓ /api/admin/claims 沒 PIN／PIN 錯都是 401，帶對 PIN 才能拿到完整名單！');

  // 4b4. 自助查詢端點 /api/my-claim：伺服器端過濾，只回傳這一筆，token 或 email（不分大小寫）都查得到
  console.log('4b4. 驗證自助查詢端點 /api/my-claim 只回傳查詢到的那一筆');
  const lookupByToken = await callGetHandler(myClaimHandler, { q: token1 });
  if (lookupByToken.status !== 200 || !lookupByToken.body.success || lookupByToken.body.claim.token !== token1) {
    throw new Error('用 token 查詢 /api/my-claim 應該要查到該筆認領');
  }
  const lookupByEmail = await callGetHandler(myClaimHandler, { q: email1.toUpperCase() });
  if (lookupByEmail.status !== 200 || !lookupByEmail.body.success || lookupByEmail.body.claim.token !== token1) {
    throw new Error('用 Email（大寫）查詢 /api/my-claim 應該不分大小寫查得到同一筆');
  }
  const lookupNotFound = await callGetHandler(myClaimHandler, { q: `no-such-token-or-email-${testId}` });
  if (lookupNotFound.status !== 404 || lookupNotFound.body.success) {
    throw new Error('查無資料的查詢應回傳 404');
  }
  console.log('   ✓ /api/my-claim 用 token／Email（不分大小寫）都能查到同一筆，查無資料回 404！\n');

  // 4c. 已依需求移除「同一 Email 限認領一次」防呆——同一信箱應該可以再認領一筆新的
  const secondChapters = [{ bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 104, verses: 12, estimatedPages: 2 }];
  const secondRes = await callHandler(claimRequestHandler, { name: '王小明(測試,第二次)', email: email1, chapters: secondChapters });
  if (!secondRes.body.success) throw new Error('同一 Email 應該可以再次認領（已依需求移除重複認領防呆）: ' + secondRes.body.error);
  cleanupClaimTokens.push(secondRes.body.token);
  console.log('   ✓ 同一 Email 可重複認領，符合「只保留單次最多 3 章」的簡化需求！');

  // 4d. 章節搶占衝突：應回傳結構化 conflictChapters 與指定文案，供前端自動移除已選章節
  const conflictRes = await callHandler(claimRequestHandler, {
    name: '測試-搶章節', email: `conflict.${testId}@example.com`,
    chapters: [{ bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 101, verses: 25, estimatedPages: 3 }]
  });
  if (conflictRes.body.success) throw new Error('已被認領的章節應被拒絕');
  if (conflictRes.status !== 409) throw new Error(`章節衝突應回傳 409，實際為 ${conflictRes.status}`);
  if (!conflictRes.body.error.startsWith('測試-搶章節平安')) throw new Error(`衝突訊息應以「{姓名}平安」開頭，實際為：${conflictRes.body.error}`);
  if (!conflictRes.body.error.includes('您所選擇的經文已經被其他弟兄姊妹認領，煩請重新勾選。謝謝。')) throw new Error(`衝突訊息文案不符合指定內容，實際為：${conflictRes.body.error}`);
  if (!conflictRes.body.conflictChapters || conflictRes.body.conflictChapters.length !== 1 || conflictRes.body.conflictChapters[0].chapter !== 101) {
    throw new Error('應回傳結構化的 conflictChapters，讓前端能自動移除衝突章節');
  }
  console.log('   ✓ 章節搶占衝突訊息文案與結構化 conflictChapters 皆正確：', conflictRes.body.error);

  // 4e. Email 選填：不填信箱也能認領成功，且不會嘗試寄信
  const noEmailChapters = [{ bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 105, verses: 15, estimatedPages: 2 }];
  const noEmailRes = await callHandler(claimRequestHandler, { name: '測試-無信箱', chapters: noEmailChapters });
  if (!noEmailRes.body.success) throw new Error('未填 Email 應該仍可認領成功: ' + noEmailRes.body.error);
  if (noEmailRes.body.emailSent) throw new Error('未填 Email 不應該嘗試寄送提醒信');
  cleanupClaimTokens.push(noEmailRes.body.token);
  console.log('   ✓ 未填 Email 仍可成功認領，且不寄送提醒信！\n');

  // 4f. 驗證後台 API 的伺服器端驗證：沒帶 PIN 或帶錯 PIN 一律拒絕，不能只靠前端畫面擋
  console.log('4f. 驗證後台 API 沒有正確的管理員 PIN 一律拒絕（api/_admin_auth.js）');
  const noAuthRes = await callHandler(toggleHandler, { claimId: claim1.id, submitted: true });
  if (noAuthRes.body.success) throw new Error('沒帶 x-admin-pin header 不應該能呼叫後台 API 成功');
  if (noAuthRes.status !== 401) throw new Error(`沒帶 PIN 應回傳 401，實際為 ${noAuthRes.status}`);

  const wrongAuthRes = await callHandler(toggleHandler, { claimId: claim1.id, submitted: true }, { 'x-admin-pin': 'not-the-real-pin' });
  if (wrongAuthRes.body.success) throw new Error('帶錯誤的 PIN 不應該能呼叫後台 API 成功');
  if (wrongAuthRes.status !== 401) throw new Error(`帶錯誤 PIN 應回傳 401，實際為 ${wrongAuthRes.status}`);

  // 上面兩次都應該被擋下，claim1 的繳交狀態不應該被動到
  const claimsAfterRejectedAuth = await getAllClaims();
  const claim1AfterRejectedAuth = claimsAfterRejectedAuth.find(c => c.id === claim1.id);
  if (claim1AfterRejectedAuth.submitted) throw new Error('驗證失敗的請求不應該真的把資料改掉');
  console.log('   ✓ 沒帶 PIN／PIN 錯誤都被伺服器端正確擋下 401，且沒有動到任何資料！\n');

  // 5. 驗證管理員後台：批次切換繳交狀態（整筆認領所有章節一起標記）
  console.log('5. 驗證管理員後台批次切換繳交狀態');
  const toggleRes = await callHandler(toggleHandler, { claimId: claim1.id, submitted: true }, adminHeaders());
  if (!toggleRes.body.success || toggleRes.body.submitted !== true) throw new Error('切換繳交狀態失敗');

  let claimsAfterBatchToggle = await getAllClaims();
  let claim1AfterBatchToggle = claimsAfterBatchToggle.find(c => c.id === claim1.id);
  if (!claim1AfterBatchToggle.submitted) throw new Error('批次標記後整筆應為 submitted=true');
  if (claim1AfterBatchToggle.chapters.some(c => !c.submitted)) throw new Error('批次標記後每一章都應該是 submitted=true');
  console.log('   ✓ 批次切換繳交狀態成功寫入資料庫，且每一章都同步更新！\n');

  // 5b. 驗證「章節收件」頁籤：繳交顆粒度是「章」，能只切換其中一章，不影響同一筆認領的其他章節
  console.log('5b. 驗證章節收件頁籤：單一章節顆粒度切換繳交狀態');
  const chapterToggleRes = await callHandler(toggleChapterHandler, { bookId: `zztest${testId}`, chapter: 102, submitted: false }, adminHeaders());
  if (!chapterToggleRes.body.success || chapterToggleRes.body.submitted !== false) throw new Error('單一章節取消繳交標記失敗');

  const claimsAfterPartial = await getAllClaims();
  const claim1AfterPartial = claimsAfterPartial.find(c => c.id === claim1.id);
  if (claim1AfterPartial.submitted) throw new Error('取消其中一章繳交後，整筆不應再是 submitted=true');
  if (!claim1AfterPartial.partiallySubmitted) throw new Error('應該要能偵測到「部分已繳交」狀態');
  if (claim1AfterPartial.submittedCount !== 1) throw new Error(`已繳交章數應為 1，實際為 ${claim1AfterPartial.submittedCount}`);
  const ch101AfterPartial = claim1AfterPartial.chapters.find(c => c.chapter === 101);
  const ch102AfterPartial = claim1AfterPartial.chapters.find(c => c.chapter === 102);
  if (!ch101AfterPartial.submitted) throw new Error('第 101 章應維持已繳交（不該被另一章的操作連坐影響）');
  if (ch102AfterPartial.submitted) throw new Error('第 102 章應已被標記為未繳交');

  // 對「尚未被任何人認領」的章節標記繳交狀態應該要被拒絕（沒有 claimed_chapters 列可以更新）
  const unclaimedToggleRes = await callHandler(toggleChapterHandler, { bookId: `zztest${testId}`, chapter: 999, submitted: true }, adminHeaders());
  if (unclaimedToggleRes.body.success) throw new Error('對未被認領的章節標記繳交狀態應該要失敗');
  if (unclaimedToggleRes.status !== 404) throw new Error(`未認領章節標記應回傳 404，實際為 ${unclaimedToggleRes.status}`);
  console.log('   ✓ 章節收件顆粒度正確：可單獨標記/取消單一章節、正確算出部分已繳交狀態，且擋下對未認領章節的操作！\n');

  // 6. 驗證管理員後台：釋出特定單一章節
  console.log('6. 驗證管理員釋出認領人特定章節功能');
  const releaseRes = await callHandler(releaseHandler, {
    claimId: claim1.id, bookId: `zztest${testId}`, chapter: 102
  }, adminHeaders());
  if (!releaseRes.body.success) throw new Error('釋出指定章節失敗: ' + releaseRes.body.error);

  allClaims = await getAllClaims();
  const updatedClaim1 = allClaims.find(c => c.id === claim1.id);
  if (!updatedClaim1 || updatedClaim1.chapters.length !== 1) {
    throw new Error('釋出單一章節後剩餘章節數不正確');
  }
  console.log('   ✓ 成功釋出單一章節，該章已即時開放給其他會友！\n');

  // 7. 驗證自助退選（整筆取消）
  console.log('7. 驗證會友自助退選（整筆取消認領）');
  const cancelRes = await callHandler(cancelHandler, { token: token1 });
  if (!cancelRes.body.success) throw new Error('自助退選失敗: ' + cancelRes.body.error);

  allClaims = await getAllClaims();
  if (allClaims.some(c => c.token === token1)) throw new Error('退選後不應再查得到該筆紀錄');
  cleanupClaimTokens.splice(cleanupClaimTokens.indexOf(token1), 1); // 已手動取消，不需要在 cleanup 階段重複處理
  console.log('   ✓ 自助退選成功，章節與主紀錄皆已即時釋出！\n');

  // 7b. 取消過的認領 token 不能被資料庫的 confirm_claim_atomic 重新復活。
  // 現在對外 API 已經沒有任何路徑會拿舊 token 重打這個 RPC 了（claim-request.js
  // 每次都產生全新 token），但這個 tombstone 防呆是資料庫層的最後一道防線，
  // 直接呼叫 RPC 驗證它本身仍然有效，避免以後有人不小心重新接上這個路徑時失效。
  console.log('7b. 驗證已取消的認領 token 不能被資料庫層重新復活');
  const supabase = getSupabase();
  const { data: reconfirmData, error: reconfirmError } = await supabase.rpc('confirm_claim_atomic', {
    p_token: token1,
    p_name: '王小明(測試)',
    p_email: email1,
    p_chapters: normalChapters.map(c => `${c.bookId}_${c.chapter}`)
  });
  if (reconfirmError) throw reconfirmError;
  if (reconfirmData.success) throw new Error('已取消的認領 token 不應該能重新確認成功');
  console.log('   ✓ 已取消的 token 重新呼叫會被資料庫正確拒絕：', reconfirmData.error, '\n');

  // 8. 驗證會友自助「部分章節」取消（只放棄其中幾章，其餘維持認領）
  console.log('8. 驗證會友自助部分章節取消');
  const partialChapters = [
    { bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 201, verses: 20, estimatedPages: 3 },
    { bookId: `zztest${testId}`, bookName: '測試書卷', chapter: 202, verses: 18, estimatedPages: 2 }
  ];
  const email2 = `chen.${testId}@example.com`;
  const claimRes2 = await callHandler(claimRequestHandler, { name: '陳小華(測試)', email: email2, chapters: partialChapters });
  if (!claimRes2.body.success) throw new Error('部分取消測試的前置認領失敗: ' + claimRes2.body.error);
  const token2 = claimRes2.body.token;
  cleanupClaimTokens.push(token2);

  const partialCancelRes = await callHandler(cancelHandler, {
    token: token2,
    chapters: [{ bookId: `zztest${testId}`, chapter: 201 }]
  });
  if (!partialCancelRes.body.success) throw new Error('部分章節取消失敗: ' + partialCancelRes.body.error);
  if (partialCancelRes.body.fullyCanceled) throw new Error('只取消其中一章不應該整筆取消');

  allClaims = await getAllClaims();
  const claim2AfterPartial = allClaims.find(c => c.token === token2);
  if (!claim2AfterPartial || claim2AfterPartial.chapters.length !== 1) {
    throw new Error('部分取消後剩餘章節數應為 1');
  }
  if (claim2AfterPartial.chapters.some(c => c.chapter === 201)) {
    throw new Error('已取消的章節不應該還留在剩餘清單裡');
  }
  console.log('   ✓ 部分章節取消成功，其餘章節維持認領狀態不受影響！\n');

  console.log('🎉 所有自動化測試全部通過 (100% PASS)！\n');
} catch (err) {
  console.error('\n❌ 測試失敗：', err.message);
  await cleanup();
  process.exit(1);
}

await cleanup();
