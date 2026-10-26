/**
 * 回评。必须由 workflow 在 push 成功（或明确失败）之后才调用，
 * 这样「已加入」的消息不会早于真实写入。
 */

import type { ApplyState } from './state.ts'
import process from 'node:process'
import { deliver } from '../link-apply/gh.ts'
import { loadRewardContext } from './context.ts'
import { appliedComment, conflictComment, failureComment, markers, rejectedComment, skippedComment } from './render.ts'
import { readState } from './state.ts'

const ctx = loadRewardContext()

function loadState(): ApplyState {
	try {
		return readState()
	}
	catch {
		// apply 阶段就崩了（连状态都没写），这里兜住，避免 workflow 红着却不留任何说明
		return {
			status: 'error',
			issues: [],
			duplicated: [],
			message: '脚本没有产出写入状态，多半在解析或读取文件时就失败了，请查看 Actions 日志',
		}
	}
}

const state = loadState()

// 身份/指令不匹配时静默退出，不在别人的 issue 里留痕
if (state.status === 'skipped')
	process.exit(0)

const pushed = process.env.PUSHED === '1' || ctx.dryRun

async function main(): Promise<void> {
	if (state.status === 'applied' && state.entry) {
		await deliver(ctx, markers.applied, pushed ? appliedComment(state.entry, ctx.number) : conflictComment(state.entry))
		return
	}
	if (state.status === 'noop' && state.entry && state.existing) {
		await deliver(ctx, markers.skipped, skippedComment(state.entry, state.existing))
		return
	}
	if (state.status === 'invalid') {
		await deliver(ctx, markers.rejected, rejectedComment(state.issues, state.duplicated))
		return
	}
	await deliver(ctx, markers.rejected, failureComment(state.message ?? '未知错误'))
}

await main()
