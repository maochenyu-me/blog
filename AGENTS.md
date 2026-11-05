# AGENTS.md — 纸鹿摸鱼处 / Clarity 主题博客

本项目（npm 包名 `clarity`，仓库 `L33Z22L11/blog-v3`）是作者的第三代个人博客，同时是一个**开源 Nuxt 博客主题**。代码经过深度定制，被众多下游站点 Fork 使用，因此改动需兼顾主题可复用性与本博客的个性化内容。

> **重要**：本项目路径位于 `blog/blog/`（外层 `blog/` 只是仓库包装目录），所有源码、配置与命令均在 `E:/github_maochenyu_me/blog/blog/` 下执行。

## 技术栈与定位

- **框架**：Nuxt 4（使用 Nuxt 4 目录结构，前端在 `app/` 而非 `pages/` 根级）
- **CMS**：Nuxt Content 3（markdown 文章，`content.config.ts` 定义 collection 与 zod 校验）
- **部署**：静态 SSG（`nuxt generate` 输出到 `dist/`），支持 Vercel / Netlify / Cloudflare Pages / EdgeOne Makers
- **包管理器**：pnpm ≥10（`packageManager: pnpm@12.5.1`），依赖通过 **pnpm catalogs**（`pnpm-workspace.yaml`）分组管理
- **Node**：`^22.19 || ^24.11 || >=26`（`engineStrict: true`）
- **代码风格**：ESLint（`@antfu/eslint-config` + `@zinkawaii/eslint-config-css`），3.8.0 起**不再使用 Sass/Stylelint**，改用原生 CSS 嵌套 + `postcss-nesting`
- **样式断点**：`528px`(phone) / `768px`(mobile) / `1080px`(widescreen)

## 常用命令

| 命令 | 说明 |
| --- | --- |
| `pnpm i` | 安装依赖（首次需 `pnpm install`） |
| `pnpm dev` | 启动开发服务器 |
| `pnpm dev:host` | 开发服务器，监听所有主机 |
| `pnpm build` | SSR 构建（`nuxt build`） |
| `pnpm generate` | **SSG 静态构建**（生产部署用，输出 `dist/`） |
| `pnpm preview` | 预览构建产物 |
| `pnpm new` | 交互式创建新文章（运行 `scripts/new-blog.ts`） |
| `pnpm ai:summary` | 交互式补 AI 摘要（`--all` / `--missing` / `--dry-run`，见 `scripts/ai-summary/`） |
| `pnpm init-project` | 初始化/重置项目配置与示例内容（`--yes` 跳过确认） |
| `pnpm lint` / `pnpm lint:fix` | ESLint 检查 / 自动修复 |
| `pnpm check:feed` | 检测单个友链/任意 URL 的托管商与可访问性 |
| `pnpm check:feed/all` | 检测所有友链可访问性并生成报告 |
| `pnpm bump` | 用 `taze` 批量升级依赖并重装 |
| `pnpm prepare` | 清缓存并 `nuxt prepare`（安装依赖时自动触发） |

安装 npm 包推荐用 `@antfu/nip` 的 `nip` 命令，装到合适的 catalog 下。

## 目录结构

