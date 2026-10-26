/** 写入结果的交接：`apply.ts` 落状态，`comment-result.ts` 读状态后回评（必须等 push 成功再回）。 */

import type { ParsedEntry } from './source.ts'
import type { CleanEntry, ValidationIssue } from './validate.ts'
import fs from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import process from 'node:process'

export type ApplyStatus = 'applied' | 'noop' | 'invalid' | 'skipped' | 'error'

export interface ApplyState {
	status: ApplyStatus
	entry?: CleanEntry
	issues: ValidationIssue[]
	duplicated: string[]
	existing?: ParsedEntry
	message?: string
}

export function statePath(): string {
	return join(process.env.RUNNER_TEMP ?? tmpdir(), 'reward-apply-state.json')
}

export function writeState(state: ApplyState): void {
	fs.writeFileSync(statePath(), JSON.stringify(state, null, 2), 'utf8')
	process.stdout.write(`status=${state.status}\n`)
	if (state.entry)
		process.stdout.write(`entry=${JSON.stringify(state.entry)}\n`)

	const outputPath = process.env.GITHUB_OUTPUT
	if (outputPath) {
		fs.appendFileSync(outputPath, `status=${state.status}\n`, 'utf8')
		fs.appendFileSync(outputPath, `entry=${JSON.stringify(state.entry ?? null)}\n`, 'utf8')
	}
}

export function readState(): ApplyState {
	const path = statePath()
	if (!fs.existsSync(path))
		throw new Error(`没有找到写入状态文件：${path}`)
	return JSON.parse(fs.readFileSync(path, 'utf8')) as ApplyState
}
