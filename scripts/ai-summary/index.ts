#!/usr/bin/env node

/**
 * 批量生成文章 AI 摘要，写入 frontmatter 的 aiSummary / aiSummaryModel / aiSummaryAt。
 *
 * 交互运行（`pnpm ai:summary`）：
 *   1. 为所有文章生成摘要（覆盖已有）
 *   2. 只为还没有 AI 摘要的文章生成
 *
 * 非交互运行（CI / 脚本）：
 *   pnpm ai:summary --all | --missing [--dry-run]
 *
 * 模型的密钥放在仓库根目录的 .env：SILICONFLOW_API_KEY=sk-xxx
 * 可选覆盖：SILICONFLOW_MODEL、SILICONFLOW_BASE_URL、AI_SUMMARY_CONCURRENCY
 */

import type { PostEntry } from './posts.ts'
import { existsSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { cancel, intro, isCancel, log, outro, select, spinner } from '@clack/prompts'
import pLimit from 'p-limit'
import blogConfig from '../../blog.config.ts'
import { readField, upsertFields } from './frontmatter.ts'
import { toPlainText, truncateText } from './markdown.ts'
import { hasSummary, listPosts } from './posts.ts'
import { buildUserMessage, isSummaryAcceptable, normalizeSummary, systemPrompt } from './prompt.ts'
import { requestChatCompletion } from './siliconflow.ts'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const postsDir = resolve(rootDir, 'content/posts')

/** 送进模型的正文上限（字符），再长对写摘要没有增益，只会烧 token */
const maxDigestLength = 8000
/** 摘要硬上限，超过就按句末截断 */
const maxSummaryLength = 200

type Mode = 'all' | 'missing'

interface Options {
	mode?: Mode
	dryRun: boolean
}

function loadEnv() {
	const envPath = resolve(rootDir, '.env')

	if (!existsSync(envPath))
		return

	try {
		process.loadEnvFile(envPath)
	}
	catch (error) {
		log.warn(`读取 .env 失败，将只使用现有环境变量：${(error as Error).message}`)
	}
}

function parseArgs(argv: string[]): Options {
	const options: Options = { dryRun: argv.includes('--dry-run') }

	if (argv.includes('--all'))
		options.mode = 'all'
	else if (argv.includes('--missing'))
		options.mode = 'missing'

	return options
}

/** 内联数组（`tags: [Nuxt, 页面]`）转数组；空值返回空数组 */
function asList(value?: string): string[] {
	if (!value)
		return []

	const inner = value.trim().replace(/^\[|\]$/g, '')

	return inner
		? inner.split(',').map(item => item.trim().replace(/^['"]|['"]$/g, '')).filter(Boolean)
		: []
}

async function pickMode(): Promise<Mode | undefined> {
	const answer = await select<Mode>({
		message: '要给哪些文章生成 AI 摘要？',
		options: [
			{ value: 'missing', label: '1. 只处理还没有 AI 摘要的文章', hint: '推荐，适合日常' },
			{ value: 'all', label: '2. 为所有文章生成（覆盖已有摘要）', hint: '会重新消耗额度' },
		],
		initialValue: 'missing',
	})

	if (isCancel(answer)) {
		cancel('已取消')
		return undefined
	}

	return answer
}

function todayInBlogTimeZone(): string {
	return new Date().toLocaleDateString('sv-SE', { timeZone: blogConfig.timeZone })
}

/** 模型名去掉厂商标前 `Qwen/Qwen3-8B` → `Qwen3-8B` */
export function shortModelName(model: string): string {
	return model.split('/').filter(Boolean).at(-1) ?? model
}

async function summarizePost(
	post: PostEntry,
	context: { apiKey: string, model: string, baseUrl?: string, dryRun: boolean },
): Promise<string> {
	const text = truncateText(toPlainText(post.body), maxDigestLength)

	if (!text)
		throw new Error('正文为空，跳过')

	const messages = [
		{ role: 'system' as const, content: systemPrompt },
		{
			role: 'user' as const,
			content: buildUserMessage({
				title: readField(post.frontmatter, 'title'),
				categories: asList(readField(post.frontmatter, 'categories')),
				tags: asList(readField(post.frontmatter, 'tags')),
				text,
			}),
		},
	]

	const result = await requestChatCompletion(messages, {
		apiKey: context.apiKey,
		model: context.model,
		baseUrl: context.baseUrl,
	})

	let summary = normalizeSummary(result.content)

	if ([...summary].length > maxSummaryLength)
		summary = truncateText(summary, maxSummaryLength)

	const check = isSummaryAcceptable(summary)

	if (!check.ok)
		throw new Error(`摘要不可用（${check.reason}）：${summary.slice(0, 40)}`)

	if (!context.dryRun) {
		await writeFile(post.fullPath, upsertFields(post.raw, {
			aiSummary: summary,
			aiSummaryModel: context.model,
			aiSummaryAt: todayInBlogTimeZone(),
		}), 'utf8')
	}

	return summary
}

async function main() {
	loadEnv()

	const argv = process.argv.slice(2)

	if (argv.includes('--help') || argv.includes('-h')) {
		log.info([
			'pnpm ai:summary            交互选择处理范围',
			'pnpm ai:summary --all      为所有非草稿文章生成摘要',
			'pnpm ai:summary --missing  只为没有摘要的文章生成',
			'  追加 --dry-run           只打印结果，不写回文件',
		].join('\n'))
		return
	}

	const options = parseArgs(argv)
	const apiKey = process.env.SILICONFLOW_API_KEY
	const model = process.env.SILICONFLOW_MODEL || 'Qwen/Qwen3-8B'
	const baseUrl = process.env.SILICONFLOW_BASE_URL || undefined
	const concurrency = Math.max(1, Number(process.env.AI_SUMMARY_CONCURRENCY) || 2)

	if (!apiKey) {
		log.error('未找到 SILICONFLOW_API_KEY。请在仓库根目录的 .env 中填写（参考 .env.example）。')
		process.exitCode = 1
		return
	}

	intro('🤖 文章 AI 摘要')

	const mode = options.mode ?? await pickMode()

	if (!mode)
		return

	const posts = await listPosts(postsDir)
	const targets = mode === 'all' ? posts : posts.filter(post => !hasSummary(post.frontmatter))

	if (!targets.length) {
		outro(`没有需要处理的文章（共 ${posts.length} 篇非草稿文章）`)
		return
	}

	const scope = mode === 'all' ? '全部' : '缺少摘要的'
	log.info(`${scope}文章 ${targets.length} 篇 · 模型 ${shortModelName(model)}${options.dryRun ? ' · 试运行（不写文件）' : ''}`)

	const limit = pLimit(concurrency)
	// CI 里没有 TTY，spinner 会刷出一堆控制字符，改用逐行日志
	const useSpinner = Boolean(process.stdout.isTTY)
	const progress = useSpinner ? spinner() : undefined
	const failures: { path: string, reason: string }[] = []
	let done = 0
	let truncated = 0

	progress?.start(`处理中 0/${targets.length}`)

	await Promise.all(targets.map(post => limit(async () => {
		try {
			const summary = await summarizePost(post, { apiKey, model, baseUrl, dryRun: options.dryRun })

			if ([...summary].length >= maxSummaryLength - 1)
				truncated += 1

			if (!useSpinner)
				log.success(`${post.path}（${[...summary].length} 字）`)
		}
		catch (error) {
			failures.push({ path: post.path, reason: (error as Error).message })
		}
		finally {
			done += 1

			if (progress)
				progress.message(`处理中 ${done}/${targets.length}`)
			else if (done === targets.length)
				log.info(`已处理 ${done}/${targets.length}`)
		}
	})))

	progress?.stop('处理完成')

	const ok = targets.length - failures.length

	if (ok)
		log.success(`${ok} 篇已${options.dryRun ? '试运行' : '写回'}${truncated ? `（其中 ${truncated} 篇摘要过长被截断）` : ''}`)

	for (const failure of failures)
		log.error(`${failure.path} → ${failure.reason}`)

	outro(failures.length ? `${failures.length} 篇失败，修正后可重复运行（已成功的不会重复消耗）` : '全部完成，记得提交改动')

	if (failures.length)
		process.exitCode = 1
}

await main()
