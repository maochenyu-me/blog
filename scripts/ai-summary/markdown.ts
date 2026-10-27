/**
 * 把文章 Markdown 压成纯文本，喂给模型。
 *
 * 代码块、MDC 组件参数、表格分隔线这些对「这篇文章在讲什么」没有帮助，
 * 留着既费 token 又容易把模型带偏，直接丢掉。块级清理按行走状态机，
 * 行内标记才用正则，免得写出一堆会回溯爆炸的规则。
 */

/** 具名插槽行（MDC 的 `#tab1`） */
const slotRe = /^#[\w-]+$/

function isFence(line: string): string | undefined {
	return line.match(/^(`{3,}|~{3,})/)?.[1]
}

function isTableDivider(line: string): boolean {
	return line.includes('-') && /^[|:\-\s]*$/.test(line) && /-{2,}/.test(line)
}

/** 丢掉围栏代码块、MDC 组件行与表格分隔行 */
function stripBlocks(markdown: string): string {
	const kept: string[] = []
	let fence: string | undefined

	for (const line of markdown.split('\n')) {
		const trimmed = line.trim()
		const marker = isFence(trimmed)

		if (fence) {
			// 只有同一种符号的围栏才能闭合，``` 里的 ~~~ 不算
			if (marker && marker[0] === fence[0])
				fence = undefined
			continue
		}

		if (marker) {
			fence = marker
			continue
		}

		if (trimmed.startsWith('::'))
			continue

		if (slotRe.test(trimmed))
			continue

		if (isTableDivider(trimmed))
			continue

		kept.push(line)
	}

	return kept.join('\n')
}

export function toPlainText(markdown: string): string {
	let text = stripBlocks(markdown)

	// 图片整段丢掉，链接只留文字
	text = text.replace(/!\[[^\]]*\]\([^)]*\)/g, '')
	text = text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
	text = text.replace(/\[([^\]]*)\]\[[^\]]*\]/g, '$1')
	text = text.replace(/<[^>]+>/g, '')
	text = text.replace(/`([^`]*)`/g, '$1')

	text = text.replace(/\|/g, ' ')

	text = text.replace(/^[ \t]{0,3}#{1,6}[ \t]*/gm, '')
	text = text.replace(/^[ \t]*>[ \t]?/gm, '')
	text = text.replace(/^[ \t]*(?:[-*+]|\d+\.)[ \t]+/gm, '')

	text = text.replace(/\*\*/g, '')
	text = text.replace(/~~/g, '')
	text = text.replace(/(^|\s)[*_](\S[^*_\n]*)[*_](?=\s|$)/g, '$1$2')
	text = text.replace(/\[\^[^\]]*\]/g, '')

	text = text
		.split('\n')
		.map(line => line.replace(/[ \t]{2,}/g, ' ').trim())
		.join('\n')

	text = text.replace(/\n{3,}/g, '\n\n')

	return text.trim()
}

/** 按段落 / 句末标点截断，别把一句话切断在半路 */
export function truncateText(text: string, maxLength: number): string {
	const chars = [...text]

	if (chars.length <= maxLength)
		return text

	const head = chars.slice(0, maxLength).join('')
	const cut = Math.max(
		head.lastIndexOf('。'),
		head.lastIndexOf('！'),
		head.lastIndexOf('？'),
		head.lastIndexOf('\n'),
	)
	const base = cut > 0 ? head.slice(0, cut + 1) : head

	return `${base.trimEnd()}…`
}
