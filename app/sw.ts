/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute, PrecacheFallbackPlugin } from 'workbox-precaching'
import { RangeRequestsPlugin } from 'workbox-range-requests'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'
import blogConfig from '~~/blog.config'

declare let self: ServiceWorkerGlobalScope

/**
 * 预缓存清单由 `@vite-pwa/nuxt` 的 injectManifest 在构建期注入（injectionPoint 即 manifest 占位符），
 * 注入源是 `nuxt.config.ts` 的 `pwa.injectManifest.globPatterns` / `globIgnores`。
 *
 * - 必须在所有运行时路由**之前**注册：已预缓存的页面（`/about`、`/2026/example`）直接由预缓存响应，
 *   既不经过网络（在线首屏快），断网时也照常打开。
 * - `ignoreURLParametersMatching` 默认只有 `/^utm_/` 与 `/^fbclid$/`，这里补上 `/^_b$/`：
 *   Nuxt 取页面 payload 时请求的是 `<route>/_payload.json?_b=<buildId>`，不忽略 `_b` 的话
 *   预缓存永远命中不了 —— 离线站内跳转会出现「页面壳到了、正文数据全空」。
 */
precacheAndRoute(self.__WB_MANIFEST, {
	ignoreURLParametersMatching: [/^utm_/, /^fbclid$/, /^_b$/],
})

/**
 * 缓存健康检查：直接读预缓存里的真实条目，确认它们没坏。
 *
 * **不能在这里再引用那个 manifest 占位符**：injectManifest 要求它在源码中只出现一次
 * （作为 injectionPoint，由构建期替换成清单数组）。多引用一次，插件就放弃注入，
 * 产物里会原样留下未展开的占位符，**整份预缓存静默失效**
 * （实测发生过：条目从 389 变成 0，而构建不报错）。所以这里只按缓存名取条目，不碰清单。
 */
const SW_CACHE_PREFIX = 'workbox-precache'

async function precacheSelfCheck() {
	try {
		const cacheNames = (await self.caches.keys()).filter(name => name.startsWith(SW_CACHE_PREFIX))
		if (!cacheNames.length)
			return false

		for (const cacheName of cacheNames) {
			const cache = await self.caches.open(cacheName)
			const requests = await cache.keys()
			if (!requests.length)
				continue
			// 均匀抽样几条真去读 body：损坏条目会抛 ERR_CACHE_READ_FAILURE
			const step = Math.max(1, Math.floor(requests.length / 5))
			for (let i = 0; i < requests.length; i += step) {
				const response = await cache.match(requests[i]!)
				if (!response)
					return false
				await response.arrayBuffer()
			}
		}
		return true
	}
	catch (error) {
		console.warn('[sw] 预缓存健康检查异常', error)
		return false
	}
}

/** 清空本 SW 名下的所有缓存（预缓存 + 运行时缓存） */
async function dropAllCaches() {
	const names = await self.caches.keys()
	await Promise.all(names.map(name => self.caches.delete(name)))
}

// 清掉旧版本 SW 留下的预缓存（缓存名带版本后缀），避免 Cache Storage 随每次发版无限增长
cleanupOutdatedCaches()

/**
 * 立即接管：「autoUpdate」依赖新 SW 立刻 activate 并接管已打开的页面。
 * 这件事与缓存健康检查解耦 —— 检查放到 activate 之后异步做。
 */
self.skipWaiting()

self.addEventListener('activate', (event: ExtendableEvent) => {
	event.waitUntil((async () => {
		await clientsClaim()
		// 缓存健康检查放在接管之后跑：这时预缓存已定稿，不会和 install 的写入抢时序。
		// 坏缓存要清掉并注销自己，让下次打开重新装一份干净的。
		if (await precacheSelfCheck())
			return
		console.warn('[sw] 预缓存自检失败，清空缓存并注销当前 SW，下次访问重新安装')
		await dropAllCaches()
		await self.registration.unregister()
		// 把已打开的页面交给网络，避免它们继续挂在坏缓存上
		for (const client of await self.clients.matchAll({ type: 'window' }))
			void client.navigate(client.url).catch(() => {})
	})())
})

/**
 * 自愈插件：缓存条目读坏时删掉它并回退到网络。
 *
 * 线上事故里大量 `ERR_CACHE_READ_FAILURE` 不只是 install 半残导致 —— CacheFirst 命中一条
 * 损坏的缓存条目时，网络层直接报错，**Workbox 不会自动删掉坏条目**，于是这个资源永远坏下去，
 * 页面反复失败重试（这就是「没离线但说说/评论一直很慢」的直接感受）。
 * 这里在策略之前拦截：读失败 → 删条目 → 让策略走网络，下一次重新缓存。
 *
 * 定义必须放在所有 `registerRoute` 之前：class 声明有暂时性死区，
 * 在使用点之后定义会在 SW 求值阶段直接抛 ReferenceError。
 */
