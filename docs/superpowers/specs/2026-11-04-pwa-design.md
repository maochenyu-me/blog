# 博客 PWA（可安装 + 离线可用）设计方案

- 日期：2026-11-04
- 工程：`E:\github_maochenyu_me\blog\blog`（Nuxt 4.5.2 + Nuxt Content 3 + 纯静态 SSG）
- 技术选型：`@vite-pwa/nuxt`（用户指定）
- 状态：**已实施（2026-11-04）**。实施过程中发生**一处设计变更**：T4 的 SW 策略由 `generateSW` + `navigateFallback` 改为 `injectManifest` + 自定义 `app/sw.ts`（原因见 §10.2），其余按本方案落地。实测结论与已知限制见 §10。

---

## 1. 背景与目标

博客目前是纯静态站点，部署在 Cloudflare Pages。访客只能把它当网页用，无法安装到桌面/主屏，断网后打不开任何内容。本方案给它加上 PWA 能力：可安装、可离线阅读、且已安装的「应用」里现有功能全部保持可用。

### 目标

1. **可安装**：桌面（Windows/Linux/macOS）与移动端都能把站点装成独立应用，装后有独立图标、独立窗口、无浏览器地址栏。
2. **离线可读**：断网后所有文章的页面（HTML/样式/字体/脚本）都能正常打开与阅读。
3. **功能不倒退**：在线时评论、说说、热搜、音乐播放器、搜索、朋友圈等全部功能与改造前完全一致。
4. **更新自动到达**：站点内容更新后，已安装用户无需手动操作即可拿到新版本。
5. **离线时体面降级**：依赖网络的功能就地说明原因，不静默失败也不弹全局横幅。
6. **iOS 可发现**：iOS 没有安装提示，补一个一次性的极简引导，不打扰老访客。

### 非目标

- **不做**推送通知（Push API）、后台同步（Background Sync）、文件处理（File Handlers）、分享目标（Share Target）。
- **不做**应用商店上架（PWABuilder 打包上 Google Play / 微软商店 / App Store）。这与方案解耦，将来想上架再单独处理。
- **不做**离线评论。评论必须连服务端，离线时只能提示。
- **不保证**「没访问过的图片」离线可见 —— 图片走运行时缓存，只缓存看过的。
- **不改**站点现有视觉与信息架构（除了 iOS 那一处一次性提示条）。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| manifest | `manifest.webmanifest`，告诉浏览器应用的名称/图标/启动方式 |
| SW | Service Worker，`sw.js`，拦截请求并决定走缓存还是网络 |
| 预缓存 | 构建期把一批文件写进 SW 清单，安装 SW 时一次性下载，**离线必可用** |
| 运行时缓存 | 首次请求时顺手存下来，之后命中缓存。**离线只能看缓存过的** |
| standalone | 安装后的显示模式：无浏览器 UI，像原生应用 |
| A2HS | Add to Home Screen（添加到主屏幕），iOS 唯一的安装路径 |
| WebAPK | 安卓 Chrome 安装 PWA 时生成的真应用包，有启动器图标与系统设置项 |

---

## 3. 成功标准（可验收）

