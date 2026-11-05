# 说说页新增 Ech0 数据源 —— 设计稿

- 日期：2026-11-04
- 状态：**已通过评审**（13 个问题的答复见文末 §9.1）
- 目标文件：`app/pages/memos.vue`、`blog.config.ts` 及其依赖链
- 分支建议：从当前 HEAD（`feat/pwa`，含 PWA/SW 改动）切出 `feat/memos-ech0`

---

## 1. 目标与验收标准

### 1.1 需求（来自用户原话，逐条拆解）

| # | 需求 | 验收方式 |
| --- | --- | --- |
| R1 | `blog.config.ts` 里可切换展示哪个数据源（现有 tg，新增 ech0） | 改 `memos.source` 后页面数据源随之切换，另一源代码不请求 |
| R2 | 正文渲染 HTML / Markdown | Ech0 的 `content`（Markdown 源码）被渲染成排版正确的 HTML（粗体、图片、列表、代码块、链接） |
| R3 | 扩展卡片 6 类：音乐 / 视频 / 网站 / GitHub / 推文 / 定位 | 6 个类型各自渲染成独立卡片，造型统一 |
| R4 | 音乐用已有的 meting 渲染 | 音乐卡片出封面/标题/歌手/可播放音频，音源来自 `blogConfig.music.meting.api` |
| R5 | 标签 | 卡片底部 chips，沿用现有 `.memos-tags` 样式 |
| R6 | 附件（音频 / 视频 / 图片 / 文件） | 映射到现有 `MemosMedia` 的图片网格 / video / audio / 文件列表 |
| R7 | 说说卡片沿用目前效果 | 头像、昵称、时间、已编辑、标签、评论按钮的 DOM 与 CSS 基本不动 |
| R8 | 评论按钮仍可点击引用并直达评论 | 点击 → 正文纯文本写入 Ecoku 输入框 + 滚动到 `#comments` |
| R9 | 不破坏已有功能（PWA 等） | `pnpm generate` 通过；SW 注册正常；`/api/memos/latest` 快照仍预渲染；离线兜底不变 |

### 1.2 非目标（本次不做）

- 不做 Ech0 的写操作（发说说、点赞、发评论）
- 不做说说详情页路由（`/memos/:id`）；只在卡片上提供指向 Ech0 原帖的外链
- 不做 Ech0 自带的评论列表渲染（评论区仍用本站 Ecoku）
- 不实现 Ech0 的 `layout`（waterfall/grid/carousel…）差异

---

## 2. 现状盘点（改动前的真实结构）

```
app/pages/memos.vue                 27 行，只有 banner + <MemosTimeline /> + <PostComment />
app/components/memos/
  MemosTimeline.vue                 278 行，骨架屏/空态/失败态/加载更多/切频道/可见性刷新
  MemosCard.vue                     309 行，卡片 DOM 与样式（头像/时间/正文/媒体/标签/评论按钮）
  MemosMedia.vue                    312 行，图片网格+灯箱、video、audio、文件列表
  MemosChannelSwitch.vue            tg 专用频道切换
app/composables/useMemos.ts         493 行，取数/分页/缓存/快照/静默刷新，**直接写死 koharu 契约**
app/types/memos.ts                  90 行，koharu 原始类型 + 视图模型
app/utils/meting.ts                 96 行，meting 适配（可直接复用）
app/composables/useMusicPlayer.ts   1063 行，悬浮播放器，暴露 playPlaylist(playlist, start)
app/composables/useReplyToComment.ts  引用到 Ecoku 输入框并滚动到 #comments
server/api/memos/latest.get.ts      构建期快照（抓 koharu 第一页 → 静态 JSON）
nuxt.config.ts                      routeRules 预渲染 /api/memos/latest；vite.server.proxy /koharu-api；head preconnect
app/sw.ts                           API_ORIGINS = NetworkOnly（含 tg-api 等 5 个域名）
blog.config.ts                      memos: { apiBase, channelIds, perPage, cacheTtl, ... }（tg 专用字段混在顶层）
```

**关键结论**：tg 的契约（`/api/v1/messages/latest` + cursor）已经渗透到 `useMemos.ts` 的每一行。要加第二个源，必须先把「取数」和「渲染」解耦，否则只能复制一份 493 行的 composable。

---

## 3. Ech0 接口事实（源码 + 线上实测，已核对版本一致）

