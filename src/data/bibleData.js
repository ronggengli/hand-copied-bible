/**
 * 聖經 66 卷書、1,189 章完整資料集（含各章節數與篇幅統計）
 * 標準和合本 (CUV) 分卷結構
 */

export const BIBLE_BOOKS = [
  // ================= 舊約 39 卷 (929 章) =================
  // --- 律法書 (摩西五經) ---
  {
    id: 'GEN',
    name: '創世記',
    short: '創',
    testament: 'OT',
    testamentName: '舊約',
    category: '律法書',
    chapters: [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26]
  },
  {
    id: 'EXO',
    name: '出埃及記',
    short: '出',
    testament: 'OT',
    testamentName: '舊約',
    category: '律法書',
    chapters: [22,25,22,31,23,30,25,32,35,29,10,51,22,31,27,36,16,27,25,26,36,31,33,18,40,37,21,43,46,38,18,35,23,35,35,38,29,31,43,38]
  },
  {
    id: 'LEV',
    name: '利未記',
    short: '利',
    testament: 'OT',
    testamentName: '舊約',
    category: '律法書',
    chapters: [17,16,17,35,19,30,38,36,24,20,47,8,59,57,33,34,16,30,37,27,24,33,44,23,55,46,34]
  },
  {
    id: 'NUM',
    name: '民數記',
    short: '民',
    testament: 'OT',
    testamentName: '舊約',
    category: '律法書',
    chapters: [54,34,51,49,31,27,89,26,23,36,35,16,33,45,41,50,13,32,22,29,35,41,30,25,18,65,23,31,40,16,54,42,56,29,34,13]
  },
  {
    id: 'DEU',
    name: '申命記',
    short: '申',
    testament: 'OT',
    testamentName: '舊約',
    category: '律法書',
    chapters: [46,37,29,49,33,25,26,20,29,22,32,32,18,29,23,22,20,22,21,20,23,30,25,22,19,19,26,68,29,20,30,52,29,12]
  },

  // --- 歷史書 ---
  {
    id: 'JOS',
    name: '約書亞記',
    short: '書',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [18,24,17,24,15,27,26,35,27,43,23,24,33,15,63,10,18,28,51,9,45,34,16,33]
  },
  {
    id: 'JDG',
    name: '士師記',
    short: '士',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [36,23,31,24,31,40,25,35,57,18,40,15,25,20,20,31,13,31,30,48,25]
  },
  {
    id: 'RUT',
    name: '路得記',
    short: '得',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [22,23,18,22]
  },
  {
    id: '1SA',
    name: '撒母耳記上',
    short: '撒上',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [28,36,21,22,12,21,17,22,27,27,15,25,23,52,35,23,58,30,24,42,15,23,29,22,44,25,12,25,11,31,13]
  },
  {
    id: '2SA',
    name: '撒母耳記下',
    short: '撒下',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [27,32,39,12,25,23,29,18,13,19,27,31,39,33,37,23,29,33,43,26,22,51,39,25]
  },
  {
    id: '1KI',
    name: '列王紀上',
    short: '王上',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [53,46,28,34,18,38,51,66,28,29,43,33,34,31,34,34,24,46,21,43,29,53]
  },
  {
    id: '2KI',
    name: '列王紀下',
    short: '王下',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [18,25,27,44,27,33,20,29,37,36,21,21,25,29,38,20,41,37,37,21,26,20,37,20,30]
  },
  {
    id: '1CH',
    name: '歷代志上',
    short: '代上',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [54,55,24,43,26,81,40,40,44,14,47,40,14,17,29,43,27,17,19,8,30,19,32,31,31,32,34,21,30]
  },
  {
    id: '2CH',
    name: '歷代志下',
    short: '代下',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [17,18,17,22,14,42,22,18,31,19,23,16,22,15,19,14,19,34,11,37,20,12,21,27,28,23,9,27,36,27,21,33,25,33,27,23]
  },
  {
    id: 'EZR',
    name: '以斯拉記',
    short: '拉',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [11,70,13,24,17,22,28,36,15,44]
  },
  {
    id: 'NEH',
    name: '尼希米記',
    short: '尼',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [11,20,32,23,19,19,73,18,38,39,36,47,31]
  },
  {
    id: 'EST',
    name: '以斯帖記',
    short: '斯',
    testament: 'OT',
    testamentName: '舊約',
    category: '歷史書',
    chapters: [22,23,15,17,14,14,10,17,32,3]
  },

  // --- 詩歌智慧書 ---
  {
    id: 'JOB',
    name: '約伯記',
    short: '伯',
    testament: 'OT',
    testamentName: '舊約',
    category: '詩歌智慧書',
    chapters: [22,13,26,21,27,30,21,22,35,22,20,25,28,22,35,22,16,21,29,29,34,30,17,25,6,14,23,28,25,31,40,22,33,37,16,33,24,41,30,24,34,17]
  },
  {
    id: 'PSA',
    name: '詩篇',
    short: '詩',
    testament: 'OT',
    testamentName: '舊約',
    category: '詩歌智慧書',
    chapters: [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,12,24,11,22,22,28,12,40,22,13,17,13,11,5,26,17,11,9,14,20,23,19,9,6,7,23,13,11,11,17,12,8,12,11,10,13,20,7,35,36,5,24,20,28,23,10,12,20,72,13,19,16,8,18,12,13,17,7,18,52,17,16,15,5,23,11,13,12,9,9,5,8,28,22,35,45,48,43,13,31,7,10,10,9,8,18,19,2,29,176,7,8,9,4,8,5,6,5,6,8,8,3,18,3,3,21,26,9,8,24,13,10,7,12,15,21,10,20,14,9,6]
  },
  {
    id: 'PRO',
    name: '箴言',
    short: '箴',
    testament: 'OT',
    testamentName: '舊約',
    category: '詩歌智慧書',
    chapters: [33,22,35,27,23,35,27,36,18,32,31,28,25,35,33,33,28,24,29,30,31,29,35,34,28,28,27,28,27,33,31]
  },
  {
    id: 'ECC',
    name: '傳道書',
    short: '傳',
    testament: 'OT',
    testamentName: '舊約',
    category: '詩歌智慧書',
    chapters: [18,26,22,16,20,12,29,17,18,20,10,14]
  },
  {
    id: 'SNG',
    name: '雅歌',
    short: '歌',
    testament: 'OT',
    testamentName: '舊約',
    category: '詩歌智慧書',
    chapters: [17,17,11,16,16,13,13,14]
  },

  // --- 大先知書 ---
  {
    id: 'ISA',
    name: '以賽亞書',
    short: '賽',
    testament: 'OT',
    testamentName: '舊約',
    category: '大先知書',
    chapters: [31,22,26,6,30,13,25,22,21,34,16,6,22,32,9,14,14,7,25,6,10,25,18,23,12,21,13,29,24,33,9,20,24,17,10,22,38,22,8,31,29,25,28,28,25,13,15,22,26,11,23,15,12,17,13,12,21,14,21,22,11,12,19,12,25,24]
  },
  {
    id: 'JER',
    name: '耶利米書',
    short: '耶',
    testament: 'OT',
    testamentName: '舊約',
    category: '大先知書',
    chapters: [19,37,25,31,31,30,34,22,26,25,23,17,27,22,21,21,27,23,15,18,14,30,40,10,38,24,22,17,32,24,40,44,26,22,19,32,21,28,18,16,18,22,13,30,5,28,7,47,39,46,64,34]
  },
  {
    id: 'LAM',
    name: '耶利米哀歌',
    short: '哀',
    testament: 'OT',
    testamentName: '舊約',
    category: '大先知書',
    chapters: [22,22,66,22,22]
  },
  {
    id: 'EZK',
    name: '以西結書',
    short: '結',
    testament: 'OT',
    testamentName: '舊約',
    category: '大先知書',
    chapters: [28,10,27,17,17,14,27,18,11,22,25,28,23,23,8,63,24,32,14,49,32,31,49,27,17,21,36,26,21,26,18,32,33,31,15,38,28,23,29,49,26,20,27,31,25,24,23,35]
  },
  {
    id: 'DAN',
    name: '但以理書',
    short: '但',
    testament: 'OT',
    testamentName: '舊約',
    category: '大先知書',
    chapters: [21,49,30,37,31,28,28,27,27,21,45,13]
  },

  // --- 小先知書 ---
  {
    id: 'HOS',
    name: '何西阿書',
    short: '何',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [11,23,5,19,15,11,16,14,17,15,12,14,16,9]
  },
  {
    id: 'JOL',
    name: '約珥書',
    short: '珥',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [20,32,21]
  },
  {
    id: 'AMO',
    name: '阿摩司書',
    short: '摩',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [15,16,15,13,27,14,17,14,15]
  },
  {
    id: 'OBA',
    name: '俄巴底亞書',
    short: '俄',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [21]
  },
  {
    id: 'JON',
    name: '約拿書',
    short: '拿',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [17,10,10,11]
  },
  {
    id: 'MIC',
    name: '彌迦書',
    short: '彌',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [16,13,12,13,15,16,20]
  },
  {
    id: 'NAM',
    name: '那鴻書',
    short: '鴻',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [15,13,19]
  },
  {
    id: 'HAB',
    name: '哈巴谷書',
    short: '哈',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [17,20,19]
  },
  {
    id: 'ZEP',
    name: '西番雅書',
    short: '番',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [18,15,20]
  },
  {
    id: 'HAG',
    name: '哈該書',
    short: '該',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [15,23]
  },
  {
    id: 'ZEC',
    name: '撒迦利亞書',
    short: '亞',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [21,13,10,14,11,15,14,23,17,12,17,14,9,21]
  },
  {
    id: 'MAL',
    name: '瑪拉基書',
    short: '瑪',
    testament: 'OT',
    testamentName: '舊約',
    category: '小先知書',
    chapters: [14,17,18,6]
  },

  // ================= 新約 27 卷 (260 章) =================
  // --- 四福音書 ---
  {
    id: 'MAT',
    name: '馬太福音',
    short: '太',
    testament: 'NT',
    testamentName: '新約',
    category: '四福音書',
    chapters: [25,23,17,25,48,34,29,34,38,42,30,50,58,36,39,28,27,35,30,34,46,46,39,51,46,75,66,20]
  },
  {
    id: 'MRK',
    name: '馬可福音',
    short: '可',
    testament: 'NT',
    testamentName: '新約',
    category: '四福音書',
    chapters: [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20]
  },
  {
    id: 'LUK',
    name: '路加福音',
    short: '路',
    testament: 'NT',
    testamentName: '新約',
    category: '四福音書',
    chapters: [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53]
  },
  {
    id: 'JHN',
    name: '約翰福音',
    short: '約',
    testament: 'NT',
    testamentName: '新約',
    category: '四福音書',
    chapters: [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25]
  },

  // --- 教會歷史 ---
  {
    id: 'ACT',
    name: '使徒行傳',
    short: '徒',
    testament: 'NT',
    testamentName: '新約',
    category: '歷史書',
    chapters: [26,47,26,37,42,15,60,40,43,48,30,25,52,28,41,40,34,28,41,38,40,30,35,27,27,32,44,31]
  },

  // --- 保羅書信 ---
  {
    id: 'ROM',
    name: '羅馬書',
    short: '羅',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [32,29,31,25,21,23,25,39,33,21,36,21,14,23,33,27]
  },
  {
    id: '1CO',
    name: '哥林多前書',
    short: '林前',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [31,16,23,21,13,20,40,13,27,33,34,31,13,40,58,24]
  },
  {
    id: '2CO',
    name: '哥林多後書',
    short: '林後',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [24,17,18,18,21,18,16,24,15,18,33,21,14]
  },
  {
    id: 'GAL',
    name: '加拉太書',
    short: '加',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [24,21,29,31,26,18]
  },
  {
    id: 'EPH',
    name: '以弗所書',
    short: '弗',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [23,22,21,32,33,24]
  },
  {
    id: 'PHP',
    name: '腓立比書',
    short: '腓',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [30,30,21,23]
  },
  {
    id: 'COL',
    name: '歌羅西書',
    short: '西',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [29,23,25,18]
  },
  {
    id: '1TH',
    name: '帖撒羅尼迦前書',
    short: '帖前',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [10,20,13,18,28]
  },
  {
    id: '2TH',
    name: '帖撒羅尼迦後書',
    short: '帖後',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [12,17,18]
  },
  {
    id: '1TI',
    name: '提摩太前書',
    short: '提前',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [20,15,16,16,25,21]
  },
  {
    id: '2TI',
    name: '提摩太後書',
    short: '提後',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [18,26,17,22]
  },
  {
    id: 'TIT',
    name: '提多書',
    short: '多',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [16,15,15]
  },
  {
    id: 'PHM',
    name: '腓利門書',
    short: '門',
    testament: 'NT',
    testamentName: '新約',
    category: '保羅書信',
    chapters: [25]
  },

  // --- 普通書信 ---
  {
    id: 'HEB',
    name: '希伯來書',
    short: '來',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [14,18,19,16,14,20,28,13,28,39,40,29,25]
  },
  {
    id: 'JAS',
    name: '雅各書',
    short: '雅',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [27,26,18,17,20]
  },
  {
    id: '1PE',
    name: '彼得前書',
    short: '彼前',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [25,25,22,19,14]
  },
  {
    id: '2PE',
    name: '彼得後書',
    short: '彼後',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [21,22,18]
  },
  {
    id: '1JN',
    name: '約翰一書',
    short: '約一',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [10,29,24,21,21]
  },
  {
    id: '2JN',
    name: '約翰二書',
    short: '約二',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [13]
  },
  {
    id: '3JN',
    name: '約翰三書',
    short: '約三',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [14]
  },
  {
    id: 'JUD',
    name: '猶大書',
    short: '猶',
    testament: 'NT',
    testamentName: '新約',
    category: '普通書信',
    chapters: [25]
  },

  // --- 啟示預言 ---
  {
    id: 'REV',
    name: '啟示錄',
    short: '啟',
    testament: 'NT',
    testamentName: '新約',
    category: '啟示預言',
    chapters: [20,29,22,11,14,17,17,13,21,11,19,17,18,20,8,21,18,24,21,15,27,21]
  }
];