| # | 标准 | 验证方式 | 验收结果（2026-11-04，T9 全量验收） |
| --- | --- | --- | --- |
| S1 | `pnpm generate` 成功，`.output/public` 下存在 `manifest.webmanifest`、`sw.js` 与全套图标（injectManifest 下**不再**有独立 `workbox-*.js`，运行时已内联进 `sw.js`） | 构建后列目录 | **PASS（口径有调整）**：`mode injectManifest`，预缓存 371 条；`sw.js` 46,347 B；不再产出独立的 `workbox-*.js`，其余产物齐全 |
| S2 | 产物 HTML 的 `<head>` 含 `<link rel="manifest">`、`theme-color`、apple 专属 meta | 构建产物 grep | **PASS**（另见 §10.4 第 10 条：实测 `theme-color` 是页面底色 `#FFFFFF`/`#121212`，非主色） |
| S3 | 本地静态服务打开站点，DevTools → Application：manifest 无报错、SW 状态 activated、已控制页面、预缓存条目数与清单一致 | Chrome DevTools 实测 | **PASS**：`activated`、首访即受控（`clientsClaim`）、预缓存条目 371 = 清单 371，剥离 `__WB_REVISION__` 后 URL 级 `missing=[] extra=[]` |
| S4 | Lighthouse 的 PWA/安装性检查通过（可安装） | Lighthouse 报告 | **PASS（改用等效判定）**：`Page.getAppManifest.errors = []` + `Page.getInstallabilityErrors = []` + 逐项硬要求；**Lighthouse 未跑**（仓库未装，`npx --no-install` 拒绝下载） |
| S5 | 断网后刷新首页、任一文章页、归档页、关于页，页面完整渲染（含样式与自托管字体） | DevTools Offline 实测 | **PASS**（最强口径：origin 进程已死 + CDP offline + 第三方域名全屏蔽）；4 页正文非空、未捕获异常 0、自托管字体全部命中 |
| S6 | 断网后访问未缓存过的图片，不出现布局塌陷或白屏（最多是缺图） | DevTools Offline 实测 | **PASS**：图片可缺，但布局盒与 `scrollHeight` 在线/离线完全一致（4801 = 4801） |
| S7 | 断网后评论区就地显示「需要联网」的说明；说说/热搜若有上次缓存则正常展示 | DevTools Offline 实测 | **PASS（评论部分）／受限**：评论就地说明有实测证据；「说说/热搜有缓存」这一分支**无法成立**，见 §10.4 第 1、11 条 |
| S8 | 在线首访后再访问，请求由 SW 提供（Network 面板标 `(ServiceWorker)`），console 无 SW 相关报错 | DevTools 实测 | **PASS**：158 条响应中 107 条 `fromServiceWorker=true`（含文档），SW 相关报错 `[]` |
| S9 | 改一处可见文案 → 重新构建 → 本地服务刷新两次后看到新文案（自动更新生效） | 实测 | **PASS**：逐秒采样坐实因果链（旧 SW 先给旧内容 → 新 SW 接管 → `autoUpdate` 自动 reload，< 4s） |
| S10 | 模拟 iPhone（非 standalone）时 iOS 引导出现一次；关闭后刷新不再出现；`standalone` 下不出现 | 浏览器 UA 模拟实测 | **PASS**：`standalone` 分支改用 Chrome `--app` 真独立窗口验证（`Emulation.setEmulatedMedia` 对 `display-mode` 无效，见 §10.4 第 4 条） |
| S11 | 改动文件 `pnpm exec eslint` 零报错；`pnpm test` 全绿 | 命令行 | **PASS**：改动文件 eslint 0 报错；`pnpm test` 195/195 |
| S12 | 桌面 Chrome 实测：地址栏出现安装图标 → 可安装 → 装后独立窗口打开 | 浏览器实测 | **受限**：可安装性 PASS，但「装后独立窗口」未端到端实测（headless 无安装入口）；已用 `--app` 窗口作为形态替代 |
| S13 | 在线状态下评论、说说、热搜、音乐、搜索、朋友圈、亮暗主题全部与改造前一致 | 浏览器逐项实测 | **PASS（8/8 在线可用）**；`/memos` 数据加载受限（tg-api CORS，见 §10.4 第 1 条），仅能证明页面壳与交互一致 |

**失败清单：无 FAIL。** 逐条原始断言值、截图与复现脚本见审计目录 `pwa-audit/`（`.pwa-t9-report.md` 与 `.pwa-t9-shots/`，本地忽略、不入库）。

---

## 4. 决策记录

### 4.1 用户已确认（2026-11-04）

| # | 决策 | 取值 |
| --- | --- | --- |
| D1 | 离线范围 | **全站页面预缓存**（HTML/JS/CSS/字体/图标），图片走运行时缓存 |
| D2 | 更新方式 | **自动静默更新**（`autoUpdate`），用户无需操作 |
| D3 | 安装入口 | **只靠浏览器原生入口**，不加入站内安装按钮 |
| D4 | iOS 例外 | 补**一个 iOS 专属的一次性引导**（因 iOS 无任何原生提示） |
| D5 | 离线降级 | **静默降级 + 局部说明**，不弹全局横幅 |
| D6 | 图标源 | 现有 `public/img/avatar/avatar.webp`（256×256） |
| D7 | iOS 支持力度 | **基础**：图标 + 全屏运行 + 状态栏配色；**不做**各机型启动图 |

### 4.2 本方案的技术决策（请评审时一并确认）

