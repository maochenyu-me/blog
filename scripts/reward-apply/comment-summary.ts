/**
 * issue 关闭时发「待审核摘要」：把解析出的名称/金额/日期和内联支付截图贴到评论区，
 * 供管理员核对。不写文件，也不需要 contents: write。
 */

import type { CleanEntry, ValidationIssue } from './validate.ts'
import fs from 'node:fs'
import { deliver } from '../link-apply/gh.ts'
import { loadRewardContext } from './context.ts'
import { parseRewardForm } from './parse.ts'
import { markers, summaryComment } from './render.ts'
import { hasDuplicate, parseSource, rewardPath } from './source.ts'
import { validateForm } from './validate.ts'

const ctx = loadRewardContext()

function findExisting(entry: CleanEntry | undefined) {
	if (!entry)
		return undefined
	try {
		return hasDuplicate(parseSource(fs.readFileSync(rewardPath, 'utf8')).entries, entry)
	}
	catch {
		// 拿不到/读不懂就当作没有，摘要不该因为文件格式问题而失败
		return undefined
	}
}

async function main(): Promise<void> {
	const { fields, missing, duplicated, screenshots } = parseRewardForm(ctx.issueBody)

	let entry: CleanEntry | undefined
	let issues: ValidationIssue[] = []
	if (!missing.length)
		({ entry, issues } = validateForm(fields, ctx.today))

	await deliver(ctx, markers.summary, summaryComment({
		entry,
		note: fields.note,
		missing,
		issues,
		duplicated,
		screenshots,
		existing: findExisting(entry),
	}))
}

await main()
