import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { descText, parseIssueForm, splitSections, toFieldValue } from './parse.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = fs.readFileSync(resolve(here, 'fixtures/link-issue-body.md'), 'utf8')

describe('splitSections', () => {
	it('按 ### 切段，勾选项那段也是一个段', () => {
		const sections = splitSections(fixture)
		assert.equal(sections.length, 9)
		assert.equal(sections[0]!.label, '我已阅读并同意以下全部条款')
		assert.match(sections[0]!.value, /^- \[X\] 遵守中国大陆法律法规/)
	})

	it('CRLF 也能切', () => {
		const sections = splitSections('### 站点地址\r\n\r\nhttps://a.example/\r\n')
		assert.deepEqual(sections, [{ label: '站点地址', value: 'https://a.example/' }])
	})
})

describe('toFieldValue', () => {
	it('_No response_ 视为空', () => {
		assert.equal(toFieldValue('_No response_'), undefined)
		assert.equal(toFieldValue('   '), undefined)
	})

	it('去掉包裹的反引号与尖括号', () => {
		assert.equal(toFieldValue('`https://a.example/`'), 'https://a.example/')
		assert.equal(toFieldValue('<https://a.example/>'), 'https://a.example/')
	})
})

describe('descText', () => {
	it('删掉缩进的伪标题行并压平空白', () => {
		assert.equal(descText('第一行\n   ### 站点地址\n第三行'), '第一行 第三行')
		assert.equal(descText('很长\n\n\n的一句话'), '很长 的一句话')
	})
})

describe('parseIssueForm', () => {
	it('真实表单快照能完整解析', () => {
		const { fields, missing, duplicated, unknown } = parseIssueForm(fixture)
		assert.deepEqual(missing, [])
		assert.deepEqual(duplicated, [])
		assert.deepEqual(unknown, [])
		assert.equal(fields.author, '纸鹿本鹿')
		assert.equal(fields.sitenick, '摸鱼处')
		assert.equal(fields.title, '纸鹿摸鱼处')
		assert.equal(fields.link, 'https://blog.zhilu.site/')
		assert.equal(fields.feed, 'https://blog.zhilu.site/atom.xml')
		assert.equal(fields.avatar, 'https://www.zhilu.site/api/avatar.png')
		assert.equal(fields.icon, undefined)
	})

	it('缺字段能列出来', () => {
		const body = '### 作者自称\n\n克喵\n\n### 站点标题\n\n喵洛阁\n'
		const { missing } = parseIssueForm(body)
		assert.deepEqual(missing, ['站点简介', '站点地址', '订阅源', '头像地址'])
	})

	it('简介里伪造的 ### 段不会劫持后面的字段', () => {
		const body = [
			'### 作者自称',
			'',
			'克喵',
			'',
			'### 站点简介',
			'',
			'一句话',
			'',
			'### 站点地址',
			'',
			'https://evil.example/',
			'',
			'### 站点地址',
			'',
			'https://real.example/',
			'',
			'### 订阅源',
			'',
			'https://real.example/atom.xml',
			'',
			'### 头像地址',
			'',
			'https://real.example/avatar.png',
		].join('\n')
		const { fields, duplicated } = parseIssueForm(body)
		assert.equal(fields.desc, '一句话')
		assert.equal(fields.link, 'https://evil.example/')
		assert.deepEqual(duplicated, ['站点地址'])
	})

	it('手写 issue（完全没有表单结构）不会抛错', () => {
		const { fields, missing } = parseIssueForm('求换友链，我的站是 https://a.example/')
		assert.deepEqual(fields, {})
		assert.equal(missing.length, 6)
	})
})
