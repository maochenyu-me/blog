import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { entryComment, fenceFor, markers, missingComment, preflightComment, tsQuote } from './render.ts'

describe('tsQuote', () => {
	it('反斜杠先转义，单引号后转义', () => {
		assert.equal(tsQuote('a\\b'), '\'a\\\\b\'')
		assert.equal(tsQuote('O\'Brien'), '\'O\\\'Brien\'')
		assert.equal(tsQuote('C:\\path\\it\'s'), '\'C:\\\\path\\\\it\\\'s\'')
	})
})

describe('fenceFor', () => {
	it('内容里的三连反引号会让围栏变长', () => {
		const fenced = fenceFor('```js\ncode\n```', 'ts')
		assert.ok(fenced.startsWith('````ts\n'))
		assert.ok(fenced.endsWith('\n````'))
	})

	it('普通内容用三连反引号', () => {
		assert.equal(fenceFor('a', 'ts'), '```ts\na\n```')
	})
})

describe('entryComment', () => {
	const fields = {
		author: '克喵:)',
		title: '喵洛阁',
		desc: '每一段旅行，都有终点。',
		link: 'https://blog.kemeow.top/',
		feed: 'https://blog.kemeow.top/atom.xml',
		avatar: 'https://blog.kemeow.top/img/avatar/avatar.webp',
		icon: '',
	}

	it('字段顺序与 app/types/feed.ts 一致，tab 缩进，尾逗号', () => {
		const body = entryComment(fields, '2026-10-26', [])
		assert.ok(body.startsWith(markers.entry))
		assert.match(body, /\{\n\tauthor: '克喵:\)',\n\ttitle: '喵洛阁',\n\tdesc: '[^']*',\n\tlink: '[^']*',\n\tfeed: '[^']*',\n\ticon: '',\n\tavatar: '[^']*',\n\tdate: '2026-10-26',\n\},/)
	})

	it('可选的 sitenick 为空时整行省略', () => {
		const body = entryComment(fields, '2026-10-26', [])
		assert.ok(!body.includes('sitenick'))
	})

	it('简介里的三连反引号打不断围栏', () => {
		const body = entryComment({ ...fields, desc: '试试 ``` 能不能逃逸' }, '2026-10-26', [])
		assert.ok(body.includes('````ts\n'))
		assert.ok(!body.includes('\n```ts\n{\n\t'))
	})

	it('超长字段会被截断并提示', () => {
		const body = entryComment({ ...fields, title: 'a'.repeat(80) }, '2026-10-26', [])
		assert.ok(body.includes('已截断'))
		assert.ok(body.includes('…'))
	})
})

describe('missingComment', () => {
	it('列出缺失字段与重复字段', () => {
		const body = missingComment(markers.entry, ['站点地址'], ['站点标题'])
		assert.ok(body.startsWith(markers.entry))
		assert.ok(body.includes('站点地址'))
		assert.ok(body.includes('重复字段'))
	})
})

describe('preflightComment', () => {
	it('渲染成表格并附免责说明', () => {
		const body = preflightComment(
			[
				{ status: 'ok', title: '站点可访问', detail: 'HTTP 200，耗时 320ms' },
				{ status: 'fail', title: 'HTTPS', detail: '未启用' },
			],
			['`icon` 已自动探测'],
		)
		assert.ok(body.startsWith(markers.preflight))
		assert.ok(body.includes('| ✅ 站点可访问 | HTTP 200，耗时 320ms |'))
		assert.ok(body.includes('| ❌ HTTPS | 未启用 |'))
		assert.ok(body.includes('不构成审核结论'))
	})
})
