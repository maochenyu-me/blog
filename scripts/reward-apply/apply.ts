/**
 * 管理员下指令后写 `app/reward.ts`。
 *
 * 这是整条链路唯一会改文件的地方，所以顺序是：权限/指令校验 → 表单校验 → 查重 →
 * 行级插入 → 文本回环自检 → 真的 import 一遍 → 才落盘。
 * 任何一步不通过都只写状态、不碰文件；回评交给 comment-result.ts（必须等 push 成功）。
 */

import type { ApplyState } from './state.ts'
import fs from 'node:fs'
import process from 'node:process'
import { hasCommand, isTrustedAuthor, loadRewardContext } from './context.ts'
import { parseRewardForm } from './parse.ts'
import { applyInsertion, hasDuplicate, parseSource, rewardPath } from './source.ts'
import { writeState } from './state.ts'
import { validateForm } from './validate.ts'
import { verifyInsertion, verifyRuntimeImport } from './verify.ts'

const ctx = loadRewardContext()

function finish(state: ApplyState): void {
	writeState(state)
}

async function main(): Promise<void> {
	// 双保险：workflow 的 if 已经拦过一次，这里不假设它一定拦住了
	if (!isTrustedAuthor(ctx) || !hasCommand(ctx)) {
		finish({ status: 'skipped', issues: [], duplicated: [] })
		return
	}

	const form = parseRewardForm(ctx.issueBody)
	if (form.missing.length) {
		finish({
			status: 'invalid',
			issues: form.missing.map(label => ({ field: label, message: '必填项为空' })),
			duplicated: form.duplicated,
		})
		return
	}

	const { entry, issues } = validateForm(form.fields, ctx.today)
	if (!entry || issues.length) {
		finish({ status: 'invalid', issues, duplicated: form.duplicated })
		return
	}

	const before = fs.readFileSync(rewardPath, 'utf8')
	const parsed = parseSource(before)

	const existing = hasDuplicate(parsed.entries, entry)
	if (existing) {
		finish({ status: 'noop', entry, issues: [], duplicated: form.duplicated, existing })
		return
	}

	const inserted = applyInsertion(before, entry)
	verifyInsertion(before, inserted.text, inserted.line, entry)
	await verifyRuntimeImport(inserted.text, parsed.entries.length + 1)

	if (ctx.dryRun) {
		const around = inserted.text.split('\n').slice(Math.max(0, inserted.line - 1), inserted.line + 2)
		process.stdout.write(`--- DRY RUN：新增行在第 ${inserted.line + 1} 行 ---\n`)
		process.stdout.write(`${around.map(line => `| ${line}`).join('\n')}\n`)
	}
	else {
		fs.writeFileSync(rewardPath, inserted.text, 'utf8')
		process.stdout.write(`已写入 ${rewardPath} 第 ${inserted.line + 1} 行\n`)
	}

	finish({ status: 'applied', entry, issues: [], duplicated: form.duplicated })
}

try {
	await main()
}
catch (error) {
	finish({ status: 'error', issues: [], duplicated: [], message: (error as Error).message })
	process.exitCode = 1
}
