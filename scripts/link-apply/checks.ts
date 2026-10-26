/** 友链规则的自动检查项。全部只做提示，不产生拒绝结论。 */

import type { FeedMetrics } from './feed-metrics.ts'
import type { ProbeResult } from './probe.ts'

export interface CheckRow {
	status: 'ok' | 'warn' | 'fail'
	title: string
	detail: string
}

/** 常见免费托管域名：命中就提醒申请人确认站点长期稳定 */
export const freeHostSuffixes = [
	'eu.org',
	'firebaseapp.com',
	'gitee.io',
	'github.io',
	'gitlab.io',
	'js.org',
	'netlify.app',
	'notion.site',
	'pages.dev',
	'vercel.app',
	'web.app',
	'workers.dev',
]

/** 提示阈值：文章数下限与建站时长下限，对应友链规则第 2 条 */
export const minArticles = 8
export const minAgeMonths = 3

export function parseUrl(raw: string): URL | undefined {
	try {
		return new URL(raw.trim())
	}
	catch {
		return undefined
	}
}

export function freeHostOf(hostname: string): string | undefined {
	const host = hostname.toLowerCase().replace(/\.$/, '')
	return freeHostSuffixes.find(suffix => host === suffix || host.endsWith(`.${suffix}`))
}

/** 跨日历时长的整月数（用于「建站满 3 个月」判定） */
export function monthsBetween(from: Date, to: Date): number {
	let months = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth())
	if (to.getDate() < from.getDate())
		months -= 1
	return months
}

export function formatDuration(ms: number): string {
	return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`
}

/** 表格单元格：竖线与反引号会破坏 markdown 表格，换行会破坏整行 */
function cell(value: string, max = 60): string {
	const flat = value.replaceAll(/\s+/g, ' ').trim().replaceAll('|', '\\|').replaceAll('`', '\'')
	if (!flat)
		return '（空）'
	return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat
}

export function siteRows(probe: ProbeResult, link: string): CheckRow[] {
	const rows: CheckRow[] = []
	const target = new URL(probe.finalUrl || link)

	if (probe.error) {
		rows.push({ status: 'fail', title: '站点可访问', detail: `❌ 请求失败：${cell(probe.error)}` })
	}
	else if (probe.ok) {
		rows.push({
			status: 'ok',
			title: '站点可访问',
			detail: `HTTP ${probe.status}，耗时 ${formatDuration(probe.elapsedMs)}`,
		})
	}
	else {
		rows.push({ status: 'fail', title: '站点可访问', detail: `HTTP ${probe.status}` })
	}

	if (target.protocol === 'https:')
		rows.push({ status: 'ok', title: 'HTTPS', detail: '已启用' })
	else
		rows.push({ status: 'fail', title: 'HTTPS', detail: '未启用 HTTPS（本站友链统一要求 HTTPS）' })

	if (probe.redirects.length) {
		const sameHost = probe.redirects.every(item => new URL(item).hostname === new URL(link).hostname)
		rows.push({
			status: 'warn',
			title: '跳转',
			detail: `${probe.redirects.length} 次跳转后到达 ${cell(target.origin)}${sameHost ? '' : '（跨域，请确认这是你的站点）'}`,
		})
	}

	// 地址连主机名都没解析出来（比如 file://）时，域名相关判断没有意义
	const free = target.hostname ? freeHostOf(target.hostname) : undefined
	if (free) {
		rows.push({
			status: 'warn',
			title: '域名类型',
			detail: `免费托管域名 \`.${cell(free)}\`，可以接受，但需要站点长期稳定`,
		})
	}
	else if (target.hostname) {
		rows.push({ status: 'ok', title: '域名类型', detail: `\`${cell(target.hostname)}\`（非已知免费托管域名）` })
	}

	return rows
}

export function feedRows(metrics: FeedMetrics | undefined, feedUrl: string, probeError: string, now: Date): CheckRow[] {
	const rows: CheckRow[] = []

	if (!metrics || metrics.format === 'unknown' || !metrics.items) {
		const reason = probeError ? `请求失败：${cell(probeError)}` : '未能解析出任何条目'
		rows.push({ status: 'warn', title: '订阅源可解析', detail: `${reason}（\`${cell(feedUrl, 80)}\`）` })
		return rows
	}

	rows.push({
		status: 'ok',
		title: '订阅源可解析',
		detail: `${metrics.format.toUpperCase()}，共 ${metrics.items} 条${metrics.title ? `（${cell(metrics.title, 30)}）` : ''}`,
	})

	if (metrics.items < minArticles) {
		rows.push({
			status: 'warn',
			title: '文章数量',
			detail: `订阅源里只有 ${metrics.items} 条，少于要求的 ${minArticles} 篇（若订阅源只保留最近 N 篇，请忽略此项）`,
		})
	}
	else {
		rows.push({ status: 'ok', title: '文章数量', detail: `${metrics.items} 条 ≥ ${minArticles} 篇` })
	}

	if (metrics.earliest) {
		const earliest = new Date(metrics.earliest)
		const age = monthsBetween(earliest, now)
		const detail = `最早一条 ${earliest.toISOString().slice(0, 10)}，约 ${age} 个月`
		if (age < minAgeMonths) {
			rows.push({
				status: 'warn',
				title: '建站时间',
				detail: `${detail}，可能不足 ${minAgeMonths} 个月（若订阅源只保留最近 N 篇，请忽略此项）`,
			})
		}
		else {
			rows.push({ status: 'ok', title: '建站时间', detail })
		}
	}

	return rows
}