| # | 决策 | 理由 | 备选 |
| --- | --- | --- | --- |
| T1 | 图标**一次性生成后提交**，不使用模块的实验性 `pwaAssets` | 确定性强；避开 Nuxt 4 下「去 `app/public` 找图标」的已知问题；图标是静态资源不需要每次构建重生成 | 用 `pwaAssets` + `@vite-pwa/assets-generator` 自动生成（引入实验特性与额外依赖） |
| T2 | 第三方 API（评论/说说/热搜/音乐远程）走 **NetworkOnly** | 这些功能本身已有 localStorage 缓存与刷新策略，SW 再插一层会写出第二套过期逻辑，徒增困惑 | SW 层做 NetworkFirst 缓存 |
| T3 | manifest 的 `theme_color` 用站点默认主色 `#1A5EFF` | manifest 是静态文件，而站点主色用户可自选，无法在构建期确定 | 不设 theme_color |
| T4 | 同时用 JS 动态更新 `<meta name="theme-color">` | 用户改了主色时，安卓状态栏/工具栏颜色能跟上（已安装应用的标题栏仍用 manifest 值，属平台限制） | 保持静态 |
| T5 | 用 `<NuxtPwaManifest />` 组件注入 manifest 链接 | 纯静态部署没有 Nitro 服务端，`registerWebManifestInRouteRules` 不适用 | 手写 `<link>` 到 `app.head` |
| T6 | 给 `sw.js` 与 `manifest.webmanifest` 加 `Cache-Control: no-cache` 响应头，**两个平台各配一份**：`public/_headers`（Cloudflare Pages）+ `edgeone.json` 的 `headers`（EdgeOne Makers） | 避免 CDN 缓存住 `sw.js` 导致更新检查被拖慢或卡死；本项目同时支持两个静态平台，只配一个会漏 | 不加，依赖默认 |
| T7 | 预缓存**排除** `img/**`、`music/**`、`_ipx/**` | 图片音频是体积大头且会随内容增长；页面壳必须小而稳 | 全量预缓存 |
| T8 | 不加 `periodicSyncForUpdates` | 浏览器支持面窄，收益低 | 加上做后台更新检查 |

---

## 5. 架构设计

### 5.1 模块接入

```
nuxt.config.ts
  modules: [ ..., '@vite-pwa/nuxt' ]
  pwa: { ... }        // 全部 PWA 配置集中在此
```

依赖（catalog 风格，与本仓库一致）：

- `@vite-pwa/nuxt`：运行时依赖（Nuxt 模块）
- 图标生成工具：**一次性使用**，不作为项目依赖提交

### 5.2 manifest

由 `pwa.manifest` 生成，字段与来源：

| 字段 | 取值 | 来源 |
| --- | --- | --- |
| `name` | `喵洛阁` | `blogConfig.title` |
| `short_name` | `喵洛阁` | 同上（3 字，远小于 12 字符上限） |
| `description` | 站点描述 | `blogConfig.description` |
| `lang` | `zh-CN` | `blogConfig.language` |
| `id` | `/` | 固定，保证应用身份稳定 |
| `start_url` | `/` | 固定 |
| `scope` | `/` | 固定 |
| `display` | `standalone` | 无浏览器 UI |
| `theme_color` | `#1A5EFF` | 站点默认主色（T3） |
| `background_color` | 浅色模式页面底色 | 启动闪屏底色（**待确认项 Q2**） |
| `icons` | 192 / 512 / maskable-512 | 见 5.5 |

Chromium 的安装性硬要求（缺一不可）：`name` 或 `short_name`、**192 与 512 两种尺寸图标**、`start_url`、`display`、`prefer_related_applications` 为 `false` 或不出现、HTTPS。

### 5.3 Service Worker 缓存分层

| 层 | 匹配范围 | 策略 | 参数 |
| --- | --- | --- | --- |
| 预缓存 | `**/*.{js,css,html,json,xml,txt,svg,ico,woff,woff2}` 且排除下方三类 | Workbox precache | 构建期生成清单 |
| 图片 | `/_ipx/**`、`/img/**`（png/jpg/jpeg/webp/avif/gif） | CacheFirst | 上限 200 条 / 30 天 |
| 音频 | `/music/**`（mp3/flac/m4a/ogg） | CacheFirst + Range 支持 | 上限 30 条 / 30 天 |
| 站外样式与字体 | `s4.zstatic.net`、`fonts.bytedance.com` | StaleWhileRevalidate | 上限 30 条 / 30 天 |
| 第三方 API | ecoku / tg-api / hot-api / meting / netease | NetworkOnly | — |

> **实施后回填（2026-11-04）**：本节的预缓存与四组运行时策略**已全部落地，但配置位置变了**。T4 重做（§10.2）后 `pwa.workbox` 整段不存在，只剩 `pwa.injectManifest` 的 `globPatterns` / `globIgnores`；四组运行时缓存、导航路由与 `_b` 参数忽略都写进了 `app/sw.ts`。下表是设计意图，**实际代码以 `app/sw.ts` 为准**。

要点：

- **`_payload.json` 必须进预缓存**：Nuxt 的 payload 提取产物，缺了它页面能开但数据空。需在构建后核实产物里确有该文件，并按实际路径补进 `globPatterns`。
- 预缓存**排除** `img/**`、`music/**`、`_ipx/**`（T7）。
- 音频的 Range 请求需要 Workbox 的 `RangeRequestsPlugin`，否则拖进度条会失效。
- 站外资源多为跨域不透明响应（no-cors），只能存不能读，因此限条数防爆。

### 5.4 更新流（`autoUpdate`）