class SelfHealingCachePlugin {
	async cachedResponseWillBeUsed({ cacheName, cachedResponse, request }: {
		cacheName?: string
		cachedResponse?: Response
		request: Request
	}) {
		if (!cachedResponse)
			return null
		try {
			// 真正读一次 body，损坏的条目会在这里抛错（ERR_CACHE_READ_FAILURE）
			await cachedResponse.clone().arrayBuffer()
			return cachedResponse
		}
		catch {
			console.warn('[sw] 缓存条目读取失败，删除后回退网络', request.url)
			if (cacheName) {
				const cache = await self.caches.open(cacheName)
				await cache.delete(request, { ignoreSearch: true })
			}
			return null
		}
	}
}

/**
 * 导航路由（本次重做的核心）。
 *
 * 旧的 `navigateFallback: '/offline'` 生成的是 `NavigationRoute(createHandlerBoundToURL('/offline'))`：
 * 只读预缓存、没有任何网络回退，且注册在所有运行时路由之前。后果是在线访问
 * `/about/`、`/about?x=1`、`/nope-does-not-exist` 这类未预缓存形态（预缓存键是清理过的 `about`）
 * 会直接拿到离线页，告诉用户「当前没有网络连接」。
 *
 * 现在：导航一律先走网络（4s 超时），网络拿到什么就是什么（平台自己决定尾斜杠重定向 / 404）；
 * 只有网络真的失败（断网）时才由 PrecacheFallbackPlugin 回退到预缓存的 `/offline`。
 */
registerRoute(
	({ request }) => request.mode === 'navigate',
	new NetworkFirst({
		cacheName: 'blog-page',
		networkTimeoutSeconds: 4,
		// 这条缓存只承接「规范 URL 之外」的导航（尾斜杠、带查询串等），量很小，但必须设上限：
		// cleanupOutdatedCaches() 只回收 `-precache-` 前缀的缓存，运行时缓存不设上限会跨发版一直涨。
		plugins: [
			new SelfHealingCachePlugin(),
			new ExpirationPlugin({ maxEntries: 50, maxAgeSeconds: 7 * 24 * 3600 }),
			new PrecacheFallbackPlugin({ fallbackURL: '/offline' }),
		],
	}),
)

/**
 * 以下四组与旧 `pwa.workbox.runtimeCaching` 等价，只把匹配改精确了：
 *
 * 旧实现用无锚点子串正则（图片 `/\/_ipx\/|\/img\//`、音频 `/\/music\//`），匹配的是**绝对 URL**，
 * 任何第三方 URL 只要路径里出现 `/img/`、`/music/` 就会被吞进本站缓存。
 * 现在图片/音频用 `url.pathname` 锚定开头（且要求同源），站外组用 `url.origin` 精确比对，
 * 不再可能误伤第三方资源。
 */
registerRoute(
	// 图片：构建期优化产物 /_ipx/** 与静态图 /img/**
	({ sameOrigin, url }) => sameOrigin && /^\/(?:_ipx|img)\//.test(url.pathname),
	new CacheFirst({
		cacheName: 'blog-image',
		plugins: [
			// 自愈插件必须排在 ExpirationPlugin 之前：先决定要不要用这条缓存
			new SelfHealingCachePlugin(),
			new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 2592000 }),
		],
	}),
)

registerRoute(
	// 音频：缺了 RangeRequestsPlugin，拖动进度条取不到 206 分段
	({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/music/'),
	new CacheFirst({
		cacheName: 'blog-audio',
		plugins: [
			new SelfHealingCachePlugin(),
			new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 2592000 }),
			new RangeRequestsPlugin(),
		],
	}),
)

/**
 * 站外样式与字体（域名见 `blog.config.ts` / `nuxt.config.ts` 的 head 注入）。
 * 多为跨域不透明响应（只能存不能读），故限条数防缓存配额被占满。
 */
const VENDOR_ORIGINS = new Set([
	'https://s4.zstatic.net',
	'https://fonts.bytedance.com',
])

registerRoute(
	({ url }) => VENDOR_ORIGINS.has(url.origin),
	new StaleWhileRevalidate({
		cacheName: 'blog-vendor-assets',
		plugins: [
			new SelfHealingCachePlugin(),
			new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 2592000 }),
		],
	}),
)

