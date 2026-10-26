/**
 * issue 关闭时的评论。这是唯一会产出 `app/feeds.ts` 条目的地方。
 *
 * 分支优先级：
 * 1. 带 `无效` / `失联` 标签 → 驳回文案（管理员常「先打标签再关闭」，必须在这里兜住）
 * 2. 关闭原因选了 not_planned → 未收录文案
 * 3. 申请人自己关闭（提交完成）→ 条目代码块
 * 4. 管理员关闭（已收录）→ 收录感谢文案
 */

import type { LinkForm } from './parse.ts'
import { isClosedByAuthor, loadContext } from './context.ts'
import { deliver } from './gh.ts'
import { parseIssueForm } from './parse.ts'
import { probeUrl, resolveIcon } from './probe.ts'
import { acceptedComment, entryComment, inlineCode, markers, missingComment, rejectedComment } from './render.ts'

const brokenLabels = ['失联', '无效']

const ctx = loadContext()

/** 表单没填 icon 时抓 favicon 兜底，顺带产出评论里的说明 */
async function withIcon(fields: Partial<LinkForm>): Promise<{ fields: Partial<LinkForm>, notes: string[] }> {
	const notes: string[] = []
	const provided = fields.icon ?? ''
	let icon = provided

	if (!icon && fields.link) {
		try {
			const site = await probeUrl(fields.link, { readBody: true })
			icon = site.ok ? await resolveIcon(fields.link, site.body) : ''
		}
		catch {
			icon = ''
		}
	}

	fields.icon = icon
	if (!icon)
		notes.push('没能自动探测到 `icon`，已留空，请手动补充（`FeedEntry.icon` 是必填字段）。')
	else if (!provided)
		notes.push(`\`icon\` 未填写，已自动探测为 ${inlineCode(icon, 100)}；不合适请手动替换。`)

	notes.push('`archs`（可选）请按实际技术栈手补，如 `[\'Nuxt\', \'Vercel\']`。')
	return { fields, notes }
}

async function main(): Promise<void> {
	const hit = ctx.labels.filter(label => brokenLabels.includes(label))

	if (hit.length) {
		const reason = hit.includes('无效')
			? '申请未通过：站点信息不符合友链规则'
			: '申请未通过：你的站点目前无法访问'
		await deliver(ctx, markers.rejected, rejectedComment(reason, []))
		return
	}

	if (ctx.stateReason === 'not_planned') {
		await deliver(ctx, markers.rejected, rejectedComment('申请未通过：本 issue 以「不计划处理」关闭', [
			'内容已修正后，欢迎重新提交一份申请。',
		]))
		return
	}

	if (!isClosedByAuthor(ctx)) {
		const { missing } = parseIssueForm(ctx.body)
		if (missing.length) {
			await deliver(ctx, markers.rejected, rejectedComment('无法收录：申请内容不完整', [
				`❌ 缺少必填信息：${missing.join('、')}`,
				'如需收录，请按申请表重新提交一份。',
			]))
			return
		}
		await deliver(ctx, markers.accepted, acceptedComment())
		return
	}

	const { fields, missing, duplicated } = parseIssueForm(ctx.body)
	if (missing.length) {
		await deliver(ctx, markers.entry, missingComment(markers.entry, missing, duplicated))
		return
	}

	const prepared = await withIcon(fields)
	const notes = prepared.notes
	if (duplicated.length)
		notes.push(`⚠️ 检测到重复字段（${duplicated.join('、')}），issue 内容可能被手工编辑过，请核对。`)

	await deliver(ctx, markers.entry, entryComment(prepared.fields, ctx.date, notes))
}

await main()
