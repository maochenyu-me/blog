export type SafeGoLinkMode = 'all' | 'listed'

/** 可疑目标的特征类型，键名对应 app/data/safego.ts 的 text.risks */
export type SafeGoRiskKind = 'http' | 'ip' | 'punycode' | 'long' | 'port'

export interface SafeGoText {
	/** 中转页浏览器标题 */
	title: string
	/** 主提示语，`{site}` 会被替换成站点名 */
	leave: string
	/** 倒计时提示语，`{seconds}` 会被替换成剩余秒数 */
	countdown: string
	/** countdown 为负数时的提示语 */
	manual: string
	/** 主按钮文案 */
	jump: string
	/** 次按钮文案 */
	back: string
	/** 参数缺失/非法时的标题 */
	invalid: string
	/** 参数缺失/非法时的说明 */
	invalidDesc: string
	/** 失败态的按钮文案 */
	home: string
	risks: Record<SafeGoRiskKind, string>
}

export interface SafeGoConfig {
	/** 总开关：false 时插件不注册任何监听，全站外链恢复直连 */
	enable: boolean
	route: {
		/** 中转页路由，需与 app/pages 下的文件名一致 */
		path: string
		/** 目标地址的查询参数名 */
		param: string
		/** 是否用 base64url 编码目标地址 */
		base64: boolean
	}
	pages: {
		/** 生效路径，glob 风格；`/**` 表示全站 */
		include: string[]
		/** 排除路径，glob 风格 */
		exclude: string[]
	}
	links: {
		/** all = 除白名单外全部中转；listed = 只中转 domains 里列出的域名 */
		mode: SafeGoLinkMode
		/** 域名名单，按主机后缀匹配 */
		domains: string[]
		/** 带这些属性的链接一律不中转 */
		ignoreAttrs: string[]
	}
	behavior: {
		/** 自动跳转倒计时秒数；负数表示不自动跳转 */
		countdown: number
		/** 悬停或键盘聚焦卡片时暂停倒计时 */
		pauseOnInteraction: boolean
		/** 切换浏览器标签页时暂停倒计时 */
		pauseWhenHidden: boolean
		/** Ctrl/Cmd/Shift + 左键、鼠标中键是否也走中转页 */
		interceptModifiedClick: boolean
	}
	text: SafeGoText
}

/** 中转页对目标地址的解析结果 */
export type SafeGoTarget =
	| { ok: true, href: string, host: string, risks: SafeGoRiskKind[] }
	| { ok: false, reason: 'missing' | 'malformed' | 'protocol' }