> 源码：`E:\kmoretti-github\Ech0`（HEAD `086219b2`）
> 线上：`https://m.081531.xyz/`，`/api/hello` 返回 `commit:"086219b"` —— **与本地源码完全一致**，可直接以源码为准。

### 3.1 主时间线接口

```
POST https://m.081531.xyz/api/echo/query
Content-Type: application/json
{"page":1,"pageSize":20}          // page 从 1 开始；pageSize 上限 100，超出静默截断为 100

→ 200 {"code":1,"msg":"查询Echos成功","data":{"total":47,"items":[Echo, ...]}}
```

免鉴权（`optionalAuth`），匿名请求 **强制过滤 `private=true`**（服务层 `showPrivate=false`）。

### 3.2 Echo 结构（含 `omitempty` 的字段可能整块缺失）

```ts
type Echo = {
  id: string                 // UUIDv7
  content: string            // ★ Markdown 源码，不是 HTML
  username?: string
  echo_files?: EchoFile[]    // 附件，无则字段缺失
  layout?: string            // waterfall|grid|horizontal|carousel|stack|none
  private: boolean
  user_id: string
  extension?: EchoExtension
  tags?: Tag[]               // {id,name,usage_count,created_at}
  fav_count: number
  created_at: number         // ★ Unix 秒
}

type EchoFile = { id, echo_id, file_id, sort_order, file?: File }
type File = {
  id, key, storage_type, url,          // ★ url 可能是相对路径 "/api/files/images/xxx.png"
  name?, content_type?, size?, width?, height?, category?, created_at?
}
// ★ 没有 duration 字段，音视频时长只能播放器自己读
```

### 3.3 扩展卡片枚举（与需求 6 类完全对应）

| type | payload | 渲染要点（源自上游 Vue 实现） |
| --- | --- | --- |
| `MUSIC` | `{url}` 音乐**分享页** URL | 解析出 `{server,type,id}` → 再请求 meting（见 §5.4） |
| `VIDEO` | `{videoId}` | `BV` 前缀 → Bilibili iframe；否则 YouTube iframe |
| `GITHUBPROJ` | `{repoUrl}` | 仓库名/stars/fork/描述/头像靠**前端实时请求** `api.github.com` |
| `WEBSITE` | `{title,site}` | 标题 + 域名 |
| `LOCATION` | `{placeholder,latitude,longitude}` | 地名 + 坐标 + 地图 |
| `TWEET` | `{url,username,statusId}` | 上游加载 `platform.twitter.com/widgets.js` 渲染 |

### 3.4 已实测的其他事实

- **CORS 全放开**：反射任意 `Origin`，`OPTIONS` 预检 204 → **浏览器可直连，不需要开发代理**（这点比 tg 省事）
- **附件静态目录 `/api/files/**` 不带 CORS 头**（注册在 CORS 中间件之前）→ `<img>/<video>` 可用，`fetch()` 读字节不行
- `created_at` 是 **Unix 秒**，需 ×1000 转 `Date`
- 线上数据实况：47 条 echo，`GITHUBPROJ`×1、`WEBSITE`×1、`LOCATION`×1，**MUSIC/VIDEO/TWEET 三类为 0，附件为 0**（图片全是 Markdown 外链 CDN）→ **这三类与附件必须靠 mock 数据验收**
- `GET /api/settings` 公开返回 `meting_api: "https://meting.081531.xyz/api"`，与本站 `blogConfig.music.meting.api` 同一个实例
- meting 实测可用：`?server=netease&type=song&id=186016` → `[{title:"晴天",author:"周杰伦",pic:...,url:"http://meting.../type=url&id=186016",lrc:...}]`（`url` 是 http，需按本站 `metingForceHttps` 规则重建为 https）

---

## 4. 架构设计

### 4.1 分层

```
                    ┌────────────────────────────┐
                    │ app/pages/memos.vue         │  只负责 banner + 时间线 + 评论区
                    └────────────┬───────────────┘
                                 │
                    ┌────────────▼───────────────┐
                    │ MemosTimeline.vue           │  骨架/空态/失败/加载更多（源无关）
                    └────────────┬───────────────┘
                                 │ 统一视图模型 MemosMessage[]
        ┌────────────────────────┴────────────────────────┐
        │ useMemos()（门面，按 memos.source 选 adapter）    │
        └───────┬──────────────────────────────┬──────────┘
                │                              │
     useMemosTg()                      useMemosEch0()
   （迁移现有 493 行逻辑）            （新增：page 分页 + ech0 映射）
                │                              │
        koharu-suite API                 Ech0 API + meting + api.github.com
```

