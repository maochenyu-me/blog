/** GitHub REST 薄封装：只做「按隐藏标记更新/新建 issue 评论」这一件事。 */

import type { IssueContext } from './context.ts'
import process from 'node:process'

export interface IssueComment {
	id: number
	body: string
}

const apiBase = 'https://api.github.com'

async function gh(token: string, path: string, init: { method?: string, body?: string } = {}): Promise<unknown> {
	const response = await fetch(`${apiBase}${path}`, {
		method: init.method ?? 'GET',
		body: init.body,
		headers: {
			'accept': 'application/vnd.github+json',
			'authorization': `Bearer ${token}`,
			'content-type': 'application/json',
			'user-agent': 'link-apply-bot',
			'x-github-api-version': '2022-11-28',
		},
	})
	if (!response.ok) {
		const detail = await response.text()
		throw new Error(`GitHub API ${response.status} ${path}：${detail.slice(0, 300)}`)
	}
	return response.json()
}

export async function listIssueComments(token: string, owner: string, repo: string, issueNumber: number): Promise<IssueComment[]> {
	return await gh(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments?per_page=100`) as IssueComment[]
}

/**
 * 按 marker 覆盖写：命中则 PATCH 同一条评论（不刷屏、保留历史位置），未命中才 POST。
 */
export async function upsertIssueComment(
	token: string,
	owner: string,
	repo: string,
	issueNumber: number,
	marker: string,
	body: string,
): Promise<'created' | 'updated'> {
	const comments = await listIssueComments(token, owner, repo, issueNumber)
	const existing = comments.find(comment => (comment.body ?? '').includes(marker))

	if (existing) {
		await gh(token, `/repos/${owner}/${repo}/issues/comments/${existing.id}`, {
			method: 'PATCH',
			body: JSON.stringify({ body }),
		})
		return 'updated'
	}

	await gh(token, `/repos/${owner}/${repo}/issues/${issueNumber}/comments`, {
		method: 'POST',
		body: JSON.stringify({ body }),
	})
	return 'created'
}

/** 统一出口：DRY_RUN 只打印，CI 里写到 issue 评论 */
export async function deliver(ctx: IssueContext, marker: string, body: string): Promise<void> {
	if (ctx.dryRun) {
		process.stdout.write(`--- DRY RUN（${marker}）---\n${body}\n`)
		return
	}
	const action = await upsertIssueComment(ctx.token, ctx.owner, ctx.repo, ctx.number, marker, body)
	process.stdout.write(`评论已${action === 'created' ? '创建' : '更新'}：${marker}\n`)
}
