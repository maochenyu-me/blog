/**
 * 落盘前的两道自检。
 *
 * 1. 文本层：新增的那一行之外，文件必须**逐行一模一样**，条目数恰好 +1。
 * 2. 运行层：把候选内容写成临时 `.mts` 真跑一次 import —— 正则拦不住「引号没转义」这类语法错，
 *    能拦住的只有真的执行一遍（文件里只有 `import type`，会被类型擦除抹掉，不需要解析 `~/` 别名）。
 */

import type { CleanEntry } from './validate.ts'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseSource } from './source.ts'

const newLineRe = /^\t\{ name: '.*', amount: \d+(?:\.\d{1,2})?, date: '\d{4}-\d{2}-\d{2}' \},$/

function triples(entries: Array<{ name: string, amount: number, date: string }>): string[] {
	return entries.map(item => `${item.name}|${item.amount}|${item.date}`)
}

export function verifyInsertion(before: string, after: string, line: number, entry: CleanEntry): void {
	if (after.includes('\r'))
		throw new Error('生成内容里出现了 CR，换行必须统一为 LF')
	if (before.endsWith('\n') !== after.endsWith('\n'))
		throw new Error('生成内容破坏了文件末尾的换行（eslint 会报 eol-last）')

	const beforeLines = before.split('\n')
	const afterLines = after.split('\n')
	if (afterLines.length !== beforeLines.length + 1)
		throw new Error(`生成内容的行数不对：期望 ${beforeLines.length + 1}，实际 ${afterLines.length}`)

	const newLineText = afterLines[line]
	if (!newLineText || !newLineRe.test(newLineText))
		throw new Error(`新增行的格式不对：${String(newLineText).slice(0, 80)}`)

	// 删掉新增行后必须与原文件逐行完全一致（等价于「原有行一行都没被动过」）
	const withoutNew = [...afterLines]
	withoutNew.splice(line, 1)
	if (withoutNew.join('\n') !== before)
		throw new Error('除新增行外，文件内容发生了变化，已中止写入')

	const beforeParsed = parseSource(before)
	const afterParsed = parseSource(after)
	if (afterParsed.entries.length !== beforeParsed.entries.length + 1)
		throw new Error('条目数没有按预期 +1')

	const afterWithoutNew = [...afterParsed.entries]
	afterWithoutNew.splice(afterWithoutNew.findIndex(item => item.line === line), 1)
	if (JSON.stringify(triples(afterWithoutNew)) !== JSON.stringify(triples(beforeParsed.entries)))
		throw new Error('原有条目的顺序或内容发生了变化，已中止写入')

	const inserted = afterParsed.entries.find(item => item.line === line)
	if (!inserted || inserted.name !== entry.name || inserted.amount !== entry.amount || inserted.date !== entry.date)
		throw new Error('回读出的新条目与预期不符，已中止写入')
}

export async function verifyRuntimeImport(text: string, expectedCount: number): Promise<void> {
	const dir = await mkdtemp(join(tmpdir(), 'reward-check-'))
	const file = join(dir, 'reward-check.mts')
	try {
		await writeFile(file, text, 'utf8')
		const module = await import(pathToFileURL(file).href) as { rewardList?: unknown[] }
		if (!Array.isArray(module.rewardList))
			throw new Error('运行时校验失败：导入后没有拿到 rewardList 数组')
		if (module.rewardList.length !== expectedCount)
			throw new Error(`运行时校验失败：条目数 ${module.rewardList.length}，期望 ${expectedCount}`)
	}
	finally {
		await rm(dir, { recursive: true, force: true })
	}
}