```
app/                  # 前端（Nuxt 4 结构）
  assets/             # 资源；css/ 下有 6 个全局样式入口（animation, article, color, font, main, reusable）
  components/         # 组件
    blog/             # 博客布局组件（BlogHeader.global.vue, BlogSidebar, BlogPanel 等）
    content/          # MDC 组件（Alert, Chat, Key, Tab, Timeline, VideoEmbed...）
    partial/          # 微型组件（前缀 Z，由 nuxt.config components 配置注册）
    popover/          # 弹窗组件
    post/             # 文章组件（Article, Comment, Excerpt, PostHeader, Slide...）
    util/             # 通用功能组件（Button, Dropdown, Expand, Pagination, Search...）
    widget/           # 侧栏小组件
  composables/        # Vue 组合式函数（useArticle, usePagination, useShiki, useToc, useWidgets...）
  layouts/            # 布局（default.vue）
  pages/              # 页面：[...slug].vue(正文/404), index(首页), archive, feed(订阅), link, preview
  plugins/            # Nuxt/Vue 插件（article-transition.client, easter-egg, tippy...）
  stores/             # Pinia（layout.ts, search.ts）
  types/              # 类型定义
  utils/              # 工具函数（anim, article, img）
  app.config.ts       # 前端响应式配置（启动后可变）★
  app.vue / error.vue # 根组件与错误页
  feeds.ts            # 友链列表（68K，含所有友链数据）★
content/              # 文章（Nuxt Content 源）
  posts/              # 正式文章
  previews/           # 草稿文章，仅可被站内搜索
  link.md / theme.md  # 友链申请说明 / 主题介绍
modules/
  anti-mirror/        # 恶意反代跳转防护模块（运行时注入脚本，列出镜像域名黑名单）
patches/              # npm 包补丁（@nuxt/image, @nuxtjs/mdc, ipx, plain-shiki, @vue/shared）
public/               # 静态资源（favicon, fonts, img, music）
remark-plugins/       # Unified 生态插件（rehype-meta-slots.ts, remark-code-component.ts）
scripts/              # 脚本（init-project.ts, new-blog.ts, framework/）
server/               # 服务端
  api/stats.get.ts    # 博客静态统计接口
  routes/atom.xml.get.ts, subscriptions.opml.get.ts  # Atom / OPML 订阅源
blog.config.ts        # 博客静态公共配置★
content.config.ts     # Nuxt Content collection 与 schema
nuxt.config.ts        # Nuxt 配置
edgeone.json          # EdgeOne 平台配置（headers/redirects）
redirects.json        # 旧站 URL 重定向（308）
pnpm-workspace.yaml   # pnpm catalogs
```

## 配置分层（★ 关键约定）

配置分三层，不要混淆作用域：

1. **`blog.config.ts`** —— 启动时需要、静态不可变的公共配置：站点信息、作者、版权、分类/文章类型、订阅源、统计服务（Umami/Cloudflare Insights/Twikoo 的 script 注入）、Twikoo 服务源、`url` 站点地址。被 `nuxt.config.ts`、`app/app.config.ts`、`content.config.ts`、服务端、anti-mirror 模块共同引用。
2. **`app/app.config.ts`** —— 前端运行时可变的响应式配置：`component`（组件默认行为）、`footer`/`header`/`nav`（导航与页脚）、`pagination`（每页条数、排序）、`themes`（颜色模式文案）、`link`。用 `defineAppConfig`，运行中可热改。
3. **`nuxt.config.ts`** —— 构建配置。其中 `css` 数组、`routeRules`（重定向 + 预渲染头）、`modules` 列表、`content` 的 remark/rehype 插件注册、`runtimeConfig.public`（架构信息注入）、postcss 嵌套。

改动站点个性化信息主要动 `blog.config.ts` + `app/app.config.ts` + `content/link.md` + `app/feeds.ts`。

## 文章系统（Nuxt Content）

- Collection 定义在 `content.config.ts`，schema 为 `ArticleSchema`（zod 校验）：`title, description, date, updated, published, categories, tags, type, image, recommend, references, draft, permalink, readingTime`，并扩展 sitemap schema。
- 分类与文章类型（`tech`/`story`）在 `blog.config.ts` 的 `article` 中定义；分类带图标与颜色。
- **URL 规则**：优先用 frontmatter 的 `permalink`；否则当 `article.hidePostPrefix` 为 true 时隐藏 `/posts/` 前缀。由 `nuxt.config.ts` 的 `hooks['content:file:afterParse']` 改写 `ctx.content.path`。
- 文章 URL **不应以 `/` 结尾**，否则 404。
- 文章正文通过自定义 remark/rehype 插件增强：`remark-code-component`（把 mermaid / music-abc 代码块映射到 Vue 组件）、`remark-math` + `rehype-katex`、`remark-reading-time`（生成 readingTime）、`rehype-meta-slots`。
- 高亮由 `plain-shiki` + `@bikariya/shiki` 处理（`useShiki.ts`、`shiki.config.ts`），配 Shiki 主题 catppuccin-latte / one-dark-pro。
- 新建文章：`pnpm new`；如需随机 URL 打开 `blog.config.ts` 的 `article.useRandomPremalink`。

