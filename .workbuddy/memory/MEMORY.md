# MEMORY.md — Long-term Memory

## Project: Triad.build (triad.build)

Instagram 活动日历爬虫项目，从 Instagram 帖子提取活动信息并展示在日历上。

### 技术架构
- **前端**: Nuxt.js
- **爬虫脚本**: `scripts/update-calendar.ts`
- **AI**: Qwen-plus（Token Plan）+ qwen-vl-plus（图片 OCR），2026-05-09 迁移
- **OCR**: ~~Google Cloud Vision~~ → **qwen-vl-plus**（直接读取图片，无需单独 OCR 服务）
- **部署**: Vercel + GitHub Actions

### 关键配置
- `QWEN_API_KEY` — Token Plan API key（替代原 `DASHSCOPE_API_KEY`）
  - baseURL: `https://token-plan.cn-beijing.maas.aliyuncs.com/compatible-mode/v1`
  - 图片理解模型: `qwen-vl-plus`
  - 事件提取模型: `qwen-plus`
- `INSTAGRAM_USER_ACCESS_TOKEN` — Instagram Graph API token
- `INSTAGRAM_BUSINESS_USER_ID` — IG Business 账户 ID
- `VERCEL_DEPLOY_HOOK` — 可选，自动触发 Vercel 重新部署
- ~~`DASHSCOPE_API_KEY`~~ — 已废弃
- ~~`GOOGLE_CLOUD_VISION_PRIVATE_KEY` / `CLIENT_EMAIL`~~ — 已废弃

### Instagram 来源账号（共 17 个，截至 2026-05-09）
- greensboropride, greensboroprojectspace, etc.gso, backtablegso, irvingparkartandframe
- gso_allgirlswalkclub, ziggysgso, gsozinefest, gso.criticalmass, flatirongso
- boroughcoffeegso, gsolibrary, gso_pfa, silentbookclubgso, gsovintagemarket
- gso_revsocialists, **recyclesbikeshop**（2026-05-09 新增，tags: biking/community/diy）

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
# 填写 QWEN_API_KEY、INSTAGRAM_USER_ACCESS_TOKEN、INSTAGRAM_BUSINESS_USER_ID
npx tsx scripts/update-calendar.ts
```

### GitHub Actions 手动触发
Actions 页面 → "Daily Calendar Refresh" → "Run workflow"

### GitHub Secrets 需要更新（2026-05-09）
- ✅ 添加：`QWEN_API_KEY`
- 🗑️ 可删除：`DASHSCOPE_API_KEY`、`GOOGLE_CLOUD_VISION_PRIVATE_KEY`、`GOOGLE_CLOUD_VISION_CLIENT_EMAIL`

### 重要坑点（2026-05-09 修复）
- **JS `||` falsy bug**：`null || 12` 和 `0 || 12` 都返回 `12`，但 `0`（午夜）是合法值，不应被替换。
  - 修复：用 `??`（nullish coalescing）替代 `||`，只对 `null/undefined` 生效。
  - 涉及字段：`startHourMilitaryTime`、`startMinute`、`endHourMilitaryTime`、`endMinute`
- **AI prompt 时间解析**：`noon`/`12pm` 必须在 prompt 中单独强调 `= 12 (NOT 0, NOT 8, NOT 13)`，否则模型容易输出 8（上午8点）或 13（下午1点）。
