/**
 * issue 打开时的自动预检。全部只作提示：不自动打标签、不自动关闭、不产生拒绝结论。
 * 检查项对齐友链规则里可以自动判定的部分（可访问性、HTTPS、订阅源、文章数、建站时间、域名类型）。
 */

import type { CheckRow } from './checks.ts'
import { feedRows, parseUrl, siteRows } from './checks.ts'
import { loadContext } from './context.ts'
import { measureFeed } from './feed-metrics.ts'
import { deliver } from './gh.ts'
import { parseIssueForm } from './parse.ts'
import { probeUrl, resolveIcon } from './probe.ts'
import { inlineCode, markers, missingComment, preflightComment } from './render.ts'

const ctx = loadContext()

async function main(): Promise<void> {
	const { fields, missing, duplicated } = parseIssueForm(ctx.body)

	if (missing.length) {
		await deliver(ctx, markers.preflight, missingComment(markers.preflight, missing, duplicated))
		return
	}

	const now = new Date()
	const rows: CheckRow[] = []
	const notes: string[] = []
	const link = fields.link!
	const feedUrl = fields.feed!
	const baseUrl = parseUrl(feedUrl)

	if (!parseUrl(link)) {
		rows.push({ status: 'fail', title: '站点地址', detail: '不是合法的 URL，请检查协议头与域名' })
	}
	else {
		const site = await probeUrl(link, { readBody: true })
		rows.push(...siteRows(site, link))

		if (site.ok && site.body) {
			const icon = fields.icon ? fields.icon : await resolveIcon(link, site.body)
			notes.push(icon
				? `\`icon\`：${fields.icon ? '使用你填写的地址' : `已自动探测为 ${inlineCode(icon, 100)}`}。`
				: '未能自动探测到 `icon`，收录时会请管理员手动补充。')
		}
	}

	if (!baseUrl) {
		rows.push({ status: 'fail', title: '订阅源可解析', detail: '订阅源地址不合法' })
	}
	else {
		const feed = await probeUrl(feedUrl, { readBody: true })
		const metrics = feed.ok && feed.body ? measureFeed(feed.body) : undefined
		rows.push(...feedRows(metrics, feedUrl, feed.error, now))
	}

	if (duplicated.length)
		notes.push(`⚠️ 检测到重复字段（${duplicated.join('、')}），issue 内容可能被手工编辑过，请核对。`)

	await deliver(ctx, markers.preflight, preflightComment(rows, notes))
}

await main()
