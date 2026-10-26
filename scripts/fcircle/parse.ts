import { XMLParser } from 'fast-xml-parser'

/** 订阅源里的一条原始条目，字段仍是原始 HTML / 原始时间字符串 */
export interface RawFeedItem {
	title: string
	/** 绝对地址，已在解析阶段按订阅源地址补全 */
	link: string
	/** ISO 时间；无法识别时缺省，由上层回退到抓取时间 */
	date?: string
	/** 摘要原文（可能含 HTML） */
	summary?: string
	/** 绝对地址封面图 */
	cover?: string
}

export interface ParsedFeed {
	title?: string
	description?: string
	items: RawFeedItem[]
}

/** 作者摘要短于该长度时视为「占位摘要」，改用正文 */
const minAuthorSummary = 40

const parser = new XMLParser({
	ignoreAttributes: false,
	attributeNamePrefix: '@_',
	trimValues: true,
	parseTagValue: false,
	parseAttributeValue: false,
})

type XmlValue = string | number | boolean | Record<string, any> | XmlValue[]

function toArray<T>(value: T | T[] | undefined): T[] {
	if (value === undefined || value === null)
		return []
	return Array.isArray(value) ? value : [value]
}

function asRecord(value: XmlValue | undefined): Record<string, any> {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, any> : {}
}

/** 取元素文本：字符串 / `#text` / 数组首项 */
function readText(value: XmlValue | undefined): string {
	if (typeof value === 'string' || typeof value === 'number')
		return String(value)
	if (Array.isArray(value))
		return readText(value[0])
	const record = asRecord(value)
	return typeof record['#text'] === 'string' ? record['#text'] : ''
}

function decodeEntities(text: string): string {
	const named: Record<string, string> = {
		amp: '&',
		apos: `'`,
		gt: '>',
		lt: '<',
		nbsp: ' ',
		quot: '"',
	}
	return text.replaceAll(/&(#x[\da-f]+|#\d+|\w+);/gi, (raw, code: string) => {
		if (code.startsWith('#x') || code.startsWith('#X'))
			return String.fromCodePoint(Number.parseInt(code.slice(2), 16))
		if (code.startsWith('#'))
			return String.fromCodePoint(Number(code.slice(1)))
		return named[code.toLowerCase()] ?? raw
	})
}

/** 去标签、解实体、压空白 —— 标题只需要纯文本 */
export function stripHtml(html: string): string {
	return decodeEntities(
		html
			.replaceAll(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
			.replaceAll(/<[^>]*>/g, ' '),
	)
		.replaceAll(/\s+/g, ' ')
		.trim()
}

function resolveUrl(url: string | undefined, base: string): string | undefined {
	const raw = url?.trim()
	if (!raw || raw.startsWith('data:') || raw.startsWith('javascript:'))
		return undefined
	try {
		const resolved = new URL(raw, base)
		return resolved.protocol === 'http:' || resolved.protocol === 'https:' ? resolved.href : undefined
	}
	catch {
		return undefined
	}
}

/** Atom 的 link 是带 rel 的属性数组，RSS 的 link 是文本节点 */
function readLink(raw: Record<string, any>): string | undefined {
	const links = toArray<XmlValue>(raw.link)

	for (const link of links) {
		if (typeof link === 'string' || typeof link === 'number')
			return String(link)

		const record = asRecord(link)
		const rel = typeof record['@_rel'] === 'string' ? record['@_rel'] : undefined
		const href = typeof record['@_href'] === 'string' ? record['@_href'] : readText(record['#text'])
		if (!href || (rel && rel !== 'alternate'))
			continue
		return href
	}

	// RSS 1.0 (RDF) 偶尔用 rdf:about 作为唯一标识
	return typeof raw['@_rdf:about'] === 'string' ? raw['@_rdf:about'] : undefined
}

/** 作者摘要够长就用摘要，否则用正文；两者都没有时退回摘要原文 */
function pickSummary(raw: Record<string, any>): string | undefined {
	const authorSummary = stripHtml([
		readText(raw.summary),
		readText(raw.description),
		readText(raw['itunes:summary']),
	].filter(Boolean).join('\n'))
	const content = [
		readText(raw['content:encoded']),
		readText(raw.content),
		readText(raw['media:description']),
	].find(text => text.trim())

	if (authorSummary.length >= minAuthorSummary)
		return authorSummary
	return content?.trim() ? content : (authorSummary || undefined)
}

function pickCover(raw: Record<string, any>, summary: string | undefined, link: string): string | undefined {
	const enclosures = toArray<XmlValue>(raw.enclosure)
	for (const enclosure of enclosures) {
		const record = asRecord(enclosure)
		const type = typeof record['@_type'] === 'string' ? record['@_type'] : ''
		if (type && !type.startsWith('image'))
			continue
		const url = resolveUrl(typeof record['@_url'] === 'string' ? record['@_url'] : undefined, link)
		if (url)
			return url
	}

	for (const media of [raw['media:content'], raw['media:thumbnail']]) {
		for (const entry of toArray<XmlValue>(media)) {
			const record = asRecord(entry)
			const medium = typeof record['@_medium'] === 'string' ? record['@_medium'] : ''
			if (medium && medium !== 'image')
				continue
			const url = resolveUrl(typeof record['@_url'] === 'string' ? record['@_url'] : undefined, link)
			if (url)
				return url
		}
	}

	for (const image of toArray<XmlValue>(raw['itunes:image'])) {
		const url = resolveUrl(asRecord(image)['@_href'], link)
		if (url)
			return url
	}

	const inline = summary?.match(/<img\s[^>]*\bsrc=["']?([^"'\s>]+)/i)?.[1]
	return resolveUrl(inline, link)
}

/** Atom 常带 Temporal 风格的 `[UTC]` 后缀，`new Date` 不认 */
function normalizeDate(raw: string | undefined): string | undefined {
	const text = raw?.trim().replace(/\s*[[(][^\])]*[)\]]$/, '')
	if (!text)
		return undefined
	const time = new Date(text)
	return Number.isNaN(time.getTime()) ? undefined : time.toISOString()
}

function toItem(raw: XmlValue, feedUrl: string): RawFeedItem | undefined {
	const record = asRecord(raw)
	const link = resolveUrl(readLink(record), feedUrl)
	if (!link)
		return undefined

	const summary = pickSummary(record)
	const title = stripHtml(readText(record.title)) || '(无标题)'
	const date = normalizeDate(readText(record.published ?? record.pubDate ?? record['dc:date'] ?? record.updated ?? record.date))

	return { title, link, date, summary, cover: pickCover(record, summary, link) }
}

/** 解析 Atom / RSS 2.0 / RSS 1.0（RDF）三种订阅源 */
export function parseFeed(xml: string, feedUrl: string): ParsedFeed {
	if (!xml?.trim())
		return { items: [] }

	let doc: Record<string, any>
	try {
		doc = asRecord(parser.parse(xml) as XmlValue)
	}
	catch {
		return { items: [] }
	}

	const root = asRecord(doc.feed ?? doc.rss ?? doc['rdf:RDF'] ?? doc.RDF)
	const channel = asRecord(root.channel ?? root)
	const entries = toArray<XmlValue>(root.entry ?? channel.item ?? root.item ?? root.entry)

	if (!Object.keys(root).length)
		return { items: [] }

	const items = entries
		.map(entry => toItem(entry, feedUrl))
		.filter((item): item is RawFeedItem => !!item)

	return {
		title: stripHtml(readText(channel.title ?? root.title)) || undefined,
		description: stripHtml(readText(channel.description ?? root.subtitle)) || undefined,
		items,
	}
}