## 服务端接口与订阅源

- `server/api/stats.get.ts`：静态文章统计（词数、字数等），`routeRules` 中 `/api/stats` 预渲染并设 `application/json` 头。
- `server/routes/atom.xml.get.ts`：Atom 订阅源；`subscriptions.opml.get.ts`：OPML 订阅聚合。
- **订阅源不挂 `xml-stylesheet`**：Chrome 已弃用 XSLT，挂了会弹「此网站使用了 XSLT」警告。人类可读入口是 `app/pages/feed.vue`（`/feed`），导航里的订阅链接指向它，阅读器仍只认 `/atom.xml`。
- 订阅源需要**绝对地址**，自托管时须让 `blog.config.ts` 的 `url` 与实际访问地址协议/主机/端口一致。
- **改 API 路径时**，用 EdgeOne Makers 部署需同步改 `edgeone.json`。

## 友链申请工作流（GitHub Issues）

友链不再靠邮件/评论接收，统一走 issue 表单。

- **标签必须先手工存在**：`友链申请`、`失联`、`无效`。表单 `labels:` 里不存在的标签会被 GitHub 静默丢弃，标签没了整条链路就不触发。
- **表单**：`.github/ISSUE_TEMPLATE/link-application.yml`（规则 5 条逐 option `required: true`，少勾一条无法提交）、`config.yml`（禁用空白 issue）。
- **工作流**：`issue-events.yml`（`issues: opened/closed/labeled/reopened/edited`，含四个 job：打开预检、关闭出条目、`失联`/`无效` 通知、赞助摘要）。**同类事件都收在同一个文件里**——GitHub 每订阅一个事件就产生一条 run，哪怕所有 job 都被 `if` 跳过也会留一条空记录；拆成多文件会让一次关闭出现好几条 Skipped 记录。
- **脚本**：`scripts/link-apply/`，入口 `comment-closed.ts` / `comment-preflight.ts` / `comment-review.ts`。**零依赖约定**：只 import `node:*`，相对导入必须带 `.ts` 扩展名，靠 Node 类型擦除直跑（需要 Node ≥22.18），工作流里**不跑 `pnpm install`**。新增依赖会破坏这个前提。
- **幂等**：评论首行埋 `<!-- link-apply:<kind> -->` 隐藏标记，重跑时 PATCH 同一条评论，不刷屏。
- **解析锚点是表单的 label 文案**（`scripts/link-apply/parse.ts` 的 `labelMap`），改了表单 label 必须同步改它。
- **规则文案以表单勾选项为准**，`content/link.md` 只是概要；`pnpm init-project` 会重写 `content/link.md`（下游 fork 的默认文案），这是预期行为。
- 本地调试：`pnpm link:test`；干跑用 `DRY_RUN=1 ISSUE_BODY_FILE=scripts/link-apply/fixtures/link-issue-body.md ISSUE_NUMBER=1 ISSUE_AUTHOR=a ISSUE_SENDER=a node scripts/link-apply/comment-closed.ts`。

## 赞赏登记工作流（GitHub Issues）

赞助数据由 issue 表单提交，管理员批准后机器人自动写进 `app/reward.ts` 的 `rewardList`。

