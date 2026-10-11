/**
 * 教會個別化設定：部署前請把這個檔案改成你們教會的內容。
 *
 * 前端頁面、確認信/催件信、後端 API 都從這個檔案讀取，改完重新部署即可，
 * 不需要動其他程式碼。這個檔案不放任何機密（Supabase 金鑰、Gmail 密碼、後台 PIN
 * 一律放環境變數，見 .env.example），可以放心提交到 git。
 */
export default {
  // ---- 教會與網站基本資訊 ----
  churchName: '範例教會',
  // 信件寄件人顯示名稱（寄件信箱則是環境變數 MAIL_USER）
  senderName: '範例教會（請勿回覆）',
  // 網頁大標題與副標題
  slogan: '《一筆一畫，同心建造》',
  tagline: '全本聖經共 66 卷書，1189 章，讓我們一起抄寫聖經！',
  // 教會官網（選填）。有填的話，頁面左上角的標誌會連結過去
  websiteUrl: '',
  // 教會標誌圖檔路徑（選填，放在 public/ 底下，例如 '/logo.svg'）。
  // 留空則改顯示教會名稱文字。注意：請只放你們有權使用的圖檔。
  logoPath: '',
  // 導覽列額外連結（選填），例如 [{ label: '活動資訊網', url: 'https://example.org' }]
  extraNavLinks: [],

  // ---- 認領規則 ----
  // 每位會友最多可認領幾章（前端、後端與資料庫函式都以這個數字為準，見 README）
  maxChaptersPerPerson: 3,
  // 防濫用：同一個來源 IP 每小時最多送出幾次認領請求（教會 Wi-Fi 下很多人共用同一個 IP，別設太低）
  claimRateLimitPerIpPerHour: 30,
  // 同一個收件信箱 24 小時內最多寄幾封確認信（超過仍會認領成功，只是不再寄信）
  emailsPerAddressPerDay: 5,

  // ---- 活動期間（格式 YYYY-MM-DD，例如 '2026-09-06'） ----
  // 部署前請改成真實日期。維持 'XXXX-XX-XX' 時，頁面與信件會顯示「XXXX 年 XX 月 XX 日」，
  // 且不會自動截止認領（方便先試用）。
  eventStart: 'XXXX-XX-XX',
  deadline: 'XXXX-XX-XX',
  // 時區偏移，用來判斷「截止日當天 23:59 之前」。台灣為 +08:00
  timezoneOffset: '+08:00',
  // true：截止日（含當天）過後，伺服器拒絕新的認領
  closeClaimsAfterDeadline: true,
  // 逾期的處理說明，會顯示在頁面與信件中
  overdueNotice: '截止日後尚未繳交者，不再收件，將由教會另外安排抄寫的同工。請把握機會，於時限內完成所認領的經文。',

  // ---- 稿紙 ----
  // public/ 底下的稿紙 PDF 檔名（會友下載用）
  manuscriptPaperFile: 'A4 300字稿紙.pdf',

  // ---- 收件地點與時間（可多個） ----
  dropoffLocations: [
    {
      name: '教會服務台',
      schedule: ['主日 11:00～12:00'],
      note: '（一樓大廳）'
    }
  ],
  // 郵寄地址（選填，供外縣市或海外會友寄送稿件）
  mailingAddress: ''
};
