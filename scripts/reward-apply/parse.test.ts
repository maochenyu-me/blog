import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { extractImageUrls, parseRewardForm } from './parse.ts'

const here = dirname(fileURLToPath(import.meta.url))
const fixture = fs.readFileSync(resolve(here, 'fixtures/reward-issue-body.md'), 'utf8')

describe('parseRewardForm', () => {
	it('真实表单快照能解析出四个必填字段', () => {
		const { fields, missing, duplicated } = parseRewardForm(fixture)
		assert.deepEqual(missing, [])
		assert.deepEqual(duplicated, [])
		assert.equal(fields.name, '青柚不加冰')
		assert.equal(fields.amount, '66.66')
		assert.equal(fields.date, '2026-09-12')
		assert.equal(fields.note, '用微信打赏的')
	})

	it('勾选确认段与 markdown 段被忽略', () => {
		const { fields } = parseRewardForm(fixture)
		assert.deepEqual(Object.keys(fields).sort(), ['amount', 'date', 'name', 'note', 'screenshot'])
	})

	it('缺字段能列出来', () => {
		const body = '### 名称\n\n克喵\n\n### 金额\n\n5\n'
		const { missing } = parseRewardForm(body)
		assert.deepEqual(missing, ['时间', '支付截图'])
	})

	it('重复字段会被标记', () => {
		const body = [
			'### 名称',
			'',
			'克喵',
			'',
			'### 金额',
			'',
			'5',
			'',
			'### 时间',
			'',
			'2026-09-01',
			'',
			'### 支付截图',
			'',
			'![](https://github.com/user-attachments/assets/a)',
			'',
			'### 名称',
			'',
			'别人',
		].join('\n')
		const { fields, duplicated } = parseRewardForm(body)
		assert.equal(fields.name, '克喵')
		assert.deepEqual(duplicated, ['名称'])
	})

	it('空的可选备注视为未填', () => {
		const body = fixture.replace('用微信打赏的', '_No response_')
		assert.equal(parseRewardForm(body).fields.note, undefined)
	})
})

describe('extractImageUrls', () => {
	it('抽 markdown 图片', () => {
		assert.deepEqual(
			extractImageUrls('![image](https://github.com/user-attachments/assets/abc)'),
			['https://github.com/user-attachments/assets/abc'],
		)
	})

	it('抽裸附件链接', () => {
		assert.deepEqual(
			extractImageUrls('看看这个 https://github.com/user-attachments/assets/xyz 谢谢'),
			['https://github.com/user-attachments/assets/xyz'],
		)
	})

	it('多张图、去重', () => {
		const raw = [
			'![a](https://github.com/user-attachments/assets/1)',
			'![b](https://github.com/user-attachments/assets/2)',
			'![c](https://github.com/user-attachments/assets/1)',
		].join('\n')
		assert.deepEqual(extractImageUrls(raw), [
			'https://github.com/user-attachments/assets/1',
			'https://github.com/user-attachments/assets/2',
		])
	})

	it('没有图片就返回空数组', () => {
		assert.deepEqual(extractImageUrls('没图'), [])
	})

	it('非 https 的地址不要', () => {
		assert.deepEqual(extractImageUrls('![a](http://github.com/user-attachments/assets/1)'), [])
	})
})
