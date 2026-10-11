/**
 * 不需要資料庫的單元測試：章節驗證、後台 PIN 鎖定、設定檔、Token、CSV/HTML 跳脫相關的純函式。
 * 執行：node tests/unit.test.js（npm test 會一併執行）
 */
import assert from 'node:assert/strict';

// 強制讓速率限制/資料庫相關呼叫失敗，驗證「資料庫不可用時退回記憶體計數」的路徑
delete process.env.SUPABASE_URL;
delete process.env.SUPABASE_SECRET_KEY;
delete process.env.ALLOW_TEST_BOOKS;
process.env.ADMIN_PIN = 'unit-test-pin-0123456789';

const { normalizeChapters } = await import('../api/_validate.js');
const { checkAdminPin } = await import('../api/_admin_auth.js');
const { getMailConfig } = await import('../api/_mailer.js');
const { generateToken } = await import('../api/_token.js');
const { generateClaimConfirmationEmail, generateReminderEmail } = await import('../src/js/emailService.js');
const { church, dates, isPastDeadline, isClaimingClosed, deadlineIsPlaceholder } = await import('../src/js/churchInfo.js');

let passed = 0;
const t = (name, fn) => Promise.resolve(fn()).then(() => { passed++; console.log(`  ✓ ${name}`); });

console.log('章節驗證 (B2)');
await t('合法章節由伺服器查表補齊書卷名稱與節數', () => {
  const r = normalizeChapters([{ bookId: 'GEN', chapter: 1, bookName: '<img src=x onerror=alert(1)>', verses: 999 }], 3);
  assert.equal(r.ok, true);
  assert.equal(r.chapters[0].bookName, '創世記');
  assert.equal(r.chapters[0].verses, 31);
  assert.equal(r.chapters[0].bookId, 'gen');
});
await t('"01" 這種寫法被拒絕（避免 gen_01 與 gen_1 變成兩個 key）', () => {
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: '01' }], 3).ok, false);
});
await t('超出章數、不存在的書卷、非整數都被拒絕', () => {
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: 51 }], 3).ok, false);
  assert.equal(normalizeChapters([{ bookId: 'nope', chapter: 1 }], 3).ok, false);
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: 1.5 }], 3).ok, false);
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: 0 }], 3).ok, false);
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: -1 }], 3).ok, false);
});
await t('重複章節、超過上限、空陣列、非陣列都被拒絕', () => {
  assert.equal(normalizeChapters([{ bookId: 'gen', chapter: 1 }, { bookId: 'GEN', chapter: '1' }], 3).ok, false);
  assert.equal(normalizeChapters([1, 2, 3, 4].map(n => ({ bookId: 'gen', chapter: n })), 3).ok, false);
  assert.equal(normalizeChapters([], 3).ok, false);
  assert.equal(normalizeChapters('gen_1', 3).ok, false);
});
await t('沒有 ALLOW_TEST_BOOKS 時 zztest 假書卷被拒絕', () => {
  assert.equal(normalizeChapters([{ bookId: 'zztest1', chapter: 1 }], 3).ok, false);
});

console.log('後台 PIN 鎖定 (B4)');
const reqFrom = ip => ({ headers: { 'x-forwarded-for': ip } });
await t('連續錯誤 5 次後，連正確 PIN 也被鎖定 (429)', async () => {
  for (let i = 0; i < 5; i++) assert.equal((await checkAdminPin(reqFrom('10.0.0.1'), `wrong-${i}`)).status, 401);
  assert.equal((await checkAdminPin(reqFrom('10.0.0.1'), process.env.ADMIN_PIN)).status, 429);
});
await t('鎖定只針對該 IP，其他 IP 仍可登入', async () => {
  assert.equal((await checkAdminPin(reqFrom('10.0.0.2'), process.env.ADMIN_PIN)).ok, true);
});
await t('沒帶 PIN 不算一次猜測', async () => {
  for (let i = 0; i < 10; i++) await checkAdminPin(reqFrom('10.0.0.3'), '');
  assert.equal((await checkAdminPin(reqFrom('10.0.0.3'), process.env.ADMIN_PIN)).ok, true);
});
await t('長度不同的錯誤 PIN 也能安全比對（不拋例外）', async () => {
  assert.equal((await checkAdminPin(reqFrom('10.0.0.4'), 'x')).status, 401);
});
await t('ADMIN_PIN 未設定時一律拒絕 (500)', async () => {
  const saved = process.env.ADMIN_PIN;
  delete process.env.ADMIN_PIN;
  assert.equal((await checkAdminPin(reqFrom('10.0.0.5'), saved)).status, 500);
  process.env.ADMIN_PIN = saved;
});

