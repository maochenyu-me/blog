# 喵洛阁 App（Tauri v2 多端）设计方案

- 日期：2026-11-03
- 工程：`E:\github_maochenyu_me\blog\blog`（Nuxt 4.5.2 + Nuxt Content 3 + 纯静态 SSG）
- 参考实例：`https://2x.nz/` 的 AcoFork App（已实测确认为 Tauri v2，产物含 `assets/tauri.conf.json` schema v2 + `lib/*/libacofork_shell.so`）
- 状态：**待用户评审**（本文件通过评审前不写任何实现代码）

---

## 1. 背景与目标

本站是纯静态 SSG 博客（`pnpm generate` → `.output/public`，nitro preset `static`，388 个文件 / 约 11 MB），已部署到 Cloudflare Pages。目标是给它套一层 **Tauri v2** 外壳，产出 Windows / macOS / Linux / Android / iOS 五端安装包。

选 Tauri 而不是 Electron 的理由不是偏好，而是本站的性质：内容全是静态文件，Tauri 用系统 WebView（Windows 上是 WebView2）就能完整承载，且**不需要内嵌浏览器内核**——参考实例的 Windows 安装包只有 4.9 MB，而 Electron 同功能通常 60–150 MB。

### 目标

1. **离线优先**：内容编译期内嵌进 app，首次启动、断网状态都能正常阅读，零网络等待。
2. **内容热更新**：发新文章不需要重新发版发安装包。启动后异步比对构建指纹，有新版则下载内容包、校验、切换。
3. **五端可交付**：桌面三端由 CI 出安装包；Android 出可直接装真机的 debug APK；iOS 出未签名 IPA（无 Apple 账号，只能由用户侧重签安装）。
4. **不污染主题**：本项目是被大量下游 fork 的开源主题，app 相关代码全部集中在独立目录并由配置开关控制，关掉即完全退出构建。
5. **失败可回滚**：内容包损坏、解压失败、新版本加载不了，都必须能自动退回上一版，绝不能出现"更新后打不开"。

### 非目标

- **不做应用本体（binary）自动更新**：Tauri 官方 updater 需要签名密钥与更新源签名链路，v1 不做。app 本体的升级仍靠重新下载安装包。
- **不接应用商店**：不上架 Google Play / App Store（无开发者账号、无签名证书）。iOS 只产未签名 IPA。
- **不改站点的视觉与信息架构**：app 就是站点本身，不另做原生导航。只新增 app 场景必需的轻量 UI（离线态、更新提示、错误页）。
- **不引入 Service Worker / PWA 离线能力**：Android WebView 上 SW 不可用是已确认现象，iOS 上需 App-Bound Domains，不做依赖。
- **不做 macOS 公证（notarization）**：无 Apple 开发者账号。

---

## 2. 术语

| 术语 | 含义 |
| --- | --- |
| 内容包 | 一份 Nuxt 静态产物（`.output/public`）的 zip + 清单，用于热更新 |
| 构建指纹 `build` | 内容包的版本标识（内容哈希），app 用它判断是否需要更新 |
| 内嵌资源 | 编译期打进二进制的 Nuxt 产物（`frontendDist`） |
| web 根 | 当前实际服务给 WebView 的目录：下载的内容包目录，或回退到内嵌资源 |
| 自定义协议 | Tauri 注册的 `app://` 类协议，取代 file:// 来服务静态资源 |
| 内容更新器 | Rust 侧负责检查/下载/校验/解压/切换/回滚的模块 |

---

## 3. 成功标准（可验收）

