/**
 * 認領 Token：連結中的唯一憑證，用來查詢、退選。
 *
 * 新產生的 token 是純隨機字串（24 bytes 密碼學亂數），本身不含任何個資、也無法推測。
 * 舊版 token 是把姓名/Email/章節 base64 編碼在裡面，任何拿到連結的人都能解碼看到個資；
 * decodeStatelessToken 只為了相容已寄出的舊連結而保留，新程式碼不要再用它。
 */
import crypto from 'node:crypto';

export function generateToken() {
  return 'tok_' + crypto.randomBytes(24).toString('base64url');
}

/** @deprecated 舊格式（內含個資）。僅供相容與測試，新認領請用 generateToken()。 */
export function generateStatelessToken(name, email, chapters) {
  const payload = {
    n: name,
    e: email,
    c: chapters.map(c => ({
      bookId: (c.bookId || '').toLowerCase(),
      bookName: c.bookName,
      chapter: c.chapter,
      verses: c.verses,
      estimatedPages: c.estimatedPages || 1
    })),
    t: Date.now()
  };
  return 'tok_' + Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeStatelessToken(token) {
  if (!token) return null;
  try {
    const clean = token.startsWith('tok_') ? token.slice(4) : token;
    const jsonStr = Buffer.from(clean, 'base64url').toString('utf8');
    const parsed = JSON.parse(jsonStr);
    if (parsed && (parsed.email || parsed.e)) {
      return {
        name: parsed.name || parsed.n,
        email: (parsed.email || parsed.e || '').toLowerCase().trim(),
        chapters: (parsed.chapters || parsed.c || []).map(ch => ({
          ...ch,
          bookId: (ch.bookId || '').toLowerCase()
        })),
        createdAt: parsed.createdAt
          ? new Date(parsed.createdAt).toISOString()
          : (parsed.t ? new Date(parsed.t).toISOString() : new Date().toISOString())
      };
    }
  } catch (e) {
    // 不是舊格式 Token
  }
  return null;
}
