import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { cleanName, entryKey, maxNameLength, parseAmount, parseDate, validateForm } from './validate.ts'

const today = '2026-10-26'

describe('cleanName', () => {
	it('折叠空白、去零宽字符', () => {
		assert.equal(cleanName('  青柚\u200B\n\t不加冰  ').value, '青柚 不加冰')
	})

	it('空昵称被拒', () => {
		assert.ok(cleanName('   ').issue)
	})

	it('超长昵称被拒（按码位算）', () => {
		assert.ok(cleanName('喵'.repeat(maxNameLength + 1)).issue)
		assert.equal(cleanName('喵'.repeat(maxNameLength)).value, '喵'.repeat(maxNameLength))
	})

	it('引号与反斜杠不拒，交给 tsQuote 转义', () => {
		assert.equal(cleanName('O\'Brien\\x').value, 'O\'Brien\\x')
	})
})

describe('parseAmount', () => {
	it('剥掉货币符号与千分位', () => {
		assert.equal(parseAmount('¥66.66').value, 66.66)
		assert.equal(parseAmount('66.66元').value, 66.66)
		assert.equal(parseAmount('1,000').value, 1000)
		assert.equal(parseAmount(' 200 ').value, 200)
	})

	it('三位小数直接拒，不静默四舍五入', () => {
		assert.ok(parseAmount('66.666').issue)
	})

	it('0 与负数被拒', () => {
		assert.ok(parseAmount('0').issue)
		assert.ok(parseAmount('-5').issue)
	})

	it('超上限被拒', () => {
		assert.ok(parseAmount('100001').issue)
	})

	it('非数字被拒', () => {
		assert.ok(parseAmount('很多').issue)
		assert.ok(parseAmount('').issue)
	})
})

describe('parseDate', () => {
	it('补零并接受 / 与 . 分隔', () => {
		assert.equal(parseDate('2026/9/1', today).value, '2026-09-01')
		assert.equal(parseDate('2026.9.1', today).value, '2026-09-01')
		assert.equal(parseDate('2026-9-1', today).value, '2026-09-01')
	})

	it('不存在的日期被拒', () => {
		assert.ok(parseDate('2026-02-30', today).issue)
	})

	it('未来日期被拒', () => {
		assert.ok(parseDate('2026-10-27', today).issue)
		assert.equal(parseDate('2026-10-26', today).value, '2026-10-26')
	})

	it('过早的日期被拒', () => {
		assert.ok(parseDate('2014-12-31', today).issue)
	})

	it('中文格式直接拒并提示正确写法', () => {
		const issue = parseDate('2026年9月1日', today).issue
		assert.ok(issue)
		assert.match(issue.message, /YYYY-MM-DD/)
	})
})

describe('entryKey 与 validateForm', () => {
	it('去重键忽略大小写与空白', () => {
		assert.equal(entryKey({ name: 'Null Pointer', date: '2026-08-30' }), entryKey({ name: 'nullpointer', date: '2026-08-30' }))
	})

	it('全部合法时产出 CleanEntry', () => {
		const { entry, issues } = validateForm({ name: '克喵', amount: '5', date: '2026-09-01' }, today)
		assert.deepEqual(issues, [])
		assert.deepEqual(entry, { name: '克喵', amount: 5, date: '2026-09-01' })
	})

	it('多个字段同时出错时全部列出', () => {
		const { entry, issues } = validateForm({ name: '', amount: '0', date: '2026-02-30' }, today)
		assert.equal(entry, undefined)
		assert.deepEqual(issues.map(issue => issue.field), ['名称', '金额', '时间'])
	})
})