| # | 标准 | 验证方式 |
| --- | --- | --- |
| S1 | 断网启动 Windows 客户端，首页、文章页、归档页、搜索全部可用，无白屏 | 本机断网实测 |
| S2 | 客户端内站内跳转不触发整页重载（Nuxt 客户端路由生效），`_payload.json` 预取无报错 | 实测 + DevTools Console 无 error |
| S3 | 发布新文章并重新部署后，客户端启动能检测到 `build` 变化，提示「有新内容」 | 改内容 → 部署 → 启动客户端 |
| S4 | 点击更新后下载内容包、校验通过、切换、重载，新文章可见；旧版本目录保留 | 实测 + 检查 `appData` 目录 |
| S5 | 内容包被篡改（改一个字节）时**拒绝应用**并保留当前版本，给出明确错误文案 | 手工改 zip 后实测 |
| S6 | 新内容包解压后缺少 `index.html` 时不切换，自动回滚到上一版 | 构造坏包实测 |
| S7 | 闭网时点「检查更新」不报错、不弹失败弹窗，静默保持当前内容 | 断网实测 |
| S8 | 外链（`https://github.com/...`）点击后在**系统浏览器**打开，不在 WebView 内跳走 | 实测 |
| S9 | 亮/暗主题下离线条、更新条、错误页均无对比度或溢出问题；528 / 768 / 1080 断点无横向滚动 | 截图 |
| S10 | Android debug APK 装真机可启动、可阅读、可热更新 | 真机实测（用户提供设备） |
| S11 | iOS 由 CI 产出未签名 IPA（不验安装可用性，只验构建成功 + 产物存在） | CI artifact |
| S12 | `app.enable = false` 时 `pnpm generate` 与现有部署流程行为完全不变，站点产物无 app 相关新增文件 | 关开关后 generate + diff |
| S13 | `pnpm lint` 通过；Nuxt 侧 app 组件在浏览器 `localhost:3000` 下不渲染任何 app-only 元素 | 命令行 + 浏览器 |
| S14 | 内容包 zip 不包含 `app-dist/` 自身（无自引用膨胀），体积与文件数符合预期 | 检查生成物 |
| S15 | CI 的 `cargo check` job 单独存在且先跑，能在数分钟内给出编译结果 | CI 运行记录 |

---

## 4. 关键决策（含被排除的方案）

### D1 用「自定义协议 + 可切换 web 根」，不用 localhost 插件，不依靠改 `frontendDist`

Tauri 的 `frontendDist` 是**编译期**量，运行时改不了；把新内容塞进去只能重新编译。官方 config schema 明确 `frontendDist` 可以是「自定义协议 URL 或远程 URL」，但那是启动地址而非内容源。

做法：注册自定义协议（暂定 scheme `app`），协议处理器在每次请求时解析 web 根：
1. `<appData>/web/<activeBuild>/`（已下载的内容包，若存在且含 `index.html`）
2. 否则回退到内嵌资源（`app.asset_resolver().get(path)`）

**排除 `tauri-plugin-localhost`**：官方 README 自述「brings considerable security risks and you should only use it if you know what you are doing. If in doubt, use the default custom protocol implementation」，且其示例代码仍是 v1 API（`WindowUrl`），crates 版本停留在 `2.0.0-alpha`。

**排除「纯远程壳」**（webview 直接加载线上站点）：违背离线优先目标；且那样本质是浏览器窗口。

**平台 origin 差异（已核实，非推断）**：官方 schema 的 `useHttpsScheme` 字段说明——自定义协议在 **Windows 与 Android** 上是 `http(s)://<scheme>.localhost`，在 macOS / Linux / iOS 上是 `<scheme>://localhost`。因此 Windows/Android 是真正的 http origin，`fetch`、`localStorage`、CSP 行为与普通网页一致；macOS/Linux/iOS 是自定义 scheme origin。这一差异要求**路径解析必须用绝对路径**，不能依赖相对 base。

### D2 内容包整包下载（v1），但清单从第一天就按增量设计

- v1：发现 `build` 不同 → 下载整包（压缩后约 3–4 MB）→ 校验 → 解压 → 切换。
- 清单格式 `{ build, generatedAt, files: { "<path>": "<sha256>" } }`，**逐文件哈希从第一天就写入**，将来升级成「只下载差异文件」时协议不用改。

代价诚实说明：每次内容更新都要下 3–4 MB。可接受的理由是更新频率低（发文章才触发），且桌面端几乎不感知。

### D3 网络请求放在前端 JS，Rust 只做落盘与切换

理由很实际：**本机装不了 Rust，我无法在本地捕获编译错误**（用户选择 Q7=B：不装环境，全靠 CI 构建）。因此要尽一切努力压低 Rust 侧面积与依赖数量。

- JS 侧用普通 `fetch` 拿 `manifest.json` 和 zip（走 WebView 网络栈，顺带免费获得本机代理支持）。
- Rust 侧只暴露四个命令：`content_status`、`content_check`、`content_apply`、`content_rollback`，外加协议处理器。
- 下载与解压仍在 Rust 侧用 `reqwest`(rustls) + `zip` + `sha2`，避免把 3–4 MB 二进制经 IPC 传进 Rust（Tauri v2 的 IPC 默认走 JSON，大二进制会 base64 膨胀）。

