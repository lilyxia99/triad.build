# MEMORY.md — Long-term Memory

## Project: Triad.build (triad.build)

Instagram 活动日历爬虫项目，从 Instagram 帖子提取活动信息并展示在日历上。

### 技术架构
- **前端**: Nuxt.js
- **爬虫脚本**: `scripts/update-calendar.ts`
- **AI（实际代码状态）**: DeepSeek (`deepseek-v4-flash` model, `https://api.deepseek.com`)
  - ⚠️ MEMORY.md 之前记录的 Qwen 迁移（2026-05-09）**从未在代码中实际执行**
  - 脚本仍使用 `DEEPSEEK_API_KEY` 和 `@google-cloud/vision` OCR
  - GitHub Actions workflow 仍传递 `DEEPSEEK_API_KEY` 和 `GOOGLE_CLOUD_VISION_*` 密钥
  - **待修复**: 需要将脚本和 workflow 迁移到 Qwen API
- **部署**: Vercel + GitHub Actions

### ⚠️ Vercel 部署坑点（2026-07-17 修复）
- **`useStorage()` 在 Vercel serverless 上不可靠**: `useStorage().getItem('assets:server:instagram_data.json')` 在 Vercel 上返回 `null`，但在本地 dev 环境正常工作
- **修复**: 改用直接 `import instagramData from '../../assets/instagram_data.json'`，数据在构建时打包到 endpoint chunk 中
- **数据被清空风险**: GitHub Actions 爬虫失败时会写入 `[]` 到 `server/assets/instagram_data.json`，auto-commit 会推送空文件。2026-06-11 至 2026-06-15 期间数据被清空

### 关键配置
- `DEEPSEEK_API_KEY` — 当前脚本实际使用的 API key
- `QWEN_API_KEY` — 计划迁移目标（Token Plan）
  - baseURL: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - 图片理解模型: `qwen-vl-plus`
  - 事件提取模型: `qwen-plus`
- `INSTAGRAM_USER_ACCESS_TOKEN` — Instagram Graph API token
- `INSTAGRAM_BUSINESS_USER_ID` — IG Business 账户 ID
- `VERCEL_DEPLOY_HOOK` — 可选，自动触发 Vercel 重新部署
- `GOOGLE_CLOUD_VISION_PRIVATE_KEY` / `CLIENT_EMAIL` — 当前脚本仍使用（待废弃）

### Instagram 来源账号
- `assets/event_sources.json` 中的 `instagram` 数组目前有 **40+ 个账号**，覆盖 Greensboro / Winston-Salem / High Point / Durham / Raleigh / Chapel Hill
- 2026-05-09 记录的 17 个是早期版本，已大幅扩展

### GitHub Secrets 状态
- 当前使用: `DEEPSEEK_API_KEY`, `GOOGLE_CLOUD_VISION_PRIVATE_KEY`, `GOOGLE_CLOUD_VISION_CLIENT_EMAIL`
- 待添加: `QWEN_API_KEY`（迁移后）
- 待删除: 上述三个旧密钥（迁移后）

### 相关文件
- `assets/event_sources.json` — Instagram 账号来源配置
- `server/assets/instagram_data.json` — 爬取输出的活动数据
- `.github/workflows/daily-update.yml` — GitHub Actions 工作流
- `sample.env` — 环境变量模板

### Skill
- `~/.workbuddy/skills/triad-build/` — 项目专属 skill，包含完整架构文档、AI 提示词、API 配置指南

### 本地运行
```bash
cp sample.env .env
# 当前填写 DEEPSEEK_API_KEY（迁移后改填 QWEN_API_KEY）
# 填写 INSTAGRAM_USER_ACCESS_TOKEN、INSTAGRAM_BUSINESS_USER_ID
npx tsx scripts/update-calendar.ts
```

### GitHub Actions 手动触发
Actions 页面 → "Daily Calendar Refresh" → "Run workflow"

### 重要坑点（2026-05-09 修复）
- **JS `||` falsy bug**：`null || 12` 和 `0 || 12` 都返回 `12`，但 `0`（午夜）是合法值，不应被替换。
  - 修复：用 `??`（nullish coalescing）替代 `||`，只对 `null/undefined` 生效。
  - 涉及字段：`startHourMilitaryTime`、`startMinute`、`endHourMilitaryTime`、`endMinute`
- **AI prompt 时间解析**：`noon`/`12pm` 必须在 prompt 中单独强调 `= 12 (NOT 0, NOT 8, NOT 13)`，否则模型容易输出 8（上午8点）或 13（下午1点）。
