# 手抄聖經認領與管理系統

教會「手抄聖經」事工用的線上認領與後台管理系統：66 卷書、1,189 章，會友上網認領章節，同工在後台記錄收件、寄催件信。

- **前台（會友）**：挑章節、填姓名即完成認領（Email 選填）；寄確認信；可用 Email 或信中專屬連結查詢、放棄章節。
- **後台（同工）**：PIN 登入；名單管理、逐章標記「已收件」、一鍵催件、匯出 CSV、釋出章節。
- **只有繁體中文**。
- **全部免費額度即可**：Vercel（Hobby）+ Supabase（Free）+ 一個能寄信的信箱（Gmail 只是範例）。

> 本系統原為一間教會於 2026 年的手抄聖經事工開發，實際使用過一整期活動，八百多位弟兄姊妹參與，整理後以 MIT 授權開源。教會名稱、日期、收件地點等全部集中在 [`church.config.js`](./church.config.js)。

## 架構

```
瀏覽器 ── 靜態頁面（Vite 打包）
   │
   └── /api/*  Vercel Serverless Functions（Node.js）
          ├── Supabase（PostgreSQL）：認領資料、章節鎖定、速率限制計數
          └── SMTP 信箱（Gmail 或其他）：確認信與催件信
```

前端**不直接連線 Supabase**，所有資料存取都經過 `/api/*`，後端用 Supabase 的 secret key。

## 從零部署