```
构建产物变化 → 浏览器发现 sw.js 有变 → 后台装好新 SW
  → skipWaiting 立即接管 → 模块插件触发一次页面刷新 → 用户看到新内容
```

已知副作用（D2 已接受）：用户正在阅读时可能遇到一次自动刷新。缓解：预缓存让刷新后首屏极快；不做「刷新前询问」以免违背 D2。

### 5.5 图标方案

一次性生成，产物提交进仓库：

| 产物 | 用途 |
| --- | --- |
| `192×192` | 安卓图标（Chromium 安装性必需） |
| `512×512` | 应用列表/启动画面（必需） |
| `maskable 512×512` | 安卓自适应图标，**四周留安全边距**，避免裁圆后切到头 |
| `apple-touch-icon 180×180` | iOS 主屏图标 |
| `favicon` | 保留现有 `public/favicon.ico` 不动（`blogConfig.favicon` 引用中） |

- 源图 `avatar.webp` 是 256×256 方形图，放大到 512 会略软 —— 已知且接受（D6）。将来换 ≥512 的源图重新生成即可。
- maskable 版本会在源图外圈填充底色再内缩，保证安全区。底色取主色或页面底色（**待确认项 Q2** 一并决定）。

### 5.6 iOS 一次性引导（D4）

新增一个 client-only 组件，只在**同时满足**下列条件时出现：

1. 是 iOS / iPadOS 设备
2. 未以 `standalone` 运行（`navigator.standalone` 或 `display-mode: standalone`）
3. localStorage 里没有「已关闭」标记

交互：底部一条一次性提示条，说明「点分享 → 添加到主屏幕」，带关闭按钮；关闭后写入标记，不再出现。视觉复用站点既有毛玻璃与主题变量，不引入新样式体系。

技术注意：iPadOS 13+ 的 UA 伪装成 macOS，**必须**配合 `navigator.maxTouchPoints > 1` 判断，否则 iPad 会被漏掉。

### 5.7 head 注入

`nuxt.config.ts` 的 `app.head` 增补：

| 标签 | 值 | 用途 |
| --- | --- | --- |
| `apple-mobile-web-app-capable` | `yes` | iOS 全屏运行（旧机制） |
| `apple-mobile-web-app-title` | `喵洛阁` | iOS 主屏名称 |
| `apple-mobile-web-app-status-bar-style` | `default` | iOS 状态栏样式 |
| `theme-color` | 页面底色（亮 `#FFFFFF` / 暗 `#121212`） | 安卓工具栏配色 |

现有 `mobile-web-app-capable` 保留不删。现有 `themeColorScript` 扩写一处：用户改主色时同步更新 `theme-color` meta（T4）。

> **注（实施后更正）**：`theme-color` 取**页面底色**（与浏览器工具栏融合），而 manifest 的 `theme_color` 按 T3 决策取**主色** `#1A5EFF` —— 两者用途不同。副作用是已安装应用启动瞬间用主色、随后切到底色，观感上有一次颜色跳变，属已声明的已知限制（§10.4 第 10 条）。

### 5.8 与仓库既有约定的对齐

| 项 | 做法 |
| --- | --- |
| 依赖声明 | 按本仓库 `pnpm catalogs` 约定，`@vite-pwa/nuxt` 归入 `framework` 组，`package.json` 用 `catalog:framework` 引用 |
| `modules` 数组顺序 | `nuxt.config.ts` 该数组带 `@keep-sorted`，`@vite-pwa/nuxt` 的插入位置是 `'@pinia/nuxt'` 之后、`'@vueuse/nuxt'` 之前 |
| `pwa` 配置块位置 | 该文件的模块配置块按字母序排列，`pwa` 放在 `ogImage` 与 `robots` 之间 |
| 缩进与样式 | tab 缩进；原生 CSS 嵌套（`postcss-nesting`），**不引入 Sass**；断点用实际数值 528 / 768 / 1080 |
| iOS 引导组件位置 | 放 `app/components/blog/`（与站点 chrome 同类），挂在 `app/layouts/default.vue` 内，只在客户端渲染 |
| 新增文件 | `public/_headers`（当前 `public/` 下没有该文件）；图标产物放 `public/img/pwa/` |
| 输出目录 | **`.output/public`**（`deploy-cloudflare-pages.yml` 实测用此路径）。注：`AGENTS.md` 写的是 `dist/`，与实际部署链路不符，属仓库文档陈旧，**不在本方案内擅自改动**，仅在此记录 |

---

## 6. 兼容性矩阵（各端安装后的真实效果）