console.log('寄信設定');
await t('未設定時 configured=false；舊名稱 GMAIL_* 仍可用；SMTP_HOST 走一般 SMTP', () => {
  for (const k of ['MAIL_USER', 'MAIL_PASS', 'GMAIL_USER', 'GMAIL_PASS', 'SMTP_HOST', 'SMTP_PORT', 'SMTP_SECURE', 'MAIL_FROM']) delete process.env[k];
  assert.equal(getMailConfig().configured, false);
  process.env.GMAIL_USER = 'a@gmail.com'; process.env.GMAIL_PASS = 'x';
  assert.equal(getMailConfig().configured, true);
  assert.equal(getMailConfig().host, '');
  process.env.MAIL_USER = 'b@example.org'; process.env.SMTP_HOST = 'smtp.example.org'; process.env.SMTP_PORT = '465';
  const c = getMailConfig();
  assert.equal(c.user, 'b@example.org');   // 新名稱優先
  assert.equal(c.secure, true);            // 465 自動 SSL
  assert.equal(c.from, 'b@example.org');
  process.env.MAIL_FROM = 'noreply@example.org';
  assert.equal(getMailConfig().from, 'noreply@example.org');
  for (const k of ['MAIL_USER', 'GMAIL_USER', 'GMAIL_PASS', 'SMTP_HOST', 'SMTP_PORT', 'MAIL_FROM']) delete process.env[k];
});

console.log('Token (B6)');
await t('新 token 為不含個資的隨機字串，且不重複', () => {
  const a = generateToken(), b = generateToken();
  assert.match(a, /^tok_[A-Za-z0-9_-]{32}$/);
  assert.notEqual(a, b);
});

console.log('信件模板與設定檔');
await t('使用者輸入在信件中被 HTML 跳脫', () => {
  const { html } = generateClaimConfirmationEmail({
    name: '<script>alert(1)</script>', email: 'a@b.co', fellowship: '"><a href=x>',
    chapters: [{ bookName: '<b>x</b>', chapter: 1, verses: 3, estimatedPages: 1 }],
    token: 'tok_x', baseUrl: 'https://example.org'
  });
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(!html.includes('<a href=x>'));
  assert.ok(!html.includes('<b>x</b>'));
});
await t('信件使用設定檔中的教會名稱與截止日，沒有未替換的占位符', () => {
  const { html, subject } = generateReminderEmail({ name: '甲', email: 'a@b.co', chapters: [], token: 'tok_x', baseUrl: 'https://example.org' });
  assert.ok(html.includes(church.churchName) && subject.includes(church.churchName));
  assert.ok(html.includes(dates.deadlineLong));
  assert.ok(!html.includes('{{') && !html.includes('undefined'));
});
await t('截止日判斷：截止日當天仍可認領，隔天關閉（日期仍是佔位符時永不截止）', () => {
  if (deadlineIsPlaceholder) {
    assert.equal(isPastDeadline(new Date('2099-01-01')), false);
    assert.equal(dates.deadlineLong, 'XXXX 年 XX 月 XX 日');
    return;
  }
  const tz = church.timezoneOffset;
  assert.equal(isPastDeadline(new Date(`${church.deadline}T23:59:00${tz}`)), false);
  assert.equal(isPastDeadline(new Date(new Date(`${church.deadline}T00:00:00${tz}`).getTime() + 25 * 3600 * 1000)), true);
  assert.equal(typeof isClaimingClosed(), 'boolean');
});

console.log(`\n✅ 單元測試全部通過（${passed} 項）`);