**要点**：`MemosTimeline` / `MemosCard` / `MemosMedia` **不知道数据源存在**，只吃统一的 `MemosMessage`。切换数据源只换 adapter。

### 4.2 统一视图模型（`app/types/memos.ts` 扩展）

```ts
export interface MemosMessage {
  id: string
  /** 站点侧来源标识，用于角标与跳转文案 */
  source: 'tg' | 'ech0'
  authorName?: string          // ech0 的 username / tg 的 channel.title
  authorHandle?: string        // @username
  publishedAt: string          // ISO（统一格式，供 UtilDate）
  revision?: number
  html: string                 // ★ 已渲染好的安全 HTML（两个 adapter 都产出 HTML）
  plainText?: string           // ★ 供「引用评论」与标签提取
  sourceUrl?: string           // 原帖链接
  media: MemosMedia[]          // 图片/视频/音频/文件（ech0 附件也映射到这里）
  tags: string[]
  extension?: MemosExtension   // 仅 ech0
  favCount?: number            // 仅 ech0
}

export type MemosExtension =
  | { type: 'music', url: string }
  | { type: 'video', videoId: string }
  | { type: 'github', repoUrl: string }
  | { type: 'website', title: string; site: string }
  | { type: 'location', placeholder: string; latitude: number; longitude: number }
  | { type: 'tweet', url: string; username: string; statusId: string }
```

> 之所以让 adapter 输出 `html` 而不是原始 markdown：`MemosCard` 现在就是 `v-html="message.html"`，保持不变即可同时服务两个源。tg 的 adapter 直接用 API 给的 `html`（现状），ech0 的 adapter 用 markdown-it 现渲染。

### 4.3 配置结构（建议重构，见 Q1）

```ts
memos: {
  /** 数据源：'tg' 走 koharu-suite；'ech0' 走自部署 Ech0 */
  source: 'ech0' as 'tg' | 'ech0',

  // ↓ 两源共用
  perPage: 20,
  cacheTtl: 2 * 60 * 1000,
  refreshInterval: 2 * 60 * 1000,
  requestTimeout: 15 * 1000,
  avatar: '',
  nickname: '',
  banner: { ... },

  /** tg 数据源 */
  tg: {
    apiBase: 'https://tg-api.518339.xyz',
    channelIds: [] as string[],
  },

  /** ech0 数据源 */
  ech0: {
    /** 实例地址，末尾不加 / */
    apiBase: 'https://m.081531.xyz',
    /** 卡片右上角「查看原帖」跳转，留空则由 apiBase 推导 */
    siteUrl: '',
    /** GitHub 扩展卡是否实时拉仓库信息（否则只显示 owner/repo 静态卡） */
    githubLive: true,
    /** 推文卡：'static' 纯静态 / 'embed' 加载 widgets.js */
    tweetMode: 'static' as 'static' | 'embed',
    /** 定位卡是否允许展开 OSM 地图 */
    locationMap: true,
  },
}
```

兼容处理：代码里 `const tgConfig = config.tg ?? { apiBase: config.apiBase, channelIds: config.channelIds }`，避免老配置直接炸。

---

## 5. 详细方案

### 5.1 数据源分发（`app/composables/useMemos.ts`）

把现有文件拆成三个：

- `app/composables/useMemos.ts` —— **门面**：读 `memos.source`，`const adapter = source === 'ech0' ? useMemosEch0() : useMemosTg()`，原样转出 `{ messages, loaded, pending, failed, stale, hasMore, init, loadMore, retry, refresh, channels, activeChannel, showChannelSwitch, switchChannel }`。tg 之外的源里 `channels=[]`、`showChannelSwitch=false`。
- `app/composables/memos/useMemosTg.ts` —— 现有 493 行**原样搬过去**（只改 import 与 `apiBase` 取值来源）。
- `app/composables/memos/useMemosEch0.ts` —— 新增，结构对齐 tg 版（缓存/静默刷新/重试逻辑照抄，分页改 page）。

