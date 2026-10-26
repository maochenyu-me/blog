import type { MusicSong, NeteaseLevel } from '~/types/music'

/**
 * Netease_url 适配层（纯函数）
 *
 * 实例是 Flask 服务（<https://github.com/Suxiaoqinx/Netease_url>），GET / POST 都支持，返回统一为
 * `{ data, message, status, success }`。实测（v2.0.0，2026-10-25）三个端点：
 *
 *   GET /playlist?id=          → data.playlist.{ name, coverImgUrl, description, tracks[] }
 *                                tracks 项为 { id, name, artists:"A/B", album, picUrl }
 *   GET /download?id=&quality= → 直接返回 audio/mp3 流，**支持 Range**（可拖动进度）
 *   GET /lyric?id=&type=lyric  → data.lrc.lyric 是 LRC 原文
 *   GET /song?id=&type=url     → data.url 是 CDN 直链，但**协议是 http**
 *
 * 关键取舍见 `NeteaseUrlConfig.audio`：直链是 http，https 站点直接引用会被混合内容拦掉，
 * 所以默认走 `/download` 代理（同域 https、支持 Range），代价是音频流量过自己的服务器。
 */

interface NeteaseTrack {
	id?: number | string
	name?: string
	artists?: string
	album?: string
	picUrl?: string
}

/** 拼实例接口地址 */
export function neteaseApiUrl(api: string, path: string, params: Record<string, string | number> = {}) {
	const base = api.replace(/\/+$/, '')
	const query = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]))
	const suffix = query.size > 0 ? `?${query.toString()}` : ''
	return `${base}/${path.replace(/^\/+/, '')}${suffix}`
}

/**
 * 播放地址（同域 https，支持 Range）。三种来源的代价不同：
 *  - `stream`：实例的流式转发端点（需自己给 Netease_url 打补丁加 `/stream`），边下边播，首字节最快；
 *  - `proxy` ：实例自带的 `/download`，会**先把整首歌落到服务器磁盘**再返回，首字节可能要十几秒；
 *  - `direct`：前端拿 CDN 直链，省带宽，但直链是 http，https 站点会被混合内容拦掉。
 */
export function neteaseAudioUrl(api: string, songId: string, level: NeteaseLevel, mode: 'stream' | 'proxy' = 'proxy') {
	if (mode === 'stream')
		return neteaseApiUrl(api, 'stream', { id: songId, level })
	return neteaseApiUrl(api, 'download', { id: songId, quality: level })
}

/** 歌词地址 */
export function neteaseLyricUrl(api: string, songId: string) {
	return neteaseApiUrl(api, 'song', { id: songId, type: 'lyric' })
}

/**
 * 直链解析地址（`audio: 'direct'` 时用）。
 * 用 `type=json` 而不是 `type=url`：一次同时返回 `data.url` 与 `data.lyric`，省一次歌词请求。
 */
export function neteaseDirectSongApi(api: string, songId: string, level: NeteaseLevel) {
	return neteaseApiUrl(api, 'song', { id: songId, type: 'json', level })
}

/**
 * 把 `/playlist` 的响应转成内部曲目。
 * 曲目只带元数据与平台 id，`src` 留给引擎在播放前现取（直链有时效）。
 */
export function neteaseParseTracks(raw: unknown): MusicSong[] {
	const list = (raw as { data?: { playlist?: { tracks?: NeteaseTrack[] } } } | null)?.data?.playlist?.tracks
	if (!Array.isArray(list))
		return []

	const songs: MusicSong[] = []
	for (const item of list) {
		const platformId = item?.id != null ? String(item.id) : ''
		const title = (item?.name ?? '').trim()
		if (!platformId || !title)
			continue
		songs.push({
			id: `netease:${platformId}`,
			title,
			artist: (item?.artists ?? '').trim(),
			album: (item?.album ?? '').trim(),
			cover: item?.picUrl ?? '',
			src: '',
			provider: 'netease-url',
			platformId,
			duration: 0,
		})
	}
	return songs
}

/** 从 `/song?type=lyric` 或 `type=json` 的响应里取 LRC 原文 */
export function neteaseParseLyric(raw: unknown): string {
	const data = (raw as { data?: Record<string, any> } | null)?.data
	if (!data)
		return ''
	// type=lyric → data.lrc.lyric；type=json → data.lyric（字符串）
	if (typeof data.lyric === 'string')
		return data.lyric
	const nested = data.lrc?.lyric
	return typeof nested === 'string' ? nested : ''
}

/** 从 `/song?type=url` 的响应里取 CDN 直链 */
export function neteaseParseDirectUrl(raw: unknown): string {
	const url = (raw as { data?: { url?: string } } | null)?.data?.url
	return typeof url === 'string' ? url : ''
}
