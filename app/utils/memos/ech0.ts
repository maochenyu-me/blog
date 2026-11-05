/**
 * Ech0 原始数据 → 统一视图模型（纯函数，`render` 由调用方注入，便于单测）。
 *
 * 契约要点（实测）：
 *   - `content` 是 Markdown **源码**，不是 HTML；
 *   - `created_at` 是 Unix **秒**；
 *   - `echo_files[].file.url` 可能是相对路径 `/api/files/...`；
 *   - `echo_files` / `tags` / `username` / `extension` 带 `omitempty`，可能整块缺失。
 */
import type { MemosExtension, MemosMedia, MemosMessage } from '~/types/memos'
import type { Ech0Echo, Ech0EchoFile, Ech0Extension } from '~/types/memos-ech0'
import { isBlankContent, markdownToPlainText, parseMarkdownHashtags, stripMarkdownHashtags } from './plain.ts'
import { resolveAssetUrl } from './url.ts'

export interface Ech0MapContext {
	/** 实例地址，末尾不带 `/` */
	apiBase: string
	/** 站点主页，用于生成原帖链接；留空回退 apiBase */
	siteUrl?: string
	/** Markdown → HTML。缺省时 `html` 为空串（单测里不需要真渲染） */
	render?: (markdown: string) => string
}

/**
 * 把可能是相对路径的资源地址补成绝对地址。
 * 兼容上游的三种形态：`/api/files/x.png`、`files/x.png`、外链绝对地址。
 * 实现与正文图片共用 `url.ts` 的同一套规则（避免两处正则各写一遍、行为漂移）。
 */
export function resolveEch0Url(url: string | undefined, apiBase: string) {
	return resolveAssetUrl(url, apiBase)
}

const categoryKinds: Record<string, MemosMedia['kind']> = {
	image: 'image',
	video: 'video',
	audio: 'audio',
	pdf: 'document',
	markdown: 'document',
	file: 'document',
}

/** 由 `category` 优先、`content_type` 兜底判断媒体类型 */
function resolveMediaKind(file: Ech0EchoFile['file']): MemosMedia['kind'] {
	const category = (file?.category ?? '').trim().toLowerCase()
	if (categoryKinds[category])
		return categoryKinds[category]
	const mime = (file?.content_type ?? '').trim().toLowerCase()
	if (mime.startsWith('image/'))
		return 'image'
	if (mime.startsWith('video/'))
		return 'video'
	if (mime.startsWith('audio/'))
		return 'audio'
	return 'unknown'
}

/** Ech0 附件 → 视图模型媒体项；没有可用 url 的条目直接丢弃 */
export function mapEchoFiles(raw: Ech0Echo, apiBase: string): MemosMedia[] {
	const list = [...(raw.echo_files ?? [])]
	list.sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0))
	const media: MemosMedia[] = []
	for (const item of list) {
		const file = item?.file
		const originalUrl = resolveEch0Url(file?.url, apiBase)
		if (!originalUrl)
			continue
		const kind = resolveMediaKind(file)
		media.push({
			id: item.id || file?.id || originalUrl,
			kind,
			status: 'ready',
			originalUrl,
			// Ech0 不生成缩略图，图片直接复用原图；音视频留空由前端用 poster 兜底
			thumbnailUrl: kind === 'image' ? originalUrl : '',
			fileName: file?.name || undefined,
			fileSize: typeof file?.size === 'number' && file.size > 0 ? file.size : undefined,
			width: typeof file?.width === 'number' && file.width > 0 ? file.width : undefined,
			height: typeof file?.height === 'number' && file.height > 0 ? file.height : undefined,
			mimeType: file?.content_type || undefined,
		})
	}
	return media
}

function nonEmptyString(value: unknown) {
	return typeof value === 'string' && value.trim() ? value.trim() : ''
}

function finiteNumber(value: unknown) {
	const num = typeof value === 'number' ? value : Number(value)
	return Number.isFinite(num) ? num : null
}

/**
 * 扩展 payload → 判别联合。
 * payload 是服务端自由 JSON，字段缺失/类型不对时返回 undefined（不渲染卡片），
 * 绝不让一张残缺卡片把整条说说搞崩。
 */
