/**
 * 把解析出的字段渲染成 issue 评论。
 *
 * 唯一的安全边界在代码块：用户内容只出现在围栏代码块或行内代码里，围栏长度按内容动态计算，
 * 因此用户在简介里写 ``` 也打不断围栏，也不会在叙述区变成 @提及或可点击链接。
 */

import type { CheckRow } from './checks.ts'
import type { LinkForm } from './parse.ts'

/** 评论首行的隐藏标记，用来定位并更新自己发过的评论（幂等） */
export const markers = {
	entry: '<!-- link-apply:entry -->',
	preflight: '<!-- link-apply:preflight -->',
	accepted: '<!-- link-apply:accepted -->',
	rejected: '<!-- link-apply:rejected -->',
} as const

/** 字段顺序与 app/types/feed.ts 一致，长度上限按友链卡片的实际排版需要 */
const fieldSpecs: Array<{ key: keyof LinkForm, max: number }> = [
	{ key: 'author', max: 32 },
	{ key: 'title', max: 60 },
	{ key: 'desc', max: 120 },
	{ key: 'link', max: 512 },
	{ key: 'feed', max: 512 },
	{ key: 'icon', max: 512 },
	{ key: 'avatar', max: 512 },
]

export function clip(value: string, max: number): { text: string, clipped: boolean } {
	const flat = value.replaceAll(/\s+/g, ' ').trim()
	if (flat.length <= max)
		return { text: flat, clipped: false }
	return { text: `${flat.slice(0, Math.max(0, max - 1))}…`, clipped: true }
}

export function oneLine(value: string, max = 80): string {
	return clip(value, max).text
}

/** 行内代码：禁止反引号与竖线破坏渲染 */
export function inlineCode(value: string, max = 80): string {
	const flat = oneLine(value, max).replaceAll('`', '\'').replaceAll('|', '\\|')
	return flat ? `\`${flat}\`` : '（空）'
}

/** TS 单引号字符串：反斜杠必须先转义，否则会吃掉后面的引号 */
export function tsQuote(value: string): string {
	return `'${value.replaceAll(/\\/g, '\\\\').replaceAll(/'/g, '\\\'')}'`
}

/** 围栏长度取内容里最长的反引号连跑 + 1，用户内容无法提前闭合代码块 */
export function fenceFor(payload: string, lang: string): string {
	const longest = [...payload.matchAll(/`+/g)].reduce((max, match) => Math.max(max, match[0].length), 0)
	const fence = '`'.repeat(Math.max(3, longest + 1))
	return `${fence}${lang}\n${payload}\n${fence}`
}

export interface EntryResult {
	code: string
	/** 被截断的字段名（评论里提示管理员核对） */
	clipped: string[]
}

export function tsEntry(fields: Partial<LinkForm>, date: string): EntryResult {
	const clipped: string[] = []
	const lines: string[] = []
	for (const { key, max } of fieldSpecs) {
		const raw = fields[key] ?? ''
		// FeedEntry.icon 是必填字段，探测不到也要显式留空
		if (!raw && key !== 'icon')
			continue
		const { text, clipped: isClipped } = clip(raw, max)
		if (isClipped)
			clipped.push(key)
		lines.push(`\t${key}: ${tsQuote(text)},`)
	}
	lines.push(`\tdate: ${tsQuote(date)},`)
	return { code: `{\n${lines.join('\n')}\n},`, clipped }
}

/** 通过申请：给出可直接贴进 app/feeds.ts 的条目 */
export function entryComment(fields: Partial<LinkForm>, date: string, notes: string[]): string {
	const { code, clipped } = tsEntry(fields, date)
	const lines = [
		markers.entry,
		'感谢申请！下面是本次申请对应的 `FeedEntry`，可直接粘贴到 `app/feeds.ts` 的 `entries` 数组：',
		'',
		fenceFor(code, 'ts'),
		'',
		`- \`date\` 取本 issue 的创建日期（${inlineCode(date)}，北京时间）。`,
		...notes.map(note => `- ${note}`),
	]
	if (clipped.length)
		lines.push(`- ⚠️ 以下字段超过长度上限已截断，请核对：${clipped.map(key => inlineCode(key)).join('、')}`)
	lines.push('', '<sub>由机器人根据 issue 表单内容生成，收录前请人工核对一遍。</sub>')
	return lines.join('\n')
}

/** 申请内容不完整：不生成条目，只列缺失项 */
export function missingComment(marker: string, missing: string[], duplicated: string[]): string {
	const lines = [
		marker,
		'这个 issue 缺少必填信息，暂时无法生成条目：',
		'',
		...missing.map(label => `- ❌ ${label}`),
	]
	if (duplicated.length) {
		lines.push(
			'',
			`> ⚠️ 检测到重复字段：${duplicated.map(label => inlineCode(label)).join('、')}。issue 内容可能被手工编辑过，请核对后按表单重新提交。`,
		)
	}
	lines.push('', '请**重新提交一份申请**（新建 issue）并补齐必填项，本 issue 会保持关闭。')
	return lines.join('\n')
}

export function preflightComment(rows: CheckRow[], notes: string[]): string {
	const lines = [
		markers.preflight,
		'### 友链申请自动预检',
		'',
		'| 检查项 | 结果 |',
		'| --- | --- |',
		...rows.map(row => `| ${statusIcon(row.status)} ${row.title} | ${row.detail} |`),
	]
	if (notes.length) {
		lines.push('', ...notes.map(note => `- ${note}`))
	}
	lines.push(
		'',
		'> 以上仅为自动提示，**不构成审核结论**，最终是否收录由管理员决定。',
		'> 确认无误后请**自行关闭本 issue** 表示提交完成。',
	)
	return lines.join('\n')
}

function statusIcon(status: CheckRow['status']): string {
	if (status === 'ok')
		return '✅'
	if (status === 'warn')
		return '⚠️'
	return '❌'
}

/** 通过审核（管理员关闭时不再贴条目代码块） */
export function acceptedComment(): string {
	return [
		markers.accepted,
		'感谢申请，本站已收录你的站点 🎉',
		'',
		'- 友链条目已由申请人关闭 issue 时生成的评论提供，管理员已录入 `app/feeds.ts`。',
		'- 若你的站点信息（地址/头像/订阅源）之后有变动，欢迎重新提交一份申请。',
		'- 站点长期失联会被移除友链，届时 issue 会重新打开说明原因。',
	].join('\n')
}

/** 驳回（不符合规则 / 站点失联） */
export function rejectedComment(reason: string, details: string[]): string {
	const lines = [
		markers.rejected,
		`### ${reason}`,
	]
	if (details.length) {
		lines.push('', ...details.map(detail => `- ${detail}`))
	}
	lines.push(
		'',
		'> 修正之后请**重新提交一份申请**，不必在本 issue 里回复。',
		'> 如果你认为这是误判，可以在本 issue 里回复说明，管理员会人工复核。',
	)
	return lines.join('\n')
}