- **标签必须先存在**：`赞助`（同 `友链申请` 的坑，不存在的标签会被静默丢弃 → 整条链路不触发）。
- **表单**：`.github/ISSUE_TEMPLATE/reward-application.yml`，字段 `名称 / 金额 / 时间 / 支付截图` 必填，`备注` 选填且**不入库**；截图只做审核凭证，不下载、不入库。
- **工作流**：`issue-comment.yml`（订阅 `issue_comment`，评论里出现「添加赞助」（兼容旧词「加入赞助名单」）且评论者是 OWNER/MEMBER/COLLABORATOR 才写入 + commit main + **自动关闭 issue** + 复用 deploy 按新提交 SHA 重新部署）。赞助的「待审核摘要」在 `issue-events.yml` 的 `reward-summary` job 里，触发点是 issue `opened`/`edited`——提交后保持开启，作者改正文时摘要跟着刷新。
- **脚本**：`scripts/reward-apply/`，入口 `comment-summary.ts` / `apply.ts` / `comment-result.ts`。同样**零依赖**（只 import `node:*`，相对导入带 `.ts`），复用 `../link-apply/` 的 `splitSections`/`tsQuote`/`deliver`/`dateInZone`。**回评必须等 push 有结果**，所以拆成 apply + comment-result 两段。
- **写入规则**：只做**行级插入一行**，不重写数组（保住手写注释、diff 只有 `+1`）；按 `date` 降序插到正确位置，同日新条目排在已有同日条目之下；写盘前要过「文本逐行回环 + 临时 `.mts` 真跑一次 import」两道自检。
- **幂等**：去重键是 `name + date`；评论用 `<!-- reward-apply:summary|applied|skipped|rejected -->` 标记覆盖写。push 失败不 rebase，而是 `reset --hard` 后重跑脚本。
- 本地调试：`pnpm reward:test`；干跑用 `DRY_RUN=1 ISSUE_BODY_FILE=scripts/reward-apply/fixtures/reward-issue-body.md ISSUE_NUMBER=999 COMMENT_BODY='添加赞助' COMMENT_ASSOCIATION=OWNER node scripts/reward-apply/apply.ts`。

## 部署要点

- 用**静态 SSG**：构建 `pnpm generate`，输出目录 `dist`，安装 `pnpm i`。不要用平台的 “Nuxt” 预设（会变 SSR，每次访问都重渲染）。
- 平台差异：
  - `nitro.prerender.autoSubfolderIndex`：Cloudflare Pages / GitHub Actions / Netlify 上设为 `false`，修复部分平台给文章路径加尾随 `/` 导致的 404（nuxt/content#2378）。
  - `image.provider`：Netlify 下设为 `'none'`（站内/站外图片处理器各有问题）。
- `routeRules`：`redirects.json` 全部转为 308 重定向；`/favicon.ico` 重定向到 `blogConfig.favicon`。
- **prerender 报错排障**：`generate` 报 `Exiting due to prerender errors` 时，搜完整日志的 `[404]` 和 `Linked from`，修正指向已删除文章的链接。
- Node 版本须满足 `package.json` engines（`engineStrict: true`）。

## PWA（可安装 + 离线）

面向维护者：站点已具备 PWA 能力（可安装 + 离线阅读）。改动前先看完本节，尤其是「缓存分层在哪里改」与「测试的四个坑」。

### 组成

| 部件 | 位置 | 作用 |
| --- | --- | --- |
| `@vite-pwa/nuxt` | `nuxt.config.ts` 的 `pwa` 块 | 生成 manifest、向 SW 注入预缓存清单、客户端注册与自动更新 |
| 自定义 Service Worker | `app/sw.ts` | 预缓存 + 四组运行时缓存 + 导航路由，**手写** |
| manifest | `nuxt.config.ts` 的 `pwa.manifest` | 名称/图标/`display: standalone`/`theme_color` |
| iOS 一次性引导 | `app/components/blog/PwaIosHint.vue`（挂在 `app/layouts/default.vue`） | iOS 没有原生安装提示，补一条可关闭的提示条 |
| 离线兜底页 | `app/pages/offline.vue`（路由 `/offline`） | 网络失败且未预缓存时的落地页，已从收录中排除 |