### D4 内容包只在部署链路生成，不进 app 二进制

两个链路共用一个 `pnpm generate`，但目的不同：

- **app 构建链路**：`frontendDist` = `../.output/public`，此时**没有** `app-dist/`，二进制干净。
- **站点部署链路**：generate 之后再跑 `scripts/app/gen-content-bundle.ts`，把 zip + manifest 写进 `.output/public/app-dist/`，随站点一起部署。

必须用**显式独立步骤**而不是 Nuxt 构建钩子或 `postgenerate`：pnpm 默认不执行 `pre`/`post` 生命周期脚本，指望 `postgenerate` 会静默失效。

**已实测的坑**：`dist` 目录在本仓库**未被 git 跟踪**，只是本地软链接 `dist -> .output/public`。所以官方 Nuxt 集成文档写的 `frontendDist: "../dist"` 在 CI 上必然不存在，必须写 `../.output/public`。

### D5 内容包生成时必须排除 `app-dist/` 自身

zip 的输出目录若位于被压缩目录内部，会把正在写入的 zip 打进去，造成自引用膨胀甚至无限增长。脚本必须显式排除 `app-dist/`。（对应验收 S14）

### D6 图标：体素头为主图标，按平台分层输出

用户选定「体素头」方案（银白发盖 + 黑脸 + 红眼 + 红领，日落橙金渐变底），基于 `public/img/avatar/avatar.webp` 重绘。

三个刻意的设计决定：

1. **不用「近黑底 + 单一高饱和强调色」**——那是当下生成式设计的头号套路。这里用原图自带的日落橙金渐变作底，是忠于素材而非套模板。
2. **图标不绑定站点主色**：`--c-primary` 是用户可切换的（`app/assets/css/color.css` 里 `--c-primary-h/s/l`），绑上去会在用户换主题色时产生冲突。
3. **桌面图标带透明留白 + 圆角方形**：macOS 不会自动给 `.icns` 加圆角（需要开发者自己烘焙），Windows 任务栏则直接显示原图。用一个「圆角方形 + 约 10% 透明留白」的 1024 源图，三端都体面。

`tauri icon` 支持 **JSON manifest 输入**（这是官方支持但文档几乎没提的能力），正好用来做 Android 自适应图标的三层：

```json
{
  "default": "app-icon.png",
  "bg_color": "#F2893C",
  "android_bg": "app-icon-android-bg.png",
  "android_fg": "app-icon-android-fg.png",
  "android_fg_scale": 85,
  "android_monochrome": "app-icon-android-mono.png"
}
```

- `default`：桌面用（圆角方形 + 留白）
- `android_bg`：日落渐变铺满
- `android_fg`：头部主体居中，占画布约 62%（自适应图标安全区是 108dp 里的 66dp）
- `android_monochrome`：单色剪影，供 Android 13+ 主题图标
- `bg_color`：iOS 图标必须不透明，用它压平背景

**顺序约束**：`tauri icon` 会把移动端图标直接写进 `gen/` 工程，所以必须**先** `tauri android init` / `tauri ios init` **再**跑 `tauri icon`，否则移动图标只落到兜底目录、进不了安装包。

生成的图源由 `scripts/app/gen-icons.ts` 用 `sharp`（已在依赖树中，v0.35.4）从 SVG 光栅化，矢量源进仓库、位图产物进 `src-tauri/icons/`。

**不要传 `-p/--png <sizes>`**：源码里一旦给了自定义尺寸就只输出这些 PNG，`icns`/`ico`/Android/iOS 全部跳过。

### D7 Tauri 身份字段以 `tauri.conf.json` 为准，不做 codegen

`identifier`（`top.kemeow.blog`）与 `productName`（`喵洛阁`）留在 `src-tauri/tauri.conf.json`。不为了"单一配置源"去从 `blog.config.ts` 生成 JSON：Tauri 不读 TS，凭空多一条"生成失败 → 构建失败"的失败路径，而我们恰恰无法本地编译验证。

`blog.config.ts` 的 `app` 段只承载**行为开关**：总开关、更新源、静默策略、检查时机。文档里两处互相注明，避免各改一半。

### D8 前端不新增任何产品级依赖

app 相关 UI（离线条、更新条、错误页）用现有 Vue + 现有 CSS 变量实现，不引入 UI 库、不引入状态库。理由：主题是被 fork 的，每多一个依赖就多一份下游维护成本。

