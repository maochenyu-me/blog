/** 赞助登记流程的四类评论。用户内容只以行内代码或白名单图片的形式出现。 */

import type { ParsedEntry } from './source.ts'
import type { CleanEntry, ValidationIssue } from './validate.ts'
import { fenceFor, inlineCode } from '../link-apply/render.ts'
import { formatEntryLine } from './source.ts'

/** 评论首行的隐藏标记，用来定位并更新自己发过的评论（幂等） */
export const markers = {
	summary: '<!-- reward-apply:summary -->',
	applied: '<!-- reward-apply:applied -->',
	skipped: '<!-- reward-apply:skipped -->',
	rejected: '<!-- reward-apply:rejected -->',
} as const

/** 只信任 GitHub 自己的附件域名，其他一律不内联（避免把任意 URL 变成页面里的图片） */
export function isTrustedShotUrl(raw: string): boolean {
	try {
		const url = new URL(raw)
		if (url.protocol !== 'https:')
			return false
		if (url.hostname === 'github.com')
			return url.pathname.startsWith('/user-attachments/')
		return url.hostname === 'githubusercontent.com' || url.hostname.endsWith('.githubusercontent.com')
	}
	catch {
		return false
	}
}

function amountText(amount: number): string {
	return `¥${amount}`
}

function tableRow(label: string, value: string): string {
	return `| ${label} | ${value.replaceAll('|', '\\|')} |`
}

function screenshotsBlock(screenshots: string[]): string[] {
	if (!screenshots.length)
		return ['', '> ⚠️ 没有在「支付截图」里检测到图片链接，请确认申请人是否真的拖了图。']

	const lines = ['', '**支付截图**：', '']
	for (const url of screenshots) {
		if (isTrustedShotUrl(url))
			lines.push(`![支付截图](${url})`)
		else
			lines.push(`- 外链（未内联）：${inlineCode(url, 120)}`)
	}
	return lines
}

export interface SummaryInput {
	entry?: CleanEntry
	note?: string
	missing: string[]
	issues: ValidationIssue[]
	duplicated: string[]
	screenshots: string[]
	existing?: ParsedEntry
}

export function summaryComment(input: SummaryInput): string {
	const lines = [markers.summary, '### 赞助登记 · 待审核', '']

	if (input.entry) {
		lines.push(
			'| 项 | 解析结果 |',
			'| --- | --- |',
			tableRow('名称', inlineCode(input.entry.name)),
			tableRow('金额', amountText(input.entry.amount)),
			tableRow('日期', input.entry.date),
		)
		if (input.note)
			lines.push(tableRow('备注', inlineCode(input.note, 100)))
	}
	else {
		lines.push('表单解析结果不完整：', '')
		for (const label of input.missing)
			lines.push(`- ❌ 缺少「${label}」`)
	}

	lines.push(...screenshotsBlock(input.screenshots))

	if (input.issues.length) {
		lines.push('', '**这些问题会导致无法写入名单**：', '')
		for (const issue of input.issues)
			lines.push(`- ❌ ${issue.field}：${issue.message}`)
	}

	if (input.duplicated.length) {
		lines.push('', `> ⚠️ 检测到重复字段（${input.duplicated.map(label => inlineCode(label)).join('、')}），issue 内容可能被手工改过。`)
	}

	if (input.existing) {
		lines.push(
			'',
			`> 名单里似乎已经有同名同日期的记录（${amountText(input.existing.amount)}），再下指令会被跳过、不会重复添加。`,
		)
	}

	if (input.entry && !input.issues.length) {
		lines.push(
			'',
			'> 管理员审核通过后，在本 issue 回复「加入赞助名单」，机器人会把这条写进 `app/reward.ts` 并自动重新部署。',
		)
	}
	else {
		lines.push('', '> 请修正后**重新提交一份申请**，修好之前不要下写入指令。')
	}

	lines.push('', '<sub>摘要来自表单解析，作者在关闭后仍可编辑 issue，**请以支付截图为准**。</sub>')
	return lines.join('\n')
}

export function appliedComment(entry: CleanEntry, issueNumber: number): string {
	return [
		markers.applied,
		'### 已加入赞助名单 ✅',
		'',
		`- 名称：${inlineCode(entry.name)}`,
		`- 金额：${amountText(entry.amount)}`,
		`- 日期：${entry.date}`,
		'',
		`已写入 \`app/reward.ts\`（关联 issue #${issueNumber}），并触发了一次重新部署，关于页稍后即可看到。`,
	].join('\n')
}

export function skippedComment(entry: CleanEntry, existing: ParsedEntry): string {
	return [
		markers.skipped,
		'### 未写入：名单里已有同名同日期的记录',
		'',
		`- 本次申请：${inlineCode(entry.name)} / ${amountText(entry.amount)} / ${entry.date}`,
		`- 已存在：${inlineCode(existing.name)} / ${amountText(existing.amount)} / ${existing.date}`,
		'',
		'如果是同一笔打款，忽略本条即可；如果是**同一个人同一天的两笔**，请管理员手工往 `app/reward.ts` 补一行。',
	].join('\n')
}

export function rejectedComment(issues: ValidationIssue[], duplicated: string[]): string {
	const lines = [markers.rejected, '### 未写入：申请内容不合法', '']
	for (const issue of issues)
		lines.push(`- ❌ ${issue.field}：${issue.message}`)
	if (duplicated.length)
		lines.push(`- ⚠️ 重复字段：${duplicated.map(label => inlineCode(label)).join('、')}`)
	lines.push('', '请申请人**重新提交一份申请**，或在 issue 里补充正确信息后再请管理员下指令。')
	return lines.join('\n')
}

export function failureComment(message: string): string {
	return [
		markers.rejected,
		'### 写入失败：脚本报错',
		'',
		`- ${inlineCode(message, 200)}`,
		'',
		'请管理员查看 Actions 日志；修好后在本 issue 再回复一次「加入赞助名单」即可重试（脚本是幂等的）。',
	].join('\n')
}

export function conflictComment(entry: CleanEntry): string {
	return [
		markers.rejected,
		'### 写入失败：推送 main 冲突',
		'',
		`条目（${inlineCode(entry.name)} / ${amountText(entry.amount)} / ${entry.date}）已生成但连续多次推送失败，请管理员手工插入下面这行：`,
		'',
		fenceFor(formatEntryLine(entry).trimStart(), 'ts'),
	].join('\n')
}
