import type { MetingServer, MetingType, MusicSong } from '~/types/music'

/**
 * Meting-API 适配层（纯函数，无 Nuxt 上下文依赖）
 *
 * 接口（xizeyoupan/Meting-API，路径是 `/api` 而不是根路径）：
 *   GET {api}?server=netease&type=playlist&id=3778678
 *   GET {api}?server=netease&type=url&id=287398     → 302 到音乐平台直链
 *   GET {api}?server=netease&type=lrc&id=287398     → text/plain 的 LRC 原文
 *   GET {api}?server=netease&type=pic&id=287398     → 302 到图片
 * type 支持 playlist / artist / song / search，**没有 album**。
 *
 * 返回的数组项结构固定为 `{ title, author, pic, url, lrc }`，两个坑：
 *   1. url / lrc 指向实例自己的 `http://` 地址，https 站点直接引用会被当作混合内容拦掉，
 *      所以这里不照抄返回值，而是抽出其中的歌曲 id 后用配置的 api 重建（顺带拿到稳定 id）；
 *   2. pic 有时是 `http://p2.music.126.net/...`，同样要升级成 https。
 */

/** Meting 返回的单条曲目 */
interface MetingTrack {
	title?: string
	author?: string
	pic?: string
	url?: string
	lrc?: string
}

/** 把 http 升级成 https，其他协议原样返回 */
export function metingForceHttps(url: string) {
	if (!url)
		return ''
	if (url.startsWith('http://'))
		return `https://${url.slice('http://'.length)}`
	return url
}

/** 构造 Meting 接口地址 */
export function metingApiUrl(api: string, options: { server: string, type: MetingType | 'url' | 'lrc' | 'pic', id: string }) {
	const base = api.replace(/\/+$/, '')
	const query = new URLSearchParams({ server: options.server, type: options.type, id: options.id })
	return `${base}?${query.toString()}`
}

/** 从 `...?type=url&id=123` 里抽出歌曲 id；抽不到返回空串 */
export function metingSongId(url: string) {
	if (!url)
		return ''
	try {
		return new URL(url, 'https://placeholder.invalid').searchParams.get('id') ?? ''
	}
	catch {
		return ''
	}
}

/**
 * 把 Meting 的数组响应转成播放器内部曲目。
 * 抽不到歌曲 id 时用「标题 + 艺人」拼一个稳定 id，保证进度记忆不串歌。
 */
export function metingParseSongs(raw: unknown, api: string, server: MetingServer): MusicSong[] {
	if (!Array.isArray(raw))
		return []

	const songs: MusicSong[] = []
	for (const item of raw as MetingTrack[]) {
		const title = (item?.title ?? '').trim()
		if (!title)
			continue
		const artist = (item?.author ?? '').trim()
		const nativeId = metingSongId(item?.url ?? '') || metingSongId(item?.lrc ?? '')
		const songId = nativeId || `${title}::${artist}`
		const prefix = `meting:${server}:${songId}`

		songs.push({
			id: prefix,
			title,
			artist,
			cover: metingForceHttps(item?.pic ?? ''),
			// 一律用配置里的 api 重建，避免实例返回 http 地址
			src: metingApiUrl(api, { server, type: 'url', id: nativeId || songId }),
			lrc: metingApiUrl(api, { server, type: 'lrc', id: nativeId || songId }),
			duration: 0,
		})
	}
	return songs
}

/** 音源的中文名，用于自动生成的歌单描述 */
export function metingServerLabel(server: MetingServer) {
	return server === 'tencent' ? 'QQ 音乐' : '网易云'
}

/** 取数类型的中文名，用于自动生成的歌单名 */
export function metingTypeLabel(type: MetingType) {
	return { playlist: '歌单', artist: '歌手', song: '单曲' }[type]
}