- 策略是 `strategies: 'injectManifest'`，**不是** `generateSW`。`srcDir: '.'` 不是笔误：injectManifest 下 `swSrc` 由 Vite root（Nuxt 4 = `app/`）拼出，写成 `'app'` 会去找 `app/app/sw.ts` 而构建失败。
- **`pwa.workbox` 整段不存在**：injectManifest 策略只读 `pwa.injectManifest`，把 glob 配置留在 `workbox` 里不会生效。
- `skipWaiting()` / `clientsClaim()` 必须由 `app/sw.ts` 自己调用 —— injectManifest 下模块不会像 generateSW 那样注入，而 `registerType: 'autoUpdate'` 的自动刷新依赖新 SW 立刻 activate。

### 缓存分层在哪里改

| 层 | 改哪里 | 现状 |
| --- | --- | --- |
| 预缓存清单 | `nuxt.config.ts` → `pwa.injectManifest.globPatterns` / `globIgnores` | `**/*.{js,css,html,json,xml,txt,svg,ico,wasm,woff,woff2}`，排除 `**/img/**`、`**/music/**`、`_ipx/**`。`wasm` 是离线搜索（sqlite3）的依赖，**不能删** |
| 预缓存忽略参数 | `app/sw.ts` 的 `precacheAndRoute(..., { ignoreURLParametersMatching })` | `utm_` / `fbclid` / **`_b`**。`_b` 是 Nuxt 取 payload 时追加的 buildId，删了它离线站内跳转只剩页面壳、没有正文 |
| 导航（文档请求） | `app/sw.ts` 的 `NetworkFirst` + `PrecacheFallbackPlugin` | 4s 超时；在线一律走网络（平台自己决定尾斜杠/404），只有网络真失败才回退 `/offline` |
| 图片 / 音频 / 站外样式字体 / 三方 API | `app/sw.ts` 的四组 `registerRoute` | CacheFirst 200 条/30d；CacheFirst + `RangeRequestsPlugin` 30 条/30d；StaleWhileRevalidate 30 条/30d；NetworkOnly |
| 清旧预缓存 | `app/sw.ts` 的 `cleanupOutdatedCaches()` | 回收旧版本 SW 留下的 `-precache-` 缓存 |

匹配规则用 `sameOrigin + url.pathname` 锚定开头（站外两组用 `url.origin` 精确比对）。**不要**退回旧的无锚点子串正则：它匹配的是绝对 URL，第三方 `…/img/x.png` 会被吞进本站 `blog-image` 缓存白占配额。

### 重新生成图标

- 源图 `public/img/avatar/avatar.webp`（256×256，放大到 512 会略软，已知且接受）。
- 产物：`public/img/pwa/{icon-192,icon-512,maskable-512}.png` 与 `public/apple-touch-icon.png`；改完在 `nuxt.config.ts` 的 `pwa.manifest.icons` 里对号。
- **当前图标是一次性产物**：计划里写的 `@vite-pwa/assets-generator` 命令与实际接口不符（v2.0.0 没有 `--out`，预置名也没有 `minimal-2023`；照计划书的命令跑会静默 exit 1）。重新生成需**自行用 `sharp` 重做**：maskable 版本把源图缩到 **80% 居中**、四周填充 **`#FFFFFF`**（与 `manifest.background_color` 一致）。

### `sw.js` 与 `manifest.webmanifest` 必须不被 CDN 缓存

两个都加 `Cache-Control: no-cache`，**两处都要改**；换 SW 文件名时同步改两处：

- `public/_headers`（Cloudflare Pages）
- `edgeone.json` 的 `headers`（EdgeOne Makers）

漏改任何一处，用户会长时间停在旧 SW 上（或更新检查被 CDN 拖死）。

### 测试这套 PWA 的四个坑

