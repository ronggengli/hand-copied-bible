/**
 * 認領請求的伺服器端驗證。
 *
 * 前端送來的章節資料一律不可信：書卷名稱、節數、稿紙面數全部由伺服器依
 * src/data/bibleData.js 查表產生，只採用「書卷代碼 + 章數」兩個值，並且驗證它們合法。
 * 過去直接採用前端送來的 bookName，導致：
 *   1. 任何人都能把自己決定的 HTML 塞進教會 Gmail 寄出的確認信（釣魚信）；
 *   2. 章數可以送 "01" 之類的寫法，組出 gen_01，跟 gen_1 是不同的 key，同一章被重複認領。
 */
import { BIBLE_BOOK_MAP, estimatePageCount } from '../src/data/bibleData.js';

/**
 * 只給自動化測試用的後門：ALLOW_TEST_BOOKS=1 時，接受 zztest 開頭的假書卷代碼（資料由前端提供）。
 * 正式環境「絕對不要」設定這個環境變數。
 */
function isTestBook(bookId) {
  return process.env.ALLOW_TEST_BOOKS === '1' && /^zztest[a-z0-9]*$/.test(bookId);
}

/**
 * @returns {{ ok: true, chapters: Array<{bookId, bookName, chapter, verses, estimatedPages}> } | { ok: false, error: string }}
 */
export function normalizeChapters(raw, maxChapters) {
  if (!Array.isArray(raw) || raw.length === 0) {
    return { ok: false, error: '請至少選擇 1 個章節' };
  }
  if (raw.length > maxChapters) {
    return { ok: false, error: `每位會友最多只能認領 ${maxChapters} 章` };
  }

  const seen = new Set();
  const chapters = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') return { ok: false, error: '章節資料格式不正確' };

    const bookId = typeof item.bookId === 'string' ? item.bookId.trim().toLowerCase() : '';
    const chapterRaw = item.chapter;
    const chapterOk = (typeof chapterRaw === 'number' && Number.isInteger(chapterRaw))
      || (typeof chapterRaw === 'string' && /^[1-9]\d{0,3}$/.test(chapterRaw));
    const chapter = chapterOk ? Number(chapterRaw) : NaN;
    if (!bookId || !Number.isInteger(chapter) || chapter < 1) {
      return { ok: false, error: '章節資料格式不正確' };
    }

    let entry;
    if (isTestBook(bookId)) {
      entry = {
        bookId,
        bookName: String(item.bookName || '測試書卷').slice(0, 20),
        chapter,
        verses: Number.isInteger(item.verses) ? item.verses : 10,
        estimatedPages: Number.isInteger(item.estimatedPages) ? item.estimatedPages : 1
      };
    } else {
      const book = BIBLE_BOOK_MAP[bookId.toUpperCase()];
      if (!book || chapter > book.chapters.length) {
        return { ok: false, error: '章節不存在，請重新整理頁面後再選擇' };
      }
      const verses = book.chapters[chapter - 1];
      entry = { bookId, bookName: book.name, chapter, verses, estimatedPages: estimatePageCount(verses) };
    }

    const key = `${entry.bookId}_${entry.chapter}`;
    if (seen.has(key)) return { ok: false, error: '選擇的章節有重複' };
    seen.add(key);
    chapters.push(entry);
  }
  return { ok: true, chapters };
}
