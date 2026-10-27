import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUserMessage, isSummaryAcceptable, normalizeSummary, summaryLengthRange } from './prompt.ts'

test('用户消息带上标题、分类、标签与正文', () => {
	const message = buildUserMessage({
		title: '朋友圈大改',
		categories: ['站点魔改'],
		tags: ['Nuxt', '页面'],
		text: '正文内容。',
	})

	assert.ok(message.includes('朋友圈大改'))
	assert.ok(message.includes('站点魔改'))
	assert.ok(message.includes('Nuxt、页面'))
	assert.ok(message.includes('正文内容。'))
})

test('缺标题、分类、标签时不留空占位', () => {
	const message = buildUserMessage({ text: '只有正文。' })

	assert.ok(message.includes('只有正文。'))
	assert.ok(!message.includes('标题：\n'))
	assert.ok(!message.includes('分类：'))
	assert.ok(!message.includes('标签：'))
})

test('去掉代码围栏与包裹引号', () => {
	assert.equal(normalizeSummary('```markdown\n这篇文章讲了。\n```'), '这篇文章讲了。')
	assert.equal(normalizeSummary('“这篇文章讲了。”'), '这篇文章讲了。')
	assert.equal(normalizeSummary('"这篇文章讲了。"'), '这篇文章讲了。')
})

test('去掉「摘要：」之类的前缀', () => {
	assert.equal(normalizeSummary('摘要：这篇文章讲了。'), '这篇文章讲了。')
	assert.equal(normalizeSummary('本文摘要: 这篇文章讲了。'), '这篇文章讲了。')
	assert.equal(normalizeSummary('**AI 摘要**：这篇文章讲了。'), '这篇文章讲了。')
})

test('多行与列表压成一段', () => {
	assert.equal(normalizeSummary('第一行\n第二行。'), '第一行 第二行。')
	assert.equal(normalizeSummary('- 主论点\n- 副论点。'), '主论点 副论点。')
	assert.equal(normalizeSummary('1. 主论点\n2. 副论点。'), '主论点 副论点。')
})

test('空白与重复标点被收拾干净', () => {
	assert.equal(normalizeSummary('  一段摘要。  '), '一段摘要。')
	assert.equal(normalizeSummary('一段摘要。。。。'), '一段摘要。')
})

test('长度区间内的摘要通过校验', () => {
	const summary = '这'.repeat(summaryLengthRange.min)

	assert.deepEqual(isSummaryAcceptable(summary), { ok: true })
})

test('过短与过长的摘要被拒绝并给出原因', () => {
	assert.equal(isSummaryAcceptable('太短').ok, false)
	assert.equal(isSummaryAcceptable('太短').reason, 'too-short')
	assert.equal(isSummaryAcceptable('长'.repeat(summaryLengthRange.max + 1)).reason, 'too-long')
	assert.equal(isSummaryAcceptable('').reason, 'empty')
})
