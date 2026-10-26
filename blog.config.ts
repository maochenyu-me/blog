import type { FeedEntry } from './app/types/feed'
import type { MessageTip } from './app/types/message'
import type { MetingPlaylistConfig, NeteasePlaylistConfig } from './app/types/music'
import type { RewardConfig } from './app/types/reward'

const basicConfig = {
	title: '喵洛阁',
	subtitle: '每一段旅行，都有终点。',
	// 长 description 利好于 SEO
	description: '克喵:)的博客，在这里记录我的生活日常、踩坑过程、项目部署和资源分享。',
	author: {
		name: '克喵:)',
		avatar: './img/avatar/avatar.webp',
		email: 'contact@518339.xyz',
		homepage: '/',
	},
	copyright: {
		abbr: 'CC BY-NC-SA 4.0',
		name: '署名-非商业性使用-相同方式共享 4.0 国际',
		url: 'https://creativecommons.org/licenses/by-nc-sa/4.0/deed.zh-hans',
	},
	favicon: '/favicon.ico',
	language: 'zh-CN',
	timeEstablished: '2024-11-01',
	timeZone: 'Asia/Shanghai',
	url: 'https://blog.kemeow.top/',
	defaultCategory: '未分类',
}

// 存储 nuxt.config 和 app.config 共用的配置
// 此处为启动时需要的配置，启动后可变配置位于 app/app.config.ts
// @keep-sorted
const blogConfig = {
	...basicConfig,

	article: {
		categories: {
			[basicConfig.defaultCategory]: { icon: 'tabler:circle-dashed' },
			/** 实践可复用操作经验：工具/系统/部署/排障 */
			技术: { icon: 'tabler:mouse', color: '#33aaff' },
			/** 编程：代码实现/工程实践/开发方法 */
			开发: { icon: 'tabler:code', color: '#7777ff' },
			/** 安全：漏洞/CTF/恶意软件/安全事件分析 */
			安全: { icon: 'tabler:bug', color: '#ff7733' },
			/** 思考：观点讨论/复盘反思/行业或产品观察 */
			杂谈: { icon: 'tabler:message', color: '#33bbaa' },
			/** 记录叙事：个人经历/校园家庭/日常片段 */
			生活: { icon: 'tabler:leaf', color: '#ff7777' },
		},
		/** 文章版式，首个为默认版式 */
		types: {
			tech: {},
			story: {},
		},
		/** 分类排序方式，键为排序字段，值为显示名称 */
		order: {
			date: '创建日期',
			updated: '更新日期',
			// title: '标题',
		},
		/** 使用 pnpm new 新建文章时自动生成自定义链接（permalink/abbrlink） */
		useRandomPremalink: false,
		/** 隐藏基于文件路由（不是自定义链接）的 URL /post 路径前缀 */
		hidePostPrefix: true,
		/** 禁止搜索引擎收录的路径 */
		robotsNotIndex: ['/preview', '/previews/*'],
	},

	/** 评论区使用的评论系统 */
	comment: {
		/**
		 * 选用哪套评论系统
		 * `ecoku` 使用自部署 Ecoku；`twikoo` 使用 Twikoo（需同时在下方 twikoo 配置 envId 并注入脚本）；`none` 不渲染评论区
		 */
		provider: 'ecoku' as 'ecoku' | 'none' | 'twikoo',
		/**
		 * 自部署的 Ecoku 评论服务
		 * 需先在 Ecoku 后台注册本站并拿到站点 ID，且把本站来源（含本地调试地址）加入该站点的「允许来源」
		 */
		ecoku: {
			/** 实例地址，末尾不要加 `/` */
			serverURL: 'https://ecoku.518339.xyz',
			/** 后台注册站点后得到的站点 ID */
			siteId: 'kemiao',
			/** 每页展示的根评论数，取值范围 1~100 */
			pageSize: 10,
			/** 评论区语言，留空跟随 Ecoku 站点设置 */
			i18n: '' as '' | 'en' | 'zh-CN' | 'zh-Hant',
		},
	},

	/** 朋友圈页面：数据由 scripts/fcircle/fetch.ts 抓取各友链订阅源后生成（app/data/fcircle.json） */
	fcircle: {
		/** 每个友链最多保留的文章数 */
		perSite: 10,
		/** 文章保留天数：超过该天数的条目不再收录（每站仍保底保留最新一条） */
		maxAgeDays: 365,
		/** 全站最多收录的文章数 */
		maxItems: 400,
		/** 单个订阅源的请求超时（毫秒） */
		timeout: 15_000,
		/** 页面顶部头图卡片，image 留空时使用主题色渐变兜底 */
		banner: {
			/** 图片放在 public/img/banner/ 下，这里填站点路径如 `/img/banner/1.jpg`（宽高比约 3:1） */
			image: '/img/banner/1.jpg',
			title: '朋友圈',
			description: '友链的朋友们最近在写什么。',
			/** 卡片最小高度，支持任意 CSS 长度 */
			height: '13rem',
		},
	},

	/** 博客 Atom 订阅源 */
	feed: {
		/** 订阅源最大文章数量，也决定 /feed 页面展示的条数 */
		limit: 50,
	},

	/** 热搜页面（数据来自第三方 DailyHotApi 公开实例，浏览器端直连，不经本站服务器） */
	hot: {
		/** 接口地址，末尾不要加 `/` */
		apiBase: 'https://hot-api.liiiu.cn',
		/**
		 * 平台列表，按数组顺序在页面顶部渲染；路由名见 https://hot-api.liiiu.cn/all
		 * 留空数组表示展示接口 `/all` 返回的全部平台（中文名与图标见 `app/data/hot.ts`）
		 */
		platforms: [
			'weibo',
			'douyin',
			'zhihu',
			'bilibili',
			'baidu',
			'toutiao',
			'36kr',
			'v2ex',
			'juejin',
			'github',
			'sspai',
			'ithome',
			'douban-movie',
			'tieba',
		] as string[],
		/** 每页条数 */
		perPage: 20,
		/** 首屏缓存在多久内视为新鲜（毫秒）；过期仍先出内容，再后台静默校准 */
		cacheTtl: 5 * 60 * 1000,
		/** 单次请求超时（毫秒）；接口跨站访问要重新握手，太短会在链路抖动时误判为失败 */
		requestTimeout: 15 * 1000,
		/** 页面顶部头图卡片，image 留空时使用主题色渐变兜底 */
		banner: {
			/** 图片放在 public/img/banner/ 下，这里填站点路径如 `/img/banner/4.jpg`（宽高比约 3:1） */
			image: '',
			title: '热搜',
			description: '微博、抖音、知乎、B站……各大平台热榜一处看完。',
			/** 卡片最小高度，支持任意 CSS 长度 */
			height: '13rem',
		},
	},

	/** 说说页面（数据来自自部署 koharu-suite 的公开读取 API） */
	memos: {
		/** koharu-suite 站点地址，末尾不要加 `/` */
		apiBase: 'https://tg-api.518339.xyz',
		/** 只展示这些频道的消息（suite channel UUID），留空表示展示全部公开频道 */
		channelIds: [] as string[],
		/** 每次加载的消息条数，取值范围 1~100 */
		perPage: 20,
		/** 首屏缓存在多久内视为新鲜（毫秒）；超时仍先用缓存出内容，再后台静默刷新 */
		cacheTtl: 2 * 60 * 1000,
		/** 切回页面时静默刷新的最小间隔（毫秒），避免频繁切换标签页打空请求 */
		refreshInterval: 2 * 60 * 1000,
		/**
		 * 单次请求超时（毫秒）。
		 * 接口跨站访问要重新做 TLS 握手，走代理时实测可达 6 秒以上，
		 * 太短的超时会在链路抖动时误判为加载失败，可酌情放宽
		 */
		requestTimeout: 15 * 1000,
		/** 页面顶部头图卡片，image 留空时使用主题色渐变兜底 */
		banner: {
			/** 图片放在 public/img/banner/ 下，这里填站点路径如 `/img/banner/2.jpg`（宽高比约 3:1） */
			image: '/img/banner/2.jpg',
			title: '说说',
			description: '记录生活点滴，一些想法。',
			/** 卡片最小高度，支持任意 CSS 长度 */
			height: '16rem',
		},
	},

	/** 留言板页面：页面文案与头图，评论区复用上方 comment 配置的评论系统 */
	message: {
		/** 页面顶部头图卡片，image 留空时使用主题色渐变兜底 */
		banner: {
			/** 图片放在 public/img/banner/ 下，这里填站点路径如 `/img/banner/3.jpg`（宽高比约 3:1） */
			image: '/img/banner/3.jpg',
			title: '留言板',
			description: '您可以在此畅所欲言，当然，请遵守互联网相关的法律法规',
			/** 卡片最小高度，支持任意 CSS 长度 */
			height: '13rem',
		},
		/** 评论区上方的提示语，按数组顺序逐条渲染 */
		tips: [
			{
				icon: 'tabler:message-2',
				parts: ['您可以在此畅所欲言，当然，请遵守互联网相关的法律法规'],
			},
			{
				icon: 'tabler:files',
				parts: ['如果您有什么想说的、想问的，或者发现了本站的小问题🐞欢迎留言'],
			},
			{
				icon: 'tabler:link',
				parts: ['需要添加友链？请移步', { label: '友链', href: '/link' }, '页面'],
			},
		] satisfies MessageTip[],
	},

	/**
	 * 悬浮音乐播放器（纯本地音源，无平台 API 依赖）
	 * 歌单清单见 `app/data/music.ts`，音频 / 歌词 / 封面放 `public/music/` 下
	 */
	music: {
		/** 是否启用播放器；关闭后不渲染 UI，也不会请求任何音频 */
		enabled: true,
		/** 默认音量，取值 0~1（用户手动调节后以用户记忆为准） */
		defaultVolume: 0.6,
		/** 默认播放模式：list 列表循环 / one 单曲循环 / shuffle 随机 */
		playMode: 'list' as 'list' | 'one' | 'shuffle',
		/** 是否显示歌词；关闭后展开态只显示曲目信息 */
		showLyrics: true,
		/**
		 * 是否隐藏歌词开头的制作信息行（`作词 : xxx` / `编曲 : xxx` / `混音 : xxx`）
		 * 网易云 LRC 普遍带这些行，放在滚动区里很吵；只在开头 10 秒内且形如「角色 + 冒号」时才隐藏
		 */
		hideLrcMeta: true,
		/**
		 * 是否记忆上次的歌单 / 歌曲 / 进度（写 localStorage）
		 * 仅用于「上次听到哪」的展示与续播起点，不会自动播放，仍需用户点击
		 */
		remember: true,
		/**
		 * Meting-API 远程歌单（浏览器端直连，接口需开放 CORS）
		 *
		 * 填了 playlists 就会在本地歌单之后追加这些远程歌单；`playlists` 为空即不启用。
		 * 拿 id 的方式：打开网易云网页版，歌单地址 `music.163.com/#/playlist?id=3778678` 里的数字；
		 * 歌手页取 `music.163.com/#/artist?id=6452` 的数字；单曲取歌曲详情页地址里的数字。
		 */
		meting: {
			/** 接口地址，指向 Meting-API 的 `/api` 路由（不是站点根路径） */
			api: 'https://meting.081531.xyz/api',
			/** 远程歌单列表，按数组顺序追加；type 支持 playlist / artist / song */
			playlists: [
				// 同一个歌单已经在下面 neteaseUrl 里配了（能拿 320k 完整曲目），这里就不重复挂一份：
				// 无 cookie 的 meting 实例只会给 30 秒试听。需要备源时再取消注释。
				// { id: '2607560262', name: '我的歌单', type: 'playlist' },
				// { id: '6452', name: '周杰伦', type: 'artist' },
			] as MetingPlaylistConfig[],
			/** 远端歌单缓存时长（毫秒），0 表示每次都重新请求 */
			cacheTtl: 30 * 60 * 1000,
			/** 单次请求超时（毫秒）；200 首的歌单实测要 4 秒左右 */
			timeout: 20 * 1000,
		},
		/**
		 * Netease_url 自部署实例（<https://github.com/Suxiaoqinx/Netease_url>）
		 *
		 * 和 meting 的区别：它靠实例自己的**黑胶会员 cookie** 换直链，能拿到无损/320k 完整曲目，
		 * 不会像无 cookie 的 meting 实例那样只给 30 秒试听。两者可以并存。
		 * `playlists` 为空即不启用。
		 */
		neteaseUrl: {
			/** 实例地址，末尾不要带 `/` */
			api: 'https://netease.518339.xyz',
			/** 音质：standard / exhigh(320k) / lossless / hires / sky / jyeffect / jymaster / dolby */
			level: 'exhigh' as const,
			/**
			 * 播放地址来源：
			 * - `stream`：走实例的 `/stream`（需部署带 `/stream` 的实例版本，见 Netease_url 仓库），
			 *   边下边发、首字节 0.3s 左右，透传 Range 可拖进度 —— **首选**；
			 * - `proxy` ：走实例自带的 `/download`，会先把整首歌落到服务器磁盘，首字节可能十几秒；
			 * - `direct`：用解析出的 CDN 直链，省服务器带宽，**但直链是 http**，https 站点会被混合内容拦掉。
			 *
			 * 用 `stream` 时若实例没打补丁，前端会自动退回 `proxy`（每首只退一次），
			 * 所以先切成 `stream` 再部署补丁也不会播不出声，只是慢一点。
			 */
			audio: 'stream' as const,
			/** 歌单列表，按数组顺序追加在本地与 meting 之后 */
			playlists: [
				{ id: '2607560262', name: '夜声羽烦喜欢的音乐' },
			] as NeteasePlaylistConfig[],
			/** 歌单缓存时长（毫秒）；209 首实测首拉约 5 秒 */
			cacheTtl: 30 * 60 * 1000,
			/** 单次请求超时（毫秒） */
			timeout: 30 * 1000,
		},
	},

	/**
	 * 文章打赏：文章底部版权卡片的「打赏」按钮与右侧目录栏的入口，点击打开收款码弹窗
	 * 收款码图片放 `public/img/reward/` 下，这里填站点路径（当前是占位图，替换同名文件即可）
	 */
	reward: {
		/** 关掉后按钮、入口与弹窗都不渲染 */
		enabled: true,
		/** 弹窗标题 */
		title: '打赏中心',
		/** 收款码上方的引导语 */
		tips: '感谢你赐予我前进的力量',
		/** 收款方式，按数组顺序渲染；建议 1:1 正方形图片 */
		methods: [
			{ name: '微信', image: '/img/reward/wechat.png' },
			{ name: '支付宝', image: '/img/reward/alipay.png' },
		],
		/** 弹窗底部的「赞赏者名单」卡片，指向关于页的名单模块；link 留空则渲染成不可点击的占位 */
		list: {
			title: '赞赏者名单',
			description: '因为你们的支持让我意识到写文章的价值🙏',
			link: '/about#reward',
		},
	} satisfies RewardConfig,

	/** 向 <head> 中添加脚本 */
	scripts: [],

	/** 文章统计配置 */
	stats: {
		/**
		 * 统计范围，匹配 content 下不含扩展名的路径（stem）；空数组统计全部内容
		 * 使用 SQL LIKE 语法：% 匹配任意长度字符，_ 匹配单个字符
		 * 多个范围取并集，如 ['posts/%', 'book/%']
		 */
		includePaths: [] as string[],
	},

	/** 自己部署的 Twikoo 服务 */
	twikoo: {
		envId: '',
		preload: '',
	},
}

/** 用于生成 OPML 和友链页面配置 */
export const myFeed: FeedEntry = {
	author: blogConfig.author.name,
	sitenick: blogConfig.title,
	title: blogConfig.title,
	desc: blogConfig.subtitle || blogConfig.description,
	link: blogConfig.url,
	feed: new URL('/atom.xml', blogConfig.url).toString(),
	icon: blogConfig.favicon,
	avatar: blogConfig.author.avatar,
	archs: ['Nuxt', 'Cloudflare'],
	date: blogConfig.timeEstablished,
	comment: '这是我自己',
}

export default blogConfig
