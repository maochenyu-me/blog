/** 朋友圈数据契约：由 `scripts/fcircle/fetch.ts` 生成，页面静态引入 `app/data/fcircle.json` */

/**
 * 站点抓取状态：
 * - `ok` 本次抓取成功
 * - `stale` 本次抓取失败，沿用上一次成功的数据
 * - `error` 本次抓取失败且没有旧数据可用
 * - `nofeed` 友链没有配置订阅源
 */
export type FcircleSiteStatus = 'ok' | 'stale' | 'error' | 'nofeed'

export interface FcircleItem {
	/** 纯文本标题 */
	title: string
	/** 原文绝对链接，同时作为去重主键 */
	link: string
	/** 纯文本摘要，已截断 */
	excerpt: string
	/** ISO 时间 */
	date: string
	/** 封面图绝对地址 */
	cover?: string
}

export interface FcircleSite {
	/** 站点标识：友链 link 的主机名，跨次快照继承旧数据的键 */
	id: string
	/** 展示名 */
	name: string
	/** 站点地址 */
	link: string
	/** 博客头像 */
	avatar: string
	/** 站点图标 */
	icon: string
	/** 订阅源地址 */
	feed?: string
	status: FcircleSiteStatus
	/** 本次失败原因，便于排查 */
	error?: string
	/** 最近一次成功抓取时间 */
	fetchedAt?: string
	items: FcircleItem[]
}

export interface FcircleData {
	/** 数据生成时间 */
	generatedAt: string
	sites: FcircleSite[]
}
