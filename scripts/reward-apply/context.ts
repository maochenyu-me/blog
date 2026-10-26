/**
 * 从 `GITHUB_EVENT_PATH` 读赞助 issue / 审核评论的上下文。
 *
 * 写 main 的唯一闸门是「仓库 owner/协作者 + 评论含指令词」——workflow 的 `if:` 判一次，
 * 这里再判一次（不假设 workflow 一定拦住了），本地干跑用环境变量补位。
 */

import fs from 'node:fs'
import process from 'node:process'
import { dateInZone } from '../link-apply/context.ts'

/** 允许下指令的身份（GitHub 的 comment.author_association） */
export const trustedAssociations = ['OWNER', 'MEMBER', 'COLLABORATOR']

/** 审核指令关键词：评论里包含它即视为通过 */
export const commandKeyword = '加入赞助名单'

export interface RewardContext {
	token: string
	owner: string
	repo: string
	number: number
	issueBody: string
	commentBody: string
	/** OWNER / MEMBER / COLLABORATOR / CONTRIBUTOR / NONE … */
	association: string
	commentUserType: string
	dryRun: boolean
	/** 北京时间今天，`YYYY-MM-DD`，用于日期上限校验 */
	today: string
}

interface EventPayload {
	issue?: {
		number?: number
		body?: string | null
		user?: { type?: string }
	}
	comment?: {
		body?: string | null
		author_association?: string
		user?: { type?: string }
	}
	repository?: { name?: string, owner?: { login?: string } }
}

function fail(message: string): never {
	throw new Error(message)
}

export function isTrustedAuthor(ctx: RewardContext): boolean {
	return trustedAssociations.includes(ctx.association) && ctx.commentUserType !== 'Bot'
}

export function hasCommand(ctx: RewardContext): boolean {
	return ctx.commentBody.includes(commandKeyword)
}

export function loadRewardContext(): RewardContext {
	const timeZone = process.env.REWARD_APPLY_TZ ?? 'Asia/Shanghai'
	const today = process.env.ISSUE_TODAY ?? dateInZone(new Date().toISOString(), timeZone)
	const dryRun = process.env.DRY_RUN === '1' || !process.env.GITHUB_TOKEN
	const repository = process.env.GITHUB_REPOSITORY ?? 'maochenyu-me/blog'
	const [owner, repo] = repository.split('/')

	let payload: EventPayload = {}
	const eventPath = process.env.GITHUB_EVENT_PATH
	if (eventPath && fs.existsSync(eventPath))
		payload = JSON.parse(fs.readFileSync(eventPath, 'utf8')) as EventPayload

	const issue = payload.issue ?? {}
	const comment = payload.comment ?? {}

	const issueBody = process.env.ISSUE_BODY_FILE
		? fs.readFileSync(process.env.ISSUE_BODY_FILE, 'utf8')
		: issue.body ?? ''

	if (!issueBody.trim())
		fail('没有拿到 issue 内容：CI 里应通过 GITHUB_EVENT_PATH 注入，本地干跑请设置 ISSUE_BODY_FILE')

	const number = issue.number ?? Number(process.env.ISSUE_NUMBER ?? 0)
	if (!number)
		fail('没有拿到 issue 编号（ISSUE_NUMBER）')

	return {
		token: process.env.GITHUB_TOKEN ?? '',
		owner: owner ?? payload.repository?.owner?.login ?? 'maochenyu-me',
		repo: repo ?? payload.repository?.name ?? 'blog',
		number,
		issueBody,
		commentBody: process.env.COMMENT_BODY ?? comment.body ?? '',
		association: process.env.COMMENT_ASSOCIATION ?? comment.author_association ?? '',
		commentUserType: process.env.COMMENT_USER_TYPE ?? comment.user?.type ?? 'User',
		dryRun,
		today,
	}
}
