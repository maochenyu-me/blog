/**
 * 摘要的提示词与输出清洗。
 *
 * 目标：一段 100~150 字的中文纯文本，能直接放进打字机卡片，
 * 所以既要压住模型的「总结腔」，也要容忍它偶发的 Markdown / 前后缀。
 */

/** 可接受的字数区间（比目标区间宽松一点，避免为好摘要反复重试） */
export const summaryLengthRange = { min: 40, max: 240 }

export const systemPrompt = [
	'你是中文技术博客的编辑，负责为文章写一段导读摘要。',
	'要求：',
	'1. 用一段连贯的中文，100 到 150 字，不分点、不加标题、不用 Markdown 标记。',
	'2. 说清这篇文章在讲什么、解决了什么问题、结论或亮点是什么。',
	'3. 直接陈述内容，不要用「本文」「这篇文章」开头，不要出现「摘要」二字，不要复述题目。',
	'4. 只依据给出的正文，不要编造文中不存在的信息，不使用第一人称。',
	'5. 只输出摘要正文，不要任何前后缀说明。',
].join('\n')

export interface PostDigest {
	title?: string
	categories?: string[]
	tags?: string[]
	text: string
}

export function buildUserMessage(input: PostDigest): string {
	const lines: string[] = []

	if (input.title?.trim())
		lines.push(`标题：${input.title.trim()}`)

	if (input.categories?.length)
		lines.push(`分类：${input.categories.join('、')}`)

	if (input.tags?.length)
		lines.push(`标签：${input.tags.join('、')}`)

	lines.push('', '正文：', input.text)

	return lines.join('\n')
}

/** 清掉模型爱加的代码围栏、前缀、引号、列表符号，压成单段 */
export function normalizeSummary(raw: string): string {
	let text = raw.trim()

	text = text.replace(/^```[\w-]*\n?/, '').replace(/\n?```$/, '').trim()
	text = text.replace(/^[*_#\s]*(?:AI\s*)?(?:文章|本文)?(?:摘要|总结)[*_\s]*[:：]\s*/i, '')
	text = text.replace(/^\s*(?:[-*+]|\d+\.)\s*/gm, '')
	text = text.replace(/\*\*|__|~~|`/g, '')
	text = text.replace(/\s*\n\s*/g, ' ')
	text = text.replace(/[ \t]{2,}/g, ' ')
	text = text.replace(/([。！？!?])\1+/g, '$1')
	text = text.replace(/^["“”'‘’]+|["“”'‘’]+$/g, '')

	return text.trim()
}

export type SummaryRejection = 'empty' | 'too-short' | 'too-long'

export function isSummaryAcceptable(summary: string): { ok: boolean, reason?: SummaryRejection } {
	const length = [...summary].length

	if (!length)
		return { ok: false, reason: 'empty' }

	if (length < summaryLengthRange.min)
		return { ok: false, reason: 'too-short' }

	if (length > summaryLengthRange.max)
		return { ok: false, reason: 'too-long' }

	return { ok: true }
}
