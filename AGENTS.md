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
  pages/              # 页面：[...slug].vue(正文/404), index(首页), archive, link, preview
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
public/               # 静态资源（assets 订阅 XSLT 模板, fonts）
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
- 订阅源需要**绝对地址**，自托管时须让 `blog.config.ts` 的 `url` 与实际访问地址协议/主机/端口一致。
- **改 API 路径时**，用 EdgeOne Makers 部署需同步改 `edgeone.json`。

## 部署要点

- 用**静态 SSG**：构建 `pnpm generate`，输出目录 `dist`，安装 `pnpm i`。不要用平台的 “Nuxt” 预设（会变 SSR，每次访问都重渲染）。
- 平台差异：
  - `nitro.prerender.autoSubfolderIndex`：Cloudflare Pages / GitHub Actions / Netlify 上设为 `false`，修复部分平台给文章路径加尾随 `/` 导致的 404（nuxt/content#2378）。
  - `image.provider`：Netlify 下设为 `'none'`（站内/站外图片处理器各有问题）。
- `routeRules`：`redirects.json` 全部转为 308 重定向；`/favicon.ico` 重定向到 `blogConfig.favicon`。
- **prerender 报错排障**：`generate` 报 `Exiting due to prerender errors` 时，搜完整日志的 `[404]` 和 `Linked from`，修正指向已删除文章的链接。
- Node 版本须满足 `package.json` engines（`engineStrict: true`）。

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