需要三個帳號：GitHub、[Supabase](https://supabase.com)、[Vercel](https://vercel.com)，以及一個專門寄信用的電子郵件信箱（Gmail 只是範例，任何支援 SMTP 的信箱都可以）。

### 1. 取得程式碼
在 GitHub 按 **Use this template**（或 fork）建立你自己的 repo。

### 2. 修改 `church.config.js`
教會名稱、寄件人名稱、標語、活動起迄日（預設是 `XXXX-XX-XX` 佔位符，**務必改成真實日期**）、截止日、收件地點與時間、每人認領上限、logo（選填）都在這裡，檔內有註解。改完 commit。
- logo 只放你們有權使用的圖檔（放 `public/`，在 `logoPath` 填路徑）；留空則顯示教會名稱文字。
- 稿紙 PDF 在 `public/`，可直接換成自己的，並更新 `manuscriptPaperFile`。

### 3. 建立 Supabase 專案
1. 建立專案後，到 **SQL Editor** 貼上 [`supabase_schema.sql`](./supabase_schema.sql) 整份執行（可重複執行）。
2. 到 **Project Settings → API** 記下 **Project URL**，以及 **secret key**（`sb_secret_...`，或舊版的 `service_role`）。
   - ⚠️ 這把 secret key 擁有完整權限，只能放在 Vercel 環境變數，**絕對不要**放進程式碼或 commit。

### 4. 準備寄信信箱
本系統用 SMTP 寄信，**不一定要用 Gmail**。請準備一個專門寄信用的信箱（不要用牧者或同工的個人信箱），二選一：

**A. 用 Gmail（設定最簡單，文件以它為例）**
1. 開啟兩步驟驗證，再到 Google 帳號 → 安全性 → **應用程式密碼** 產生一組 16 碼密碼。
2. `MAIL_USER` 填 Gmail 地址，`MAIL_PASS` 填那組應用程式密碼。**不需要**設定 `SMTP_HOST`。
3. Gmail 一般每天約可寄 500 封，足夠一般教會使用。

**B. 用教會自己的信箱或其他服務**（教會網域信箱、Outlook / Microsoft 365、Zoho、SendGrid SMTP 等）
1. 向信箱服務商（或你們的網管）要 SMTP 的主機名稱、埠號、帳號、密碼。
2. 設定 `SMTP_HOST`、`SMTP_PORT`（常見為 587；465 會自動使用 SSL），`MAIL_USER`、`MAIL_PASS`。
3. 如果服務商要求寄件位址必須是特定格式，再設定 `MAIL_FROM`。
4. 每天可寄的上限由服務商決定，請先確認，系統只做了單一信箱的次數上限（見下方「防濫用」）。

兩種方式都建議先用「本機開發」寄一封測試信確認能收到。

### 5. 部署到 Vercel
1. Vercel → **Add New Project** → 匯入你的 repo（Framework 選 Vite，Build Command `npm run build`，Output `dist`）。
2. 在 **Environment Variables** 設定（Production 與 Preview 都要）：

| 變數 | 必填 | 說明 |
|---|---|---|
| `SUPABASE_URL` | ✅ | Supabase Project URL |
| `SUPABASE_SECRET_KEY` | ✅ | Supabase secret key |
| `ADMIN_PIN` | ✅ | 後台通行碼。**請用 12 字元以上的隨機字串**（見下方「後台安全」） |
| `MAIL_USER` | ✅ | 寄信信箱的登入帳號（同時是預設寄件位址）。舊名稱 `GMAIL_USER` 仍可使用 |
| `MAIL_PASS` | ✅ | 該信箱的密碼（Gmail 請填應用程式密碼）。舊名稱 `GMAIL_PASS` 仍可使用 |
| `SMTP_HOST` | 用 Gmail 以外時 | SMTP 主機；沒填就使用 Gmail |
| `SMTP_PORT` | 選填 | 預設 587；465 自動使用 SSL |
| `SMTP_SECURE` | 選填 | 填 `true` 強制使用 SSL |
| `MAIL_FROM` | 選填 | 寄件位址，預設與 `MAIL_USER` 相同 |
| `BASE_URL` | 建議 | 你的網站網址（例 `https://xxx.vercel.app`），信件裡的連結用它；沒設會用 Vercel 的正式網域 |
| `SENDER_NAME` | 選填 | 覆蓋 `church.config.js` 的 `senderName` |

3. Deploy。完成後打開網址，點右上「管理員後台」用 `ADMIN_PIN` 登入。

> **不要**設定 `ALLOW_TEST_BOOKS`、`DISABLE_RATE_LIMIT`——它們是測試專用後門，設了會關掉防護。

## 後台使用

- **名單管理**：看所有認領、搜尋、篩選；標記繳交、釋出章節、催件、匯出 CSV（Excel 可直接開）。
- **章節收件**：整本聖經的章節格子，點一下標記「已收件」；進度條會連動。
- **批次催件**：後台按鈕會逐封寄出；人數很多時建議改用腳本 `npm run send-reminders`（有間隔、依 Email 合併、不重複提醒，先用 `DRY_RUN=true` 看名單）。需要 `.env.local` 並設定 `BASE_URL`。

## 本機開發

```bash
npm install
cp .env.example .env.local   # 填入你的設定
npm run dev                  # http://localhost:5173
npm run build
```

### 測試

```bash
npm run test:unit          # 不需要資料庫
npm run test:integration   # 會真的寫入 .env.local 指向的 Supabase
```

⚠️ **`test:integration` 會對 `.env.local` 設定的資料庫寫入測試資料（結束時清除）。請務必使用獨立的 Supabase 測試專案，不要指向正式資料庫。**
`scripts/loadtest.py` 同理，且測試用部署需設 `ALLOW_TEST_BOOKS=1`、`DISABLE_RATE_LIMIT=1`。

## 已知的安全取捨（部署前請務必讀）

這個系統為「活動期間短、使用者包含不熟電腦的長輩」設計，**刻意偏向便利**，因此有以下取捨。**這是設計選擇，不是疏漏；但請你的教會自行評估是否接受。**

1. **Email 查詢會看到並能操作該 Email 的認領。** 查詢頁輸入 Email 即可看到該信箱認領的章節，並取得可放棄章節的連結。好處是長輩不用保存信中的連結；代價是**任何人只要知道某位會友的 Email，就能查到他的認領並把它退掉**。若你們的會友不熟悉彼此信箱、或擔心惡意者，請自行修改 `api/my-claim.js`（例如 Email 查詢只寄出連結、不回傳 token）。
2. **認領不需要驗證身分。** 任何人都能用任意姓名、任意 Email 認領；不驗證 Email 是否屬於本人。
3. **確認信寄給填寫的任何信箱。** 因此惡意者可讓你們的寄信信箱寄信給別人（內容固定為系統模板，無法自訂）。已有防護：同一信箱 24 小時最多寄 `emailsPerAddressPerDay` 封。
4. **後台只有一組共用 PIN**，沒有個人帳號與稽核登入者。

### 防濫用（已內建）

- **認領速率限制**：同一來源 IP 每小時最多 `claimRateLimitPerIpPerHour` 次（預設 30，含失敗）。這能擋住「單一電腦用腳本狂送」，但**擋不住分散多個 IP 的攻擊**；教會 Wi-Fi 下大家共用同一個 IP，數字別設太低。需要更強防護請加上 Vercel Firewall 或 Cloudflare Turnstile。
- **章節資料伺服器端驗證**：書卷名稱、節數都由伺服器查表，前端送來的值一律不採用，擋掉偽造內容與重複認領。
- **截止後關閉認領**（`closeClaimsAfterDeadline`）。

### 後台安全

- PIN 只存在伺服器環境變數；前端不含任何密碼。
- 同一 IP 連續輸錯 5 次鎖定 15 分鐘，**所有後台 API 共用同一套計數**，存在資料庫（跨 Serverless 容器有效）。
- 因為是單一共用 PIN 且鎖定以 IP 為單位，**PIN 請務必用長的隨機字串**（例如密碼管理器產生的 16 字元）；短的數字 PIN 會被分散式猜測攻破。
- 換同工時請更換 PIN（Vercel 改環境變數後重新部署）。

### 資料庫權限

`supabase_schema.sql` 已收回 `anon` / `authenticated` 對所有函式與資料表的存取，只有後端使用的 service role 能操作。**請務必用本 repo 的最新版 schema**，並確認沒有在 Supabase 後台自行對 anon 開放資料表。

## 授權與素材

程式碼以 [MIT License](./LICENSE) 授權。本 repo 不包含任何教會的標誌；你需自行放入有權使用的素材。經文書卷名稱與章節、節數為公開資料。

## 回報問題

一般問題請開 Issue。**資安問題請勿公開 Issue**，見 [SECURITY.md](./SECURITY.md)。