| 端 | 浏览器 | 安装入口 | 装出来的形态 | 离线 |
| --- | --- | --- | --- | --- |
| Windows / Linux | Chrome、Edge | 地址栏安装图标 | 真应用：开始菜单、任务栏、Alt+Tab、系统设置可卸载 | ✅ |
| macOS | Chrome、Edge | 地址栏安装图标 | 真应用 | ✅ |
| macOS | Safari 17+ | 文件 → 添加到程序坞 | 真应用 | ✅ |
| 安卓 | **Chrome（需 GMS）**、三星浏览器 | 菜单 → 安装应用 | **WebAPK**：启动器图标、独立窗口、系统可管理 | ✅ |
| 安卓 | Firefox / Edge / Opera / 无 GMS 的 Chrome | 只有「添加到主屏幕」 | 带浏览器角标的快捷方式，点开仍在浏览器内 | 部分 |
| iOS 16.4+ | Safari（主）、Chrome/Edge/Firefox | 分享 → 添加到主屏幕 | 主屏图标 + 全屏运行 | ✅ |
| iOS ≤16.3 | 仅 Safari | 同上 | 同上 | ✅ |
| 桌面 Firefox | — | **不支持** PWA 安装 | 只能当普通网站 | ✅（SW 仍生效） |

**说明**：装成「真应用」还是「快捷方式」由浏览器决定，我们无法控制。Firefox 桌面版装不了但**离线能力照常生效**。

---

## 7. 风险与缓解

| # | 风险 | 影响 | 缓解 |
| --- | --- | --- | --- |
| ~~R1~~ **R1（预判错误，实测更正）** | ~~Vite 8 与模块的版本落差：1.2.0 的 peer 只声明支持到 Vite 7。~~ **该判断实测不存在**：`@vite-pwa/nuxt@1.1.1` 依赖的 `^1.2.0` 实际解析到 **`vite-plugin-pwa@1.3.0`**，其 `peerDependencies.vite` 已含 **`\|\| ^8.0.0`**，本项目 Vite 是 `8.2.2`。 | 无（原判断担心的构建失败未发生） | **无需任何 `pnpm.overrides`**：T0 兼容性 spike 直接通过，`pnpm generate` 一次成功；`package.json` / `pnpm-workspace.yaml` 中确认**没有** overrides 段。后续升级 `@vite-pwa/nuxt` 时重新核对 peer 范围即可 |
| R2 | issue #212（open）：Nuxt 4 下构建报 `[BABEL] sw.js: Cannot find module '@babel/parser'` | 构建中断 | 显式补 `@babel/parser` devDep；或改 `injectManifest` 自写 SW 绕开 workbox 打包路径 |
| R3 | issue #204：Nuxt 4 下模块去 `app/public` 找图标源，而本项目 `public/` 在根目录 | 图标生成失败 | T1 已改为一次性生成+提交，不依赖自动探测 |
| R4 | 预缓存体积随文章与图片增长 | 首访下载变慢 | 预缓存排除图片/音频（T7）；只缓存页面壳与文本类资源 |
| R5 | `autoUpdate` 在用户阅读时刷新页面 | 打断阅读 | D2 已接受；保证刷新后首屏极快 |
| R6 | manifest 的 `theme_color` 是静态值，站点主色可自选 | 已安装应用标题栏不一定跟用户主色 | T4 动态更新 meta 缓解；平台限制写进文档 |
| R7 | CDN 缓存住 `sw.js` 导致更新检查失效 | 用户长期停在旧版 | T6 加 `Cache-Control: no-cache` |
| R8 | 跨域不透明响应进缓存，无法读取大小 | 缓存配额被占满 | 限条数 + 限时长（5.3） |
| R9 | 站点现有 `<head>` 已有 `mobile-web-app-capable`，与新增 apple meta 并存 | 无 | 保留即可，浏览器各取所需 |

---

## 8. 落地任务拆分（概览，详细计划待评审后另出）

| 任务 | 内容 |
| --- | --- |
| T0 | **兼容性 spike**：装模块 → 构建 → 核实产物（R1/R2 的生死判定，失败即停下汇报） |
| T1 | 一次性生成图标全套并提交 |
| T2 | manifest 配置 + head 注入 + apple meta + 动态 theme-color |
| T3 | Workbox 缓存分层（预缓存清单、运行时缓存、navigateFallback） |
| T4 | iOS 一次性引导组件 |
| T5 | 离线降级说明（评论区等需联网功能的就地提示） |
| T6 | `public/_headers` 加 `sw.js` 不缓存 |
| T7 | 浏览器全量验收（S1–S13，含离线模拟与 Lighthouse） |
| T8 | 文档与后续维护说明（如何重新生成图标、如何调整缓存策略） |

---

## 9. 评审结论与补充决策（2026-11-04 已确认）

方案整体**通过评审**，进入实施。评审时提出的 4 个问题已拍板（实施后回填：**Q1–Q4 已全部按决议实施**，下方「对方案的影响」列已按落地实际情况改写）：

