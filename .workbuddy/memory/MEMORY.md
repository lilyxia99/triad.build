# MEMORY.md — Long-term Memory

## Project: Triad.build (triad.build)

Instagram 活动日历爬虫项目，从 Instagram 帖子提取活动信息并展示在日历上。

### 技术架构
- **前端**: Nuxt.js
- **爬虫脚本**: `scripts/update-calendar.ts`
- **AI**: Qwen-plus（阿里云百炼），已从 OpenAI 迁移（2026-04-12）
- **OCR**: Google Cloud Vision
- **部署**: Vercel + GitHub Actions

### 关键配置
- `DASHSCOPE_API_KEY` (阿里云百炼) — 在 GitHub Secrets 中配置
- `INSTAGRAM_USER_ACCESS_TOKEN` — Instagram Graph API token
- `INSTAGRAM_BUSINESS_USER_ID` — IG Business 账户 ID
- `GOOGLE_CLOUD_VISION_PRIVATE_KEY` / `CLIENT_EMAIL` — 可选，OCR 用途
- `VERCEL_DEPLOY_HOOK` — 可选，自动触发 Vercel 重新部署

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
# 填写 .env 中的所有变量
npx tsx scripts/update-calendar.ts
```

### GitHub Actions 手动触发
Actions 页面 → "Daily Calendar Refresh" → "Run workflow"
