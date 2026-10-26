/**
 * 热搜页用到的第三方接口契约。
 * 数据源为 DailyHotApi 公开实例（https://hot-api.liiiu.cn），字段随平台不同会缺失，
 * 所以除 `title` 外一律可选，渲染前必须做存在性判断。
 */

/** 子分类的选项结构，键为查询参数取值，值为显示名 */
export interface HotParamOptions {
	/** 参数语义，如「排行榜分区」 */
	name: string
	/** 取值 → 显示名 */
	type: Record<string, string>
}

/** 部分平台支持子分类，键为查询参数名（实测都是 `type`） */
export type HotParams = Record<string, HotParamOptions>

/** 热榜单条 */
export interface HotItem {
	/** 唯一标识，部分平台（如百度）恒为 0，不能单独用作列表 key */
	id?: string | number
	title: string
	desc?: string
	cover?: string
	author?: string
	/** 毫秒时间戳，少数平台会给出非法值，使用前需校验范围 */
	timestamp?: number | null
	/** 热度值，微博 / 百度等平台没有该字段 */
	hot?: number
	url?: string
	mobileUrl?: string
}

/** 单个平台的接口返回 */
export interface HotResponse {
	code?: number
	/** 路由名，如 `weibo` */
	name?: string
	/** 中文站名，如「微博」 */
	title?: string
	/** 榜单名，如「热搜榜」 */
	type?: string
	description?: string
	params?: HotParams
	/** 榜单原始链接 */
	link?: string
	total?: number
	/** 是否命中接口侧缓存 */
	fromCache?: boolean
	/** 数据采集时间（ISO 字符串） */
	updateTime?: string
	data?: HotItem[]
}

/** 平台静态元数据：接口只给路由名，中文名与图标放本地 */
export interface HotPlatformMeta {
	name: string
	icon: string
}

/** 页面展示用的平台项 */
export interface HotPlatform extends HotPlatformMeta {
	/** 接口路由名，如 `weibo` */
	route: string
}

/** 子分类选项 */
export interface HotTypeOption {
	value: string
	label: string
}