| # | 问题 | 决议 | 对方案的影响（实施后回填） |
| --- | --- | --- | --- |
| Q1 | 离线兜底页 | **已按此实施**：新做一个 `/offline` 页 | 新增路由 `app/pages/offline.vue`；已加入 `robotsNotIndex` 与 sitemap 排除。**变更**：T4 重做后 `/offline` 不再由 Workbox 的 `navigateFallback` 触达，改由 `app/sw.ts` 导航路由上的 `PrecacheFallbackPlugin({ fallbackURL: '/offline' })` 触达（原因见 §10.2） |
| Q2 | 启动闪屏 / maskable 填充底色 | **已按此实施**：浅色页面底色 | `manifest.background_color` 取 `#FFFFFF`；maskable 图标外圈填充同色 |
| Q3 | 音频缓存策略 | **已按此实施**：先配好，暂不生效 | `/music/**` 的 CacheFirst + `RangeRequestsPlugin` 已写进 `app/sw.ts`；当前目录只有 `.gitkeep`，策略要等放入音频后才会被真实用到（见 §10.4 第 9 条） |
| Q4 | 安装说明文案 | **已按此实施**：加一段 | 关于页已补分平台安装说明（纯文案，未加 UI） |

补充两点实施期结论：

- **T3 评审指出的 robots 落点**：`robotsNotIndex` 实际定义在 `blog.config.ts` 的 `article` 段（而非 `nuxt.config.ts` 的 `robots.disallow`），由 `nuxt.config.ts` 的 `robots.disallow: blogConfig.article.robotsNotIndex` 引用。两处效果等价，且写进 `blog.config.ts` 更 DRY（站点配置集中一处），保持现状。
- **Q1 的触达方式变更**：见 §10.2；`/offline` 仍是唯一兜底页，但它现在是「网络真失败时的回退目标」，不再拦截在线导航。

### 实施前的前置门槛

**R1 兼容性 spike 是硬门槛**：先用最小配置验证 `@vite-pwa/nuxt` 能在本项目（Nuxt 4.5.2 + **Vite 8.2.2**）下完成一次 `pnpm generate` 并产出 `sw.js` 与 `manifest.webmanifest`。

- 通过 → 按 §8 任务拆分进入正式实施。
- 不通过 → 用 pnpm `overrides` 把 `vite-plugin-pwa` 提升到 `^2.0.0` 重试。
- 仍不通过 → **停止**，向用户汇报并讨论替代路线（手写 SW 或降级方案），不擅自继续。

> **实施后回填（2026-11-04）**：门槛**已通过**，且 R1 的立论前提本身不成立（`^1.2.0` 实际解析到 `vite-plugin-pwa@1.3.0`，peer 已含 `|| ^8.0.0`，见 §7 的 R1 更正）。**overrides 从未被添加**，也不需要。

---

## 10. 实施记录（2026-11-04 回填）

### 10.1 实施状态

本方案已实施完毕，代码在 `feat/pwa` 分支（评审基线 HEAD `05a09dd`）。除 §10.2 记录的**一处设计变更**外，模块接入、manifest、head 注入、图标、iOS 引导、离线降级说明、平台 headers 与安装文案均按本方案落地。逐条验收结果见 §3 表格的「验收结果」列，原始证据在审计目录 `pwa-audit/`（本地忽略、不入库）。

### 10.2 设计变更：T4 的 SW 策略由 `generateSW` 改为 `injectManifest`

> 编号说明：本节的 **T4 指实施阶段的任务编号**（证据见审计目录 `pwa-audit/.pwa-t4-report.md` / `.pwa-t4b-report.md`），与 §8 概览表的编号**相差 1**（§8 的 T4 是「iOS 一次性引导组件」，实施时作为 T5 执行）。下文引用 T3/T5 等同理以实施编号为准。

#### 触发缺陷（用户实测确认）

`pwa.workbox.navigateFallback: '/offline'` 生成的是：

```js
registerRoute(new NavigationRoute(createHandlerBoundToURL('/offline')))
```

它**只读预缓存、没有任何网络回退**，且注册在**所有运行时路由之前**（旧产物字节偏移：NavigationRoute **18555** < blog-image **18694** < blog-audio **18844** < blog-vendor-assets **19075**）。预缓存清单里的 URL 键是清理过的干净路径（`about`、`2026/example`，由 `@vite-pwa/nuxt` 的 `manifestTransforms` 去掉 `.html`/`index.html`），而 `NavigationRoute` 吞掉所有 `mode === 'navigate'` 的请求并直接回 `createHandlerBoundToURL('/offline')`。后果是**在线**状态下，任何「未预缓存形态」的导航都被替换成离线页：

| 访问 URL | 旧实现实际渲染 |
| --- | --- |
| `/about` | ✅ 正常 |
| `/about/` | ❌ 离线页 |
| `/about?x=1` | ❌ 离线页 |
| `/nope-does-not-exist` | ❌ 离线页 |
| `/2026/example` | ✅ 正常 |
| `/2026/example/` | ❌ 离线页 |

