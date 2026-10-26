import { resolve } from 'node:path'
import { arch, env, version as nodeVersion, platform } from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { name as ciName, CLOUDFLARE_PAGES, GITHUB_ACTIONS, NETLIFY } from 'ci-info'
import { mapValues } from 'es-toolkit/object'
import { pascalCase } from 'es-toolkit/string'
import { Temporal } from 'temporal-polyfill'
import blogConfig from './blog.config'
import packageJson from './package.json'
import redirectList from './redirects.json'

/**
 * mdc 会把这里的值原样写进 `#mdc-imports`。
 * content 在 Node 侧用原生 ESM 动态 import 它，Windows 下必须给 `file://` URL（裸绝对路径会被当成 `e:` 协议）。
 * 打包端不认该协议会报 unresolved，故在 `vite.plugins` 与 `nitro.rollupConfig.plugins` 里各加一个
 * resolveId 钩子，把 `file://` 改写成文件路径后再交给打包器。
 */
function pluginPath(path: string) {
	return pathToFileURL(resolve(`./remark-plugins/${path}.ts`)).href
}

/**
 * 首屏前应用本地保存的主题色（键名与 app/components/blog/ThemeToggle.vue 一致）。
 * 必须内联在 head 里执行，否则侧栏取色按钮挂载前会先闪一次默认蓝。
 */
const themeColorScript = `try {
	const hex = localStorage.getItem('blog-primary-color')
	if (hex && /^#[a-f\\d]{6}$/i.test(hex)) {
		const r = parseInt(hex.slice(1, 3), 16) / 255
		const g = parseInt(hex.slice(3, 5), 16) / 255
		const b = parseInt(hex.slice(5, 7), 16) / 255
		const max = Math.max(r, g, b)
		const min = Math.min(r, g, b)
		const l = (max + min) / 2
		let h = 0
		let s = 0
		if (max !== min) {
			const d = max - min
			s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
			if (max === r) h = ((g - b) / d + (g < b ? 6 : 0)) / 6
			else if (max === g) h = ((b - r) / d + 2) / 6
			else h = ((r - g) / d + 4) / 6
		}
		const style = document.documentElement.style
		style.setProperty('--c-primary-h', Math.round(h * 360) + 'deg')
		style.setProperty('--c-primary-s', Math.round(s * 100) + '%')
		style.setProperty('--c-primary-l', Math.round(l * 100) + '%')
		style.setProperty('--c-primary-base', hex)
	}
} catch {}`