1. **必须用 `http://localhost:<port>`**：`navigator.serviceWorker` 只在安全上下文存在，用局域网 IP 打开会静默跳过注册（不报错，看起来像「没接上」）；且 Ecoku 评论接口的 Origin 白名单只放行 `localhost:3000`，换端口/换 host 即 403，会误判成离线降级失效。
2. **离线要真断源 + 屏蔽第三方域名**：「只杀静态服务器 ≠ 断外网」，第三方 API 仍可达会把「无缓存也能离线显示」判成**假 PASS**。仅用 CDP `Network.emulateNetworkConditions{offline:true}` 也不行 —— 它拦不住 SW 内部 fetch，会产生假阴性；需叠加 `Network.setBlockedURLs`（或真断网卡）。
3. **workbox 预缓存 key 带 `?__WB_REVISION__`**：做「清单 ↔ Cache Storage」URL 级比对时必须剥离该参数，否则会把全部条目误判成缺失。
4. **`Emulation.setEmulatedMedia` 对 `display-mode` 无效**：验证 `standalone` 分支要用 Chrome `--app=<url>` 真独立窗口（那里 `matchMedia('(display-mode: standalone)')` 才为 `true`）。

### 改动 SW 后的验证方式

`pnpm generate` 后检查构建日志与产物：

- 日志出现 `mode injectManifest`，以及 `precache  N entries`；
- 清单条数 = Cache Storage 里 `workbox-precache-v2-*` 的条目数（当前 **371**）；
- 产物里**没有** ESM 语法（SW 以 classic 注册，有 `import`/`export`/`import.meta` 会直接解析失败）：

  ```bash
  grep -cE "^\s*(import|export)\b|import\.meta" .output/public/sw.js   # 期望 0
  ```

- `.output/public` 下不再有独立的 `workbox-*.js`（运行时已内联进 `sw.js`，单文件约 46 KB）。

## 说说页面（数据源：tg / ech0）

说说页（`app/pages/memos.vue`）的取数与渲染是**完全解耦**的：`blog.config.ts` 的 `memos.source` 二选一，两个适配器对外暴露同一套状态，`MemosTimeline.vue` / `MemosCard.vue` 只处理统一的 `MemosMessage`。

| 层 | 位置 | 说明 |
| --- | --- | --- |
| 门面 | `app/composables/useMemos.ts` | 按 `memos.source` 选适配器；同时导出 `formatMemosFileSize` / `formatMemosDuration`（组件自动导入） |
| tg 适配器 | `app/composables/memos/useMemosTg.ts` | koharu-suite，**游标**分页（`nextCursor`） |
| ech0 适配器 | `app/composables/memos/useMemosEch0.ts` | 自部署 Ech0，**页码**分页（`page` + `total`） |
| 视图模型 | `app/types/memos.ts` | 统一 `MemosMessage`（`source` / `html` / `plainText` / `extension` / `favCount`） |
| ech0 原始类型 | `app/types/memos-ech0.ts` | 后端带 `omitempty`，字段一律可选 |
| 映射（纯函数） | `app/utils/memos/ech0.ts` | 原始 → 视图模型，`node --test` 覆盖 |
| Markdown | `app/utils/memos/markdown.ts` | **懒加载** `markdown-it`，`html:false` |
| 纯文本/标签 | `app/utils/memos/plain.ts` | 引用评论用纯文本 + 剥裸 `#标签` |
| 音乐解析 | `app/utils/memos/music.ts` | 音乐**分享页 URL** → `{server,type,id}` → Meting |
| 扩展卡片 | `app/components/memos/MemosExt*.vue` | Shell + 6 类卡（music/video/github/website/tweet/location），全部异步加载 |
| 构建期快照 | `server/api/memos/latest.get.ts` | 按 `memos.source` 分支，两个源返回各自原始形态 |

**配置要点**

- 共用项在 `memos` 顶层：`perPage` / `cacheTtl` / `refreshInterval` / `requestTimeout` / `avatar` / `nickname` / `banner`。
- `memos.tg`：`apiBase`（koharu-suite）、`channelIds`。
- `memos.ech0`：`apiBase`、`siteUrl`（留空回退 apiBase，用于「查看原帖」）、`githubLive`（关掉后 GitHub 卡只显示 owner/repo，不打 api.github.com）、`tweetMode`（`static` / `embed`）、`locationMap`。
- 代码保留 `config.tg ?? config.apiBase` 的旧配置兼容读取。