（6 条 URL 由用户实测确认。）

#### 新方案

`app/sw.ts` 自定义 SW（`strategies: 'injectManifest'`，`srcDir: '.'`、`filename: 'sw.ts'`）：

1. `precacheAndRoute(self.__WB_MANIFEST, { ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^_b$/] })` —— **注册在最前**：已预缓存页面直接由预缓存响应，不进导航路由；在线首屏更快，断网照常打开。
2. 导航路由 `NetworkFirst({ cacheName: 'blog-page', networkTimeoutSeconds: 4, plugins: [ExpirationPlugin, PrecacheFallbackPlugin({ fallbackURL: '/offline' })] })` —— 在线一律走网络，拿到什么就是什么（平台自己决定尾斜杠重定向 / 404，4xx/5xx 不缓存）；**只有网络真失败**时才回退预缓存的 `/offline`。
3. `cleanupOutdatedCaches()` + `self.skipWaiting()` + `clientsClaim()` —— `injectManifest` 下模块不再自动注入这两件事，而 `registerType: 'autoUpdate'` 的自动刷新依赖新 SW 立刻 activate。
4. 四组运行时缓存（图片 / 音频 / 站外样式字体 / 三方 API）改由 SW 代码注册。匹配从「无锚点子串正则（匹配绝对 URL）」改成 `sameOrigin + url.pathname` 锚定开头，站外两组用 `url.origin` 精确比对 —— 旧写法会把第三方 `…/img/x.png` 吞进本站 `blog-image` 缓存。

#### 顺带修掉的第二个缺陷：`_b` 参数

Nuxt 取页面 payload 时请求的是 `<route>/_payload.json?_b=<buildId>`；`workbox-precaching` 默认只忽略 `/^utm_/` 与 `/^fbclid$/`，这条 URL 既命中不了任何预缓存键、也不命中任何运行时路由 ⇒ 断网后站内跳转只有页面壳、正文数据全空。补上 `/^_b$/` 后按干净 URL 命中预缓存，实测正文非空（`bodyTextLen=7592`）。

#### 依赖代价

新增 6 个 workbox 运行时包：`workbox-core` / `workbox-precaching` / `workbox-routing` / `workbox-strategies` / `workbox-expiration` / `workbox-range-requests`（均 `^7.4.1`，按仓库 catalogs 约定归入 `framework` 组）。旧实现走的是传递依赖，新实现显式声明。

#### 与分析/任务书的关系

T4 原授权范围是「把四组 `runtimeCaching` 配齐 + `navigateFallback` 指向 `/offline`」；上述在线回归是重做时才暴露的，重做经评审批准。T4 的说明性原报告保留在审计目录（`pwa-audit/.pwa-t4-report.md`），重做报告见同目录 `.pwa-t4b-report.md`。

### 10.3 实测结论（S1–S13 验收 + 体积口径）

- **验收结果：无 FAIL。** S1–S13 全部有实测证据（逐条见 §3 的「验收结果」列）。**S12 受限**（可安装性 PASS，装后独立窗口未端到端实测）；**S4 未跑 Lighthouse**，改用 `Page.getAppManifest.errors = []` + `Page.getInstallabilityErrors = []` + 逐项硬要求替代。
- **预缓存体积口径（不要误读）**：Vite 自报磁盘未压缩合计约 **9215 KiB ≈ 9.00 MiB**（371 条）。该数字会随构建微幅波动 —— 构建期会 live 拉取 `/api/memos/latest`，HTML 与 payload 大小非确定（两次独立构建实测 9,437,479 B / 9,437,491 B，差异全在 HTML）；首访实测传输 **10.26 MiB 是未压缩口径** —— 本地静态服务器没开压缩，**这不是用户下载量**；另起带 gzip 的同款服务器实测 **4.32 MiB（≈42%）**；真实 Cloudflare Pages / EdgeOne 对 html/js/css/json 用 **brotli**（通常比 gzip 再好 5–10%），因此真实首访预缓存下载量约 **4 MiB**，而非 9–10 MiB。
- **回归**：`pnpm test` **195/195**；改动文件 `pnpm exec eslint` **0 报错**。

### 10.4 已知限制（如实列出，均非本次 PWA 改造引入的回归，除非另有说明）

