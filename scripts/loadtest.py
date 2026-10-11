#!/usr/bin/env python3
"""
手抄聖經系統 - 上線前並發負載測試

用真實 HTTP 請求打向指定的部署網址（Preview 或 Production，跟正式站同一套
Vercel/Supabase 基礎設施），模擬公佈訊息後短時間內大量會友同時湧入的情境。

所有寫入資料都用 zztest 開頭的假書卷代碼（沿用 tests/app.test.js 既有慣例，
書卷代碼本身不可包含底線——章節 key 是用 `${bookId}_${chapter}` 組成、
解析時單純用 split('_') 取前兩段，書卷代碼裡多一個底線會讓解析錯位，
畫面顯示會出現「zztest null章」這種亂碼，這是純粹的測試資料命名問題，
不是系統本身的 bug），不會撞到真實章節。測試結束會呼叫 /api/cancel-claim
清除，並列印清除結果供人工複查。

用法：
  python3 scripts/loadtest.py <BASE_URL>

  這支腳本會用假書卷代碼大量認領，且全部來自同一個 IP，所以「測試用部署」必須額外設定環境變數：
    ALLOW_TEST_BOOKS=1      接受 zztest 開頭的假書卷（api/_validate.js）
    DISABLE_RATE_LIMIT=1    關閉認領速率限制（api/claim-request.js）
  這兩個變數絕對不可以出現在正式站。請用「獨立的 Supabase 專案 + 獨立的 Vercel 部署」來測。

⚠️ 注意：這支腳本會對目標網址發送真實並發請求、真的寫入又清除資料，
   請勿對著不知情的正式站或別人維運的環境亂跑。
"""
import json
import sys
import time
from collections import Counter
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

if len(sys.argv) < 2:
    sys.exit("用法：python3 scripts/loadtest.py <BASE_URL>（請指定「測試用」部署網址，不要對正式站執行）")
BASE = sys.argv[1]

session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=400, pool_maxsize=400)
session.mount("https://", adapter)


def safe_json(r):
    try:
        return r.json()
    except Exception:
        return None


def timed_get(url):
    t0 = time.time()
    try:
        r = session.get(url, timeout=30)
        return {"ok": r.ok, "status": r.status_code, "ms": (time.time() - t0) * 1000, "body": safe_json(r)}
    except Exception as e:
        return {"ok": False, "status": 0, "ms": (time.time() - t0) * 1000, "error": str(e)}


def timed_post(url, payload):
    t0 = time.time()
    try:
        r = session.post(url, json=payload, timeout=30)
        return {"ok": r.ok, "status": r.status_code, "ms": (time.time() - t0) * 1000, "body": safe_json(r)}
    except Exception as e:
        return {"ok": False, "status": 0, "ms": (time.time() - t0) * 1000, "error": str(e)}


def pctl(data, p):
    s = sorted(data)
    if not s:
        return 0
    k = max(0, min(len(s) - 1, int(round(p / 100 * (len(s) - 1)))))
    return s[k]


def run_burst(label, n, worker_fn):
    print(f"\n=== {label}：{n} 個並發請求 ===", flush=True)
    t0 = time.time()
    results = []
    with ThreadPoolExecutor(max_workers=n) as ex:
        futs = [ex.submit(worker_fn, i) for i in range(n)]
        for f in as_completed(futs):
            results.append(f.result())
    total_ms = (time.time() - t0) * 1000
    oks = [r for r in results if r["ok"]]
    fails = [r for r in results if not r["ok"]]
    lat = [r["ms"] for r in results]
    print(f"總耗時: {total_ms:.0f}ms | 成功: {len(oks)}/{n} | 失敗: {len(fails)}")
    print(f"延遲 min/p50/p95/max (ms): {min(lat):.0f}/{pctl(lat,50):.0f}/{pctl(lat,95):.0f}/{max(lat):.0f}")
    if fails:
        c = Counter(r["status"] for r in fails)
        print("失敗狀態碼分布:", dict(c))
        for r in fails[:3]:
            print("  範例失敗:", r.get("status"), r.get("error"), str(r.get("body"))[:200])
    return results


def main():
    print(f"目標: {BASE}")
    ts = int(time.time())

    # Phase A: 唯讀，模擬大家同時打開首頁抓章節表/進度條
    run_burst("Phase A - 讀取章節表/進度 (GET /api/claims)", 300, lambda i: timed_get(f"{BASE}/api/claims"))

    # Phase B: 300 人同時認領「各自不同」的章節（正常情境的尖峰）
    # 注意：bookId 故意不含底線（zztestload 而非 zztest_load），
    # 避免 chapter_key 用 split('_') 解析時錯位。
    def write_worker(i):
        payload = {
            "name": f"zztestload{ts}_{i}",
            "email": "",
            "fellowship": "",
            "chapters": [{"bookId": f"zztestload{ts}", "chapter": i + 1}],
        }
        return timed_post(f"{BASE}/api/claim-request", payload)

    write_results = run_burst(
        "Phase B - 300 人同時認領各自不同章節 (POST /api/claim-request)", 300, write_worker
    )
    write_ok = [r for r in write_results if r["ok"] and (r.get("body") or {}).get("success")]
    print(f"實際認領成功: {len(write_ok)}/300")

    # Phase C: 20 人同時搶同一章（驗證原子交易在真實併發下是否還是只有 1 人搶到）
    def race_worker(i):
        payload = {
            "name": f"zztestrace{ts}_{i}",
            "email": "",
            "fellowship": "",
            "chapters": [{"bookId": f"zztestrace{ts}", "chapter": 1}],
        }
        return timed_post(f"{BASE}/api/claim-request", payload)

    race_results = run_burst("Phase C - 20 人同時搶同一章節 (衝突處理正確性)", 20, race_worker)
    race_ok = [r for r in race_results if r["ok"] and (r.get("body") or {}).get("success")]
    print(f"\n衝突測試：20 人搶同一章節，實際成功 {len(race_ok)} 人（正確答案應該剛好是 1）")
    if len(race_ok) != 1:
        print("🚨 這一項結果不符合預期，代表章節搶占的原子性在高併發下可能有問題，需要立刻查！")

    # 清除所有測試資料
    all_tokens = []
    for r in write_results + race_results:
        body = r.get("body") or {}
        if r["ok"] and body.get("success") and body.get("token"):
            all_tokens.append(body["token"])

    print(f"\n=== 清除測試資料：共 {len(all_tokens)} 筆待清除 ===")

    def cleanup_worker(token):
        return timed_post(f"{BASE}/api/cancel-claim", {"token": token})

    cleanup_results = []
    with ThreadPoolExecutor(max_workers=50) as ex:
        futs = [ex.submit(cleanup_worker, t) for t in all_tokens]
        for f in as_completed(futs):
            cleanup_results.append(f.result())
    cleanup_ok = [r for r in cleanup_results if r["ok"] and (r.get("body") or {}).get("success")]
    print(f"清除成功: {len(cleanup_ok)}/{len(cleanup_results)}")

    cleanup_failures = [r for r in cleanup_results if not (r["ok"] and (r.get("body") or {}).get("success"))]
    if cleanup_failures:
        print("⚠️ 有清除失敗的項目，需要人工到 Supabase 複查資料庫（用 name 開頭 zztestload/zztestrace 篩選）：")
        for r in cleanup_failures:
            print("  ", r)
    else:
        print("=== 全部清除成功，資料庫應已恢復乾淨 ===")


if __name__ == "__main__":
    main()
