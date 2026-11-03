# VANTAGE 教學手冊

## 建議課程配置

- 適合：已熟悉 HTTP、JWT、基本存取控制與 API 測試的學員。
- 建議時間：120–180 分鐘。
- 個人模式：直接使用網站內的 Developer Console。
- 攔截代理模式：執行 `npm run lab:api`，搭配 curl 或 Burp；僅限本機 loopback。
- 評量重點：能否指出「哪一個 context 沒有被綁定」，而不只是完成請求。

## 三條研究鏈

```text
Identity & Delegation
Ghost Device Grant → OrbitCache → Echo Channel ─────┐
                                                    │
Events & Integrity                                  │
Split Canon → Replay Perigee ───────────────────────┤
Key Drift → Cargo Swap ─────────────────────────────┤→ Black Sky Finale
                                                    │
Command & Data Plane                                │
Twin Burn → Policy Debris ──────────────────────────┘
```

研究矩陣只會在前置任務完成後解鎖下一個節點。每次成功回應的 `proof` 欄位會記錄 evidence；重設模擬後，所有臨時權杖和證據都失效。

## 關卡講解

### 01 · Ghost Device Grant

正常控制：裝置 grant 應綁定 `clientId`、`audience`、tenant、device 與 PKCE。

教學流程：

1. 以 `field-tablet / telemetry.read` 建立裝置代碼。
2. 核准顯示用 user code。
3. 兌換時改用 `orbital-console / mission.control`。
4. 比較回應中的 `binding` 與實際簽發 claims。

根因：兌換器只用 `deviceCode` 找 grant，沒有重新比對 client 與 audience。

### 02 · OrbitCache

正常控制：敏感 persisted query 的快取鍵應包含完整 variables、tenant 與 principal。

教學流程：先以 partner context 暖入 `pq-mission-snapshot-v1`，再以目前租戶送出相同 hash。觀察 `extensions.cache` 和 `resolverTrace`。

根因：快取鍵只有 persisted hash，快取結果又在物件 resolver 前直接回傳。

### 03 · Echo Channel

正常控制：連線握手成功不代表所有 topic 都可訂閱。

教學流程：建立 Northstar event connection，再要求 `tenant/meridian/mission/perigee-12/commands`。成功 evidence 包含最終題需要的 window nonce。

根因：系統只驗證 WebSocket/SSE 握手，subscription body 的 topic 未執行 ACL。

### 04 · Split Canon

正常控制：簽章驗證與業務處理必須使用同一份 canonical bytes。

教學 payload 內含重複的 `thrust` 欄位。引擎刻意讓 verifier 採 first-wins、processor 採 JavaScript JSON parser 的 last-wins，畫面會並列兩個結果。

根因：兩個 parser 對重複欄位的語意不同。

### 05 · Replay Perigee

正常控制：全域 idempotency 應在副作用之前以原子方式寫入。

教學流程：查看 deliveries，重播已處理的 `evt_mro_8841`，觀察 attempt 增加且 command window 再度開啟。

根因：replay path 在執行副作用後才處理去重狀態。

### 06 · Key Drift

正常控制：JWKS cache key 應是 issuer + tenant + kid，並固定可信 issuer、algorithm 與 key use。

教學流程：以 Northstar issuer 的 `ops-2026` 驗證 target tenant 為 Meridian 的 manifest。比較 `targetTenant` 與 `keyResolution.resolvedTenant`。

根因：JWKS cache 只以 `kid` 索引。

### 07 · Cargo Swap

正常控制：capability 必須綁定完整 object key、tenant、target、principal、method 與期限。

教學流程：先為 Northstar calibration artifact 建立 capability，再保留 capability 並替換 download query 的 object key。

根因：簽章 claims 只有 bucket、method 與 expiry。

### 08 · Twin Burn

正常控制：distinct approver、版本檢查、狀態更新與 capability 簽發應在同一交易中完成。

教學流程：取得目前 approval ETag，使用 parallel simulator 讓相同 operator 對同一版本送出兩個請求。

根因：兩個處理器同時讀到舊版本，且 distinct-approver 僅在讀取階段檢查。

### 09 · Policy Debris

正常控制：UI preference 與安全政策應使用不同 schema；合併器拒絕原型特殊鍵。

教學流程：匯入包含 `__proto__.allowUnattendedUplink` 的 JSON 字串，觀察 policy preview 的 property source。

引擎只模擬污染結果，不會實際修改 JavaScript `Object.prototype`；測試會確認全域 prototype 保持乾淨。

### 10 · Black Sky Finale

正常控制：mission、spacecraft、window、artifact、approval、policy 與 command digest 必須封裝在單一、不可拆分的 capability context。

教學流程：從前面四條分支組合 evidence。每一項都會個別通過，但 `PERIGEE-12` mission 與 `AURORA-7` target 並非同一 context；脆弱 gateway 仍回傳模擬授權。

成功旗標：`VANTAGE{CONTEXT_IS_THE_CONTROL_PLANE}`。

## 討論題

1. 快取為何也是授權邊界，而不只是效能元件？
2. 驗證「每一張 token 有效」為何不等於「整體操作已授權」？
3. 重播防護應在哪一層做，才能涵蓋多節點與多租戶？
4. capability URL 應簽署 path、query、method 還是結構化 claims？
5. 如何用資料庫唯一約束與 compare-and-swap 落實 distinct approver？

## 教師驗證

```bash
npm test
npm run build
```

完整測試會確認：

- 10 個 proof 都能按依賴順序產生。
- 未登入、absolute URL、站外 Origin 與未登記 operation 會被拒絕。
- browser engine state 可序列化且不同實例互相隔離。
- HTTP mode 不提供 engine 與 fixture 原始碼。
- prototype pollution 僅為安全模擬，不修改全域 prototype。
- 最終結果永遠標示 `SIMULATION ONLY`。
