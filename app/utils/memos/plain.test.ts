import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { isBlankContent, markdownToPlainText, parseMarkdownHashtags, stripMarkdownHashtags } from './plain.ts'

describe('markdownToPlainText', () => {
	it('去掉标题 / 引用 / 列表 / 强调 / 行内代码标记', () => {
		const md = [
			'## 今天',
			'',
			'> 引用一句',
			'',
			'- **粗体** 与 *斜体* 与 `code`',
			'1. 第一项',
		].join('\n')
		const text = markdownToPlainText(md)
		assert.equal(text, ['今天', '', '引用一句', '', '粗体 与 斜体 与 code', '第一项'].join('\n'))
	})

	it('链接保留文字、图片保留 alt、空 alt 图片整段丢弃', () => {
		assert.equal(markdownToPlainText('[喵洛阁](https://blog.kemeow.top)'), '喵洛阁')
		assert.equal(markdownToPlainText('![一张图](https://x.test/a.png)'), '一张图')
		assert.equal(markdownToPlainText('前 ![](https://x.test/a.png) 后'), '前  后')
	})

	it('围栏代码块内的内容原样保留', () => {
		const md = ['```js', 'const a = 1', '```'].join('\n')
		assert.equal(markdownToPlainText(md), 'const a = 1')
	})

	it('表格竖线转空格并丢掉分隔行', () => {
		const md = ['| a | b |', '| --- | --- |', '| 1 | 2 |'].join('\n')
		const text = markdownToPlainText(md)
		assert.ok(!text.includes('|'))
		assert.ok(text.includes('a'))
		assert.ok(!text.includes('---'))
	})

	it('空输入返回空串', () => {
		assert.equal(markdownToPlainText(''), '')
		assert.equal(markdownToPlainText(), '')
	})
})

describe('stripMarkdownHashtags', () => {
	it('删掉裸写的话题标签', () => {
		assert.equal(stripMarkdownHashtags('#吐槽 梁圣也陨落了～😭'), '梁圣也陨落了～😭')
		assert.equal(stripMarkdownHashtags('今天 #日常 #生活 好开心'), '今天 好开心')
	})

	it('不动 Markdown 标题（# 后面有空格）', () => {
		const md = '# 标题\n\n正文 #标签'
		assert.equal(stripMarkdownHashtags(md), '# 标题\n\n正文')
	})

	it('不动围栏代码块里的 #include', () => {
		const md = ['```c', '#include <stdio.h>', '```', '', '正文 #吐槽'].join('\n')
		const stripped = stripMarkdownHashtags(md)
		assert.ok(stripped.includes('#include <stdio.h>'))
		assert.ok(!stripped.includes('#吐槽'))
	})

	it('空输入返回空串', () => {
		assert.equal(stripMarkdownHashtags(''), '')
	})
})

describe('parseMarkdownHashtags', () => {
	it('按出现顺序提取并去重', () => {
		assert.deepEqual(parseMarkdownHashtags('#日常 内容 #吐槽 #日常'), ['#日常', '#吐槽'])
	})

	it('限制条数', () => {
		assert.equal(parseMarkdownHashtags('#a1 #b2 #c3', 2).length, 2)
	})

	it('单个字符不算标签（与 tg 规则一致）', () => {
		assert.deepEqual(parseMarkdownHashtags('#a 不是标签'), [])
	})
})

describe('isBlankContent', () => {
	it('只有空白与标点算空', () => {
		assert.equal(isBlankContent('   '), true)
		assert.equal(isBlankContent('，。！'), true)
		assert.equal(isBlankContent('有内容'), false)
	})
})