// 此处配置无需修改
export default defineNuxtConfig({
	app: {
		head: {
			meta: [
				{ name: 'author', content: [blogConfig.author.name, blogConfig.author.email].filter(Boolean).join(', ') },
				{ name: 'color-scheme', content: 'light dark' },
				// 此处为元数据的生成器标识，不建议修改
				{ 'name': 'generator', 'content': `${pascalCase(packageJson.name)} ${packageJson.version}`, 'data-github-repo': packageJson.homepage },
				{ name: 'mobile-web-app-capable', content: 'yes' },
			],
			link: [
				{ rel: 'icon', href: blogConfig.favicon },
				{ rel: 'alternate', type: 'application/atom+xml', href: '/atom.xml' },
				// 说说接口在首屏挂载后才请求，提前建连把 TLS 握手摊到解析 HTML 的空档里
				{ rel: 'preconnect', href: new URL(blogConfig.memos.apiBase).origin, crossorigin: 'anonymous' },
				// 热搜接口同样在挂载后才请求，提前建连；接口已开放 CORS，匿名预连接即可
				{ rel: 'preconnect', href: new URL(blogConfig.hot.apiBase).origin, crossorigin: 'anonymous' },
				// Twikoo 未配置（preload 为空）时不输出 preconnect，否则会产生空 href 的 link 标签
				...(blogConfig.twikoo.preload ? [{ rel: 'preconnect' as const, href: blogConfig.twikoo.preload }] : []),
				// Ecoku 的评论接口在客户端挂载后才请求，提前建连把 TLS 握手摊到解析 HTML 的空档里
				...(blogConfig.comment.provider === 'ecoku' ? [{ rel: 'preconnect' as const, href: blogConfig.comment.ecoku.serverURL }] : []),
				{ rel: 'stylesheet', href: 'https://s4.zstatic.net/npm/katex@0.16.44/dist/katex.min.css' },
				// "InterVariable", "Inter"
				{ rel: 'stylesheet', href: 'https://s4.zstatic.net/npm/inter-ui@4.1.1/inter-variable.css' },
				{ rel: 'stylesheet', href: 'https://s4.zstatic.net/npm/inter-ui@4.1.1/inter.css' },
				// 已自托管于 /fonts/zhuque (朱雀仿宋) 与 /fonts/jetbrains-mono (JetBrains Mono)，不再从 googleapis.cn 加载
				// 抖音美好体 "DOUYINSANSBOLD-GB"
				{ rel: 'stylesheet', href: 'https://fonts.bytedance.com/dfd/api/v1/css?family=DOUYINSANSBOLD-GB&display=swap' },
			],
			templateParams: {
				separator: '|',
			},
			titleTemplate: `%s %separator ${blogConfig.title}`,
			script: [...blogConfig.scripts, { innerHTML: themeColorScript }],
		},
		rootAttrs: {
			id: 'blog-root',
		},
	},

	compatibilityDate: '2024-08-03',

	components: [
		{ path: '~/components/partial', prefix: 'Z' },
		'~/components',
	],

	css: [
		'@/assets/css/animation.css',
		'@/assets/css/article.css',
		'@/assets/css/color.css',
		'@/assets/css/font.css',
		'@/assets/css/main.css',
		'@/assets/css/reusable.css',
	],

	// @keep-sorted
	experimental: {
		extractAsyncDataHandlers: true,
		typescriptPlugin: true,
	},

	nitro: {
		prerender: {
			// 修复部分平台会在文章路径后添加 `/`，导致闪现 404 错误
			// https://github.com/nuxt/content/issues/2378
			autoSubfolderIndex: CLOUDFLARE_PAGES || GITHUB_ACTIONS || NETLIFY ? false : undefined,
		},
		rollupConfig: {
			plugins: [
				{
					// 服务端由 Nitro 独立打包，与 vite 侧同理：把 mdc 写入的 file:// 插件 id 换成文件路径
					name: 'nitro-mdc-file-url-plugins',
					resolveId(source) {
						return source.startsWith('file://') ? fileURLToPath(source) : null
					},
				},
			],
		},
	},

	// @keep-sorted
	routeRules: {
		...mapValues(redirectList, to => ({ redirect: { to, statusCode: 308 as const } })),
		'/api/memos/latest': {
			prerender: true,
			headers: {
				'Content-Type': 'application/json',
				// 快照是构建那一刻的静态数据，交给 CDN 边缓存 60s，
				// 重复访问不必每次都回源取旧文件，也让新说说最多延迟一分钟可见
				'Cache-Control': 'public, max-age=0, s-maxage=60, stale-while-revalidate=300',
			},
		},
		'/api/stats': { prerender: true, headers: { 'Content-Type': 'application/json' } },
		'/atom.xml': { prerender: true, headers: { 'Content-Type': 'application/xml' } },
		'/favicon.ico': { redirect: { to: blogConfig.favicon } },
		'/subscriptions.opml': { prerender: true, headers: { 'Content-Type': 'application/xml' } },
	},

	runtimeConfig: {
		// @keep-sorted
		public: {
			arch,
			buildTime: Temporal.Now.zonedDateTimeISO().toString(),
			// EdgeOne 检测暂时不可用
			ci: env.TENCENTCLOUD_RUNENV === 'SCF' ? 'EdgeOne' : ciName || '',
			nodeVersion,
			platform,
		},
	},

	/** 在生产环境启用 sourcemap */
	// sourcemap: true,

	typescript: {
		nodeTsConfig: {
			// @keep-sorted
			include: [
				'../remark-plugins/**/*.ts',
				'../scripts/**/*.ts',
			],
		},
	},

	postcss: {
		plugins: {
			'postcss-nesting': {},
		},
	},

	vite: {
		plugins: [
			{
				// remark-plugins 必须以 file:// URL 交给 mdc（content 在 Node 侧用原生 ESM 动态 import，
				// Windows 下裸绝对路径会被当成 `e:` 协议）。打包端不认该协议，会在解析阶段报
				// "could not be resolved - treating it as an external dependency"，这里直接改写成文件路径。
				name: 'mdc-file-url-plugins',
				enforce: 'pre',
				resolveId(source) {
					if (!source.startsWith('file://'))
						return null
					return fileURLToPath(source)
				},
			},
		],
		define: {
			/** 在生产环境启用 Vue DevTools */
			// __VUE_PROD_DEVTOOLS__: 'true',
			/** 在生产环境启用 Vue 水合不匹配详情 */
			// __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'true',
		},
		optimizeDeps: {
			// @keep-sorted
			include: ['@shikijs/colorized-brackets', '@shikijs/transformers', '@unhead/schema-org/vue', '@vue/devtools-core', '@vue/devtools-kit', 'embla-carousel-autoplay', 'embla-carousel-vue', 'embla-carousel-wheel-gestures', 'es-toolkit/array', 'es-toolkit/math', 'es-toolkit/object', 'es-toolkit/promise', 'es-toolkit/string', 'minisearch', 'parse-domain', 'plain-shiki', 'shiki/themes/catppuccin-latte.mjs', 'shiki/themes/one-dark-pro.mjs', 'temporal-polyfill', 'vue-tippy'],
		},
		server: {
			allowedHosts: true,
			// 开发环境把说说接口转发到 koharu-suite，避免 localhost 被其 CORS 白名单拦截
			proxy: {
				'/koharu-api': {
					target: blogConfig.memos.apiBase,
					changeOrigin: true,
					rewrite: (path: string) => path.replace(/^\/koharu-api/, ''),
				},
			},
		},
	},

	// @keep-sorted
	modules: [
		'@bikariya/image-viewer',
		'@bikariya/modals',
		'@bikariya/shiki',
		'@nuxt/content',
		'@nuxt/hints',
		'@nuxt/icon',
		'@nuxt/image',
		'@nuxtjs/color-mode',
		'@nuxtjs/seo',
		'@pinia/nuxt',
		'@vueuse/nuxt',
		'nuxt-llms',
		'unplugin-yaml/nuxt',
	],

	colorMode: {
		preference: 'system',
		fallback: 'light',
		classSuffix: '',
	},

	content: {
		build: {
			markdown: {
				highlight: false,
				// @keep-sorted
				remarkPlugins: {
					[pluginPath('remark-code-component')]: {
						options: {
							'mermaid': { component: 'mermaid', prop: 'code' },
							'music-abc': { component: 'music-score', prop: 'abc' },
						},
					},
					'remark-math': {},
					'remark-reading-time': {},
				},
				// @keep-sorted
				rehypePlugins: {
					[pluginPath('rehype-meta-slots')]: {},
					'rehype-katex': {},
				},
				toc: { depth: 4, searchDepth: 4 },
			},
		},
		experimental: {
			sqliteConnector: 'native',
		},
	},

	dxup: {
		features: {
			namedLayoutSlots: true,
		},
	},

	hints: {
		// 规避 devtools 未连接时 birpc RPC 超时报错（nuxt/hints#339）
		// https://github.com/nuxt/hints/issues/339
		features: {
			hydration: false,
			lazyLoad: false,
		},
	},

	hooks: {
		'ready': () => {
			console.info(`
================================
${pascalCase(packageJson.name)} ${packageJson.version}
${packageJson.homepage}
================================
`)
		},
		'content:file:afterParse': (ctx) => {
			const { permalink, path } = ctx.content as Record<string, string | undefined>
			// 优先使用自定义链接（permalink/abbrlink），其次隐藏基于文件路由的 URL 中的 /posts 前缀
			if (permalink)
				ctx.content.path = permalink
			else if (blogConfig.article.hidePostPrefix && path?.startsWith('/posts/'))
				ctx.content.path = path.slice('/posts'.length)
		},
	},

	icon: {
		customCollections: [
			{ prefix: 'zi', dir: './app/assets/icons' },
		],
		clientBundle: {
			scan: {
				globInclude: ['**\/*.{vue,jsx,tsx,ts,md,mdc,mdx}'],
			},
		},
	},

	image: {
		// 尽量以这些密度点对点显示
		densities: [1, 1.5, 2],
		format: ['avif', 'webp'],
		// Neylify 下 netlify 处理器无法显示站外图片，ipx 处理器无法显示站内图片，需彻底禁用
		// https://github.com/nuxt/image/issues/1353
		// 注：Cloudflare Pages 静态部署( pnpm generate / static preset )无需此处禁用——
		// @nuxt/image 会自动选择 ipxStatic provider，构建期把优化图写入 .output/public/_ipx/。
		provider: NETLIFY ? 'none' : undefined,
	},

	linkChecker: {
		// @keep-sorted
		skipInspections: [
			'no-baseless',
			'no-non-ascii-chars',
			'no-uppercase-chars',
		],
	},

	llms: {
		domain: blogConfig.url,
		title: blogConfig.title,
		description: blogConfig.description,
	},

	ogImage: {
		enabled: false,
	},

	robots: {
		disableNuxtContentIntegration: true,
		disallow: blogConfig.article.robotsNotIndex,
	},

	site: {
		name: blogConfig.title,
		url: blogConfig.url,
		defaultLocale: blogConfig.language,
	},
})
