/**
 * Markdown → 纯文本 / 标签处理（纯函数，无 Nuxt 上下文依赖，可被 `node --test` 直接跑）。
 *
 * 用途：
 *   1. 卡片「引用评论」需要一段干净的纯文本，不能把 `**` `![]()` 塞进评论框；
 *   2. Ech0 的 `tags` 是结构化字段，正文里手写的 `#标签` 属于重复信息，需要在**渲染前**剥掉
 *      （在 Markdown 源码层剥离比在生成后的 HTML 上跑正则安全：不会误伤标签属性里的 `#`）。
 */

/** 与 `useMemos.ts` 中的 tg 实现保持同一套规则：前面不能是单词字符 / `/` / `&` / `#` */
const hashtagSource = String.raw`(?<![\w/&#])#[\p{L}\p{N}_]{2,32}`
const bareHashtagPattern = new RegExp(`${hashtagSource}\\s*`, 'gu')

/** 围栏代码块：剥离标签时要整块跳过，避免把 `#include` 当成话题标签 */
const fencePattern = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g

/**
 * 从 Markdown 源码里删掉裸写的 `#话题`（围栏代码块内不动）。
 * 结构化标签由数据源的 `tags` 字段提供，正文里保留会造成卡片上重复出现。
 */
export function stripMarkdownHashtags(markdown = '') {
	if (!markdown)
		return ''
	return markdown
		.split(fencePattern)
		.map((part, index) => (index % 2 === 1
			? part
			: part
					.replace(bareHashtagPattern, '')
					// 标签摘掉后常留下连续空格与行尾空格，顺手收一下
					.replace(/[ \t]{2,}/g, ' ')
					.replace(/[ \t]+$/gm, '')))
		.join('')
}

/** 从 Markdown 源码里按出现顺序提取 `#话题`，去重并限制条数 */
export function parseMarkdownHashtags(markdown = '', limit = 8) {
	const tags: string[] = []
	if (!markdown)
		return tags
	for (const match of markdown.matchAll(new RegExp(hashtagSource, 'gu'))) {
		const tag = match[0]
		if (!tags.includes(tag))
			tags.push(tag)
		if (tags.length >= limit)
			break
	}
	return tags
}

/** 只剩空白或标点，视为「没有正文」 */
export function isBlankContent(text = '') {
	return /^[\s\p{P}]*$/u.test(text)
}

const inlineRules: [RegExp, string][] = [
	// 围栏代码块的标记行（含语言标识）先摘掉，剩下的代码正文原样保留；
	// 必须在行内代码规则之前做，否则 ```js 会被 `` `+([^`]+)`+ `` 整段吃掉
	[/^[ \t]*(?:`{3}|~{3})[^\n]*$/gm, ''],
	// 图片：保留 alt 文本（alt 为空则整体丢弃）
	[/!\[([^\]]*)\]\([^)]*\)/g, '$1'],
	// 链接：保留文字
	[/\[([^\]]*)\]\([^)]*\)/g, '$1'],
	// 自动链接
	[/<(https?:\/\/[^\s>]+)>/g, '$1'],
	// 行内代码
	[/`+([^`]+)`+/g, '$1'],
	// 表格分隔行（整行 `|---|:--:|`）
	[/^[-\s:|][-\s:]*\|[-\s:|]*$/gm, ''],
	// 表格竖线
	[/\|/g, ' '],
	// 强调 / 删除线
	[/\*\*([^*]+)\*\*/g, '$1'],
	[/__([^_]+)__/g, '$1'],
	[/~~([^~]+)~~/g, '$1'],
	[/\*([^*\n]+)\*/g, '$1'],
	[/_([^_\n]+)_/g, '$1'],
	// 标题、引用、列表、分隔线（`[ \t]` 而非 `\s`，避免跨行吞掉空行）
	[/^[ \t]{0,3}#{1,6}[ \t]+/gm, ''],
	[/^[ \t]{0,3}>[ \t]?/gm, ''],
	[/^[ \t]{0,3}(?:[-*+]|\d{1,3}[.)])[ \t]+/gm, ''],
	[/^[ \t]{0,3}[-*_](?:[ \t]*[-*_]){2,}[ \t]*$/gm, ''],
	// 残留的 HTML 标签
	[/<\/?[a-z][^>]*>/gi, ''],
]

/** Markdown 源码 → 用于引用的纯文本 */
export function markdownToPlainText(markdown = '') {
	if (!markdown)
		return ''
	let text = markdown
	for (const [pattern, replacement] of inlineRules)
		text = text.replace(pattern, replacement)
	return text
		// 行尾多余空格
		.replace(/[ \t]+$/gm, '')
		// 三行以上空行折叠成两行
		.replace(/\n{3,}/g, '\n\n')
		.trim()
}