分页差异封装在 adapter 内部：
| | tg | ech0 |
| --- | --- | --- |
| 首页 | `GET /api/v1/messages/latest?limit&channel` | `POST /api/echo/query {page:1,pageSize}` |
| 翻页 | `?cursor=` | `{page: n+1}` |
| 到底 | `nextCursor == null` | `items.length === 0 \|\| 已加载数 >= total` |
| 频道 | 有 | 无（`showChannelSwitch=false`） |

`loadMore()` / `hasMore` / 失败重试 / 切回页面静默刷新 **对外行为完全不变**。

### 5.2 正文 Markdown 渲染

新增 `app/utils/memos/markdown.ts`（懒加载，不进首屏 bundle）：

```ts
// 与 Ech0 前端同款配置：html:false 是安全底线
const md = markdownit({ html: false, linkify: true, breaks: true })
```

自定义规则：
1. `link_open` → `target="_blank" rel="noopener noreferrer nofollow"`
2. `image` → `loading="lazy" decoding="async"`，`src` 以 `/` 开头时拼 `apiBase`（ech0 相对路径兜底）
3. `code_inline` / `fence` / `pre` → 复用现有 `--font-monospace` 变量与 `article.css` 里的代码块底色（**不做语法高亮**，见 Q13）
4. 渲染后不出 `<script>`（`html:false` 已保证裸 HTML 被转义；markdown-it 自带 `validateLink` 拦 `javascript:`）

配套 `app/utils/memos/plain.ts`：`markdownToPlainText(md)` —— 去 `**`、`[]()`、`#`、`>`、代码围栏、图片，供「引用评论」使用。

### 5.3 扩展卡片组件树

```
app/components/memos/          # 与 MemosCard 平铺同级（Nuxt 会按目录名去重前缀，
                               #  故 MemosExtMusic.vue → <MemosExtMusic />）
  MemosExtensionCard.vue      分发器：按 message.extension.type 懒加载子卡
  MemosExtShell.vue           统一外壳：左侧图标 + 标签文案 + 右侧「前往 ↗」，
                              且**统一做 href 协议白名单**（payload 来自接口，见 §5.11）
  MemosExtMusic.vue           （异步加载，含 meting 请求）
  MemosExtVideo.vue           Bilibili / YouTube iframe + 外链兜底
  MemosExtGithub.vue          owner/repo、描述、stars、forks、头像
  MemosExtWebsite.vue         title + hostname
  MemosExtTweet.vue           静态卡（@handle + 打开原推）
  MemosExtLocation.vue        地名 + 坐标 + 按需展开 OSM iframe
```

> 实施时未拆 `extension/` 子目录：子目录会让自动组件名变成
> `MemosExtensionMemosExtMusic` 这类冗长名字，平铺 + `MemosExt` 前缀更省事且与
> `MemosCard.vue` 的前缀去重规则一致。

`MemosExtensionCard` 用 `defineAsyncComponent` 引入，保证 tg 源与无扩展卡片的页面零额外体积。

统一视觉：外壳 `border-radius: 0.5em`、`--c-flat-card-bg-2` 背景、`1px --c-flat-card-border`，与卡片本体的扁平风格一致（不引入新色板）。

### 5.4 音乐卡片（R4 核心）

```
payload.url（分享页）
   │ parseMusicUrl()  ← 移植 Ech0 的 parseMusicURL 规则（netease / qq / apple）
   ▼
{server:'netease'|'tencent', type:'song'|'playlist', id}
   │
   ├─ 元信息：GET {metingApi}?server&type=song&id=<random>  → [{title,author,pic,url,lrc}]
   └─ 播放地址：metingApiUrl(metingApi,{server,type:'url',id})  ← 复用 app/utils/meting.ts，避免 http 混流
   ▼
卡片 UI：封面 + 标题/歌手 + 播放/暂停 + 进度条（**只做卡片内联播放器**，不联动悬浮播放器）
```

- meting 地址取 `blogConfig.music.meting.api`（**不是** ech0 的 `/api/settings`，本站已有配置，且两者是同一实例）
- 播放器自绘一条极简控制条（封面 56px、标题/歌手单行省略、播放键、进度条；`<audio>` 本体隐藏），进度与时长用 `timeupdate` / `loadedmetadata` 自己维护，不依赖 `useMusicPlayer`
- 同一页面上多张音乐卡互斥播放（播放 A 时暂停 B）
- 解析失败 / meting 无结果 → 降级为「打开音乐页」外链卡，不报错
- Apple Music 链接 meting 不支持 → 见 Q4

