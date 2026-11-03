# VANTAGE // Orbital Control

VANTAGE 是一個完全虛構、隔離的進階資安教育靶場。網站模擬多租戶衛星任務控制 SaaS，涵蓋 OAuth 裝置授權、GraphQL persisted query、事件訂閱、遙測簽章、Webhook、JWKS、artifact capability、競態與政策設定等信任邊界。

> 本專案不連接任何真實衛星、地面站、身分提供者或外部 API。所有組織、使用者、權杖、事件與檔案均為合成資料。

## 難度定位

本靶場比單點漏洞練習更重視「上下文組合」。10 題分成三條研究鏈，最後一題必須組合前面取得的 mission、window、artifact、approval 與 policy evidence。

| # | 任務 | 核心概念 |
|---|---|---|
| 01 | Ghost Device Grant | OAuth grant 未綁定 client / audience |
| 02 | OrbitCache | GraphQL persisted query 跨租戶快取 |
| 03 | Echo Channel | Event topic subscription 未逐次授權 |
| 04 | Split Canon | 簽章與處理器的 canonicalization 差異 |
| 05 | Replay Perigee | Webhook replay / idempotency |
| 06 | Key Drift | JWKS `kid` 跨 issuer / tenant 混淆 |
| 07 | Cargo Swap | Artifact capability 未綁定完整資源 |
| 08 | Twin Burn | 雙人核准競態與重複簽發 |
| 09 | Policy Debris | 設定合併造成政策繼承污染 |
| 10 | Black Sky Finale | 個別有效、整體錯誤的 capability context |

## 執行

需求：Node.js 22 以上。

```bash
npm install
npm run dev
```

瀏覽器模擬模式：

```text
http://127.0.0.1:4274/hacksite-Vantage/
```

需要用 curl、Burp 或瀏覽器 Network 檢驗真實 HTTP 時：

```bash
npm run lab:api
```

HTTP 模式只監聽 `127.0.0.1:4280`，驗證 Host 與 Origin、限制 64 KB body，且不提供 `engine.mjs`、`fixtures.mjs`。

## 驗證與建置

```bash
npm test
npm run build
```

測試同一套十題攻擊鏈於兩種 transport：直接呼叫隔離引擎與 loopback HTTP server。建置結果輸出至 `dist/`，可部署到 GitHub Pages。

## 專案結構

```text
public/
  app.mjs       SPA、transport、研究矩陣與 console
  views.mjs     任務控制介面頁面
  engine.mjs    隔離式教學引擎
  fixtures.mjs  純合成任務資料
  catalog.mjs   十題課程與修補概念
scripts/
  server.mjs    loopback-only HTTP adapter
  build.mjs     靜態建置
tests/          引擎、HTTP 與介面測試
```

教師流程與完整解題脈絡請見 [TEACHING.md](./TEACHING.md)。

## 安全邊界

- Developer Console 僅接受站內相對路徑。
- GraphQL 只接受登記過的合成 operation。
- 瀏覽器模式不發出外部請求。
- HTTP 模式只允許 loopback Host / Origin。
- 所謂「artifact download」僅回傳虛構 metadata，不包含執行檔。
- 最終 uplink 永遠只回傳 `SIMULATION ONLY`，不會傳送任何外部命令。
