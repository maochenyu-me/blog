import assert from 'node:assert/strict'
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { hasSummary, isDraft, listPosts } from './posts.ts'

async function fixture() {
	const root = await mkdtemp(join(tmpdir(), 'ai-summary-'))

	await mkdir(join(root, '2026', '08'), { recursive: true })
	await writeFile(join(root, '2026', '08', 'published.md'), '---\ntitle: 已发布\ndate: 2026-08-01\n---\n\n正文\n')
	await writeFile(join(root, '2026', '08', 'draft.md'), '---\ntitle: 草稿\ndraft: true\n---\n\n正文\n')
	await writeFile(join(root, '2026', '08', 'draft-quoted.mdx'), '---\ntitle: 草稿二\ndraft: "true"\n---\n\n正文\n')
	await writeFile(join(root, '2026', '08', 'summary.md'), '---\ntitle: 有摘要\naiSummary: "旧摘要。"\n---\n\n正文\n')
	await writeFile(join(root, '2026', '08', 'empty-summary.md'), '---\ntitle: 空摘要\naiSummary: ""\n---\n\n正文\n')
	await writeFile(join(root, '2026', '08', 'notes.txt'), '不是文章')

	return root
}

test('只收录 md/mdx，排除草稿，按路径排序', async () => {
	const root = await fixture()

	try {
		const posts = await listPosts(root)

		assert.deepEqual(posts.map(post => post.path), [
			'2026/08/empty-summary.md',
			'2026/08/published.md',
			'2026/08/summary.md',
		])
	}
	finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('条目带上原始内容与 frontmatter', async () => {
	const root = await fixture()

	try {
		const posts = await listPosts(root)
		const target = posts.find(post => post.path === '2026/08/summary.md')

		assert.ok(target)
		assert.equal(target.frontmatter.includes('title: 有摘要'), true)
		assert.equal(target.body.trim(), '正文')
	}
	finally {
		await rm(root, { recursive: true, force: true })
	}
})

test('draft 的多种写法都能识别', () => {
	assert.equal(isDraft('draft: true'), true)
	assert.equal(isDraft('draft: yes'), true)
	assert.equal(isDraft('draft: "true"'), true)
	assert.equal(isDraft('draft: false'), false)
	assert.equal(isDraft('title: 甲'), false)
	assert.equal(isDraft('meta:\n  draft: true'), false)
})

test('有无摘要的判定', () => {
	assert.equal(hasSummary('aiSummary: "一段摘要。"'), true)
	assert.equal(hasSummary('aiSummary: ""'), false)
	assert.equal(hasSummary('title: 甲'), false)
})