### 5.5 其余 5 类卡片

| 卡片 | 数据来源 | 降级 |
| --- | --- | --- |
| Video | `videoId` 前缀判定 provider，iframe `aspect-ratio:16/9` | iframe 被墙/失败 → 保留标题栏「前往观看」链接 |
| GitHub | `api.github.com/repos/{owner}/{repo}`，`localStorage` 缓存 24h，同 URL 并发去重 | 失败 → 只显示 `owner/repo` + 图标（不显示 stars） |
| Website | payload 自带 title/site | `site` 非法 URL → 原样显示文本、不可点 |
| Tweet | payload 自带 username/url | 恒为可点外链（见 Q5） |
| Location | payload 自带地名与坐标 | 地图展开失败 → 只留坐标文本与外部地图链接 |

所有外部请求统一 `AbortController` + 超时（复用 `memos.requestTimeout`），且**懒加载**（`IntersectionObserver` / 组件异步）避免首屏打一堆第三方请求。

### 5.6 标签（R5）

- `echo.tags[].name` → 现有 `.memos-tags` chips（`#` 图标 + 文本），与 tg 的 `#话题` 外观一致
- 正文里的裸 `#吐槽` 是否剥离见 Q9（推荐沿用 `stripMemosTags`，避免正文与底部重复）

### 5.7 附件（R6）

`echo_files[].file` → `MemosMedia[]`：

| `file.category` / `content_type` | MemosMedia.kind | 渲染 |
| --- | --- | --- |
| `image` / `image/*` | image | 现有网格 + 灯箱（单图通栏、双图两列、其余三列，`width/height` 定宽高比） |
| `video` / `video/*` | video | `<video controls playsinline preload=metadata>` |
| `audio` / `audio/*` | audio | 现有 audio 条（时长由 `loadedmetadata` 读） |
| 其他 | document | 文件名 + 体积 + 下载/新窗口 |

- `url` 为相对路径时拼 `apiBase`；`storage_type=external` 时是绝对外链
- `status` 恒为 `ready`（Ech0 没有 transcode 概念）
- 忽略 `layout` 字段（Q9 一并确认）

### 5.8 卡片外观与评论按钮（R7 / R8）

`MemosCard.vue` 增量改动（**结构不动**）：

1. `<article :id="'memo-' + message.id">` —— 便于站内/外部分享定位
2. 右上跳转图标：tg 用 `tabler:brand-telegram`（现状）；ech0 用 `tabler:external-link`，`to = ech0.siteUrl + /echo/{id}`，`v-tip="在 Ech0 中查看原帖"`
3. `verifiedTip` 文案按源生成（tg：「这个说说来自博客作者本人的 Telegram 频道」；ech0：「这个说说来自博客作者本人的 Ech0」）
4. `channelLabel`：tg 走 channel；ech0 走 `@username`，没有则留空
5. 正文下方插入 `<MemosExtensionCard v-if="message.extension" :extension>`（在 media 之上，与 Ech0 详情页一致）
6. 底部保留标签 + 评论按钮；`onReply()` 的 `quoteText` 改用 `message.plainText`（ech0 由 markdown 剥出）
7. `favCount > 0` 时在标签行右侧加一个极小的心形计数（可选，见 Q10）

评论跳转逻辑 `useReplyToComment.ts` **一行不改**（已经是 `#comments` + Ecoku 选择器的通用实现）。

### 5.9 取数缓存 / 快照 / PWA（R9 关键）

| 项 | 改动 |
| --- | --- |
| localStorage 缓存 | key 从 `memos:first-page:v1:<id>` 升到 `v2:<source>:<id>`（tg：`v2:tg:<channelId>`，ech0：`v2:ech0`），避免换源后读到别家的数据 |
| 构建期快照 | `server/api/memos/latest.get.ts` 按 `memos.source` 分支；ech0 分支抓 `POST /api/echo/query {page:1}` → **仍输出 `{items,total}` 形态**（统一由 adapter 归一），失败返回空壳，客户端自动直连 |
| routeRules | `/api/memos/latest` 预渲染与头不变 |
| `app/sw.ts` | `API_ORIGINS` 增加 ech0 origin（NetworkOnly）；**ech0 附件不缓存**（跨域大文件、无 CORS 头，且离线读说说本就走 localStorage 首屏） |
| `nuxt.config.ts` head | `preconnect` 按 `source` 注入：tg → koharu origin；ech0 → ech0 origin（不两个都注入） |
| `nuxt.config.ts` vite proxy | `/koharu-api` 保留（仅 tg 用到）；**ech0 不需要代理**（CORS 实测开放） |
| `app/pages/memos.vue` | `useSeoMeta` description 按源生成，不再写死「Telegram 频道」 |