// 全聖經章節總數 (1189 章)
export const TOTAL_CHAPTERS = BIBLE_BOOKS.reduce((sum, book) => sum + book.chapters.length, 0);

// 全書卷以 ID 映射的 Dictionary
export const BIBLE_BOOK_MAP = Object.fromEntries(
  BIBLE_BOOKS.map(b => [b.id, b])
);

// 產生扁平化的章節唯一鍵清單，格式: `${bookId}_${chapterNum}`，例如 GEN_1
export function getChapterKey(bookId, chapterNum) {
  return `${bookId}_${chapterNum}`;
}

export function parseChapterKey(key) {
  const [bookId, chapterStr] = key.split('_');
  const chapter = parseInt(chapterStr, 10);
  // BIBLE_BOOK_MAP 的 key 是原始大寫書卷代碼（如 'GEN'），但系統其他地方
  // （資料庫 chapter_key、URL、比對邏輯）一律用小寫 bookId，這裡查表前要轉回大寫，
  // 不然每次都查不到書卷、只能顯示裸代碼與 0 節（曾經真實發生過的 bug）。
  const book = BIBLE_BOOK_MAP[(bookId || '').toUpperCase()];
  return {
    bookId,
    chapter,
    bookName: book ? book.name : bookId,
    bookShort: book ? book.short : bookId,
    verses: book && book.chapters[chapter - 1] ? book.chapters[chapter - 1] : 0
  };
}

/**
 * 根據經節數預估手抄稿紙面數（以 A4 300 字稿紙估算，平均 8~9 節約需 1 面稿紙）
 * @param {number} verses 經節數
 * @returns {number} 預估稿紙面數
 */
export function estimatePageCount(verses) {
  if (!verses || verses <= 0) return 1;
  // 繁體中文聖經每節約 30~35 字，300字稿紙約每 8.5 節一面
  const pages = Math.ceil(verses / 8.5);
  return Math.max(1, pages);
}

/**
 * 取得特定書卷特定章節的經節數與預估面數
 */
export function getChapterMeta(bookId, chapterNum) {
  const book = BIBLE_BOOKS.find(b => b.id.toLowerCase() === bookId.toLowerCase());
  if (!book) return { verses: 25, estimatedPages: 3 };
  
  const verses = (book.chapters && book.chapters[chapterNum - 1]) || 25;
  const estimatedPages = estimatePageCount(verses);
  return { verses, estimatedPages };
}