export function mapEchoExtension(extension: Ech0Extension | null | undefined): MemosExtension | undefined {
	if (!extension?.type)
		return undefined
	const payload = extension.payload ?? {}

	switch (extension.type) {
		case 'MUSIC': {
			const url = nonEmptyString(payload.url)
			return url ? { type: 'music', url } : undefined
		}
		case 'VIDEO': {
			const videoId = nonEmptyString(payload.videoId)
			return videoId ? { type: 'video', videoId } : undefined
		}
		case 'GITHUBPROJ': {
			const repoUrl = nonEmptyString(payload.repoUrl)
			return repoUrl ? { type: 'github', repoUrl } : undefined
		}
		case 'WEBSITE': {
			const site = nonEmptyString(payload.site)
			if (!site)
				return undefined
			return { type: 'website', title: nonEmptyString(payload.title) || site, site }
		}
		case 'LOCATION': {
			const latitude = finiteNumber(payload.latitude)
			const longitude = finiteNumber(payload.longitude)
			if (latitude === null || longitude === null)
				return undefined
			if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180)
				return undefined
			return {
				type: 'location',
				placeholder: nonEmptyString(payload.placeholder),
				latitude,
				longitude,
			}
		}
		case 'TWEET': {
			const url = nonEmptyString(payload.url)
			if (!url)
				return undefined
			return {
				type: 'tweet',
				url,
				username: nonEmptyString(payload.username),
				statusId: nonEmptyString(payload.statusId),
			}
		}
		default:
			return undefined
	}
}

/**
 * 标签 = 结构化 `tags` ∪ 正文里写的话题（去重后按出现顺序，最多 8 个）。
 *
 * 为什么取并集而不是二选一：实测线上 47 条里有 26 条的 `tags` 只有 Ech0 自动打的
 * 全站标签（`kemiaoshuoshuo`），作者真正想表达的 `#日常` `#吐槽` 只写在正文里；
 * 而正文标签又会在渲染前被剥掉（避免与底部 chips 重复）。若只认 `tags`，
 * 这批说说的标签信息会净丢失，卡片底部只剩一个陌生的全站标签。
 */
function collectTags(raw: Ech0Echo) {
	const tags: string[] = []
	const push = (label: string) => {
		if (label && !tags.includes(label))
			tags.push(label)
	}

	for (const tag of raw.tags ?? []) {
		const name = (tag?.name ?? '').trim()
		if (!name)
			continue
		push(name.startsWith('#') ? name : `#${name}`)
	}
	// 正文里的裸标签：结构化标签之外再补一轮，保证作者手写的分类不丢
	for (const label of parseMarkdownHashtags(raw.content ?? ''))
		push(label)

	return tags.slice(0, 8)
}

/** 一条 Echo → 一条说说卡片数据 */
export function mapEchoToMessage(raw: Ech0Echo, ctx: Ech0MapContext): MemosMessage {
	const markdown = stripMarkdownHashtags(raw.content ?? '')
	const plainText = markdownToPlainText(markdown)
	// 只有图片、没有文字的说说在纯文本里是空的，但它仍然是有效内容，不能被判空
	const hasImage = /!\[[^\]]*\]\([^)]*\)/.test(markdown)
	const blank = isBlankContent(plainText) && !hasImage
	const siteBase = (ctx.siteUrl || ctx.apiBase).replace(/\/+$/, '')

	return {
		id: raw.id,
		source: 'ech0',
		authorName: (raw.username ?? '').trim() || undefined,
		publishedAt: new Date(raw.created_at * 1000).toISOString(),
		html: blank ? '' : (ctx.render?.(markdown) ?? ''),
		plainText: blank ? undefined : plainText,
		sourceUrl: `${siteBase}/echo/${raw.id}`,
		media: mapEchoFiles(raw, ctx.apiBase),
		tags: collectTags(raw),
		extension: mapEchoExtension(raw.extension),
		favCount: raw.fav_count > 0 ? raw.fav_count : undefined,
	}
}

/** 一批 Echo → 卡片列表（保持接口返回顺序，即时间倒序） */
export function mapEchosToMessages(items: Ech0Echo[] | undefined, ctx: Ech0MapContext) {
	return (items ?? []).map(item => mapEchoToMessage(item, ctx))
}