### 5.10 开发期 mock（验收 MUSIC / VIDEO / TWEET / 附件唯一手段）

线上 47 条数据里这四类全为 0，必须自带造数据能力：

- `app/data/memos-ech0-mock.ts`（**仅被 dev 分支引用**，`import.meta.dev` 守卫 + 动态 `import()`，生产构建不进 bundle）
- 触发方式：URL 带 `?memos-mock=1`（Q12）
- 覆盖：1 条纯长文（含标题/列表/代码块/表格/外链图片）、1 条音乐（`https://music.163.com/#/song?id=186016`）、1 条视频（`BV1xx411c7mD`）、1 条推文、1 条定位、1 条 GitHub、1 条网站、1 条多附件（图/音/视频/zip）

---

## 6. 文件级改动清单

**新增**

| 文件 | 作用 |
| --- | --- |
| `app/types/memos-ech0.ts` | Ech0 原始响应类型 |
| `app/utils/memos/ech0.ts` | 原始 → `MemosMessage` 映射（纯函数） |
| `app/utils/memos/markdown.ts` | markdown-it 实例与渲染规则 |
| `app/utils/memos/plain.ts` | markdown → 纯文本 |
| `app/utils/memos/music.ts` | 音乐分享页 URL 解析 |
| `app/utils/memos/*.test.ts` | 上面 3 个纯函数的 `node --test` 单测 |
| `app/composables/memos/useMemosTg.ts` | 现有 tg 逻辑迁入 |
| `app/composables/memos/useMemosEch0.ts` | ech0 取数 adapter |
| `app/components/memos/extension/*`（7 个 vue） | 扩展卡片 |
| `app/data/memos-ech0-mock.ts` | dev mock 数据 |

**修改**

| 文件 | 改动 |
| --- | --- |
| `blog.config.ts` | `memos.source` + `memos.tg` + `memos.ech0`（见 §4.3） |
| `app/types/memos.ts` | 扩展视图模型（`source`/`extension`/`favCount`/`authorHandle`） |
| `app/composables/useMemos.ts` | 退化为门面分发 |
| `app/components/memos/MemosCard.vue` | 锚点、跳转图标、来源角标、扩展卡插槽、favCount |
| `app/pages/memos.vue` | SEO 文案按源生成 |
| `server/api/memos/latest.get.ts` | 按源分支 |
| `app/sw.ts` | `API_ORIGINS` 增 ech0 |
| `nuxt.config.ts` | preconnect 按源；channel 说明 |
| `AGENTS.md` | 补一节「说说数据源（tg / ech0）」维护说明 |

**依赖**：新增 `markdown-it`（v15 **自带类型**，无需 `@types/markdown-it`），放入 `pnpm-workspace.yaml` 的 `content` catalog。体积约 40KB gzip，且**懒加载**。

---

## 6.5 URL 安全约定（评审后补，实现中已落地）

Ech0 的 `extension.payload` 是服务端自由 JSON，前端绑定 `:href` 时**没有第二道防线**：
Vue 的 `@vue/runtime-dom` 不做 href 协议净化（`javascript:` 黑名单只存在于 compiler-dom
对模板**字面量**的检查里，对 `:href` **绑定无效**）。因此：

| 位置 | 规则 |
| --- | --- |
| `app/utils/memos/url.ts` | `safeHttpUrl()` 只放行 http/https；`safeGithubRepoUrl()` 再加 `github.com` 的 `owner/repo` 白名单；`resolveAssetUrl()` 统一附件与正文图片的相对路径拼接 |
| `MemosExtShell.vue` | 右上「前往」链接统一过 `safeHttpUrl`，非法地址**不渲染链接** |
| `MemosExtGithub.vue` / `MemosExtTweet.vue` | 卡内的 `<a>` 同样走白名单；非法时退化成不可点的纯文本卡 |
| Markdown 正文 | 由 `markdown-it` 的 `validateLink` 兜底（实测 `javascript:` / `JAVASCRIPT:` / `&#106;avascript:` 均被拒绝） |

