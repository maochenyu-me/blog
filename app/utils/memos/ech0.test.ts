import type { Ech0Echo } from '~/types/memos-ech0'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { mapEchoExtension, mapEchoFiles, mapEchosToMessages, mapEchoToMessage, resolveEch0Url } from './ech0.ts'
import { identityRenderer } from './markdown.ts'

const ctx = {
	apiBase: 'https://m.example.test',
	siteUrl: 'https://m.example.test',
	render: identityRenderer,
}

function makeEcho(overrides: Partial<Ech0Echo> = {}): Ech0Echo {
	return {
		id: '01a09ad5-825a-7552-a99d-08ebd2a9553c',
		content: '今天的**碎碎念**',
		username: 'kemiao',
		layout: 'waterfall',
		private: false,
		user_id: 'u1',
		fav_count: 2,
		created_at: 1789304078,
		tags: [{ id: 't1', name: '日常', usage_count: 21, created_at: 1781953126 }],
		...overrides,
	}
}

describe('resolveEch0Url', () => {
	it('相对路径补实例域名', () => {
		assert.equal(resolveEch0Url('/api/files/images/a.png', ctx.apiBase), 'https://m.example.test/api/files/images/a.png')
	})

	it('上游兼容形态 files/xxx 补成 /api/files/xxx', () => {
		assert.equal(resolveEch0Url('files/a.png', ctx.apiBase), 'https://m.example.test/api/files/a.png')
	})

	it('外链与协议相对地址保持原样', () => {
		assert.equal(resolveEch0Url('https://cdn.test/a.png', ctx.apiBase), 'https://cdn.test/a.png')
		assert.equal(resolveEch0Url('//cdn.test/a.png', ctx.apiBase), 'https://cdn.test/a.png')
	})

	it('空值返回空串', () => {
		assert.equal(resolveEch0Url(undefined, ctx.apiBase), '')
		assert.equal(resolveEch0Url('', ctx.apiBase), '')
	})
})

describe('mapEchoFiles', () => {
	it('按 sort_order 排序并按 category 判定类型', () => {
		const media = mapEchoFiles(makeEcho({
			echo_files: [
				{ id: 'f2', echo_id: 'e', file_id: 'x2', sort_order: 2, file: { id: 'x2', key: 'k2', storage_type: 'local', url: '/api/files/videos/b.mp4', category: 'video', content_type: 'video/mp4' } },
				{ id: 'f1', echo_id: 'e', file_id: 'x1', sort_order: 1, file: { id: 'x1', key: 'k1', storage_type: 'local', url: '/api/files/images/a.png', category: 'image', width: 800, height: 600 } },
			],
		}), ctx.apiBase)

		assert.equal(media.length, 2)
		assert.equal(media[0]!.id, 'f1')
		assert.equal(media[0]!.kind, 'image')
		assert.equal(media[0]!.width, 800)
		assert.equal(media[0]!.thumbnailUrl, media[0]!.originalUrl)
		assert.equal(media[1]!.kind, 'video')
		assert.equal(media[1]!.thumbnailUrl, '')
	})

	it('没有 category 时用 content_type 兜底', () => {
		const media = mapEchoFiles(makeEcho({
			echo_files: [
				{ id: 'f1', echo_id: 'e', file_id: 'x1', file: { id: 'x1', key: 'k', storage_type: 'local', url: '/api/files/audios/a.mp3', content_type: 'audio/mpeg' } },
			],
		}), ctx.apiBase)
		assert.equal(media[0]!.kind, 'audio')
	})

	it('未知类型落到 document，缺 url 的条目被丢弃', () => {
		const media = mapEchoFiles(makeEcho({
			echo_files: [
				{ id: 'f1', echo_id: 'e', file_id: 'x1', file: { id: 'x1', key: 'k', storage_type: 'local', url: '/api/files/documents/a.zip', category: 'file' } },
				{ id: 'f2', echo_id: 'e', file_id: 'x2', file: { id: 'x2', key: 'k2', storage_type: 'local', url: '' } },
				{ id: 'f3', echo_id: 'e', file_id: 'x3' },
			],
		}), ctx.apiBase)
		assert.equal(media.length, 1)
		assert.equal(media[0]!.kind, 'document')
	})

	it('echo_files 缺失时返回空数组', () => {
		assert.deepEqual(mapEchoFiles(makeEcho(), ctx.apiBase), [])
	})
})

