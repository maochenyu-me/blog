/**
 * 扫描文章目录：只收 md/mdx，草稿直接跳过，保证脚本与站点的口径一致
 * （草稿在 content.config.ts 里本来就被排除在内容库之外）。
 */

import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { hasField, splitFrontmatter } from './frontmatter.ts'

export interface PostEntry {
	/** 相对文章根目录的 posix 路径，如 `2026/08/example.md` */
	path: string
	fullPath: string
	raw: string
	frontmatter: string
	body: string
}

const articleRe = /\.mdx?$/i
/** 顶层 `draft: true|yes`（引号可有可无）；缩进的同名键不算 */
const draftRe = /^draft:[ \t]*['"]?(?:true|yes)\b/im

export function isDraft(frontmatter: string): boolean {
	return draftRe.test(frontmatter)
}

export function hasSummary(frontmatter: string): boolean {
	return hasField(frontmatter, 'aiSummary')
}

async function walk(root: string, current: string, files: string[]): Promise<void> {
	const entries = await readdir(join(root, current), { withFileTypes: true })

	for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
		const relative = current ? `${current}/${entry.name}` : entry.name

		if (entry.isDirectory()) {
			await walk(root, relative, files)
			continue
		}

		if (articleRe.test(entry.name))
			files.push(relative)
	}
}

/** 列出根目录下所有非草稿文章，按路径排序 */
export async function listPosts(root: string): Promise<PostEntry[]> {
	const files: string[] = []
	await walk(root, '', files)

	const posts: PostEntry[] = []

	for (const path of files) {
		const fullPath = join(root, path)
		const raw = await readFile(fullPath, 'utf8')
		const { frontmatter, body } = splitFrontmatter(raw)

		if (isDraft(frontmatter))
			continue

		posts.push({ path, fullPath, raw, frontmatter, body })
	}

	return posts
}
