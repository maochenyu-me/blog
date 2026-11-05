/**
 * Ech0 公开读取 API 的原始响应类型。
 *
 * 契约来源：`POST {apiBase}/api/echo/query`（实测 + 上游源码 `internal/model/echo/echo.go`）。
 * 注意后端 json tag 带 `omitempty`：`echo_files` / `tags` / `username` / `extension` 等
 * 字段**可能整块缺失**而不是 `null`，所以这里一律可选。
 */

/** 统一响应信封：成功 `code === 1` */
export interface Ech0Envelope<T> {
	code: number
	msg: string
	data: T
	error_code?: string
	message_key?: string
	message_params?: Record<string, unknown>
}

/** `POST /api/echo/query` 的 data */
export interface Ech0Page<T> {
	total: number
	items: T[]
}

export interface Ech0Tag {
	id: string
	name: string
	usage_count?: number
	created_at?: number
}

/** 附件：`file` 里才有真正的 url / 尺寸信息 */
export interface Ech0File {
	id: string
	key: string
	/** local / s3 / external */
	storage_type: string
	/** 可能是相对路径 `/api/files/images/xxx.png`，也可能是外链绝对地址 */
	url: string
	name?: string
	content_type?: string
	size?: number
	width?: number
	height?: number
	/** image / video / audio / pdf / markdown / file */
	category?: string
	created_at?: number
}

export interface Ech0EchoFile {
	id: string
	echo_id: string
	file_id: string
	sort_order?: number
	file?: Ech0File
}

export type Ech0ExtensionType = 'MUSIC' | 'VIDEO' | 'GITHUBPROJ' | 'WEBSITE' | 'LOCATION' | 'TWEET'

export interface Ech0Extension {
	id: string
	echo_id: string
	type: Ech0ExtensionType | string
	payload: Record<string, unknown>
	created_at?: number
	updated_at?: number
}

export interface Ech0Echo {
	id: string
	/** Markdown 源码 */
	content: string
	username?: string
	echo_files?: Ech0EchoFile[]
	/** waterfall / grid / horizontal / carousel / stack / none */
	layout?: string
	private: boolean
	user_id: string
	extension?: Ech0Extension | null
	tags?: Ech0Tag[]
	fav_count: number
	/** Unix 秒 */
	created_at: number
}
