import type { Nav, NavItem } from '~/types/nav'
import type { VisitorConfig, VisitorContentPart, VisitorGreeting } from '~/types/visitor'
import { pascalCase } from 'es-toolkit/string'
import { Temporal } from 'temporal-polyfill'
import blogConfig from '~~/blog.config'
import { name, version } from '~~/package.json'

// 图标查询：https://yesicon.app/tabler
// 图标插件：https://marketplace.visualstudio.com/items?itemName=antfu.iconify

// @keep-sorted
export default defineAppConfig({
	// 将 blog.config 中的配置项复制到 appConfig，方便调用
	...blogConfig,

	component: {
		alert: {
			/** 默认使用卡片风格还是扁平风格 */
			defaultStyle: 'card' as 'card' | 'flat',
		},

		codeblock: {
			/** 代码块触发折叠的行数 */
			triggerRows: 32,
			/** 代码块折叠后的行数 */
			collapsedRows: 16,
			/** 启用代码块缩进导航会关闭空格渲染 */
			enableIndentGuide: true,
			/** 代码块缩进导航(Indent Guige)竖线匹配空格数 */
			indent: 4,
			/** tab渲染宽度 */
			tabSize: 3,
		},

		/** 倒计时 widget */
		countdown: {
			/** 「距离」下方显示的节日名称 */
			targetName: '春节',
			/** 显示当天所属的农历日期 */
			showLunar: true,
			/** 显示目标春节的干支生肖年 */
			showZodiac: true,
			/** 一周的开始日，1=周一 … 7=周日，默认周一 */
			weekStart: 1,
		},

		/** 文章开头摘要 */
		excerpt: {
			animation: true,
			caret: '_',
		},

		/** 文章开头的 AI 摘要卡（内容由 scripts/ai-summary 写入 frontmatter） */
		aiSummary: {
			/** 标题文案 */
			label: 'AI 摘要',
			/** 模型厂商标注，与模型名拼成右侧徽标，如「SiliconFlow · Qwen3-8B」 */
			provider: 'SiliconFlow',
			/** 逐字打出摘要；关闭或系统开启「减少动态效果」时整段直出 */
			animation: true,
			/** 打字机总时长（毫秒），单字间隔在此基础上有上下限 */
			duration: 2200,
			/** 打字机光标 */
			caret: '_',
			/** 窄屏下超过这个字数就折叠 */
			foldAfter: 80,
		},

		/** 精选文章 Slide */
		slide: {
			/** 适合封面图无字时启用 */
			showTitle: true,
		},

		stats: {
			/** 归档页面每年标题对应的年龄 */
			birthYear: 0,
			/** blog-stats widget 的预置文本 */
			wordCount: '',
		},

		/** 欢迎来访者 widget */
		visitor: {
			/** 卡片标题 */
			title: '欢迎来访者',
			/**
			 * 正文段落：外层数组每项是一段，段内片段按顺序拼接。
			 * 字符串为普通文字；`{ text, highlight }` 主色加粗；`{ text, href }` 渲染成链接。
			 */
			content: [
				[
					'我是',
					{ text: blogConfig.author.name, highlight: true },
					'，一个喜欢折腾服务器和写点东西的技术爱好者，喜欢记录踩坑过程，也喜欢把走过的路写成路标。',
				],
				[
					'有问题欢迎来',
					{ text: '留言板', href: '/message' },
					'提问；如果需要联系我，也可以直接',
					{ text: '发邮件', href: `mailto:${blogConfig.author.email}` },
					'。',
				],
			] satisfies VisitorContentPart[][],
			/** 博主坐标，用于计算访客距离；`name` 仅用于提示文案 */
			origin: {
				name: '南京',
				lat: 32.016979,
				lng: 118.834129,
			},
			/** 取访客公网 IP 的接口，响应需形如 `{ data: { ip } }` */
			ipApi: 'https://60s-api.518339.xyz/v2/ip',
			/** 地理接口，`{ip}` 会替换成访客 IP；留空则跳过定位，只显示 IP 与问候语 */
			geoApi: 'https://ipwho.is/{ip}?lang=zh-CN',
			/** IP 默认模糊，悬停或键盘聚焦时显示 */
			blurIp: true,
			/** 问候语按访客本地时间分段，`from` 为起始小时（含，24 小时制） */
			greetings: [
				{ from: 5, text: '🌤️ 早上好，快趁机多睡点懒觉！' },
				{ from: 11, text: '☀️ 中午好，记得午休哦~' },
				{ from: 13, text: '🕞 下午好，饮茶先啦！' },
				{ from: 17, text: '🚶‍♂️ 下班啦！主打一个不听老板话~' },
				{ from: 19, text: '🌙 晚上好，来一起熬夜吧呜😭' },
				{ from: 0, text: '夜深了，早点休息，少熬夜呀' },
			] satisfies VisitorGreeting[],
			/** 会话内缓存的新鲜期（毫秒），刷新页面时不会重复请求 */
			cacheTtl: 30 * 60 * 1000,
			/** 单次请求超时（毫秒） */
			requestTimeout: 10 * 1000,
		} satisfies VisitorConfig,
	},

	// @keep-sorted
	footer: {
		/** 页脚版权信息，支持 <br> 换行等 HTML 标签 */
		copyright: `© ${Temporal.Now.plainDateISO().year.toString()} ${blogConfig.author.name}`,
		/** 侧边栏底部图标导航 */
		iconNav: [
			{ icon: 'tabler:home', text: '个人主页', url: blogConfig.author.homepage },
			{ icon: 'tabler:rss', text: '订阅', url: '/feed' },
		] satisfies NavItem[],
		/** 页脚站点地图 */
		nav: [
			{
				title: '探索',
				items: [
					{ icon: 'tabler:rss', text: '订阅', url: '/feed' },
				],
			},
			{
				title: '社交',
				items: [
					{ icon: 'tabler:mail', text: blogConfig.author.email, url: `mailto:${blogConfig.author.email}` },
				],
			},
			{
				title: '信息',
				items: [
					{ icon: 'simple-icons:nuxt', text: `主题: ${pascalCase(name)} ${version}`, url: 'https://github.com/L33Z22L11/blog-v3' },
					{ icon: 'tabler:color-swatch', text: '主题和组件文档', url: 'https://blog.zhilu.site/theme' },
				],
			},
		] satisfies Nav,
	},

	/** 左侧栏顶部 Logo */
	header: {
		logo: blogConfig.author.avatar,
		/** 展示标题文本，否则展示纯 Logo */
		showTitle: true,
		subtitle: blogConfig.subtitle,
		emojiTail: ['📝', '✨', '🌱'],
	},

	/** 友链页面 */
	link: {
		/** 无订阅源展示静音图标 */
		remindNoFeed: true,
		/** 友链分组内随机排序 */
		randomInGroup: true,
	},

	/** 左侧栏导航 */
	nav: [
		{
			title: '',
			items: [
				{ icon: 'tabler:files', text: '文章', url: '/' },
				{
					icon: 'tabler:list',
					text: '目录',
					url: '#',
					children: [
						{ icon: 'tabler:archive', text: '归档', url: '/archive' },
						{ icon: 'tabler:tag', text: '标签', url: '/tags' },
					],
				},
				{ icon: 'tabler:flame', text: '热搜', url: '/hot' },
				{ icon: 'tabler:message-2', text: '说说', url: '/memos' },
				{ icon: 'tabler:photo', text: '相册', url: '/gallery' },
				{
					icon: 'tabler:users',
					text: '友邻',
					url: '#',
					children: [
						{ icon: 'tabler:link', text: '友链', url: '/link' },
						{ icon: 'tabler:friends', text: '朋友圈', url: '/fcircle' },
					],
				},
				{ icon: 'tabler:message-circle', text: '留言板', url: '/message' },
				{ icon: 'tabler:user-circle', text: '关于', url: '/about' },
			],
		},
	] satisfies Nav,

	pagination: {
		perPage: 10,
		/** 默认排序方式，需要是 this.article.order 中的键名 */
		sortOrder: 'date' as keyof typeof blogConfig.article.order,
		/** 允许（普通/预览/归档）文章列表正序，开启后排序方式左侧图标可切换顺序 */
		allowAscending: false,
	},

	themes: {
		light: {
			icon: 'tabler:sun',
			tip: '浅色模式',
		},
		system: {
			icon: 'tabler:device-desktop',
			tip: '跟随系统',
		},
		dark: {
			icon: 'tabler:moon',
			tip: '深色模式',
		},
	},
})