---

## 5. 架构

```
Nuxt 4 SSG ──pnpm generate──► .output/public (388 files, 11 MB)
                                    │
              ┌─────────────────────┴──────────────────────┐
              ▼                                            ▼
   【编译期内嵌 frontendDist】                  【部署链路：内容包生成】
   离线开箱可用，首次启动零下载                   app-dist/manifest.json
              │                                  app-dist/content.zip
              │                                            │
              │                                            ▼
              │                              Cloudflare Pages  /app-dist/
              │                                            │
              ▼                                            │
   ┌──────────────────────────────────────────┐            │
   │ Tauri v2 Rust 内核                        │◄───────────┘
   │ ① 自定义协议 app://  → 请求路径映射到文件  │  启动后异步比对 build
   │ ② web 根解析：                            │  有新版 → 下载/校验/切换/重载
   │    appData/web/<activeBuild>/   ← 优先    │
   │    内嵌资源                     ← 兜底    │
   │ ③ 内容更新器（下载/校验/解压/原子切换/回滚）│
   └──────────────────────────────────────────┘
                        ▲
                        │ invoke
              ┌─────────┴──────────┐
              │ Nuxt 侧 app-only UI │  离线条 / 更新提示 / 错误页
              └────────────────────┘
```

### 5.1 分层职责

| 层 | 职责 | 不负责 |
| --- | --- | --- |
| Nuxt 构建层 | 产出静态站点；app 构建时开关不影响站点产物 | 打包、更新 |
| 内容包层 | 把静态产物打成 zip + 清单，随站点部署 | 下载、切换 |
| Tauri/Rust 层 | 服务资源、管理 web 根、内容包的生命周期 | 决定"要不要更新"（由前端触发） |
| app UI 层 | 展示当前状态、触发检查、给出可操作提示 | 直接读写文件 |

### 5.2 web 根解析规则

请求路径 `P`（如 `/about/index.html`）按序尝试：

1. `<web根>/P`
2. `<web根>/P/index.html`（目录形式）
3. `<web根>/P.html`
4. 找不到 → 若是导航请求（`Accept` 含 `text/html`）返回 `<web根>/404.html`，否则 404

MIME 类型必须正确（`mime_guess`），字体、JS 的 `Content-Type` 错误会导致 CORS/加载失败。

Nuxt 的 `autoSubfolderIndex` 在本项目是非固定值（取决于部署平台变量），所以上述四条回退顺序必须都实现，不能假设目录形态。

### 5.3 内容包状态机

```
idle ──check──► has_update ──download──► downloaded ──apply──► active
  │                 │                        │                   │
  │                 └──(无新版)──► idle       └──(校验失败)──► error(保留当前)
  │
  └──(断网/请求失败)──► idle（静默，不打扰）
```

- **校验**：zip 整体 sha256 + 逐文件 sha256（对照 manifest）双重校验
- **解压安全**：拒绝含 `..` 的路径条目（zip-slip），拒绝绝对路径，限制解压后总大小
- **原子切换**：解压到 `<appData>/web/<build>.tmp/` → 校验通过 → 重命名为 `<build>/` → 写 `active.json`（单文件原子替换）→ 重载 webview
- **回滚**：`active.json` 里保留 `previous`；新版本启动后前端上报 `ready` 失败（或协议层读不到 `index.html`）则自动切回 `previous`

---

## 6. 仓库落地

```
blog/blog/
├─ blog.config.ts                          # 新增 app 段（总开关 / 更新源 / 策略）
├─ app/
│   ├─ components/app/                     # 仅 app 内渲染
│   │   ├─ AppStatusBar.vue                # 离线条 / 更新提示
│   │   └─ AppBootError.vue                # 内容包损坏时的可操作错误页
│   └─ plugins/app-bridge.client.ts        # 检测 window.__TAURI__，封装 invoke
├─ scripts/app/
│   ├─ gen-content-bundle.ts               # zip + manifest（排除 app-dist 自身）
│   ├─ gen-icons.ts                        # SVG → PNG / Android 分层 / iOS 压平
│   └─ svg/                                # 矢量源（唯一的图标设计源）
├─ src-tauri/
│   ├─ tauri.conf.json                     # 身份 / 窗口 / CSP / bundle
│   ├─ Cargo.toml                          # 依赖刻意精简
│   ├─ capabilities/default.json
│   ├─ icons/                              # tauri icon 产物
│   ├─ src/
│   │   ├─ main.rs
│   │   ├─ lib.rs                          # Builder：协议 + 命令 + 插件
│   │   ├─ protocol.rs                     # app:// 处理器（路径→文件、MIME、SPA 回退）
│   │   ├─ webroot.rs                      # web 根解析与 active.json
│   │   └─ content_update.rs               # 检查/下载/校验/解压/切换/回滚
│   └─ gen/{android,ios}/                  # 由 tauri android/ios init 生成，需提交
└─ .github/workflows/
    ├─ build-app.yml                       # 新增：cargo check + 桌面三端 + 移动端
    └─ deploy-cloudflare-pages.yml         # 修改：增加内容包生成步骤
```

