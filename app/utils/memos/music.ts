/**
 * Ech0 音乐扩展卡片的取数链路（纯函数，可单测）。
 *
 * Ech0 的 `MUSIC.payload.url` 存的是**音乐分享页地址**（网易云 / QQ / Apple），
 * 不是音频直链，也没有单独的 id 字段。要播放必须先解析成 `{server, type, id}`，
 * 再交给 Meting-API 换成音频 / 封面 / 歌词地址 —— 与本博客悬浮播放器同一条链路。
 *
 * 解析规则移植自上游 `web/src/utils/other.ts` 的 `parseMusicURL`，保持行为一致。
 */
import { metingApiUrl } from '../meting.ts'

export interface MusicLinkInfo {
	/** Meting 的 `server` 参数 */
	server: 'netease' | 'tencent' | 'apple'
	/** 该链接指向的资源类型（Apple 有 album） */
	type: 'song' | 'playlist' | 'album'
	id: string
}

function matchHost(url: URL, domain: string) {
	return url.hostname === domain || url.hostname.endsWith(`.${domain}`)
}

/**
 * 从任意文本里解析出音乐分享页信息。
 * 解析不了返回 `null`，调用方负责降级成外链卡片。
 */
export function parseMusicLink(input: string | undefined): MusicLinkInfo | null {
	const value = (input ?? '').trim()
	if (!value)
		return null

	// 允许整段粘贴「文案 + 链接」，取第一个 http(s) 地址
	const matched = value.match(/https?:\/\/[^\s"'<>]+/i)
	const raw = matched ? matched[0] : value

	let url: URL
	try {
		url = new URL(raw)
	}
	catch {
		return null
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:')
		return null

	if (matchHost(url, 'music.163.com')) {
		// 网易云分享页常把查询串放在 hash 里（`#/song?id=xxx`），searchParams 读不到，必须用原始串匹配
		const id = raw.match(/[?&]id=(\d+)/)?.[1]
		if (!id)
			return null
		const path = `${url.hash}${url.pathname}`
		if (/(?:\/|#\/|\/m\/)song/.test(path))
			return { server: 'netease', type: 'song', id }
		if (/(?:\/|#\/|\/m\/)playlist/.test(path))
			return { server: 'netease', type: 'playlist', id }
		return null
	}

	if (matchHost(url, 'qq.com')) {
		const detailMatch = raw.match(/songDetail\/([a-zA-Z0-9]+)/)
		if (detailMatch)
			return { server: 'tencent', type: 'song', id: detailMatch[1]! }
		const legacySongId = raw.match(/[?&]songid=(\d+)/)?.[1]
		if (legacySongId)
			return { server: 'tencent', type: 'song', id: legacySongId }
		const playlistMatch = raw.match(/\/playlist\/(\d+)/i)
		if (playlistMatch)
			return { server: 'tencent', type: 'playlist', id: playlistMatch[1]! }
		return null
	}

	if (matchHost(url, 'music.apple.com')) {
		const appleMatch = raw.match(/\/(song|album)\/[^/]+\/(\d+)/)
		if (!appleMatch)
			return null
		return { server: 'apple', type: appleMatch[1] as 'song' | 'album', id: appleMatch[2]! }
	}

	return null
}

/** Meting-API 不支持 Apple Music，这类链接只能降级成外链卡片 */
export function isMetingSupported(info: MusicLinkInfo | null): info is MusicLinkInfo & { server: 'netease' | 'tencent' } {
	return !!info && info.server !== 'apple'
}

/** 元信息（标题 / 歌手 / 封面）走 `type=<song|playlist>`，返回数组 */
export function metingMetaUrl(api: string, info: MusicLinkInfo) {
	if (!isMetingSupported(info))
		return ''
	const type = info.type === 'playlist' ? 'playlist' : 'song'
	return metingApiUrl(api, { server: info.server, type, id: info.id })
}

/**
 * 音频地址。这里**不照抄** Meting 返回的 `url`（那是实例自己的 http 地址，
 * https 站点直接引用会被判混合内容），而是用配置的 api 重建。
 */
export function metingAudioUrl(api: string, info: MusicLinkInfo) {
	if (!isMetingSupported(info))
		return ''
	return metingApiUrl(api, { server: info.server, type: 'url', id: info.id })
}

/** 封面地址，同样重建以拿到 https */
export function metingCoverUrl(api: string, info: MusicLinkInfo) {
	if (!isMetingSupported(info))
		return ''
	return metingApiUrl(api, { server: info.server, type: 'pic', id: info.id })
}

/** 音乐页地址，用于卡片上的「打开音乐」兜底链接 */
export function musicPageUrl(info: MusicLinkInfo) {
	switch (info.server) {
		case 'netease':
			return `https://music.163.com/#/${info.type === 'playlist' ? 'playlist' : 'song'}?id=${info.id}`
		case 'tencent':
			return info.type === 'playlist'
				? `https://y.qq.com/n/ryqq_v2/playlist/${info.id}`
				: `https://y.qq.com/n/ryqq_v2/songDetail/${info.id}`
		default:
			return `https://music.apple.com/cn/${info.type}/${info.id}`
	}
}
