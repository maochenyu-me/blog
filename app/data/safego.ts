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