### 6.1 `blog.config.ts` 新增段（草案）

```ts
export const app = {
  enable: true,                                  // 总开关；false 时完全不参与构建
  contentBase: 'https://blog.kemeow.top',        // 内容包来源
  manifestPath: '/app-dist/manifest.json',
  checkOnLaunch: true,
  checkDelayMs: 4000,                            // 启动后延迟，避免抢首屏带宽
  autoDownload: false,                           // 是否静默下载（默认问用户）
  keepPreviousBuilds: 1,                         // 保留几个历史版本用于回滚
}
```

---

## 7. 图标设计说明

### 7.1 素材与提炼

`avatar.webp`（256×256，有损 VP8，无 alpha）内容是 Minecraft 体素风角色：银白像素短发、黑红配色衣着、手持红黑巨镰（红色发光月牙刃）、橙红日落天空。

提炼成图标时只保留**能承受 16px 的信息**：银白发盖、黑脸、红色眼部块、红领、日落渐变。衣服上的「克喵:)」字样、镰刀细节、树木剪影在任务栏尺寸下必然糊成一团，因此**不进图标**（移到启动页/关于页）。

### 7.2 配色

| 名称 | 值 | 用途 |
| --- | --- | --- |
| 日落橙 | `#F2893C` | 主背景（中段） |
| 暖金 | `#FFC772` | 背景高光（顶部） |
| 赤红 | `#B93A1C` | 背景暗部（底部） |
| 血红 | `#E23A2E` | 眼部、红领 |
| 银白 | `#ECE8E1` | 发盖 |
| 银灰 | `#C2BCB2` | 发盖侧阴影 |
| 墨黑 | `#16130F` | 脸与肩 |

### 7.3 小尺寸校核

必须在 16 / 24 / 32 / 48 / 64 五个尺寸下逐个目视确认（已做过一轮：16px 下退化为「银顶黑块 + 两个红点」的色块签名，仍可辨认，因此保留该方案）。

### 7.4 app 内 UI 的 token（不另造体系）

| 用途 | 复用变量 |
| --- | --- |
| 离线条 / 更新条底 | `--c-bg-a80` + `backdrop-filter`（与站点 header 同款） |
| 卡片底 | `--ld-bg-card` |
| 边框 / 次级文字 | `--c-border` / `--c-text-2` |
| 动作主色 | `--c-primary` |
| 状态色 | `--c-success` / `--c-warning` / `--c-error` |

文案原则：按钮说明会发生什么（「更新内容」而不是「确定」）；失败说明原因与下一步；闭网时静默不打扰。

---

## 8. CI 设计

基准：`@tauri-apps/cli` 2.12.4、`tauri-action@v1`、Rust ≥ 1.90。

### 8.1 四个 job

| job | runner | 作用 | 关键时刻 |
| --- | --- | --- | --- |
| `check` | windows-latest | **`cargo check`，最先跑，几分钟出编译错误** | 弥补"本地无法编译" |
| `desktop` | windows / ubuntu-22.04 / macos-14 | 出安装包，只传 artifact | 不建 Release |
| `android` | ubuntu-22.04 | `--debug` APK（可直装真机） | JDK 21 / SDK 37 / NDK 29 |
| `ios` | macos-14 | `tauri ios build --no-sign` → 未签名 IPA | 需先 `ios init --ci` |

### 8.2 关键参数（已核实，不是猜）