/**
 * 第三方 API（域名与 `blog.config.ts` 的 memos / hot / comment / meting / netease 一致）。
 * 它们自身已有 localStorage 缓存与刷新策略，SW 不再插一层写出第二套过期逻辑。
 *
 * 说说页的 Ech0 实例**刻意**从配置里 import 而不是写死字符串：换实例时只改一处。
 * 代价是 blog.config 的对象字面量会整段内联进 SW（约 +4KB，构建期常量，无运行时开销），
 * 这比「复制一份域名到这里、改配置时忘记同步」安全，勿当作冗余裁掉。
 * 它同时承载附件静态资源 `/api/files/**`，这些大文件同样交给 NetworkOnly 直连 ——
 * 离线时说说本身走 localStorage 首屏缓存，附件取不到属预期。
 */
const API_ORIGINS = new Set([
	'https://ecoku.518339.xyz',
	'https://tg-api.518339.xyz',
	'https://hot-api.liiiu.cn',
	'https://meting.081531.xyz',
	'https://netease.518339.xyz',
	new URL(blogConfig.memos.ech0.apiBase).origin,
])

registerRoute(
	({ url }) => API_ORIGINS.has(url.origin),
	new NetworkOnly(),
)

/**
 * 评论验证码（Cap）服务：**整个域名都由 SW 接管，不落浏览器 HTTP 缓存**。
 *
 * Cap 是 Ecoku 评论的人机验证服务，一个独立域名（当前是 cap.518339.xyz），负责两步：
 *   1. `/assets/widget.js` + `/assets/cap_wasm_bg.wasm` + `/assets/pako_inflate.min.js` —— 渲染验证控件
 *   2. `<sitekey>/challenge` 等 API —— 取题、答题、换 token
 * 它的实例地址由 Ecoku 服务端下发，**前端构建期拿不到**，所以没法写进 `API_ORIGINS`。
 *
 * 为什么必须接管：这些资源一旦在浏览器磁盘缓存里坏掉，就持续报 `ERR_CACHE_READ_FAILURE`，
 * 验证控件渲染不出来 → **评论发不出去**（线上真实发生过）。而 Workbox 的运行时路由
 * 只管自己写进 Cache Storage 的条目，管不到浏览器 HTTP 磁盘缓存；只有让请求经过 SW、
 * 用 NetworkOnly 直连网络，才能绕开坏条目。
 *
 * 匹配方式：**按域名特征**（host 以 `cap.` 开头，或路径落在 `/assets/cap_wasm_bg.wasm`），
 * 不写死具体域名 —— 换验证码实例时不用改代码。验证码必须实时联网求解，缓存它没有意义，
 * 所以 NetworkOnly 是正确策略，不存在「离线时验证码不可用」的额外损失（本来也不可用）。
 */
const CAP_HOST_PATTERN = /^cap\./i
const CAP_ASSET_HINT = /^\/assets\/(?:cap_wasm_bg\.wasm|pako_inflate\.min\.js|widget\.js)$/

/**
 * 验证码实例的主机是否落在「自有域族」里。
 * 用 Ecoku 实例域名反推父域（`ecoku.518339.xyz` → `518339.xyz`），
 * 这样只接管「cap.自有域」的请求，不会误伤其他站点碰巧叫 `cap.*` 的资源，
 * 也不写死具体主机名 —— 验证码换实例时只要还在同一域族下，代码不用动。
 */
const OWN_PARENT_DOMAIN = (() => {
	try {
		const parts = new URL(blogConfig.comment.ecoku.serverURL).hostname.split('.')
		return parts.length > 1 ? parts.slice(1).join('.') : ''
	}
	catch {
		return ''
	}
})()

function isOwnedCapHost(hostname: string) {
	if (!CAP_HOST_PATTERN.test(hostname))
		return false
	return !!OWN_PARENT_DOMAIN && hostname.endsWith(`.${OWN_PARENT_DOMAIN}`)
}

registerRoute(
	({ url, sameOrigin }) => {
		// 不碰任何同源请求：本站没有 /assets/ 目录，也不给自己留误伤余地
		if (sameOrigin)
			return false
		// 自己的验证码实例：整域接管（静态资源 + challenge API 都绕过磁盘缓存）
		if (isOwnedCapHost(url.hostname))
			return true
		// 兜底：万一把验证码挪到了别的域，至少控件本体与 wasm 仍走 SW
		// （只要页面受本 SW 控制，跨域资源请求同样会经过 fetch 事件）
		return CAP_ASSET_HINT.test(url.pathname)
	},
	new NetworkOnly(),
)
