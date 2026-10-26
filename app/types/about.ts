/** 头像两侧的浮动标签，自上而下排布 */
export interface AboutTagColumns {
	left: string[]
	right: string[]
}

/** 渐变问候卡 */
export interface AboutGreeting {
	/** 第一行小字 */
	hello: string
	/** 名字前的引导词 */
	namePrefix: string
	/** 名字后的身份描述，按「、」拼接 */
	roles: string[]
	/** 身份描述末尾的高亮词 */
	highlight: string
}

/** 本站介绍卡：主句 + 轮播关键词 */
export interface AboutSite {
	/** 卡头小字 */
	tips: string
	/** 主句，按行拆开 */
	lines: string[]
	/** 轮播词前的引导词 */
	keywordPrefix: string
	/** 轮播词，按顺序循环淡入淡出 */
	keywords: string[]
}

/** 座右铭卡 */
export interface AboutMotto {
	/** 卡头小字 */
	tips: string
	text: string
	/** 出处标注 */
	from: string
}

/** 技能墙单项 */
export interface AboutSkill {
	name: string
	/** Iconify 图标名，构建期内联进产物 */
	icon: string
}

/** 心路历程节点 */
export interface AboutMilestone {
	/** 时间标注，短的写「2024.11」，最近的写「现在」 */
	time: string
	title: string
	desc: string
}