**ech0 接口契约**（实测 v1.0.3 / commit `086219b`，与本地 `E:\kmoretti-github\Ech0` HEAD 一致）

```text
POST {apiBase}/api/echo/query   body {page, pageSize}
→ {code:1, msg, data:{total, items}}
```

- `page` 从 1 开始；`pageSize` 上限 **100**，超出静默截断；`page=0` 静默回落 1。
- 匿名请求服务端强制过滤 `private`，公开页不需要也不该做私密筛选。
- `content` 是 **Markdown 源码**（不是 HTML），`created_at` 是 **Unix 秒**。
- `echo_files` / `tags` / `username` / `extension` / `layout` 带 `omitempty`，**字段可能整块缺失**。
- `echo_files[].file.url` 可能是相对路径 `/api/files/...`，映射时统一拼实例域名。
- 附件**没有 duration**，音视频时长由播放器 `loadedmetadata` 自己读。
- CORS **完全放开**（反射任意 Origin），浏览器可直连 → **不需要开发代理**（与 tg 不同）。
- 附件静态目录 `/api/files/**` **不带 CORS 头**（注册在 CORS 中间件之前）→ 只能用 `<img>/<video>/<audio>` 标签，不能 `fetch()` 读字节。

**扩展卡片**

| type | payload | 渲染 |
| --- | --- | --- |
| `MUSIC` | `{url}` 音乐分享页 | 解析出 id → Meting 取元信息/音频/封面，卡片内联播放器（页内互斥）；Apple 不被 Meting 支持 → 外链卡 |
| `VIDEO` | `{videoId}` | `BV` 前缀 → Bilibili iframe，否则 YouTube |
| `GITHUBPROJ` | `{repoUrl}` | 实时打 `api.github.com`，localStorage 缓存 24h，失败降级静态 |
| `WEBSITE` | `{title,site}` | 标题 + 域名 |
| `LOCATION` | `{placeholder,latitude,longitude}` | 地名 + 坐标，点击才创建 OSM embed iframe |
| `TWEET` | `{url,username,statusId}` | 默认纯静态卡（不加载 widgets.js） |

**音乐前提**：`payload.url` 存的是分享页，播放要二次请求 Meting（`blogConfig.music.meting.api`）。**无 cookie 的 meting 实例对 VIP 歌曲会 302 到网易云的 404 页**（实测 186016 晴天失败、347230 等免费曲成功），所以卡片必须容错：播不了就显示「音源暂不可用（版权限制）」，不能让整张卡消失。

**URL 安全（必须遵守）**：`extension.payload` 是服务端自由 JSON，而 **Vue 的 `:href` 绑定不做协议净化**（`javascript:` 黑名单只在 compiler-dom 对模板字面量的检查里）。所以：

- 任何来自接口的链接一律先过 `app/utils/memos/url.ts` 的 `safeHttpUrl()`；GitHub 地址用 `safeGithubRepoUrl()` 再加 hostname 白名单。
- `MemosExtShell.vue` 已统一兜住右上「前往」链接，各卡内部的 `<a>` 必须自己再过一遍（GitHub / Tweet 卡已做）。
- 非法地址的降级是**不渲染链接**（渲成纯文本卡），不是留一个 `href=""`。
- `url.test.ts`（11 条用例）是这条防线的回归测试，改动这些卡时先跑它。

**标签取值**：`collectTags()` 取「结构化 `tags` ∪ 正文裸 hashtag」的并集。**不要改回「有 tags 就只看 tags」**：实测 47 条里 26 条的结构化 tags 只有 Ech0 自动打的全站标签（`kemiaoshuoshuo`），作者的真实分类只写在正文里，而正文标签又会在渲染前被剥掉。

**开发期造数据**：线上 ech0 没有 MUSIC/VIDEO/TWEET 扩展与附件，用 `http://localhost:3000/memos?memos-mock=1` 注入 `app/data/memos-ech0-mock.ts`。mock 模式下**跳过 localStorage 缓存**，改数据立刻生效。生产产物校验：`grep -rl "mock-01-longform" .output/public/_nuxt/` 应为空。

