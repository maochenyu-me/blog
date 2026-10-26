import { stripHtml } from './parse.ts'

/** 摘要纯文本上限（字符数，中文按字算） */
export const maxExcerptLength = 140

/** 各家 feed 常见的「阅读全文」尾巴，摘到卡片里只会是噪音 */
const trailingNoise = /\s*(?:(?:点击)?(?:阅读|查看)(?:全文|原文)|继续阅读|read\s*more|»|→)[\s.。…]*$/i

/** 摘要转纯文本并截断；空摘要返回空串，页面据此隐藏该块 */
export function toExcerpt(summary?: string, maxLength = maxExcerptLength): string {
	if (!summary)
		return ''

	let text = stripHtml(summary).replace(trailingNoise, '').trim()
	const chars = [...text]

	if (chars.length > maxLength) {
		text = `${chars.slice(0, maxLength).join('').trimEnd()}…`
	}

	return text
}

/** 宽松解析各种 feed 时间写法，失败时回退（默认当前时间） */
export function toIsoDate(raw: string | undefined, fallback: Date = new Date()): string {
	const text = raw?.trim().replace(/\s*[[(][^\])]*[)\]]$/, '')
	const time = text ? new Date(text) : null

	return time && !Number.isNaN(time.getTime()) ? time.toISOString() : fallback.toISOString()
}
