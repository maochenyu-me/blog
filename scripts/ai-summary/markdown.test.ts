import assert from 'node:assert/strict'
import test from 'node:test'
import { toPlainText, truncateText } from './markdown.ts'

test('代码块整体丢弃', () => {
	const md = [
		'前言',
		'```ts',
		'const a = 1',
		'```',
		'结论',
	].join('\n')

	const text = toPlainText(md)

	assert.ok(text.includes('前言'))
	assert.ok(text.includes('结论'))
	assert.ok(!text.includes('const a = 1'))
})

test('MDC 组件块与参数被丢弃', () => {
	const md = [
		'开头',
		'::tab{:tabs=\'["组件","语法"]\'}',
		'#tab1',
		'::link-card',
		'---',
		'title: 卡片标题',
		'---',
		'::',
		'::',
		'结尾',
	].join('\n')

	const text = toPlainText(md)

	assert.ok(text.includes('开头'))
	assert.ok(text.includes('结尾'))
	assert.ok(!text.includes('::'))
	assert.ok(!text.includes('tabs='))
})

test('链接保留文字、图片与 HTML 标签丢弃', () => {
	const md = '参考[官方文档](https://example.com)和 ![](/a.png) 以及<span class="x">行内</span>'

	const text = toPlainText(md)

	assert.ok(text.includes('参考官方文档和'))
	assert.ok(text.includes('行内'))
	assert.ok(!text.includes('example.com'))
	assert.ok(!text.includes('<span'))
	assert.ok(!text.includes('/a.png'))
})

test('标题、列表、引用、强调与行内代码符号被清理', () => {
	const md = [
		'## 小标题',
		'> 引用一句',
		'- **重点**：`code`',
		'1. ~~删除~~ 项目',
	].join('\n')

	const text = toPlainText(md)

	assert.ok(text.includes('小标题'))
	assert.ok(text.includes('引用一句'))
	assert.ok(text.includes('重点：code'))
	assert.ok(text.includes('删除 项目'))
	assert.ok(!/[#>*`~]/.test(text))
})

test('表格分隔行被丢弃、单元格文字保留', () => {
	const md = [
		'| 名称 | 说明 |',
		'| --- | --- |',
		'| 甲 | 乙 |',
	].join('\n')

	const text = toPlainText(md)

	assert.ok(text.includes('名称 说明'))
	assert.ok(text.includes('甲 乙'))
	assert.ok(!text.includes('---'))
})

test('连续空行被压成一个，首尾留白被去掉', () => {
	const text = toPlainText('\n\n段落一\n\n\n\n段落二\n\n')

	assert.equal(text, '段落一\n\n段落二')
})

test('正文为空时返回空字符串', () => {
	assert.equal(toPlainText(''), '')
	assert.equal(toPlainText('```\nonly code\n```'), '')
})

test('超长正文按段落截断，并标注省略', () => {
	const text = truncateText('第一段。\n\n第二段很长很长。\n\n第三段。', 12)

	assert.ok(text.length <= 13)
	assert.ok(text.endsWith('…'))
	assert.ok(text.startsWith('第一段。'))
})

test('未超长时原样返回', () => {
	assert.equal(truncateText('短文本。', 100), '短文本。')
})