`url.test.ts` 覆盖 11 条用例锁住这些行为（含 `data:` / `vbscript:` / `file:` / 协议相对地址）。

**渲染器实例**：`loadMemosMarkdownRenderer()` 从「模块级单例」改为「按配置 key 缓存」
（`apiBase` + `externalLinks`）。原因：`md.renderer.rules` 是**对象级**改写，单例意味着
「拉一次配置就永久生效」，以后任何新增调用方都会被前一个调用方的规则静默影响。

---

## 7. 验证方案

### 7.1 自动化

- `node --test "app/utils/memos/*.test.ts"`：ech0 映射（含 `omitempty` 缺字段、相对 URL、6 种扩展、附件分类）、音乐 URL 解析（网易云 song/playlist、QQ、Apple、非法）、markdown→纯文本
- `pnpm lint`
- `pnpm generate`：必须成功；检查 `dist/api/memos/latest`（或 `.output/public/api/memos/latest`）内容非空

### 7.2 浏览器验收（本地 `http://localhost:3000`，Ecoku Origin 白名单只放行这个 host）

用 browser-skill 在 Agent Window 实测：

1. `?memos-mock=1` 下 8 张卡片类型齐全，扩展卡片各自的跳转/展开/播放可用
2. 真实 ech0 源（不带 mock）：47 条中前 20 条渲染，正文 Markdown（粗体/图片/链接）正常，标签 chips 正确
3. 音乐卡：封面/标题/歌手出图，点击播放有声音，「加入播放列表」后悬浮播放器切换成功
4. 附件卡：图片灯箱可放大、视频可播、音频可播、文件可下载
5. 评论按钮：点击后滚动到 `#comments` 且 Ecoku 输入框出现 `> 引用的纯文本`
6. 加载更多 / 到底提示 / 首屏骨架 / 断网失败态
7. 移动端 375px 宽度下扩展卡片不溢出
8. PWA：`/sw.js` 注册成功、`manifest.webmanifest` 正常、`/api/memos/latest` 命中预渲染、离线打开 `/memos` 仍出首屏缓存

### 7.3 回归

- 把 `memos.source` 切回 `'tg'`，确认 tg 源与改动前行为一致（6 张卡、频道切换、cursor 分页）
- `pnpm build` 不报错

---

## 8. 风险与已知限制

| 风险 | 影响 | 应对 |
| --- | --- | --- |
| meting 无 cookie 只给 128k/可能试听 | 部分 VIP 歌只能试听 | 与现有音乐播放器同一限制，文案提示「跳转音乐页」 |
| `api.github.com` 匿名限流 60 次/小时/IP | stars 不显示 | localStorage 24h 缓存 + 失败降级静态 |
| YouTube / widgets.js 国内不可达 | 视频/推文内容空白 | 结构上先渲染外链兜底，iframe 仅作增强 |
| 附件静态目录无 CORS | 无法 fetch 读字节 | 只用 `<img>/<video>/<audio>` 标签 |
| ech0 数据无附件/音乐/视频/推文样例 | 无法真实回归这 4 类 | dev mock + 单测覆盖映射 |
| 配置结构重构 | 下游 fork 若不改配置会报错 | 代码保留 `config.tg ?? config.apiBase` 兼容读取 |

---

## 9. 待确认问题（每条带推荐答案）

> 标 ★ 的是会改变代码结构的决策，其余是交互细节。

**Q1 ★ 配置结构**：把现在混在 `memos` 顶层的 tg 字段收进 `memos.tg`，新增 `memos.ech0`，用 `memos.source` 切换？
→ 推荐：**是**（重构，代码内保留旧字段兼容读取）。

**Q2 ★ 数据源数量**：`source` 只允许单选（tg / ech0 二选一），还是允许两个源合并成一条时间线？
→ 推荐：**单选**。合并需要两套分页游标 + 时间排序，复杂度和出错面都翻倍，收益不明显。

**Q3 ★ 音乐卡片交互**：卡片内联播放器（封面+进度条+播放键）是否够？还是只要一个「加入悬浮播放器」按钮？
→ 推荐：**内联播放 + 「加入播放列表」按钮**（内联满足即点即听，按钮复用你已有的 meting 渲染链路）。

