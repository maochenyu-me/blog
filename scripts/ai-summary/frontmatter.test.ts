import assert from 'node:assert/strict'
import test from 'node:test'
import { hasField, readField, splitFrontmatter, upsertFields } from './frontmatter.ts'

const raw = `---
title: 组件样式示例
tags: [示例]
date: 2024-09-21 23:18:18
---

## 正文

内容。
`

test('拆分 frontmatter 与正文', () => {
	const parts = splitFrontmatter(raw)

	assert.equal(parts.hasFrontmatter, true)
	assert.match(parts.frontmatter, /title: 组件样式示例/)
	// 正文保留原始缩进与换行（写回时才不会丢东西），只有两侧的 --- 与首个空行被切掉
	assert.ok(parts.body.trimStart().startsWith('## 正文'))
})

test('CRLF 文章也能拆分', () => {
	const parts = splitFrontmatter('---\r\ntitle: 甲\r\n---\r\n\r\n正文\r\n')

	assert.equal(parts.hasFrontmatter, true)
	assert.equal(parts.body.trim(), '正文')
})

test('没有 frontmatter 时整篇都是正文', () => {
	const parts = splitFrontmatter('# 只有正文')

	assert.equal(parts.hasFrontmatter, false)
	assert.equal(parts.frontmatter, '')
	assert.equal(parts.body, '# 只有正文')
})

test('读取普通标量、引号标量与块标量', () => {
	const frontmatter = [
		'title: 组件样式示例',
		'description: "带冒号: 和 \\"引号\\" 的值"',
		'single: \'单引号\'\'内转义\'',
		'aiSummary: |-',
		'  第一行',
		'  第二行',
		'model: Qwen/Qwen3-8B',
	].join('\n')

	assert.equal(readField(frontmatter, 'title'), '组件样式示例')
	assert.equal(readField(frontmatter, 'description'), '带冒号: 和 "引号" 的值')
	assert.equal(readField(frontmatter, 'single'), '单引号\'内转义')
	assert.equal(readField(frontmatter, 'aiSummary'), '第一行\n第二行')
	assert.equal(readField(frontmatter, 'model'), 'Qwen/Qwen3-8B')
	assert.equal(readField(frontmatter, 'missing'), undefined)
})

test('缩进的同名键不算顶层字段', () => {
	const frontmatter = ['meta:', '  aiSummary: 嵌套的值'].join('\n')

	assert.equal(readField(frontmatter, 'aiSummary'), undefined)
	assert.equal(hasField(frontmatter, 'aiSummary'), false)
})

test('空字符串与块标量空值视为无数据', () => {
	assert.equal(hasField('aiSummary: ""', 'aiSummary'), false)
	assert.equal(hasField('aiSummary: |', 'aiSummary'), false)
	assert.equal(hasField('aiSummary: 有内容', 'aiSummary'), true)
})

test('追加新字段到 frontmatter 末尾，正文原样保留', () => {
	const next = upsertFields(raw, { aiSummary: '一段摘要。', aiSummaryModel: 'Qwen/Qwen3-8B' })

	assert.match(next, /title: 组件样式示例/)
	assert.match(next, /aiSummary: "一段摘要。"/)
	assert.match(next, /aiSummaryModel: "Qwen\/Qwen3-8B"/)
	assert.ok(next.includes('## 正文'))
	assert.equal(next.split('---').length, raw.split('---').length, '不应新增分隔线')
})

test('覆盖已有字段并清掉旧的块标量续行', () => {
	const withOld = `---
title: 甲
aiSummary: |-
  旧的摘要
  还是旧的
aiSummaryModel: 旧模型
---

正文
`
	const next = upsertFields(withOld, { aiSummary: '新摘要。', aiSummaryModel: 'Qwen/Qwen3-8B' })

	assert.equal(readField(splitFrontmatter(next).frontmatter, 'aiSummary'), '新摘要。')
	assert.equal(readField(splitFrontmatter(next).frontmatter, 'aiSummaryModel'), 'Qwen/Qwen3-8B')
	assert.ok(!next.includes('旧的摘要'))
	assert.ok(next.includes('正文'))
})

test('没有 frontmatter 的文章会被补上头部', () => {
	const next = upsertFields('# 标题\n\n正文\n', { aiSummary: '摘要。' })

	assert.ok(next.startsWith('---\n'))
	assert.match(next, /aiSummary: "摘要。"/)
	assert.ok(next.includes('# 标题'))
})

test('摘要里的引号与反斜杠被正确转义', () => {
	const text = '他说"好"，并留下 C:\\path'
	const next = upsertFields(raw, { aiSummary: text })

	assert.equal(readField(splitFrontmatter(next).frontmatter, 'aiSummary'), text)
})

test('多行摘要被压成一行，避免破坏 frontmatter', () => {
	const next = upsertFields(raw, { aiSummary: '第一行\n第二行' })

	assert.equal(readField(splitFrontmatter(next).frontmatter, 'aiSummary'), '第一行 第二行')
})
