# 外链中转安全页（SafeGo）设计方案

- 日期：2026-11-02
- 工程：`E:\github_maochenyu_me\blog\blog`（Nuxt 4 + Nuxt Content 3 + SSG）
- 参考实现：<https://github.com/willow-god/hexo-safego>
- 状态：**待用户评审**（本文件通过评审前不写任何实现代码）

---

## 1. 背景与目标

博客目前所有外链都由 `app/components/util/Link.vue` 直接加 `target="_blank"` 打开，读者在点开之前无从确认目标站点是谁。本方案新增一个「外链中转安全页」：读者点击站外链接时先进入本站的中转页，看清楚目标域名与完整地址，再决定「直接跳转」还是「回到上页」。

### 目标

1. 站外链接统一经过中转页，覆盖文章正文、侧栏、页脚、友链页、说说、朋友圈等**所有**渲染位置。
2. 「回到上页」能准确回到**点击外链的那个页面及其滚动位置**。
3. 倒计时时长、生效页面、生效外链、全部文案都通过 `app/data/` 下的配置文件调整，改配置不需要动组件代码。
4. 视觉上完全是博客的一部分：复用既有配色变量、字体与按钮组件，自动跟随亮/暗模式与用户自选主题色。

### 非目标

- 不做真正的安全过滤（不查黑名单库、不做沙箱），这是**提示页**不是**防火墙**。
- 不替代浏览器自身的安全能力。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 中转页 | 路由 `/go` 对应的页面，`app/pages/go.vue` |
| 拦截器 | `app/plugins/safego.client.ts`，全局点击监听器 |
| 目标地址 | 外链的真实 URL，放在中转页的查询参数里 |
| 生效范围 | 哪些页面、哪些外链需要经过中转页 |
| 白名单 | 命中后**跳过**中转、直接打开的外链域名 |

---

## 3. 成功标准（可验收）

| # | 标准 | 验证方式 |
| --- | --- | --- |
| S1 | 文章正文里的 `https://github.com/...` 左键点击后进入 `/go?u=…` | 浏览器实测 + 地址栏断言 |
| S2 | 从文章中部（`scrollY > 1500`）点外链后点「回到上页」，回到同一篇文章且 `scrollY` 与点击前一致（±2px） | 浏览器实测记录点击前后 `scrollY` |
| S3 | 倒计时结束自动跳转，跳转后按浏览器返回键直接回到文章（不是回到中转页） | 浏览器实测 |
| S4 | 命中白名单的域名、`pages.exclude` 中的页面、`mailto:`、`#锚点`、站内链接都不进中转页 | 浏览器实测（把 `/link` 临时加入 `pages.exclude` 验证豁免生效，验完还原） |
| S5 | `behavior.countdown` 改为负数后不自动跳转，只显示手动提示与两个按钮 | 改配置后实测 |
| S6 | 亮色/暗色两种模式下都无对比度与溢出问题；1080 / 768 / 528 三个断点无横向滚动 | 截图 |
| S7 | `pnpm lint` 通过；`pnpm generate` 成功产出且 `/go` 有静态壳 | 命令行 |
| S8 | `pnpm test` 中的 SafeGo 纯函数用例全绿 | 命令行 |
| S9 | `/go` 不出现在 sitemap，且带 `noindex` | 检查 `sitemap.xml` 与页面 head |

---

## 4. 架构与数据流

```
用户点击外链 <a href="https://ext…">
        │
        ▼  app/plugins/safego.client.ts   ← 唯一拦截点（document 捕获阶段）
        ├─ 页面判定：当前 path 命中 pages.include 且不在 pages.exclude
        ├─ 链接判定：绝对 http(s) + 非同源 + 不在白名单 + 无忽略属性
        └─ preventDefault()
             ├─ 普通左键       → router.push('/go?u=<target>')     当前标签页
             └─ 修饰键 / 中键  → window.open('/go?u=<target>')     新标签页
        │
        ▼  app/pages/go.vue（layout: safego）
        ├─ onMounted 解析并校验目标（只允许 http / https）
        ├─ 渲染：目标域名 + 完整 URL + 风险提示 + 倒计时进度
        └─ [直接跳转] ｜ [回到上页] ｜ 倒计时结束自动跳
        │
        ▼  location.replace(target) → 目标站点
```

