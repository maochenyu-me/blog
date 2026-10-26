import assert from 'node:assert/strict'
import test from 'node:test'
import { toExcerpt, toIsoDate } from './normalize.ts'

test('摘要去掉 HTML 与多余空白', () => {
	const excerpt = toExcerpt('<p>第一段</p>\n\n<p>第二段&nbsp;&amp;结尾</p>')

	assert.equal(excerpt, '第一段 第二段 &结尾')
})

test('摘要按字符截断，中文不会被切坏', () => {
	const excerpt = toExcerpt('喵'.repeat(200), 10)

	assert.equal([...excerpt].length, 11)
	assert.ok(excerpt.endsWith('…'))
})

test('摘要尾部常见的「阅读全文」被去掉', () => {
	assert.equal(toExcerpt('<p>正文内容。阅读全文</p>'), '正文内容。')
	assert.equal(toExcerpt('<p>正文内容。Read more</p>'), '正文内容。')
	// 纸鹿博客的 Atom 会在正文末尾拼一个「点击查看全文」锚点
	assert.equal(toExcerpt('<p>正文内容。</p><a class="view-full">点击查看全文</a>'), '正文内容。')
})

test('空摘要返回空字符串，交给页面隐藏该块', () => {
	assert.equal(toExcerpt(undefined), '')
	assert.equal(toExcerpt('<p> </p>'), '')
})

test('日期解析失败时回退到给定时间', () => {
	const fallback = new Date('2026-10-24T00:00:00.000Z')

	assert.equal(toIsoDate('2026-09-14T14:57:02.925+00:00[UTC]'), '2026-09-14T14:57:02.925Z')
	assert.equal(toIsoDate('Mon, 14 Sep 2026 10:00:00 +0800'), '2026-09-14T02:00:00.000Z')
	assert.equal(toIsoDate('不是日期', fallback), fallback.toISOString())
	assert.equal(toIsoDate(undefined, fallback), fallback.toISOString())
})