> ⚠️ 这里踩过一次坑：`import.meta.dev` 若写在 `computed()` 里，Rollup 折叠成 `false` 后仍会保留动态 `import()` 的调用点，mock 数据会被当成独立 chunk 打进生产产物。必须像 `loadMockPage()` 那样用**分支外的普通 `if (!import.meta.dev) return null`**，让整个 import 不可达。

**测试**：`node --test "app/utils/**/*.test.ts"`（已并入 `pnpm test`）。`app/**/*.test.ts` 在 `eslint.config.mjs` 里显式关闭了 `test/no-import-node-test`，沿用仓库「零依赖、跑 Node 内置 test runner」的约定。

**两个已知坑**

1. `useRoute()` 必须在 **setup 同步阶段**取一次再给异步回调用；在 `await` 之后的回调里再调会丢 Nuxt 上下文，异常还会被适配器的 `catch` 吞掉，表现成「mock 不生效但页面正常显示旧数据」。
2. 改这些文件时 dev server 的 chokidar 偶发 `EBUSY`（编辑器原子写产生的 `*.tmpdir/` 被监听）导致 Nuxt 自重启甚至 500：编辑前先停 dev server，或改完重启一次再验收。

---

## 工具链约定

- **pnpm catalogs**：`pnpm-workspace.yaml` 将依赖按 `ui` / `content` / `framework` / `util` / `quality` 分组，`package.json` 用 `catalog:xxx` 引用。升级依赖走 `pnpm bump` 或 `nip`。
- **`@keep-sorted` 注释**：`nuxt.config.ts`、`blog.config.ts`、`app.config.ts` 等文件的数组/对象按注释要求保持排序（ESLint `sort` 规则会校验），编辑新增项时注意放置顺序。
- **代码风格**：缩进用 tab（`editor.tabSize: 3`，Vue 模板缩进 tab）；组件样式 `lang="css"` 或省略；CSS 嵌套由 `postcss-nesting` 处理；不引入 Sass 变量（3.8.0 已移除全局 Sass 变量注入）。
- **补丁包**：`patches/` 下的 npm 补丁是特定行为的来源（如代码块不转 tab、行内代码 `props.code` 传原文、图片支持 1.5x 密度、IPX 处理 ICO、`::highlight` 选择器）。改动相关行为先看对应补丁。

## 3.8.0 原生 CSS 迁移（破坏性变更）

- 六个全局样式入口改为同名 `.css`；组件 `lang="scss"` 改 `<style scoped>`；`sass-embedded` 不再默认安装；全局 Sass 变量注入删除；Stylelint 移除，`lint`/`lint:fix` 统一走 ESLint。
- 保留 SCSS 定制：自行加 `sass-embedded` 依赖并在 `nuxt.config.ts` `vite.css.preprocessorOptions.scss` 恢复 `additionalData`，同时改 ESLint `vue/block-lang` 允许 `scss`。
- 媒体查询断点必须用实际数值，不能用 CSS 自定义属性替代 Sass 变量。

## 个性化内容红线（作者声明）

部署前必须完成项目个性化配置与内容修改：不得将作者信息用于自己的网站图标/名称，严禁将项目内作者文章以你的名义重新发布至公开环境（详见 README「耻辱柱」）。

## 开发提示

- `.vscode/settings.json`：Vue 默认 formatter 为 null（交给 ESLint 的 codeActionsOnSave），TypeScript 用官方 LSP，CSS 引用 stylelint（若保留 SCSS）。
- 开发期已移除 `@nuxt/a11y` 自动扫描（3.8.0，性能考虑）。
- 调试水合/过渡：`nuxt.config.ts` 中 `vite.define.__VUE_PROD_HYDRATION_MISMATCH_DETAILS__` 和 `__VUE_PROD_DEVTOOLS__` 注释掉的开关可开启诊断。
