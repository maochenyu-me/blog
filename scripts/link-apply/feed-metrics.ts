/**
 * 零依赖的订阅源指标：判格式、数条目、取最早/最新时间。
 * 只服务「预检提示」，不需要严格解析 XML，正则足够且好测。
 */

export type FeedFormat = 'atom' | 'rss' | 'rdf' | 'json' | 'unknown'

export interface FeedMetrics {
	format: FeedFormat
	items: number
	/** 最早的条目时间（ISO），取不到为 undefined */
	earliest?: string
	latest?: string
	title?: string
}

const entityMap: Record<string, string> = {
	'&amp;': '&',
	'&apos;': '\'',
	'&gt;': '>',
	'&lt;': '<',
	'&nbsp;': ' ',
	'&quot;': '"',
}

function decodeText(raw: string): string {
	return raw
		.replaceAll(/^<!\[CDATA\[|\]\]>$/g, '')
		.replaceAll(/&(?:amp|apos|gt|lt|nbsp|quot);/g, match => entityMap[match] ?? match)
		.replaceAll(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
		.replaceAll(/\s+/g, ' ')
		.trim()
}

function toIso(times: number[]): string | undefined {
	if (!times.length)
		return undefined
	return new Date(Math.min(...times)).toISOString()
}

function toIsoMax(times: number[]): string | undefined {
	if (!times.length)
		return undefined
	return new Date(Math.max(...times)).toISOString()
}

function measureJsonFeed(text: string): FeedMetrics {
	const data = JSON.parse(text) as { title?: string, items?: Array<Record<string, string>> }
	const items = Array.isArray(data.items) ? data.items : []
	const times = items
		.map(item => Date.parse(item.date_published ?? item.date_modified ?? ''))
		.filter(time => !Number.isNaN(time))
	return {
		format: 'json',
		items: items.length,
		earliest: toIso(times),
		latest: toIsoMax(times),
		title: data.title ? decodeText(data.title) : undefined,
	}
}

export function measureFeed(text: string): FeedMetrics {
	const src = text.trimStart()

	if (src.startsWith('{')) {
		try {
			return measureJsonFeed(text)
		}
		catch {
			return { format: 'unknown', items: 0 }
		}
	}

	const format: FeedFormat = /<feed[\s>]/i.test(src)
		? 'atom'
		: /<rss[\s>]/i.test(src)
			? 'rss'
			: /<rdf:RDF/i.test(src) ? 'rdf' : 'unknown'

	const items = (src.match(/<(?:entry|item)[\s>]/g) ?? []).length
	const times = [...src.matchAll(/<(?:published|updated|pubDate|dc:date)>([^<]*)<\//gi)]
		.map(match => Date.parse(decodeText(match[1] ?? '')))
		.filter(time => !Number.isNaN(time))

	const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(src)

	return {
		format,
		items,
		earliest: toIso(times),
		latest: toIsoMax(times),
		title: titleMatch?.[1] ? decodeText(titleMatch[1]) : undefined,
	}
}