### 4.1 两个刻意的技术选择（已核实，非推测）

**进入中转页用 `router.push`（而非 `replace`）**
让 `/go` 成为一条独立的历史记录，于是「回到上页」= `router.back()`，并且滚动位置由 Nuxt 默认 `scrollBehavior` 恢复。已核实 `nuxt@4.5.2` 的 `dist/pages/runtime/router.options.js`：`_calculatePosition()` 的第一个分支就是 `if (savedPosition) return savedPosition`，因此返回导航会自动恢复到离开时的滚动位置，**不需要自己记录 scrollTop**。

**跳出用 `location.replace(target)`（而非 `location.href`）**
把 `/go` 这条历史记录替换成目标站点。历史栈因此是 `[文章, 目标站点]`，读者在外部站点按浏览器返回键时**直接回到博客文章原位置**，而不是回到中转页——这正是「回到上页」语义能延续到外部站点的关键。

### 4.2 为什么拦截器挂在 `document` 捕获阶段

- 挂在 `document` 上可以覆盖动态插入的 DOM（评论、说说、朋友圈卡片），无需逐组件改造。
- 用捕获阶段保证确定性。已逐个核实 Nuxt 4.5.2 的真实渲染路径（`node_modules/.pnpm/nuxt@4.5.2_…/nuxt/dist/app/components/nuxt-link.js`）：
  - **站外链接根本不产生 JS 导航**。`NuxtLink` 在 `isExternal || hasTarget` 时渲染成裸 `<a>`，其 `onClick`（第 324-325 行）第一句就是 `if (isExternal.value || hasTarget.value) return;`；而 `app/components/util/Link.vue` 给所有 `isExtLink()` 为真的链接都加了 `target="_blank"`，所以站外链接走的正是这条分支。捕获阶段执行 `preventDefault()` 即可取消浏览器原生「开新标签」的默认行为，**不存在与既有 JS 处理器的竞态**。
  - 渲染成 `RouterLink` 的只有站内链接（第 287 行的条件），它们本来就不在拦截范围内；即便被误命中，Vue Router 的 `guardEvent()` 也会检查 `event.defaultPrevented` 并提前返回。
- 已核实不会误伤既有交互：博客的图片灯箱（`app/components/content/Pic.vue`）把 `@click` 绑在 `<img>` 上，不产生 `<a>` 元素。
- 只处理 `http:` / `https:` 绝对地址，`<a href="#">`（左侧栏「目录」「功能集合」「友邻」等折叠项）自然被排除。

---

## 5. 配置契约

### 5.1 配置入口：`app/data/safego.ts`（新增）

与 `app/data/music.ts`、`app/data/hot.ts` 同级同风格（命名导出 + 类型文件），是全站唯一配置入口。

