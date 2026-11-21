# 🎵 歌荒救星 V2.2：改用 Groq 免費方案的操作步驟

本專案根據 V2.1 GitHub Pages + Cloudflare Workers 完整版修改，仍是 **即時 LLM 生成**，不是示範資料。

## 何時適用

當 OpenAI API 出現 `insufficient_quota`、無法繼續儲值，或想要測試免費方案時，可以把後端改成 Groq Cloud。

Groq 的免費方案有 RPM / TPM / RPD 等限制，**不是無限制**；請在 https://console.groq.com/docs/rate-limits 核對目前帳戶限額。

## 1. 將修改版程式更新到 GitHub

這份 ZIP 的 GitHub 結構仍是：`docs/`、`worker/`、`shared/`、`tests/`、`wrangler.jsonc`、`package.json`。

你可以在 GitHub 網頁編輯原 Repo：只需要更新三個既有檔案：

- `shared/openai.mjs`
- `worker/index.mjs`
- `tests/worker.test.mjs`（可選，供自動測試使用）

並可新增本說明 `GROQ_SETUP.md`。**不要修改 `wrangler.jsonc` 原有 Worker 名稱**，除非確定目前設定不一致。

不建議直接把整包 ZIP 作為 GitHub 單一檔案上傳。若透過 GitHub 網頁覆蓋，打開每個檔案的鉛筆編輯功能，貼入新檔案完整內容，按 Commit changes。

## 2. Groq 建立 API Key

1. 打開 https://console.groq.com/ ，建立或登入帳號。
2. 在 `API Keys` 頁建立新金鑰，命名為 `indie-music-savior`。
3. 複製後直接保存到 Cloudflare Secret；不要貼入 GitHub 或 ChatGPT。

## 3. 在 Cloudflare Worker 設定三個變數

`Workers & Pages → 你已部署的 Worker → Settings → Variables and Secrets`：

| 名稱 | 類型 | 值 |
|---|---|---|
| `AI_PROVIDER` | Text | `groq` |
| `GROQ_API_KEY` | Secret | 你的 Groq 金鑰 |
| `GROQ_MODEL` | Text（選用） | `openai/gpt-oss-20b` |

**保留**原本的 `ALLOWED_ORIGIN`，例如 `https://你的帳號.github.io`。
`OPENAI_API_KEY` 可以移除，或保留但已設定 `AI_PROVIDER=groq` 時不會被使用。

儲存後部署 Worker。

## 4. 驗證設定

在瀏覽器開啟你的 `https://...workers.dev/status`，預期：

```json
{
  "ok": true,
  "configured": true,
  "provider": "groq",
  "model": "openai/gpt-oss-20b"
}
```

這只代表後端讀得到 Secret，不代表免費額度足夠。

## 5. 測試歌荒救星

`docs/config.js` 原本的 Worker URL **不用變**，因為仍使用同一個 Cloudflare Worker。

打開 GitHub Pages，輸入「陰雨夜晚，想聽憂傷的 Dream Pop」並按推薦。

如果正常，就會依序使用 Groq 模型完成情緒分析、資料庫選歌、繁體中文短評和 Stable Diffusion 英文 Prompt。

若顯示 429，請先查看 Groq 的 Limits/Usage；免費額度也會有上限。

## 6. 將來想切回 OpenAI

只要設定：

- `AI_PROVIDER` 改為 `openai`
- `OPENAI_API_KEY` 設為有效 OpenAI Secret
- （選用）`OPENAI_MODEL=gpt-4.1-mini`

不需要重新修改前端程式碼；這份 V2.2 沒有在 Groq 額度用完時自動切回付費 OpenAI。

## 安全與限制

- Groq 免費層有速率與總用量限制，不是永久無限額度。
- API Key 永遠只能放 Cloudflare Secret。
- Origin 檢查與 IP 限流只能降低風險，不能杜絕 API 濫用。
- 本版只產生 Stable Diffusion Prompt，**尚未真的生成圖片**。
- 我們已用模擬回應測試 2 次 LLM 的流程，但沒有你的 Groq API Key，未驗證真實供應商連線。

參考：https://console.groq.com/docs/responses-api 、 https://console.groq.com/docs/structured-outputs
