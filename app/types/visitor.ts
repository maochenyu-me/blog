/**
 * 欢迎来访者 widget 的配置与接口契约。
 * IP 接口只保证给到访客公网 IP，地理信息由另一个接口补，字段可能缺失，
 * 所以 `VisitorGeo` 里的定位字段在渲染前都要做存在性判断。
 */

/** 正文片段：字符串为普通文字，对象可高亮或带链接 */
export interface VisitorContentPartObject {
	text: string
	/** 加粗并用主色显示，适合强调身份或关键词 */
	highlight?: boolean
	/** 站内路径或完整链接，有值时按链接渲染 */
	href?: string
}

/** 正文由若干段落组成，段落再由片段拼成，便于在同一行内混排强调与链接 */
export type VisitorContentPart = string | VisitorContentPartObject

/** 问候语：`from` 为起始小时（含，24 小时制），按数值大小匹配，与数组顺序无关 */
export interface VisitorGreeting {
	from: number
	text: string
}

/** 博主坐标，用于计算访客距离；`name` 仅用于无障碍与提示文案 */
export interface VisitorOrigin {
	name: string
	lat: number
	lng: number
}

/** 地理接口响应中我们用得上的字段子集，已抹平各接口的字段差异 */
export interface VisitorGeo {
	ip: string
	/** 国家名，如「马来西亚」 */
	country: string
	/** 国家代码，如 `MY`，用于判断是否国内访客 */
	countryCode: string
	/** 省份 / 一级行政区 */
	region: string
	city: string
	/** 纬度，接口没给时为 `null`，此时不显示距离 */
	lat: number | null
	lng: number | null
}

/** `app.config.ts` 中 `component.visitor` 的完整配置 */
export interface VisitorConfig {
	title: string
	/** 正文段落，每项是一段 */
	content: VisitorContentPart[][]
	origin: VisitorOrigin
	/** 取访客公网 IP 的接口，响应需为 `{ data: { ip } }` */
	ipApi: string
	/** 地理接口，`{ip}` 会替换成访客 IP；留空则跳过定位，只显示 IP 与问候语 */
	geoApi: string
	/** IP 默认模糊，悬停或键盘聚焦时显示 */
	blurIp: boolean
	greetings: VisitorGreeting[]
	/** 会话内缓存的新鲜期（毫秒） */
	cacheTtl: number
	/** 单次请求超时（毫秒） */
	requestTimeout: number
}
