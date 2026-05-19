# Triad.build 城市过滤功能实施总结

## 📍 完成的修改

### 1. 添加新城市 Instagram 账号
- ✅ 添加了 17 个新 Instagram 账号：
  - **Winston-Salem** (6个): Downtown Winston-Salem, The Ramkat, ArtCrush WSNC, Winston-Salem Arts Alliance, Winston Vintage Market, Roar WS
  - **Durham** (6个): Motorco Music Hall, The Pinhook, Durham Performing Arts Center, Durham Arts Council, Full Steam Brewery, Durham LGBTQ Center, Club Era Durham, Arcana Durham, The Velvet Hippo
  - **Raleigh** (3个): Raleigh Pride, IMURJ, Lincoln Theatre Raleigh, NC Museum of Art
  - **Chapel Hill** (3个): Cat's Cradle, ArtsCenter Carrboro, Downtown Chapel Hill, Mystery Brewing Company, Love Chapel Hill
  - **High Point** (2个): High Point Theatre, Downtown High Point, High Point Arts Council, Visit High Point

### 2. 后端配置
- ✅ `assets/event_sources.json`:
  - 添加了 `appConfig.cities` 配置（6个城市，Greensboro 默认启用）
  - 所有新 Instagram 账号已添加到 `instagram` 数组
- ✅ `server/tagsListServe.ts`:
  - 添加了 `City` 接口定义
  - 添加了 `getAllCities()` 函数
- ✅ `server/assets/instagram_data.json`:
  - 为所有 523 个事件添加了 `city` 字段

### 3. 前端城市过滤
- ✅ `composables/filters.ts`:
  - 定义了 `CITIES` 数组（6个城市配置，包含 id、abbr、label、color、defaultEnabled）
  - 定义了 `CITY_COLOR_MAP`（城市到颜色的映射）
  - 定义了 `citySafeId()` 函数
- ✅ `components/App.vue`:
  - 导入了城市相关函数和家庭
  - 添加了 `cityEnabled` 响应式状态
  - 提供了 `cityEnabled` 和 `toggleCity` 给子组件
  - 在 `headerToolbar` 中添加了城市按钮
  - 修改了 `isDisplayingBasedOnTags()` 来检查城市过滤
  - 修改了 `eventContent` 来添加城市颜色编码（彩色圆点）
- ✅ `components/FilterModal.vue`:
  - 添加了城市过滤 UI（复选框 + 颜色圆点）

## 🎨 城市颜色方案
- **Greensboro**: `#87d8e3` (青色) - 默认启用
- **High Point**: `#f0a05a` (橙红色) - 默认禁用
- **Winston-Salem**: `#7ec87e` (绿色) - 默认禁用
- **Durham**: `#e07070` (红色) - 默认禁用
- **Raleigh**: `#c09ee0` (紫色) - 默认禁用
- **Chapel Hill**: `#7acfcf` (蓝色) - 默认禁用

## 🚀 使用方法
1. **日历页面**：
   - 顶部工具栏会显示城市按钮（如 "GSO", "HPT", "WS" 等）
   - 点击按钮可以切换城市显示/隐藏
   - 按钮上的圆点颜色表示对应城市颜色
   - 禁用的城市按钮会显示删除线

2. **Filter 弹窗**：
   - 顶部新增 "Cities" 部分
   - 可以勾选/取消勾选城市
   - 每个城市前有对应颜色的圆点

3. **事件显示**：
   - 每个事件标题前会显示城市颜色的圆点
   - 可以直观地识别事件所属城市

## 🔄 下一步
1. **测试**：运行 `npm run dev` 启动开发服务器，验证功能是否正常
2. **重新生成数据**：如果需要获取新城市的 Instagram 数据，运行 `npx tsx scripts/update-calendar.ts`
3. **部署**：推送到 GitHub 并触发 Vercel 部署

## 📝 注意事项
- 默认只显示 Greensboro 的事件，其他城市需要手动启用
- 城市过滤与现有的标签过滤是"与"的关系（必须同时满足）
- 新添加的 Instagram 账号需要运行爬虫脚本才能获取实际事件数据