1. **tg-api 的 CORS 白名单不含 `localhost:3000`**：`tg-api.518339.xyz` 只放行 `https://blog.kemeow.top`（站点自身域名，见 `blog.config.ts` 的 `url`）；带 `Origin: http://localhost:3000` 请求时**没有** `Access-Control-Allow-Origin` 响应头。因此「说说」在本地在线也取不到数据，`localStorage` 缓存永远写不进去 ⇒ S7 的「说说若有上次缓存则正常展示」与 S13 的「说说与改造前一致」在本地只能证明页面壳/交互一致。**改造前同样如此，非 PWA 回归；线上域名不受影响**；如需本地闭环，把 `http://localhost:3000` 加进 tg-api 白名单。
2. **「只杀静态服务器 ≠ 断外网」**：只杀 3000 端口时第三方 API 仍可达，会让「无缓存也能离线显示」被判成**假 PASS**（实测踩到）。**后续任何离线验收都必须同时屏蔽第三方域名**（如 CDP `Network.setBlockedURLs`）。
3. **workbox 预缓存 key 带 `?__WB_REVISION__`**：做「清单 ↔ Cache Storage」URL 级比对时必须剥离该参数，否则会把全部条目误判成「缺失」。
4. **`Emulation.setEmulatedMedia` 对 `display-mode` 无效**：页内 `matchMedia('(display-mode: standalone)')` 仍为 `false`；验证 standalone 分支要用 Chrome `--app=<url>` 真独立窗口（那里才为 `true`）。
5. **comment 组件的 `await import('ecoku')` 失败仍会产生 unhandled rejection**：现有守卫只覆盖「已卸载」路径，挂载中 chunk 拉取失败（dev / 无 SW 场景可达）仍可能产生未处理拒绝，骨架也可能一直转（本机复现过 Vite 依赖预打包 504 导致骨架常转，重启 dev 自愈）。**先于本次改动存在，非本次回归**。
6. **`navigator.onLine` 在「有 LAN 无 WAF / captive portal」时不可靠**：会返回 `true`，此时 Ecoku 仍走自己的失败态（保留原行为，未改）。
7. **iOS 引导的 `useAvoidTarget` 属超规格附加项**：提示条贴底会压住右下角悬浮面板按钮，故注册了仓库既有机制让按钮自动上移。不在 T5 任务书内，评审已判定无风险。
8. **站外域名在 `app/sw.ts` 里硬编码**：SW 是独立构建产物，无法 `import` `blog.config.ts`，`VENDOR_ORIGINS` / `API_ORIGINS` 只能写常量 ⇒ 换域名时两处要同步改，存在漂移风险。
9. **`/music/**` 音频缓存无法用真实音频验证**：`public/music/` 下只有 `.gitkeep`，只验证到配置正确注入 `sw.js`（含 `RangeRequestsPlugin`），未做真实 mp3 的 206 分段实测。
10. **manifest `theme_color` 与 head `theme-color` 不一致**：manifest 是 `#1A5EFF`（T3 决策），产物 head 的两条 `theme-color` 实测是页面底色（light `#FFFFFF` / dark `#121212`），head 脚本会在用户改主色时覆盖为用户所选色。未装应用时安卓工具栏用页面底色，装后启动瞬间用 manifest 的 `#1A5EFF`，观感上有一次颜色跳变。**这是有意为之**：manifest 的 `theme_color` 是应用身份色，head 的 `theme-color` 用于与页面底色融合；若要消除跳变，把 manifest 的 `theme_color` 也改成页面底色即可（不影响 S2 判定）。
11. **T2 的技术前提对 `/hot` 不成立**：§4.2 的 T2 写「这些功能本身已有 localStorage 缓存与刷新策略」，实测 `useMemos.ts` 确有 `memos:first-page:v1:<id>` 的 24h localStorage 缓存（只是被 CORS 挡在写不进去），而 `/hot` **完全没有**持久缓存 ⇒ 离线时显示「0 条 / 微博的热榜没取到…重试」。属体面降级（有文案 + 重试按钮），符合 D5；若要离线可读需给 hot 补缓存策略。
12. **离线兜底会把地址栏归一为 `/offline`，因此拿不回原始地址**：`PrecacheFallbackPlugin` 只是把 `/offline` 的文档交给浏览器，地址栏仍是读者原本要去的 URL；Nuxt 随后（约 1.2s）用 `history.replaceState` 归一到 `/offline`。后果是「重新加载」重载的是本页自身，无法回到读者原本要去的页面。**已做的补救**：离线页文案不再承诺「重新加载这个页面」，并额外给一个「返回首页」（首页在预缓存里，断网时也能打开）。彻底恢复原地址需要额外的 URL 暂存机制，未做。
13. **manifest 图标不在预缓存里**：图标位于 `/img/pwa/**`，被 `globIgnores` 的 `**/img/**` 排除 ⇒ 离线时浏览器控制台会报 `Error while trying to use the following icon from the Manifest: /img/pwa/icon-192.png`。不影响安装（安装必然在线）与已装应用图标，无用户可见影响；若要消噪可把这三张图单独加回预缓存（约 165 KB）。