- **`tauri-action@v1`**（当前 major；`includeUpdaterJson` 是 v0 旧名，v1 为 `uploadUpdaterJson`）
- **只构建不发 Release**：省略 `tagName` / `releaseName` / `releaseId`，并置 `uploadWorkflowArtifacts: true`
- **Linux 用 `ubuntu-22.04`**：官方理由是 **glibc 基线**（不是"24.04 的 webkit 坏了"；对 Tauri v2 无此证据）
- Linux 依赖取官方两份列表的并集：`libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev patchelf xdg-utils`
- **Android**：JDK 21（Gradle 要求 JVM 17–27，Tauri 映射表上限 26）；必须设 `ANDROID_HOME` 与 `NDK_HOME`（非交互下缺失直接 bail）；NDK `29.0.13846066`、SDK 37
- **Android 装真机必须签名**：release 产物是 `app-universal-release-unsigned.apk`，装不上；用 `--apk --debug` 走 debug 签名
- **iOS**：`tauri ios build --no-sign`（cli 2.11.0+），内部即传 `CODE_SIGNING_ALLOWED=NO` 等参数，无需 Apple 账号；未签名 IPA 不能直接装正常 iPhone，只能侧载重签
- Rust targets：Android 需 `aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android`

### 8.3 内容包生成步骤（改动生产部署工作流）

在 `deploy-cloudflare-pages.yml` 的 `pnpm generate` 之后、`wrangler pages deploy` 之前增加一步：

```
pnpm exec unrun scripts/app/gen-content-bundle.ts
```

它读写 `.output/public` 并生成 `.output/public/app-dist/{manifest.json,content.zip}`，随后随整站一起部署。

**风险声明**：这是对**线上部署工作流**的修改，必须谨慎，并准备好回滚（回滚 = 删掉这一行 step，内容包不再生成，app 端表现为"永远检测不到更新"但功能不受损）。

---

## 9. 安全

- **不启用 `tauri-plugin-localhost`**（官方自述高风险）。
- **CSP 收紧**：`default-src 'self'`；`connect-src` 仅放行内容包源与站点自身运行所需的外部 API。已知站点运行时会访问的外部域名（实测自线上 HTML，**最终清单以 Windows 客户端实测网络面板为准**）：

  | 域名 | 用途 |
  | --- | --- |
  | `tg-api.518339.xyz` | 说说 |
  | `hot-api.liiiu.cn` | 热搜 |
  | `ecoku.518339.xyz` | Twikoo 评论 |
  | `meting.081531.xyz` | 音乐 |
  | `netease.518339.xyz` | 网易云 |
  | `t0.gstatic.cn` / `s4.zstatic.net` / `cdn.jsdmirror.com` / `fonts.bytedance.com` | 字体与图标 CDN |

- **内容包完整性**：zip sha256 + 逐文件 sha256 双重校验，任一不符即拒绝。
- **解压安全**：拒绝 `..`、绝对路径、超限体积。
- **不加 `dangerousDisableAssetCspModification`、不开 `freezePrototype: false` 以外的放宽**。
- **凭据**：本方案不涉及任何密钥入库；若将来做 release 签名，keystore 与密码一律走 GitHub Secrets 占位符，不进仓库。

---

## 10. 测试与验收计划

### 10.1 浏览器测试（无需 Rust，先做）

- `pnpm dev` 起 `localhost:3000`（用户已授权使用 3000 端口）
- 验证：app-only UI 在浏览器下**完全不渲染**（`window.__TAURI__` 不存在）
- 验证：离线条 / 更新条 / 错误页在亮暗两套主题、528/768/1080 三断点的视觉
- 注意：bsk 浏览器守护进程当前起不来（Job Object 限制），需先解决或以 headless 方式替代

### 10.2 Windows 实测清单（CI 产物 → 本机安装）

1. 断网启动，读三篇文章（S1）
2. DevTools 看 Console 无 error，站内跳转无整页重载（S2）
3. 部署新内容后启动，出现更新提示（S3）
4. 更新成功、新文章可见、旧目录保留（S4）
5. 篡改 zip 字节 → 拒绝应用（S5）
6. 构造缺 `index.html` 的包 → 不切换（S6）
7. 断网点检查更新 → 静默（S7）
8. 点外链 → 系统浏览器打开（S8）
9. 顺带确认两件此前未证实的事：`console.log(isSecureContext)` 的真值；`_payload.json` 预取是否正常

### 10.3 Android 真机清单（用户提供设备）

1. 安装 debug APK 成功
2. 启动、阅读、站内路由正常
3. 热更新全流程（含回滚）

### 10.4 iOS