```ts
import type { SafeGoConfig } from '~/types/safego'

/**
 * 外链中转安全页配置
 *
 * 改动本文件即改变全站外链行为，无需触碰任何组件代码。
 * 中转页本身的路由在 app/pages/go.vue，视觉在 app/layouts/safego.vue。
 */
export const safeGoConfig: SafeGoConfig = {
	/** 总开关：false 时插件不注册任何监听，全站外链恢复直连 */
	enable: true,

	/** 中转页路由与传参 */
	route: {
		/** 中转页路由，需与 app/pages 下的文件名一致 */
		path: '/go',
		/** 目标地址的查询参数名，如 /go?u=https%3A%2F%2Fexample.com */
		param: 'u',
		/**
		 * 是否用 base64url 编码目标地址。
		 * true 时地址栏不暴露原始 URL，但读者也无法在地址栏确认目标；
		 * 注意这**不是**安全措施，只是观感选择。
		 */
		base64: false,
	},

	/** 哪些页面生效：全站生效，只排除下面这些 */
	pages: {
		/** 生效路径，glob 风格；`/**` 表示全站 */
		include: ['/**'],
		/**
		 * 排除路径，glob 风格。中转页自身必须排除，否则会死循环。
		 * 需要豁免其他页面时在这里追加，例如：
		 *   '/link'   友链页（若不想让访客跳转友链时多一步）
		 *   '/about'  关于页
		 */
		exclude: ['/go', '/preview', '/previews/**'],
	},

	/** 哪些外链需要跳转 */
	links: {
		/**
		 * 'all'    除白名单外，全部站外链接都走中转页
		 * 'listed' 只有 domains 里列出的域名走中转页，其余直连
		 *          （此模式下 `domains` 语义由「豁免名单」变成「命中名单」）
		 */
		mode: 'all',
		/**
		 * 域名白名单，按主机后缀匹配：
		 * 'github.com' 同时命中 github.com 与 gist.github.com。
		 * 同源链接本来就不过中转页，这里通常填自己的其他服务域名。
		 */
		domains: ['518339.xyz', 'kemeow.top'],
		/** 带这些属性的链接一律不中转，也是手工豁免的开关 */
		ignoreAttrs: ['download', 'data-safego-ignore'],
	},

	/** 跳转行为 */
	behavior: {
		/** 自动跳转倒计时秒数；**负数表示不自动跳转**，只保留手动按钮 */
		countdown: 5,
		/** 鼠标悬停或键盘聚焦到卡片上时暂停倒计时，避免读者没看完就被跳走 */
		pauseOnInteraction: true,
		/** 切换浏览器标签页时暂停倒计时 */
		pauseWhenHidden: true,
		/** Ctrl/Cmd/Shift + 左键、鼠标中键是否也走中转页（在新标签页打开中转页） */
		interceptModifiedClick: true,
	},

	/** 文案，全部可覆写；`{site}` 与 `{seconds}` 为占位符 */
	text: {
		/** 中转页浏览器标题 */
		title: '链接安全提示',
		/** 主提示语，`{site}` 会被替换成站点名 */
		leave: '你正在离开「{site}」',
		/** 倒计时提示语，`{seconds}` 会被替换成剩余秒数 */
		countdown: '{seconds} 秒后自动跳转，请自行确认链接安全性',
		/** countdown 为负数时的提示语 */
		manual: '请确认链接安全后手动跳转',
		/** 主按钮文案 */
		jump: '直接跳转',
		/** 次按钮文案 */
		back: '回到上页',
		/** 参数缺失/非法时的标题 */
		invalid: '这个中转链接无效',
		/** 参数缺失/非法时的说明 */
		invalidDesc: '目标地址缺失，或使用了不被允许的协议。为安全起见已阻止跳转。',
		/** 失败态的按钮文案 */
		home: '返回首页',
		/** 风险特征提示文案，键名对应 app/types/safego.ts 的 SafeGoRiskKind */
		risks: {
			http: '该链接使用 HTTP 明文传输，内容可能被窃听或篡改',
			ip: '目标是一个 IP 地址，而不是可读的域名',
			punycode: '域名含 Punycode 编码，可能伪装成形近字符',
			long: '地址异常长，常见于追踪链接或伪装地址',
			port: '使用了非标准端口',
		},
	},
}
```

### 5.2 类型：`app/types/safego.ts`（新增）

```ts
export type SafeGoLinkMode = 'all' | 'listed'

export type SafeGoRiskKind = 'http' | 'ip' | 'punycode' | 'long' | 'port'

export interface SafeGoText {
	title: string
	leave: string
	countdown: string
	manual: string
	jump: string
	back: string
	invalid: string
	invalidDesc: string
	home: string
	risks: Record<SafeGoRiskKind, string>
}

export interface SafeGoConfig {
	enable: boolean
	route: { path: string, param: string, base64: boolean }
	pages: { include: string[], exclude: string[] }
	links: { mode: SafeGoLinkMode, domains: string[], ignoreAttrs: string[] }
	behavior: {
		countdown: number
		pauseOnInteraction: boolean
		pauseWhenHidden: boolean
		interceptModifiedClick: boolean
	}
	text: SafeGoText
}

/** 目标地址解析结果 */
export type SafeGoTarget =
	| { ok: true, href: string, host: string, risks: SafeGoRiskKind[] }
	| { ok: false, reason: 'missing' | 'malformed' | 'protocol' }
