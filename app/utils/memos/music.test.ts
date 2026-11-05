import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isMetingSupported, metingAudioUrl, metingCoverUrl, metingMetaUrl, musicPageUrl, parseMusicLink } from './music.ts'

const api = 'https://meting.example.test/api'

describe('parseMusicLink', () => {
	it('网易云单曲：三个入口形态都能解析', () => {
		const expected = { server: 'netease', type: 'song', id: '186016' }
		assert.deepEqual(parseMusicLink('https://music.163.com/#/song?id=186016'), expected)
		assert.deepEqual(parseMusicLink('https://music.163.com/song?id=186016'), expected)
		assert.deepEqual(parseMusicLink('https://music.163.com/m/song?id=186016'), expected)
	})

	it('网易云歌单', () => {
		assert.deepEqual(parseMusicLink('https://music.163.com/#/playlist?id=3778678'), {
			server: 'netease',
			type: 'playlist',
			id: '3778678',
		})
	})

	it('网易云专辑不支持（与上游一致返回 null）', () => {
		assert.equal(parseMusicLink('https://music.163.com/#/album?id=123'), null)
	})

	it('qQ 音乐：新版详情页 / 旧版 songid / 歌单', () => {
		assert.deepEqual(parseMusicLink('https://y.qq.com/n/ryqq_v2/songDetail/003abcXYZ'), {
			server: 'tencent',
			type: 'song',
			id: '003abcXYZ',
		})
		assert.deepEqual(parseMusicLink('https://y.qq.com/share/index.html?songid=123456'), {
			server: 'tencent',
			type: 'song',
			id: '123456',
		})
		assert.deepEqual(parseMusicLink('https://y.qq.com/n/ryqq_v2/playlist/7654321'), {
			server: 'tencent',
			type: 'playlist',
			id: '7654321',
		})
	})

	it('apple Music', () => {
		assert.deepEqual(parseMusicLink('https://music.apple.com/cn/album/example/1234567890?i=987654321'), {
			server: 'apple',
			type: 'album',
			id: '1234567890',
		})
		assert.deepEqual(parseMusicLink('https://music.apple.com/cn/song/example/1440833098'), {
			server: 'apple',
			type: 'song',
			id: '1440833098',
		})
	})

	it('非音乐站点 / 空值 / 非法输入返回 null', () => {
		assert.equal(parseMusicLink('https://example.com/song?id=1'), null)
		assert.equal(parseMusicLink(''), null)
		assert.equal(parseMusicLink(), null)
		assert.equal(parseMusicLink('not a url'), null)
		assert.equal(parseMusicLink('https://music.163.com/#/song'), null)
	})

	it('允许整段粘贴文案，取第一个链接', () => {
		assert.deepEqual(parseMusicLink('分享单曲 https://music.163.com/#/song?id=186016 好听'), {
			server: 'netease',
			type: 'song',
			id: '186016',
		})
	})
})

describe('meting 地址构造', () => {
	const netease = { server: 'netease', type: 'song', id: '186016' } as const
	const apple = { server: 'apple', type: 'album', id: '123' } as const

	it('apple 不被 meting 支持', () => {
		assert.equal(isMetingSupported(netease), true)
		assert.equal(isMetingSupported(apple), false)
		assert.equal(isMetingSupported(null), false)
	})

	it('元信息 / 音频 / 封面分别走 song、url、pic', () => {
		assert.equal(metingMetaUrl(api, netease), `${api}?server=netease&type=song&id=186016`)
		assert.equal(metingAudioUrl(api, netease), `${api}?server=netease&type=url&id=186016`)
		assert.equal(metingCoverUrl(api, netease), `${api}?server=netease&type=pic&id=186016`)
	})

	it('apple 的三种地址都返回空串（调用方据此降级）', () => {
		assert.equal(metingMetaUrl(api, apple), '')
		assert.equal(metingAudioUrl(api, apple), '')
		assert.equal(metingCoverUrl(api, apple), '')
	})
})

describe('musicPageUrl', () => {
	it('按音源生成对应音乐页', () => {
		assert.equal(musicPageUrl({ server: 'netease', type: 'song', id: '1' }), 'https://music.163.com/#/song?id=1')
		assert.equal(musicPageUrl({ server: 'netease', type: 'playlist', id: '2' }), 'https://music.163.com/#/playlist?id=2')
		assert.equal(musicPageUrl({ server: 'tencent', type: 'song', id: '3' }), 'https://y.qq.com/n/ryqq_v2/songDetail/3')
		assert.equal(musicPageUrl({ server: 'apple', type: 'album', id: '4' }), 'https://music.apple.com/cn/album/4')
	})
})
