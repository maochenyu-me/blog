/// <reference lib="webworker" />

import { clientsClaim } from 'workbox-core'
import { ExpirationPlugin } from 'workbox-expiration'
import { cleanupOutdatedCaches, precacheAndRoute, PrecacheFallbackPlugin } from 'workbox-precaching'
import { RangeRequestsPlugin } from 'workbox-range-requests'
import { registerRoute } from 'workbox-routing'
import { CacheFirst, NetworkFirst, NetworkOnly, StaleWhileRevalidate } from 'workbox-strategies'

declare let self: ServiceWorkerGlobalScope

/**
 * 预缓存清单由 `@vite-pwa/nuxt` 的 injectManifest 在构建期注入（injectionPoint 即 `self.__WB_MANIFEST`），
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

// 清掉旧版本 SW 留下的预缓存（缓存名带版本后缀），避免 Cache Storage 随每次发版无限增长
cleanupOutdatedCaches()

/**
 * `registerType: 'autoUpdate'` 时模块只负责在 SW `activated`（isUpdate）后刷新页面，
 * 「立即接管」仍需 SW 自己声明：install 完直接 activate，并马上接管尚未受控的页面。
 * （generateSW 时代这两件事由模块写进 `workbox.skipWaiting` / `clientsClaim`，injectManifest 下不会自动注入。）
 */
self.skipWaiting()
clientsClaim()

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
		plugins: [new ExpirationPlugin({ maxEntries: 200, maxAgeSeconds: 2592000 })],
	}),
)

registerRoute(
	// 音频：缺了 RangeRequestsPlugin，拖动进度条取不到 206 分段
	({ sameOrigin, url }) => sameOrigin && url.pathname.startsWith('/music/'),
	new CacheFirst({
		cacheName: 'blog-audio',
		plugins: [
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
		plugins: [new ExpirationPlugin({ maxEntries: 30, maxAgeSeconds: 2592000 })],
	}),
)

/**
 * 第三方 API（域名与 `blog.config.ts` 的 memos / hot / comment / meting / netease 一致）。
 * 它们自身已有 localStorage 缓存与刷新策略，SW 不再插一层写出第二套过期逻辑。
 */
const API_ORIGINS = new Set([
	'https://ecoku.518339.xyz',
	'https://tg-api.518339.xyz',
	'https://hot-api.liiiu.cn',
	'https://meting.081531.xyz',
	'https://netease.518339.xyz',
])

registerRoute(
	({ url }) => API_ORIGINS.has(url.origin),
	new NetworkOnly(),
)
