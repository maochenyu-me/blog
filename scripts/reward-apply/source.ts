/**
 * 在 `app/reward.ts` 里做**行级插入**：只加一行，不重写整个数组。
 *
 * 为什么不整块重新生成：文件里有作者手写的 doc 注释，重生成会吃掉它们；
 * 而且这条链路是「机器人直接推 main」，diff 只有 `+1` 行才是可 review 的。
 */

import type { CleanEntry } from './validate.ts'
import { tsQuote } from '../link-apply/render.ts'
import { entryKey } from './validate.ts'

export const rewardPath = 'app/reward.ts'

/** 条目行：制表符 + 单行对象 + 尾逗号，与现有数据风格一致 */
export const entryLineRe = /^\t\{ .* \},$/

const nameRe = /name:\s*'((?:[^'\\]|\\.)*)'/
const amountRe = /amount:\s*(\d+(?:\.\d+)?)/
const dateRe = /date:\s*'(\d{4}-\d{2}-\d{2})'/
const arrayStartRe = /=\s*\[\s*$/
const arrayEndRe = /^\]\s*$/

export interface ParsedEntry {
	name: string
	amount: number
	date: string
	/** 该条目在 lines 里的下标 */
	line: number
	raw: string
}

export interface ParsedSource {
	lines: string[]
	arrayLine: number
	/** 收尾的 `]` 所在行 */
	closeLine: number
	entries: ParsedEntry[]
}

function unescapeName(raw: string): string {
	return raw.replaceAll(/\\(.)/g, '$1')
}

/** 找到 `export const rewardList` 的数组区间并解析已有条目；任何不确定的情况都直接抛错 */
export function parseSource(text: string): ParsedSource {
	const lines = text.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')

	const arrayLine = lines.findIndex(line => line.startsWith('export const rewardList'))
	if (arrayLine === -1)
		throw new Error('在 app/reward.ts 里找不到 `export const rewardList`')
	if (!arrayStartRe.test(lines[arrayLine]!))
		throw new Error('`rewardList` 不是多行数组（`= [` 结尾），请先把它展开成多行')

	let closeLine = -1
	for (let index = arrayLine + 1; index < lines.length; index++) {
		if (arrayEndRe.test(lines[index]!)) {
			closeLine = index
			break
		}
	}
	if (closeLine === -1)
		throw new Error('找不到 `rewardList` 数组的收尾 `]`')

	const entries: ParsedEntry[] = []
	for (let index = arrayLine + 1; index < closeLine; index++) {
		const line = lines[index]!
		const trimmed = line.trim()

		// 空行和注释要保住（作者手写的说明就在数组上方与条目之间）
		if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('/*') || trimmed.startsWith('*') || trimmed === '*/')
			continue

		if (!entryLineRe.test(line))
			throw new Error(`app/reward.ts 第 ${index + 1} 行不是预期的单行条目格式，请手工整理后再试：${trimmed.slice(0, 80)}`)

		const name = nameRe.exec(line)
		const amount = amountRe.exec(line)
		const date = dateRe.exec(line)
		if (!name || !amount || !date)
			throw new Error(`app/reward.ts 第 ${index + 1} 行缺少 name/amount/date，请手工整理后再试`)

		entries.push({
			name: unescapeName(name[1]!),
			amount: Number(amount[1]),
			date: date[1]!,
			line: index,
			raw: line,
		})
	}

	assertDescending(entries)
	return { lines, arrayLine, closeLine, entries }
}

/** 断言日期非递增（同日多条是允许的，新条目会排在已有同日条目下面） */
function assertDescending(entries: ParsedEntry[]): void {
	for (let index = 1; index < entries.length; index++) {
		if (entries[index - 1]!.date < entries[index]!.date) {
			throw new Error(`app/reward.ts 的 rewardList 不是按日期降序排列（第 ${index} 条 ${entries[index]!.date} 比上一条新），请先手工整理`)
		}
	}
}

export function formatEntryLine(entry: CleanEntry): string {
	return `\t{ name: ${tsQuote(entry.name)}, amount: ${entry.amount}, date: '${entry.date}' },`
}

/** 第一个比新条目旧的记录位置；没有更旧的就插到 `]` 之前 */
export function planInsertion(src: ParsedSource, entry: CleanEntry): number {
	const target = src.entries.findIndex(item => item.date < entry.date)
	return target === -1 ? src.closeLine : src.entries[target]!.line
}

export function applyInsertion(text: string, entry: CleanEntry): { text: string, line: number, lineText: string } {
	const src = parseSource(text)
	const line = planInsertion(src, entry)
	const lineText = formatEntryLine(entry)
	const lines = [...src.lines]
	lines.splice(line, 0, lineText)
	return { text: lines.join('\n'), line, lineText }
}

export function hasDuplicate(entries: ParsedEntry[], entry: CleanEntry): ParsedEntry | undefined {
	const key = entryKey(entry)
	return entries.find(item => entryKey(item) === key)
}
