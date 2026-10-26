/** 播放器用到的数据契约（本地音源，无平台 API 依赖） */

export interface MusicSong {
	/** 唯一 id，用于记忆上次播放与列表比对 */
	id: string
	title: string
	artist: string
	album?: string
	/** 封面：`/music/covers/xxx.webp` 或绝对 URL；留空时用默认音符图标 */
	cover?: string
	/** 时长（秒），仅在拿不到 metadata 前用于显示，填 0 或省略即可 */
	duration?: number
	/**
	 * 音频地址：`/music/songs/xxx.mp3` 或绝对 URL。
	 * 远程解析型音源（`provider` 有值）可以留空，播放前由引擎现取。
	 */
	src: string
	/** 歌词：`.lrc` 地址，或直接写 LRC 原文 */
	lrc?: string
	/**
	 * 远程解析器标识。
	 * 有值时 `src` 允许为空 —— 引擎会在播放前调对应接口换成真实地址（直链有时效，不能预存）。
	 */
	provider?: MusicProvider
	/** 平台原始 id（如网易云 songId），供 `provider` 解析用 */
	platformId?: string
}

/** 远程解析器 */
export type MusicProvider = 'netease-url'

/** 远程歌单来源 */
export type MusicPlaylistSource = 'local' | 'meting' | 'netease'

export interface MusicPlaylist {
	/** 唯一 id，用于弹窗切换与进度记忆 */
	id: string
	name: string
	desc?: string
	/** 歌单封面，留空时取第一首歌的封面 */
	cover?: string
	songs: MusicSong[]
	/** 数据来源：本地配置 / 远程 Meting 接口；缺省视为 local */
	source?: MusicPlaylistSource
}

/** Meting-API 支持的音源 */
export type MetingServer = 'netease' | 'tencent'

/** Meting-API 支持的取数类型（该接口没有 album） */
export type MetingType = 'playlist' | 'artist' | 'song'

/**
 * 一条远程歌单配置。
 * Meting 的 playlist / artist / song 三种类型返回的都是同一个数组结构，
 * 因此这里只需要换 type 与 id。
 */
export interface MetingPlaylistConfig {
	/** 歌单 / 歌手 / 单曲的平台 id */
	id: string
	/** 自定义显示名，留空时按音源类型自动命名 */
	name?: string
	desc?: string
	/** 自定义封面，留空时取第一首歌的封面 */
	cover?: string
	/** 取数类型，默认 playlist */
	type?: MetingType
	/** 音源，默认 netease */
	server?: MetingServer
	/** 是否禁用本条 */
	disabled?: boolean
}

/** `blog.config.ts` → `music.meting` */
export interface MetingConfig {
	/** 接口地址，指向 Meting-API 的 /api 路由 */
	api: string
	/** 远程歌单列表；为空表示不启用远程数据源 */
	playlists: MetingPlaylistConfig[]
	/** 歌单缓存时长（毫秒），0 表示不缓存 */
	cacheTtl: number
	/** 单次请求超时（毫秒） */
	timeout: number
}

/** 网易云音质档位（Netease_url 的 `level` 参数） */
export type NeteaseLevel = 'standard' | 'exhigh' | 'lossless' | 'hires' | 'sky' | 'jyeffect' | 'jymaster' | 'dolby'

/** Netease_url 的一条歌单配置 */
export interface NeteasePlaylistConfig {
	/** 网易云歌单 id（`music.163.com/#/playlist?id=` 后面那串数字） */
	id: string
	name?: string
	desc?: string
	cover?: string
	disabled?: boolean
}

/** `blog.config.ts` → `music.neteaseUrl` */
export interface NeteaseUrlConfig {
	/** 实例地址，末尾不要带 `/` */
	api: string
	/** 音质：standard / exhigh(320k) / lossless / hires … */
	level: NeteaseLevel
	/**
	 * 播放地址来源：
	 * - `stream`：实例的流式转发端点 `/stream`（需自行打补丁，见 memory.md），边下边播、首字节最快；
	 * - `proxy` ：实例自带的 `/download`，会先把整首歌下载到服务器磁盘，首字节可能要十几秒；
	 * - `direct`：用解析出的 CDN 直链，省服务器带宽，但直链是 http，https 站点会被混合内容拦掉。
	 */
	audio: 'stream' | 'proxy' | 'direct'
	/** 歌单列表；为空表示不启用 */
	playlists: NeteasePlaylistConfig[]
	/** 歌单缓存时长（毫秒），0 表示不缓存 */
	cacheTtl: number
	/** 单次请求超时（毫秒），歌单首拉可能较慢 */
	timeout: number
}

/** 播放模式：列表循环 / 单曲循环 / 随机 */
export type PlayMode = 'list' | 'one' | 'shuffle'

/** 播放器状态 */
export type PlayerStatus = 'idle' | 'loading' | 'playing' | 'paused'

/** 解析后的 LRC 行 */
export interface LrcLine {
	/** 秒 */
	time: number
	text: string
}