```

---

## 6. 纯函数层契约：`shared/utils/safego.ts`（新增）

放 `shared/utils/` 是为了让插件与页面共用同一份判定逻辑，并且**零第三方依赖**（只用 `URL`、正则与字符串操作），从而可以直接被 `scripts/` 下的 `node --test` 用例导入。所有函数必须是纯函数、无副作用、不读取 `document`。

| 函数 | 签名 | 语义 |
| --- | --- | --- |
| `matchPathPattern` | `(pattern: string, path: string) => boolean` | glob 风格路径匹配。`**` 跨路径段、`*` 段内通配；`'/**'` 命中任意路径。尾部斜杠视为等价 |
| `isPageInScope` | `(path: string, pages: SafeGoConfig['pages']) => boolean` | `include` 任一命中且 `exclude` 全部未命中才为真 |
| `matchDomainHost` | `(host: string, domains: string[]) => boolean` | 主机后缀匹配：`host === d` 或 `host.endsWith('.' + d)`；大小写不敏感 |
| `resolveTarget` | `(raw: string \| undefined, base64: boolean) => SafeGoTarget` | 解码（必要时 base64url）后校验；**只接受 `http:` 与 `https:`**，其余返回 `{ ok: false, reason: 'protocol' }`；空值返回 `'missing'`；`new URL` 抛错返回 `'malformed'` |
| `detectRisks` | `(url: URL) => SafeGoRiskKind[]` | 见 §6.1 |
| `buildSafeGoUrl` | `(path: string, param: string, target: string, base64: boolean) => string` | 用 `URLSearchParams` 构造中转页地址，保证编码正确 |

### 6.1 风险特征判定规则

| kind | 触发条件 |
| --- | --- |
| `http` | `url.protocol === 'http:'` |
| `ip` | 主机是 IPv4 字面量（`/^\d{1,3}(\.\d{1,3}){3}$/`）或 IPv6 字面量（以 `[` 开头） |
| `punycode` | 任一主机标签以 `xn--` 开头（大小写不敏感） |
| `long` | `url.href.length > 160` |
| `port` | `url.port` 非空且不是 `80` / `443` |

命中多条时按上表顺序全部展示，不做优先级取舍。

### 6.2 base64 约定

使用 **base64url**（`-` / `_`，去填充），避免 `+` 在查询串中被解码成空格。解码时同时容忍标准 base64（`+` / `/`）与缺失填充。

---

## 7. 拦截器契约：`app/plugins/safego.client.ts`（新增）

```ts
export default defineNuxtPlugin((nuxtApp) => { /* … */ })
```

- 只注册客户端（文件名后缀 `.client.ts`）。`enable: false` 时直接 return，不注册任何监听。
- 监听 `document` 的 `click`（捕获）与 `auxclick`（捕获，仅 `button === 1` 且 `interceptModifiedClick` 为真）。
- 页面生效范围在**每次点击时**读取 `nuxtApp.$router.currentRoute.value.path` 判定，而不是注册时判定一次。

### 7.1 判定顺序（命中任一即放行，不做拦截）

1. `event.defaultPrevented` 已为真 —— 尊重既有组件已经处理过的点击。
2. `safeGoConfig.enable` 为假。
3. 沿 `event.composedPath()` 找不到 `HTMLAnchorElement`（找不到时退回 `event.target.closest('a[href]')`，兼容 shadow DOM）。
4. 锚点带有 `links.ignoreAttrs` 中的任一属性，或带有 `download` 属性。
5. `getAttribute('href')` 无法解析成绝对 URL，或协议不是 `http:` / `https:`。
6. 解析结果与 `window.location.origin` 同源。
7. 主机命中 `links.domains`（`mode === 'all'` 时是豁免名单）。
8. `mode === 'listed'` 且主机**未**命中 `links.domains`。
9. 当前页面路径不在 `pages.include` 内，或命中 `pages.exclude`。

### 7.2 拦截后的动作

```
event.preventDefault()
url = buildSafeGoUrl(route.path, route.param, target, route.base64)
若（修饰键被按下 或 auxclick 中键）且 interceptModifiedClick：
    window.open(url, '_blank')
否则：
    nuxtApp.$router.push(url)
```

不调用 `stopPropagation()`：只取消浏览器默认行为，让其他监听器照常收到事件，避免破坏既有埋点或组件逻辑。

### 7.3 同一标签内的重复拦截保护

`/go` 默认在 `pages.exclude` 中（§5.1），因此中转页上的任何链接都不会被再次中转。插件内仍做一次路径相等判断作为兜底。

---

## 8. 中转页契约

### 8.1 布局：`app/layouts/safego.vue`（新增）

一个只提供全屏居中容器的极简布局，不含侧栏、页脚、音乐播放器与博客面板：

```
<main class="page-safego"><slot /></main>
```

- `min-height: 100dvh`、`display: flex`、`align-items: center`、`justify-content: center`、`padding: 1rem`、背景 `var(--c-bg-1)`（与博客同底色）。
- 不使用 `id="main-content"`，因为它被 `app/layouts/default.vue` 的非 scoped 样式按网格列定位。

### 8.2 页面：`app/pages/go.vue`（新增）

```ts
definePageMeta({ layout: 'safego' })
useSeoMeta({ title: safeGoConfig.text.title, robots: 'noindex, nofollow' })
```

**必须遵守的水合约束**：`/go` 会被 `nuxt generate` 预渲染成静态壳，而 `?u=` 是查询参数。若在 `setup` 里直接读 `route.query` 渲染内容，预渲染 HTML（无查询串）与客户端水合结果不一致，会触发水合告警。因此目标解析必须放在 `onMounted` 里，服务端/预渲染阶段渲染一个中性骨架。

状态机：

| 状态 | 触发条件 | 渲染 |
| --- | --- | --- |
| `loading` | `onMounted` 之前（预渲染与首帧） | 卡片骨架，不显示域名与按钮 |
| `ready` | `resolveTarget()` 返回 `ok: true` | 完整中转界面 |
| `invalid` | 返回 `ok: false` | `ZError` + 「返回首页」 |

### 8.3 交互

| 元素 | 行为 |
| --- | --- |
| 「直接跳转」按钮 | `window.location.replace(target)`，跳过剩余倒计时 |
| 「回到上页」按钮 | 见 §8.4 |
| 倒计时 | `setInterval` 每秒递减；归零时执行「直接跳转」。悬停/聚焦卡片或页面隐藏时暂停（可配） |
| `Esc` 键 | 等同「回到上页」 |
| 失败态 | 只显示说明与「返回首页」，不显示跳转按钮 |

### 8.4 「回到上页」的精确语义

```
若 window.history.state?.back 存在：
    router.back()          // 同标签页普通点击路径；Nuxt 自动恢复滚动位置
否则：
    window.close()         // 由 window.open 打开的中转页标签，直接关掉
    若 window.closed 仍为 false：
        navigateTo('/')    // 直接输入 /go 或手动新开标签的兜底
```

依据：`window.history.state.back` 由 Vue Router 在 `push` 时写入，是新开的第三个标签页所不具备的（新标签页没有本站导航历史）；而 `window.close()` 对非脚本打开的标签页会被浏览器拒绝，因此兜底分支是安全的。

### 8.5 无障碍

- 倒计时文案容器加 `aria-live="polite"`，让读屏用户听到剩余时间。
- 卡片标题使用 `h1`；跳转与返回是页面上仅有的两个可聚焦控件，Tab 顺序为「直接跳转 → 回到上页」。
- 不自动把焦点放到「直接跳转」上（避免误触离开本站）。
- 所有动画在 `prefers-reduced-motion: reduce` 下禁用。

---

## 9. 视觉设计

设计约束来自需求原文「基于博客的布局和样式」，因此**不新造视觉语言**，只做取舍与排版。

### 9.1 设计令牌（全部取自既有变量，零新增颜色 / 零新增字体）

| 用途 | 令牌 |
| --- | --- |
| 页面底色 | `--c-bg-1` |
| 卡片面 / 卡片描边 | `--ld-bg-card`、`--c-border` |
| 主文案 / 次要 / 辅助 | `--c-text-1`、`--c-text-2`、`--c-text-3` |
| 目标域名、主按钮 | `--c-primary`、`--c-primary-soft` |
| 警示图标与风险提示 | `--c-warning` |
| 失败态 | `--c-error` |
| 正文 / 地址字体 | `--font-basic`（Inter Variable）/ `--font-monospace`（JetBrains Mono） |
| 阴影 / 圆角 | `--box-shadow-2`、既有卡片圆角 |

亮暗模式与用户自选主题色因此自动跟随，无需额外分支。

### 9.2 排版

- 目标域名：`--font-basic`，约 `1.75rem` / `700`，主色。**这是一屏内最大的字**。
- 完整地址：`--font-monospace`，约 `0.8rem`，`--c-text-2`，允许折行（`overflow-wrap: anywhere`）。
- 主提示语：约 `1.05rem` / `600`。
- 倒计时与风险提示：约 `0.85rem`，`--c-text-3` / `--c-warning`。
- 卡片最大宽度 560px，正文行宽控制在 60 字符以内。

### 9.3 布局

```
┌────────────────────────────────────────────┐
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░░░░░░░░  ← 倒计时进度条（卡片顶边）
│                                            │
│  ⚠ 你正在离开「喵洛阁」                      │
│                                            │
│  github.com                                │  ← 大号、主色
│  https://github.com/L33Z22L11/blog-v3      │  ← 等宽小字、低对比
│                                            │
│  ⚡ 5 秒后自动跳转，请自行确认链接安全性       │
│                                            │
│  [ 直接跳转 ]   [ 回到上页 ]                 │
└────────────────────────────────────────────┘
```

- 外层卡片**居中**，卡片内部内容**左对齐**：读起来像一张待确认的单据，而不是营销 hero。
- 倒计时进度条贴在卡片顶边，从满到空收缩。

### 9.4 设计原则（以及对「模板化默认」的检视）

1. **复用而非新造**：零新颜色、零新字体、零新图标库，全部走博客 token 与 `ZButton` / `Icon` / `ZError` 组件。
2. **主角是域名**：访客此刻唯一的判断依据就是「要去哪个站」，所以一屏内最大的字是它，而不是一个通用的大图标。
3. **只下一个赌注**：全文唯一的记忆点是卡片顶边那条倒计时进度条（既是节奏也是信息），其余保持安静克制。
4. **不装饰**：不加编号、不加全大写标签、不加渐变、不加多余图标。
5. **尊重读者**：悬停/聚焦暂停倒计时、切标签页暂停、`Esc` 可退、动态效果可降级。

**与通用默认的差异检视**：这类需求最容易产出的是「居中的大图标 + 标题 + 副标题 + 两个按钮」的模板卡片。本方案刻意偏离三点——内容左对齐而非居中、用等宽字体展示地址作为排版主角、用顶边进度条替代圆形倒计时环；同时没有使用任何编号标记、全大写标签或渐变装饰。

---

## 10. 边界、错误处理与已知限制

### 10.1 安全

- **开放重定向防护（必须实现）**：`/go` 只接受 `http:` 与 `https:`，`javascript:`、`data:`、`file:`、`blob:` 等一律落入失败态。这是本功能唯一真正的安全属性。
- base64 解码失败、`URL` 构造失败 → 失败态，不跳转。
- 失败态不显示「直接跳转」按钮。

### 10.2 已知限制（不改，但写进文档）

| 限制 | 说明 |
| --- | --- |
| 右键菜单的「复制链接地址」 | 得到的是原始外链。运行时拦截无法覆盖，除非改写 href（本方案不做）。 |
| 跨域 iframe 内的链接 | 评论系统若以跨域 iframe 渲染，其内部链接不在本站文档树内，拦截不到。 |
| 禁用 JavaScript 的浏览器 | 插件不执行，外链直连。 |
| 豁免手段 | 链接上加 `data-safego-ignore` 即可单独放行。 |

### 10.3 与既有系统的集成点

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `blog.config.ts` | `article.robotsNotIndex` 追加 `'/go'` | 该数组已接到 `nuxt.config.ts` 的 `robots.disallow`，避免中转页被收录 |
| `nuxt.config.ts` | 顶层新增 `sitemap: { exclude: ['/go'] }` | 已核实 `@nuxtjs/sitemap@8.5.0` 的 `ModuleOptions` 支持 `exclude`；本站 `/sitemap.xml` 返回 200，模块生效中 |
| `app/pages/go.vue` | `useSeoMeta({ robots: 'noindex, nofollow' })` | 页面级兜底 |

**不改动** `app/components/util/Link.vue`。理由：拦截器已经接管点击；若同时改掉 `target="_blank"`，在插件失效（禁用 JS、配置关闭）时全站外链行为会跟着变，属于无谓的耦合。右键新开标签仍走浏览器默认行为，但该行为已被 §7.2 的修饰键分支覆盖。

---

## 11. 测试计划

### 11.1 单元测试：`scripts/safego/safego.test.ts`（新增）

仓库约定 `pnpm test` = `node --test "scripts/**/*.test.ts"`，所以测试放在 `scripts/` 下，用 `node:test` + `node:assert/strict`，只导入 `node:*` 与本仓库的 `.ts` 模块（不带第三方依赖）。覆盖：

- `matchPathPattern`：精确匹配、`/**`、`/previews/**`、尾斜杠、不匹配用例。
- `isPageInScope`：include 命中 / exclude 优先。
- `matchDomainHost`：精确、子域、非子域（`evilgithub.com` 不得命中 `github.com`）、大小写。
- `resolveTarget`：正常 http/https、缺参、非法协议（`javascript:` / `data:`）、base64 与 base64url 两种编码、损坏的 base64。
- `detectRisks`：五条规则各自的命中与未命中。

### 11.2 浏览器端验收（`browser-skill`，`localhost:3000`）

**注意：本机 dev server 只监听 IPv6，`127.0.0.1:3000` 无法连接，必须用 `localhost:3000`。**

| 步骤 | 断言 |
| --- | --- |
| 1. 打开一篇正文含外链的文章，记录点击前 `window.scrollY` | 外链存在 |
| 2. 点击该外链 | 路由变为 `/go`，`u` 参数等于目标地址，页面显示正确域名 |
| 3. 点「回到上页」 | 回到同一篇文章，`window.scrollY` 与步骤 1 记录值相差 ≤ 2px |
| 4. 再次进入中转页，等待倒计时归零 | 自动跳转；随后 `history.back()` 直达文章 |
| 5. 白名单域名链接、`mailto:`、`#锚点`、站内链接 | 均不进入 `/go` |
| 5b. 把 `/link` 临时加入 `pages.exclude`，在该页点外链 | 不进入 `/go`；验完还原配置 |
| 6. 把 `countdown` 临时改为 `-1` | 不自动跳转，显示手动提示 |
| 7. 亮/暗模式 + 1080 / 768 / 528 断点 | 无横向滚动、无对比度问题 |
| 8. 带 `data-safego-ignore` 的链接 | 不进入 `/go` |
| 9. 附带 `javascript:` 目标的 `/go?u=javascript:alert(1)` | 显示失败态，不跳转 |

### 11.3 构建验收

- `pnpm lint` 通过。
- `pnpm generate` 成功，且产出的 `/go/index.html` 存在、HTML 中带 `noindex`。
- 构建产物的 `sitemap.xml` 不含 `/go`。

---

## 12. 交付物清单

| 文件 | 状态 | 说明 |
| --- | --- | --- |
| `app/types/safego.ts` | 新增 | 配置与目标的类型 |
| `app/data/safego.ts` | 新增 | 唯一配置入口 |
| `shared/utils/safego.ts` | 新增 | 纯函数判定层（零第三方依赖） |
| `app/plugins/safego.client.ts` | 新增 | 全局点击拦截器 |
| `app/layouts/safego.vue` | 新增 | 中转页专用极简布局 |
| `app/pages/go.vue` | 新增 | 中转页 |
| `scripts/safego/safego.test.ts` | 新增 | 纯函数回归用例 |
| `blog.config.ts` | 修改 | `article.robotsNotIndex` 追加 `'/go'` |
| `nuxt.config.ts` | 修改 | 顶层 `sitemap.exclude` 追加 `'/go'` |

---

## 13. 风险

| 风险 | 等级 | 应对 |
| --- | --- | --- |
| `/go` 预渲染与 `?u=` 查询参数导致水合不匹配 | 中 | §8.2 的 `onMounted` 门控；验收步骤必查控制台水合告警 |
| `shared/utils/safego.ts` 里的 `import type { … } from '~/types/safego'` 在 `node --test` 下无法解析别名 | 低 | 类型导入会被 Node 类型擦除，不产生运行时解析；若实测仍报错，则把类型定义下沉到 `shared/types/safego.ts` |
| 捕获阶段拦截误伤既有交互 | 低 | 已核实图片灯箱绑在 `<img>` 上；只处理 http(s) 绝对地址；提供 `data-safego-ignore` 与 `ignoreAttrs` |
| 中转页的 View Transition 与 `article-transition.client.ts` 冲突 | 低 | 该插件在找不到 `[data-transition-key]` 共享元素时直接提前返回；`/go` 不使用该属性 |
| 大量外链页面上监听器带来的性能开销 | 极低 | 单个 `document` 级委托监听，无逐元素绑定 |
