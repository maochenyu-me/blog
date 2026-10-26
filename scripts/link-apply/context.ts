/**
 * 从 GitHub Actions 注入的 `GITHUB_EVENT_PATH` 读取 issue 上下文。
 * 所有用户数据只经 JSON 文件进入脚本，绝不拼进 shell 命令。
 * 本地干跑用 ISSUE_BODY_FILE / ISSUE_NUMBER / ISSUE_CREATED_AT / ISSUE_LABELS 补位。
 */

import fs from 'node:fs'
import process from 'node:process'

export interface IssueContext {
	token: string
	owner: string
	repo: string
	number: number
	body: string
	createdAt: string
	/** 推荐写进 feeds.ts 的日期，已按 timeZone 截断为 YYYY-MM-DD */
	date: string
	labels: string[]
	state: string
	stateReason: string
	authorLogin: string
	senderLogin: string
	dryRun: boolean
}

interface EventPayload {
	issue?: {
		number?: number
		body?: string | null
		created_at?: string
		state?: string
		state_reason?: string | null
		labels?: Array<{ name?: string } | string>
		user?: { login?: string }
	}
	sender?: { login?: string }
	repository?: { name?: string, owner?: { login?: string } }
}

export function dateInZone(iso: string, timeZone: string): string {
	const parsed = new Date(iso)
	const date = Number.isNaN(parsed.getTime()) ? new Date() : parsed
	// sv-SE 恰好输出 YYYY-MM-DD
	return new Intl.DateTimeFormat('sv-SE', { timeZone }).format(date)
}

function fail(message: string): never {
	throw new Error(message)
}

export function loadContext(): IssueContext {
	const timeZone = process.env.LINK_APPLY_TZ ?? 'Asia/Shanghai'
	const dryRun = process.env.DRY_RUN === '1' || !process.env.GITHUB_TOKEN
	const repository = process.env.GITHUB_REPOSITORY ?? 'maochenyu-me/blog'
	const [owner, repo] = repository.split('/')

	let payload: EventPayload = {}
	const eventPath = process.env.GITHUB_EVENT_PATH
	if (eventPath && fs.existsSync(eventPath))
		payload = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as EventPayload

	const issue = payload.issue ?? {}
	const labels = (issue.labels ?? []).map(label => typeof label === 'string' ? label : label.name ?? '').filter(Boolean)

	const body = process.env.ISSUE_BODY_FILE
		? fs.readFileSync(process.env.ISSUE_BODY_FILE, 'utf8')
		: issue.body ?? ''

	if (!body.trim())
		fail('没有拿到 issue 内容：CI 里应通过 GITHUB_EVENT_PATH 注入，本地干跑请设置 ISSUE_BODY_FILE')

	const number = issue.number ?? Number(process.env.ISSUE_NUMBER ?? 0)
	if (!number)
		fail('没有拿到 issue 编号（ISSUE_NUMBER）')

	const createdAt = issue.created_at ?? process.env.ISSUE_CREATED_AT ?? new Date().toISOString()
	const envLabels = (process.env.ISSUE_LABELS ?? '').split(',').map(item => item.trim()).filter(Boolean)

	return {
		token: process.env.GITHUB_TOKEN ?? '',
		owner: owner ?? payload.repository?.owner?.login ?? 'maochenyu-me',
		repo: repo ?? payload.repository?.name ?? 'blog',
		number,
		body,
		createdAt,
		date: dateInZone(createdAt, timeZone),
		labels: labels.length ? labels : envLabels,
		state: issue.state ?? 'open',
		stateReason: issue.state_reason ?? process.env.ISSUE_STATE_REASON ?? '',
		authorLogin: issue.user?.login ?? process.env.ISSUE_AUTHOR ?? '',
		senderLogin: payload.sender?.login ?? process.env.ISSUE_SENDER ?? '',
		dryRun,
	}
}

/** 申请人自己关闭 = 提交完成；其余（管理员/协作者）关闭 = 审核动作 */
export function isClosedByAuthor(ctx: IssueContext): boolean {
	return Boolean(ctx.authorLogin) && ctx.authorLogin === ctx.senderLogin
}
