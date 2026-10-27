import type { ReadTimeResults } from 'reading-time'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { defineCollection } from '@nuxt/content'
import { defineSitemapSchema } from '@nuxtjs/sitemap/content'
import { z } from 'zod'
import blogConfig from './blog.config'

/**
 * Nuxt Content 的 source 只能按文件路径过滤，不能按 frontmatter 过滤，
 * 所以先扫一遍 content 目录，把 `draft: true` 的文件收集成 exclude glob。
 * 草稿因此根本不会进内容库：列表、订阅源、搜索、sitemap、统计、`/raw/**` 全拿不到它。
 * 注意：改完 frontmatter 的 draft 字段后要重启 dev / 重新构建才生效。
 */
function draftGlobs(dir = resolve('content'), root = dir): string[] {
	const globs: string[] = []
	try {
		for (const item of readdirSync(dir, { withFileTypes: true })) {
			const path = join(dir, item.name)
			if (item.isDirectory()) {
				globs.push(...draftGlobs(path, root))
				continue
			}
			if (!/\.mdx?$/.test(item.name))
				continue
			const frontmatter = readFileSync(path, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---/)
			if (frontmatter && /^\s*draft:\s*['"]?(?:true|yes)\b/im.test(frontmatter[1]))
				globs.push(path.slice(root.length + 1).replaceAll('\\', '/'))
		}
	}
	catch {
		// content 目录还不存在时按「没有草稿」处理
	}
	return globs
}

type ArticleType = keyof typeof blogConfig.article.types
// 文章类型已在 blog.config 中定义，此处使用 any 类型绕过 zod 类型验证
const articleTypes = Object.keys(blogConfig.article.types) as any

export interface ArticleSchema {
	title?: string
	description?: string
	date?: string
	updated?: string
	published?: string
	categories?: string[]
	tags?: string[]
	type?: ArticleType

	image?: string
	recommend?: number
	references?: { title?: string, link?: string }[]
	/** TODO */
	draft?: boolean
	permalink?: string

	/** 由 scripts/ai-summary 生成的文章摘要 */
	aiSummary?: string
	/** 生成摘要所用的模型，如 `Qwen/Qwen3-8B` */
	aiSummaryModel?: string
	/** 生成日期（YYYY-MM-DD） */
	aiSummaryAt?: string

	readingTime?: ReadTimeResults
}

const articleSchema = z.object({
	title: z.string().optional(),
	description: z.string().optional(),
	date: z.string().optional(),
	updated: z.string().optional(),
	published: z.string().optional(),
	categories: z.array(z.string()).default([blogConfig.defaultCategory]),
	tags: z.array(z.string()).default([]),
	type: z.enum(articleTypes).optional().default(articleTypes[0]),

	image: z.string().optional(),
	recommend: z.number().optional(),
	references: z.array(z.object({
		title: z.string().optional(),
		link: z.string().optional(),
	})).optional(),
	draft: z.boolean().default(false),
	permalink: z.string().optional(),

	/** 文章开头的 AI 摘要，由 scripts/ai-summary 写入；缺失时页面回退到 description */
	aiSummary: z.string().optional(),
	aiSummaryModel: z.string().optional(),
	aiSummaryAt: z.string().optional(),

	readingTime: z.object({
		text: z.string(),
		minutes: z.number(),
		time: z.number(),
		words: z.number(),
	}),
}) satisfies z.ZodType<ArticleSchema>

export const collections = {
	content: defineCollection({
		source: {
			include: '**',
			/** 草稿文件直接排除在内容库之外（见 draftGlobs） */
			exclude: draftGlobs(),
		},
		type: 'page',
		schema: articleSchema.extend({
			sitemap: defineSitemapSchema({
				name: 'content',
				onUrl: (url, entry) => {
					const lastmod = (entry.updated || entry.published || entry.date) as string | undefined
					if (lastmod)
						url.lastmod = new Date(lastmod).toLocaleDateString('sv')
				},
				z,
			}),
		}),
	}),
}
