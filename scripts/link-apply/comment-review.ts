/**
 * 管理员重开 issue 并打上 `失联` / `无效` 标签时的评论。
 * 两个标签的文案不同，且都会先复检一遍站点，避免误标。
 * 注意：管理员「先打标签再关闭」的路径由 comment-closed.ts 兜住，这里只管 issue 处于 open 的情况。
 */

import type { CheckRow } from './checks.ts'
import { feedRows, parseUrl, siteRows } from './checks.ts'
import { loadContext } from './context.ts'
import { measureFeed } from './feed-metrics.ts'
import { deliver } from './gh.ts'
import { parseIssueForm } from './parse.ts'
import { probeUrl } from './probe.ts'
import { inlineCode, markers, rejectedComment } from './render.ts'

const ctx = loadContext()

function toDetails(rows: CheckRow[]): string[] {
	return rows
		.filter(row => row.status !== 'ok')
		.map(row => `${row.title}：${row.detail}`)
}

async function reviewBroken(link: string, feedUrl: string): Promise<void> {
	if (!parseUrl(link)) {
		await deliver(ctx, markers.rejected, rejectedComment('你的站点目前无法访问', [
			'issue 里的站点地址不合法或已被修改，无法探测。',
		]))
		return
	}

	const site = await probeUrl(link, { readBody: false })
	if (site.ok) {
		await deliver(ctx, markers.rejected, rejectedComment('复检显示你的站点当前可以访问', [
			`${inlineCode(link, 100)} 返回 HTTP ${site.status}，耗时约 ${site.elapsedMs}ms。`,
			'如果是误标，管理员会移除 `失联` 标签；如果你刚刚修好站点，请回复说明，管理员会重新审核。',
		]))
		return
	}

	const details = [
		`❌ 无法访问：${site.error ? inlineCode(site.error, 120) : `HTTP ${site.status}`}`,
		`探测地址：${inlineCode(link, 100)}`,
	]

	if (parseUrl(feedUrl)) {
		const feed = await probeUrl(feedUrl, { readBody: true })
		details.push(feed.ok
			? `订阅源当前可访问（HTTP ${feed.status}），但站点首页打不开，请检查域名解析与部署状态。`
			: `订阅源同样无法访问：${feed.error ? inlineCode(feed.error, 120) : `HTTP ${feed.status}`}。`)
	}

	await deliver(ctx, markers.rejected, rejectedComment('你的网站目前无法访问，已从友链中移除', details))
}

async function reviewInvalid(link: string, feedUrl: string, missing: string[], duplicated: string[]): Promise<void> {
	const details: string[] = []

	if (missing.length)
		details.push(`❌ 缺少必填信息：${missing.join('、')}`)
	if (duplicated.length)
		details.push(`⚠️ 重复字段（${duplicated.join('、')}），issue 内容可能被手工编辑过`)

	if (parseUrl(link) && parseUrl(feedUrl)) {
		const site = await probeUrl(link, { readBody: true })
		const feed = await probeUrl(feedUrl, { readBody: true })
		const metrics = feed.ok && feed.body ? measureFeed(feed.body) : undefined
		details.push(...toDetails([
			...siteRows(site, link),
			...feedRows(metrics, feedUrl, feed.error, new Date()),
		]))
	}
	else {
		details.push('❌ 站点地址或订阅源地址不合法')
	}

	if (!details.length)
		details.push('站点内容或质量未达到友链规则要求（人工判定）。')

	await deliver(ctx, markers.rejected, rejectedComment('站点信息无效，未通过友链审核', details))
}

async function main(): Promise<void> {
	const { fields, missing, duplicated } = parseIssueForm(ctx.body)
	const link = fields.link ?? ''
	const feedUrl = fields.feed ?? ''

	// 两个标签同时存在时，「无效」优先：它包含「不是暂时的失联」的意思
	if (ctx.labels.includes('无效'))
		await reviewInvalid(link, feedUrl, missing, duplicated)
	else
		await reviewBroken(link, feedUrl)
}

await main()
