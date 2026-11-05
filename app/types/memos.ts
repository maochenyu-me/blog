/** koharu-suite 公开读取 API 的原始响应类型（字段以实际返回为准，缺失字段一律允许 null） */

export interface MemosRawChannel {
	id: string
	title: string
	username: string | null
}

export interface MemosRawMedia {
	id: string
	/** photo / video / voice / document / animation / sticker / unknown */
	kind: string
	/** ready / pending / unavailable */
	cacheStatus: string
	originalUrl: string | null
	thumbnailUrl: string | null
	fileName: string | null
	/** 字符串形式的字节数 */
	fileSize: string | null
	mimeType: string | null
	width: number | null
	height: number | null
	duration: number | null
}

export interface MemosRawMessage {
	id: string
	authorSignature: string | null
	channel: MemosRawChannel
	content: {
		/** text / caption / … */
		kind: string
		text: string
		html: string
		entities?: {
			type: string
			offset: number
			length: number
		}[]
	}
	media: MemosRawMedia[]
	mediaGroupId: string | null
	publishedAt: string
	revision: number
	sourceUrl: string | null
}

export interface MemosRawList<T> {
	items: T[]
	/** 为 null 表示没有下一页 */
	nextCursor: string | null
}

/** 视图模型 */

/** 说说数据源：tg = koharu-suite（Telegram 频道）；ech0 = 自部署 Ech0 */
export type MemosSource = 'tg' | 'ech0'

export interface MemosChannel {
	id: string
	title: string
	username?: string | null
}

export type MemosMediaKind = 'image' | 'video' | 'audio' | 'document' | 'unknown'

export interface MemosMedia {
	id: string
	kind: MemosMediaKind
	status: 'ready' | 'pending' | 'unavailable'
	originalUrl: string
	thumbnailUrl: string
	fileName?: string
	fileSize?: number
	duration?: number
	width?: number
	height?: number
	/** MIME，Ech0 附件会带；tg 源可能为空 */
	mimeType?: string
}

/**
 * Ech0 扩展卡片（payload 为服务端自由 JSON，这里是按 type 收窄后的判别联合）。
 * 解析失败或类型未知时整个 extension 为 undefined，卡片不渲染。
 */
export type MemosExtension
	= | { type: 'music', url: string }
		| { type: 'video', videoId: string }
		| { type: 'github', repoUrl: string }
		| { type: 'website', title: string, site: string }
		| { type: 'location', placeholder: string, latitude: number, longitude: number }
		| { type: 'tweet', url: string, username: string, statusId: string }

export interface MemosMessage {
	id: string
	/** 数据来源，决定卡片角标、跳转图标与文案 */
	source: MemosSource
	/** 作者显示名（tg 取频道标题，ech0 取 username） */
	authorName?: string
	/** 作者 @handle（tg 取频道 username） */
	authorHandle?: string
	/** ISO 时间字符串 */
	publishedAt: string
	revision?: number
	/** 由数据源生成的 HTML（tg 用接口给的，ech0 由 Markdown 渲染而来） */
	html: string
	/** 去掉标记后的正文纯文本，供「引用评论」使用 */
	plainText?: string
	/** 原帖地址 */
	sourceUrl?: string
	media: MemosMedia[]
	/** 从正文提取的 #话题 标签（统一带 `#` 前缀） */
	tags: string[]
	/** 仅 ech0：扩展卡片 */
	extension?: MemosExtension
	/** 仅 ech0：点赞数 */
	favCount?: number
}
