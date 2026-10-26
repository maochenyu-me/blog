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
}

export interface MemosMessage {
	id: string
	channel: MemosChannel
	authorSignature?: string
	publishedAt: string
	revision: number
	/** 由 API 生成的安全 HTML */
	html: string
	plainText?: string
	sourceUrl?: string
	media: MemosMedia[]
	/** 从正文提取的 #话题 标签 */
	tags: string[]
}