只验 CI 构建成功与 IPA 产物存在（S11），不验安装。

---

## 11. 风险与未证实项

| # | 风险 / 未证实 | 影响 | 应对 |
| --- | --- | --- | --- |
| R1 | **本地无法编译 Rust**，首轮 CI 通过不保证 | 高 | Rust 面积最小化；`cargo check` 独立 job 先跑；依赖只留 `reqwest`/`zip`/`sha2`/`mime_guess` |
| R2 | 自定义协议在 iOS 上的行为未验证（无设备） | 中 | iOS 只交付脚手架 + CI 构建；机制与 Android 同源，Android 验证通过可大幅降低风险 |
| R3 | `_payload.json` 在自定义协议下的预取行为未证实 | 中 | Windows 实测；若失败则对该构建启用 `experimental.payloadExtraction: false` |
| R4 | 官方 Nuxt 指引要求 `ssr: false`，但本站是真 SSG | 低 | 不改现有 SSG 形态（真 HTML 首屏优于 SPA）；实测为准 |
| R5 | Twikoo 的 QQ/微信登录在 WebView 内可能受限 | 中 | 实测；若不可用则 app 内降级为"跳到浏览器评论" |
| R6 | Android WebView 上 `isSecureContext` 真值未知（wry issue 的说法与 W3C 规范矛盾） | 低 | 一行 `console.log` 即可确认；本方案不依赖任何 secure-context-only API |
| R7 | 修改生产部署工作流 | 中 | 独立 step、可单行回滚、先在分支验证 |
| R8 | 每次内容更新下载 3–4 MB | 低 | 已按增量兼容的清单格式设计，后续可升级 |
| R9 | macOS runner 上 `tauri ios build --no-sign` 端到端未实跑 | 中 | 首次 CI 即验证；失败则降级为仅提交 `gen/ios` 脚手架 |
| R10 | Android `sdkmanager` 装 SDK 37 / NDK 29 的 CI 实操未验证 | 中 | 首次 CI 即验证；可回退到 `android-actions/setup-android` 默认版本组合 |

---

## 12. 实施顺序

| 里程碑 | 内容 | 出口条件 |
| --- | --- | --- |
| M1 骨架 | `src-tauri/` 初始化、`tauri.conf.json`、图标管线、`cargo check` CI | CI `check` 绿 |
| M2 静态承载 | 自定义协议 + web 根（仅内嵌资源路径） | Windows 安装包能打开站点且离线可用 |
| M3 内容包链路 | 生成脚本 + 部署步骤 + manifest 上线 | 线上 `/app-dist/manifest.json` 可访问 |
| M4 热更新 | 检查/下载/校验/切换/回滚 + app UI | S3–S7 全过（Windows） |
| M5 移动端 | `android/ios init`、图标分层、Android debug APK、iOS 未签名 IPA | S10（Android 真机）、S11（CI） |
| M6 收尾 | 桌面三端 CI、验收清单全跑、文档 | S1–S15 全过 |

---

## 13. 附录：官方依据

- Tauri v2 配置 Schema（`frontendDist`、`useHttpsScheme`）：<https://schema.tauri.app/config/2>
- Nuxt 集成指引：<https://v2.tauri.app/start/frontend/nuxt/>
- 图标：<https://v2.tauri.app/develop/icons/>
- GitHub 构建流水线：<https://v2.tauri.app/distribute/pipelines/github/>
- Linux 基线（glibc）理由：<https://v2.tauri.app/distribute/debian/>
- Android 签名：<https://v2.tauri.app/distribute/sign/android/>
- iOS 签名：<https://v2.tauri.app/distribute/sign/ios/>
- tauri-action：<https://github.com/tauri-apps/tauri-action>
- Nuxt `payloadExtraction`：<https://nuxt.com/docs/4.x/guide/going-further/experimental-features#payloadextraction>
- W3C Secure Contexts（`.localhost` 判定）：<https://w3c.github.io/webappsec-secure-contexts/>

---

## 14. 待用户评审确认的两处

1. **`app-dist` 放线上站点**（`https://blog.kemeow.top/app-dist/`）会被公开访问到；内容是本站静态产物本身，不含隐私，但会多占约 3–4 MB 存储与一次下载带宽。是否接受？若不接受，改为对象存储。
2. **`identifier` 定为 `top.kemeow.blog`**，产品名「喵洛阁」。一旦发布不宜更改，请在评审时最终确认。