describe('mapEchoExtension', () => {
	it('六种类型都能收窄', () => {
		const cases = [
			['MUSIC', { url: 'https://music.163.com/#/song?id=1' }, { type: 'music', url: 'https://music.163.com/#/song?id=1' }],
			['VIDEO', { videoId: 'BV1xx411c7mD' }, { type: 'video', videoId: 'BV1xx411c7mD' }],
			['GITHUBPROJ', { repoUrl: 'https://github.com/a/b' }, { type: 'github', repoUrl: 'https://github.com/a/b' }],
			['WEBSITE', { title: '塔罗会', site: 'https://mm.test' }, { type: 'website', title: '塔罗会', site: 'https://mm.test' }],
			['LOCATION', { placeholder: '仙林', latitude: 31.83, longitude: 120.46 }, { type: 'location', placeholder: '仙林', latitude: 31.83, longitude: 120.46 }],
			['TWEET', { url: 'https://x.com/a/status/1', username: 'a', statusId: '1' }, { type: 'tweet', url: 'https://x.com/a/status/1', username: 'a', statusId: '1' }],
		] as const
		for (const [type, payload, expected] of cases) {
			assert.deepEqual(mapEchoExtension({ id: 'x', echo_id: 'e', type, payload: payload as unknown as Record<string, unknown> }), expected)
		}
	})

	it('字段缺失 / 类型不对 → undefined（不渲染卡片）', () => {
		assert.equal(mapEchoExtension(null), undefined)
		assert.equal(mapEchoExtension(undefined), undefined)
		assert.equal(mapEchoExtension({ id: 'x', echo_id: 'e', type: 'MUSIC', payload: {} }), undefined)
		assert.equal(mapEchoExtension({ id: 'x', echo_id: 'e', type: 'LOCATION', payload: { latitude: 91, longitude: 0 } }), undefined)
		assert.equal(mapEchoExtension({ id: 'x', echo_id: 'e', type: 'LOCATION', payload: { latitude: 'abc', longitude: 0 } }), undefined)
		assert.equal(mapEchoExtension({ id: 'x', echo_id: 'e', type: 'UNKNOWN', payload: { url: 'x' } }), undefined)
	})

	it('wEBSITE 缺 title 时用 site 兜底', () => {
		assert.deepEqual(
			mapEchoExtension({ id: 'x', echo_id: 'e', type: 'WEBSITE', payload: { site: 'https://mm.test' } }),
			{ type: 'website', title: 'https://mm.test', site: 'https://mm.test' },
		)
	})
})

describe('mapEchoToMessage', () => {
	it('完整字段映射', () => {
		const message = mapEchoToMessage(makeEcho(), ctx)
		assert.equal(message.id, '01a09ad5-825a-7552-a99d-08ebd2a9553c')
		assert.equal(message.source, 'ech0')
		assert.equal(message.authorName, 'kemiao')
		assert.equal(message.sourceUrl, 'https://m.example.test/echo/01a09ad5-825a-7552-a99d-08ebd2a9553c')
		assert.equal(message.favCount, 2)
		assert.deepEqual(message.tags, ['#日常'])
		assert.equal(message.extension, undefined)
		assert.deepEqual(message.media, [])
		assert.match(message.plainText ?? '', /碎碎念/)
	})

	it('unix 秒转 ISO', () => {
		const message = mapEchoToMessage(makeEcho({ created_at: 1789304078 }), ctx)
		assert.match(message.publishedAt, /^2026-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
		assert.equal(new Date(message.publishedAt).getTime(), 1789304078 * 1000)
	})

	it('缺 username / tags / fav_count=0 时给出干净的空值', () => {
		const message = mapEchoToMessage(makeEcho({ username: undefined, tags: undefined, fav_count: 0 }), ctx)
		assert.equal(message.authorName, undefined)
		assert.deepEqual(message.tags, [])
		assert.equal(message.favCount, undefined)
	})

	it('正文里的裸标签被剥掉，但标签本身仍保留（结构化 ∪ 正文）', () => {
		const message = mapEchoToMessage(makeEcho({ content: '#吐槽 今天网好卡 #日常' }), ctx)
		assert.ok(!(message.plainText ?? '').includes('#'))
		assert.ok(!message.html.includes('#吐槽'))
		// 结构化 tags 是 #日常；正文里的 #吐槽 也不能丢（线上大量说说只在正文写标签）
		assert.deepEqual(message.tags, ['#日常', '#吐槽'])
	})

	it('结构化 tags 只有全站标签时，正文里的分类仍然保留', () => {
		const message = mapEchoToMessage(makeEcho({
			content: '#日常 过两天要去实习了',
			tags: [{ id: 't9', name: 'kemiaoshuoshuo' }],
		}), ctx)
		assert.deepEqual(message.tags, ['#kemiaoshuoshuo', '#日常'])
	})

	it('没有结构化标签时从正文提取', () => {
		const message = mapEchoToMessage(makeEcho({ content: '随便说说 #随手记', tags: undefined }), ctx)
		assert.deepEqual(message.tags, ['#随手记'])
	})

	it('只有图片的说说不算空正文', () => {
		const message = mapEchoToMessage(makeEcho({ content: '![](https://cdn.test/a.png)' }), ctx)
		assert.ok(message.html.includes('a.png'))
	})

	it('只有标点的正文判空，html 与 plainText 都清掉', () => {
		const message = mapEchoToMessage(makeEcho({ content: '，。！ #日常' }), ctx)
		assert.equal(message.html, '')
		assert.equal(message.plainText, undefined)
		assert.deepEqual(message.tags, ['#日常'])
	})

	it('siteUrl 留空时用 apiBase 生成原帖链接', () => {
		const message = mapEchoToMessage(makeEcho(), { ...ctx, siteUrl: '' })
		assert.equal(message.sourceUrl, 'https://m.example.test/echo/01a09ad5-825a-7552-a99d-08ebd2a9553c')
	})

	it('没有 render 时 html 为空串而不是抛错', () => {
		const message = mapEchoToMessage(makeEcho(), { apiBase: ctx.apiBase })
		assert.equal(message.html, '')
	})
})

describe('mapEchosToMessages', () => {
	it('保持接口顺序', () => {
		const list = mapEchosToMessages([
			makeEcho({ id: 'b', created_at: 2 }),
			makeEcho({ id: 'a', created_at: 1 }),
		], ctx)
		assert.deepEqual(list.map(item => item.id), ['b', 'a'])
	})

	it('undefined 返回空数组', () => {
		assert.deepEqual(mapEchosToMessages(undefined, ctx), [])
	})
})
