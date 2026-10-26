import type { FcircleItem } from '../../app/types/fcircle.ts'

export interface MergeOptions {
	/** 每个站点最多保留的条目数 */
	perSite: number
	/** 保留窗口（天） */
	maxAgeDays: number
	/** 当前时间，测试可注入 */
	now: Date
}

const dayMs = 24 * 60 * 60 * 1000

function timeOf(item: FcircleItem): number {
	const time = new Date(item.date).getTime()
	return Number.isNaN(time) ? 0 : time
}

function sortByDateDesc(items: FcircleItem[]): FcircleItem[] {
	return [...items].sort((a, b) => timeOf(b) - timeOf(a))
}

/**
 * 合并单站新旧条目：
 * - 以原文链接为键去重，新抓到的覆盖旧的；
 * - 本次抓取为空（失败 / 无订阅源）时完整沿用旧数据，不做年龄裁剪，避免页面内容抖动；
 * - 正常抓取时丢弃超出窗口的条目，但保底保留最新一条，防止长期不更新的站点凭空消失。
 */
export function mergeSiteItems(previous: FcircleItem[], incoming: FcircleItem[], options: MergeOptions): FcircleItem[] {
	const byLink = new Map<string, FcircleItem>()
	for (const item of previous)
		byLink.set(item.link, item)
	for (const item of incoming)
		byLink.set(item.link, item)

	const sorted = sortByDateDesc([...byLink.values()])

	if (!incoming.length)
		return sorted.slice(0, options.perSite)

	const cutoff = options.now.getTime() - options.maxAgeDays * dayMs
	const fresh = sorted.filter(item => timeOf(item) >= cutoff)
	const kept = fresh.length ? fresh : sorted.slice(0, 1)

	return kept.slice(0, options.perSite)
}

/** 跨站总量截断：只保留最新的若干条，被清空的站点直接从结果里移除 */
export function capGlobalItems<T extends { items: FcircleItem[] }>(sites: T[], maxItems: number): T[] {
	const picked = new Set<string>()
	sortByDateDesc(sites.flatMap(site => site.items))
		.slice(0, maxItems)
		.forEach(item => picked.add(item.link))

	return sites
		.map(site => ({ ...site, items: site.items.filter(item => picked.has(item.link)) }))
		.filter(site => site.items.length > 0)
}
