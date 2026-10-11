import { defineConfig, loadEnv } from 'vite';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { church, dates, esc, locationsCardsHtml, manuscriptPaperPath } from './src/js/churchInfo.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * 本機開發用的 API 轉接層。
 *
 * 過去這裡曾經是一份完全獨立、用 fs 讀寫 JSON 檔案模擬後端行為的「第二套邏輯」，
 * 跟 /api/*.js（Vercel 正式環境）與已刪除的 server.js（Express 本機伺服器）互相獨立、
 * 各自維護，三份程式碼會各自漂移、彼此不同步。
 *
 * 現在改為直接動態載入 /api/*.js 底下「真正會部署上線的那份程式碼」並執行它，
 * 讓本機開發與雲端正式環境永遠是同一套邏輯、同一個 Supabase 資料庫。
 */
function vercelApiDevPlugin() {
  return {
    name: 'vercel-api-dev-adapter',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/')) return next();

        const urlPath = req.url.split('?')[0];
        const relPath = urlPath.replace(/^\/api\//, '').replace(/\/$/, '');
        const filePath = path.join(__dirname, 'api', `${relPath}.js`);

        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', async () => {
          let parsedBody = {};
          if (body) {
            try { parsedBody = JSON.parse(body); } catch (e) { /* 非 JSON body 忽略 */ }
          }
          req.body = parsedBody;

          const shimRes = {
            statusCode: 200,
            setHeader: (k, v) => res.setHeader(k, v),
            status(code) { this.statusCode = code; res.statusCode = code; return this; },
            json(data) {
              if (!res.getHeader('Content-Type')) res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify(data));
            },
            end(data) { res.end(data); }
          };

          try {
            // 加上 query string 避免 Vite/Node ESM 模組快取，確保改了 api/*.js 後不用重啟就能生效
            const mod = await import(`${pathToFileURL(filePath).href}?t=${Date.now()}`);
            const handler = mod.default;
            if (typeof handler !== 'function') {
              throw new Error(`${relPath}.js 沒有 export default handler`);
            }
            await handler(req, shimRes);
          } catch (e) {
            if (e.code === 'ERR_MODULE_NOT_FOUND') {
              return next();
            }
            console.error(`[vite-api-adapter] /api/${relPath} 執行失敗:`, e);
            shimRes.status(500).json({ success: false, error: e.message });
          }
        });
      });
    }
  };
}


/**
 * 把 index.html 裡的 {{名稱}} 換成 church.config.js 的內容（建置與 dev 都會處理）。
 * 一律先做 HTML 跳脫，所以設定檔裡可以放含 & < > 的文字。
 */
function churchConfigHtmlPlugin() {
  const brandHtml = church.logoPath
    ? `<img src="${esc(church.logoPath)}" alt="${esc(church.churchName)}" class="brand-logo-img">`
    : `<span class="brand-logo-text">${esc(church.churchName)}</span>`;
  const brandLinked = church.websiteUrl
    ? `<a href="${esc(church.websiteUrl)}" target="_blank" rel="noopener noreferrer" class="brand-logo-link" title="前往${esc(church.churchName)}官方網站">${brandHtml}</a>`
    : `<span class="brand-logo-link">${brandHtml}</span>`;
  const values = {
    churchName: esc(church.churchName),
    slogan: esc(church.slogan),
    tagline: esc(church.tagline),
    maxChapters: String(church.maxChaptersPerPerson),
    eventRange: esc(dates.eventRange),
    deadlineSlash: esc(dates.deadlineSlash),
    overdueNotice: esc(church.overdueNotice),
    paperPath: manuscriptPaperPath,
    paperFile: esc(church.manuscriptPaperFile),
    faviconLink: church.logoPath ? `<link rel="icon" href="${esc(church.logoPath)}">` : '',
    brandHtml: brandLinked,
    extraNavLinksHtml: (church.extraNavLinks || [])
      .map(l => `<a href="${esc(l.url)}" target="_blank" rel="noopener noreferrer" class="btn-nav btn-nav-external">${esc(l.label)} ↗</a>`)
      .join('\n        '),
    locationCards: locationsCardsHtml(),
    mailingNoteHtml: church.mailingAddress
      ? `<li>歡迎海外及外縣市弟兄姊妹參與，抄寫完的稿件，請於活動期間內，寄至：<strong>${esc(church.mailingAddress)}</strong></li>`
      : ''
  };
  return {
    name: 'church-config-html',
    transformIndexHtml(html) {
      return html.replace(/\{\{(\w+)\}\}/g, (m, key) => {
        if (!(key in values)) throw new Error(`index.html 有未定義的設定占位符 {{${key}}}`);
        return values[key];
      });
    }
  };
}

export default defineConfig(({ mode }) => {
  // 把 .env.local 等檔案裡的變數（SUPABASE_URL、GMAIL_USER...）載入 process.env，
  // 讓被動態 import 進來的 api/*.js（讀取 process.env）在本機開發時也能拿到正確設定。
  const env = loadEnv(mode, process.cwd(), '');
  Object.assign(process.env, env);

  return {
    plugins: [churchConfigHtmlPlugin(), vercelApiDevPlugin()],
    server: {
      port: 5173,
      host: true
    }
  };
});
