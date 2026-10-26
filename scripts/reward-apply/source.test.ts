import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyInsertion, formatEntryLine, hasDuplicate, parseSource, planInsertion } from './source.ts'

const here = dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(resolve(here, 'fixtures/reward-source.fixture.ts'), 'utf8')

const entry = (name: string, amount: number, date: string) => ({ name, amount, date })

describe('parseSource', () => {
	it('解析出所有条目与数组边界', () => {
		const parsed = parseSource(source)
		assert.equal(parsed.entries.length, 6)
		assert.equal(parsed.entries[0]!.name, '应志鹏')
		assert.equal(parsed.entries[4]!.amount, 5)
		assert.ok(parsed.closeLine > parsed.arrayLine)
	})

	it('找不到 rewardList 时报错', () => {
		assert.throws(() => parseSource('export const list = [\n\t{ name: \'a\', amount: 1, date: \'2026-01-01\' },\n]\n'), /rewardList/)
	})

	it('单行数组形式报错而不是猜', () => {
		assert.throws(() => parseSource('export const rewardList: RewardEntry[] = []\n'), /多行数组/)
	})

	it('非单行条目报错并带行号', () => {
		const bad = source.replace('\t{ name: \'一只柯基\', amount: 8.8, date: \'2026-07-25\' },', '\t{\n\t\tname: \'一只柯基\',\n\t},')
		assert.throws(() => parseSource(bad), /第 \d+ 行/)
	})

	it('不是日期降序时报错', () => {
		const bad = source.replace('2026-07-02', '2026-12-02')
		assert.throws(() => parseSource(bad), /降序/)
	})

	it('同日多条是允许的', () => {
		const same = source.replace('2026-07-25', '2026-07-19')
		assert.equal(parseSource(same).entries.length, 6)
	})
})

describe('formatEntryLine', () => {
	it('与现有数据风格一致：tab + 单引号 + 尾逗号', () => {
		assert.equal(formatEntryLine(entry('克喵', 5, '2026-09-01')), '\t{ name: \'克喵\', amount: 5, date: \'2026-09-01\' },')
	})

	it('金额不补零，单引号被转义', () => {
		assert.equal(formatEntryLine(entry('O\'Brien', 66.6, '2026-09-01')), '\t{ name: \'O\\\'Brien\', amount: 66.6, date: \'2026-09-01\' },')
	})
})

describe('planInsertion / applyInsertion', () => {
	it('插到正确日期位置（降序）', () => {
		const parsed = parseSource(source)
		const target = planInsertion(parsed, entry('新人', 10, '2026-09-20'))
		assert.equal(parsed.lines[target]!.includes('青柚不加冰'), true)
	})

	it('比所有人都新时插到最前面', () => {
		const parsed = parseSource(source)
		assert.equal(planInsertion(parsed, entry('新人', 10, '2026-10-01')), parsed.entries[0]!.line)
	})

	it('比所有人都旧时插到 `]` 之前', () => {
		const parsed = parseSource(source)
		assert.equal(planInsertion(parsed, entry('新人', 10, '2026-01-01')), parsed.closeLine)
	})

	it('同日新条目排在已有同日条目之下', () => {
		const { text } = applyInsertion(source, entry('同日新人', 10, '2026-09-12'))
		const lines = text.split('\n')
		const oldIndex = lines.findIndex(line => line.includes('青柚不加冰'))
		const newIndex = lines.findIndex(line => line.includes('同日新人'))
		assert.ok(newIndex > oldIndex)
	})

	it('只多一行，其余内容一字不变', () => {
		const { text } = applyInsertion(source, entry('新人', 10, '2026-09-20'))
		assert.equal(text.split('\n').length, source.split('\n').length + 1)
		assert.equal(parseSource(text).entries.length, 7)
	})
})

describe('hasDuplicate', () => {
	it('同名同日视为重复', () => {
		const parsed = parseSource(source)
		assert.ok(hasDuplicate(parsed.entries, entry('青柚不加冰', 1, '2026-09-12')))
	})

	it('同名不同日不算重复', () => {
		const parsed = parseSource(source)
		assert.equal(hasDuplicate(parsed.entries, entry('青柚不加冰', 66.66, '2026-09-13')), undefined)
	})
})