**Q4 Apple Music 链接**：meting 不支持 Apple。降级成外链卡片，还是像 Ech0 一样嵌 `embed.music.apple.com` iframe？
→ 推荐：**外链卡片**（国内可达性不确定，iframe 白屏时用户不知道发生了什么）；可加配置开关。

**Q5 ★ 推文卡片**：加载官方 `widgets.js` 渲染成真推文（国内多半加载失败），还是纯静态卡（头像位 + @用户名 + 「打开原推」）？
→ 推荐：**纯静态卡**，配置 `tweetMode: 'embed'` 可切换。

**Q6 ★ GitHub 卡片**：实时请求 `api.github.com` 拿 star/fork/描述（有 60/h 限流），还是纯静态显示 `owner/repo`？
→ 推荐：**实时 + 24h localStorage 缓存 + 失败降级**。

**Q7 定位卡片**：地名+坐标文本，点击展开 OpenStreetMap iframe；还是只给文本 + 「在地图中打开」外链？
→ 推荐：**文本 + 按需展开 OSM iframe**（零依赖、不加载第三方 SDK）。

**Q8 ★ 评论**：保持现状（只用本站 Ecoku，按钮=引用+跳转），还是额外显示 Ech0 自己的评论数/评论列表？
→ 推荐：**保持现状**（完全符合你说的「评论按钮依旧可以点击引用并直达评论」）；若想在卡片上显示 ech0 评论数，每条卡片要多打一次接口，不建议。

**Q9 正文 `#标签`**：ech0 的正文里 `#吐槽` 是普通文本，而结构化标签在 `tags` 字段里。是否像 tg 那样把正文里的裸标签**剥掉**（避免与底部 chips 重复）？同时 `layout` 字段忽略？
→ 推荐：**剥掉 + 忽略 layout**。

**Q10 点赞数**：`fav_count` 是否显示在卡片底部？
→ 推荐：**显示**（>0 时才显示，一个心形 + 数字，弱化处理）。

**Q11 原帖入口**：卡片右上角加「在 Ech0 中查看原帖」（跳 `{ech0.siteUrl}/echo/{id}`），并给卡片加 `id="memo-{id}"` 锚点便于分享定位？
→ 推荐：**都加**。

**Q12 mock 触发**：`?memos-mock=1`（仅 dev 生效、生产 tree-shaking 掉）可以吗？还是你希望有个更明确的开关位置（比如 `blog.config.ts` 的 `memos.ech0.mock: true`）？
→ 推荐：**`?memos-mock=1`**，不污染配置文件。

**Q13 代码块高亮**：说说正文里的代码块是否要语法高亮？做的话需要按需加载 shiki（约 300KB+）。
→ 推荐：**不做**，用等宽字体 + `article.css` 已有的 `pre` 底色，视觉够用且零体积代价。

### 9.1 评审结论（2026-11-04，作者确认）

| # | 结论 |
| --- | --- |
| Q1 | **重构**：`memos.source` + `memos.tg` + `memos.ech0`，代码内兼容旧字段 |
| Q2 | **单选**：`source: 'tg' \| 'ech0'` |
| Q3 | **只做卡片内联播放器**：说说卡片里渲染一个音乐播放器，播放 meting 解析出的数据即可，不与悬浮播放器联动 |
| Q4 | 按推荐：Apple Music → 外链卡片（`tweetMode` 同级的开关预留，默认 off） |
| Q5 | **纯静态推文卡**（`tweetMode: 'static'` 默认，可切 `'embed'`） |
| Q6 | **实时请求 GitHub + 24h 缓存 + 失败降级静态** |
| Q7 | 按推荐：地名+坐标文本，**按需展开 OSM iframe** |
| Q8 | **保持现状**：只用本站 Ecoku，评论按钮=引用正文+滚动到 `#comments` |
| Q9 | **剥掉正文裸标签 + 忽略 `layout`** |
| Q10 | 按推荐：`fav_count > 0` 时显示心形计数 |
| Q11 | 按推荐：卡片右上「在 Ech0 中查看原帖」+ `id="memo-{id}"` 锚点 |
| Q12 | 按推荐：`?memos-mock=1`（仅 dev 生效，生产 tree-shaking 掉） |
| Q13 | 按推荐：**不做语法高亮** |
