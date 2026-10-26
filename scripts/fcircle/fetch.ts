#!/usr/bin/env node

/**
 * 抓取所有友链订阅源，生成朋友圈页面数据（app/data/fcircle.json）。
 *
 * 由 .github/workflows/fcircle.yml 每天定时执行，也可以本地 `pnpm fcircle:fetch` 手动跑。
 * 抓取失败的站点沿用上一次成功的数据，并在数据里标记状态，页面据此提示「近期未更新」。
 */

import type { FcircleData, FcircleItem, FcircleSite, FcircleSiteStatus } from '../../app/types/fcircle.ts'
import type { FeedEntry } from '../../app/types/feed.ts'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import pLimit from 'p-limit'
import blogConfig from '../../blog.config.ts'
import { entries } from '../framework/utils.ts'
import { capGlobalItems, mergeSiteItems } from './merge.ts'
import { toExcerpt, toIsoDate } from './normalize.ts'
import { parseFeed } from './parse.ts'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const dataPath = resolve(rootDir, 'app/data/fcircle.json')

/** 并发上限：友链站大多是静态托管，4 并发足够快又不容易被判爬虫 */
const concurrency = 4
/** 重试次数（首发失败后再试 2 次） */
const retries = 2
/** 响应体上限，防止个别站点返回巨无霸页面拖垮 CI */
const maxBodyBytes = 2 * 1024 * 1024

const userAgent = `Mozilla/5.0 (compatible; FcircleBot/1.0; +${blogConfig.url})`

interface SiteResult {
	site: FcircleSite
	/** 本次是否抓取成功 */
	ok: boolean
	/** 本次新增/更新后的条目数 */
	count: number
	detail: string
}

function log(message: string) {
	process.stdout.write(`${message}\n`)
}

function siteIdOf(entry: FeedEntry) {
	try {
		return new URL(entry.link).hostname
	}
	catch {
		return entry.link
	}
}

function displayName(entry: FeedEntry) {
	return (entry.title?.trim() || entry.sitenick?.trim() || entry.author?.trim() || siteIdOf(entry))
}

async function sleep(ms: number) {
	return new Promise(resolve => setTimeout(resolve, ms))
}

/** 取订阅源原文；非 2xx、超时、超出体积上限都抛错，由调用方转成 stale 状态 */
async function fetchFeed(url: string): Promise<string> {
	let lastError: unknown

	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt)
			await sleep(500 * attempt)

		try {
			const response = await fetch(url, {
				headers: {
					'accept': 'application/atom+xml, application/rss+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.5',
					'user-agent': userAgent,
				},
				redirect: 'follow',
				signal: AbortSignal.timeout(blogConfig.fcircle.timeout),
			})

			if (!response.ok)
				throw new Error(`HTTP ${response.status}`)

			const body = await response.text()
			if (body.length > maxBodyBytes)
				throw new Error(`响应体过大（${Math.round(body.length / 1024)}KB）`)

			return body
		}
		catch (error) {
			lastError = error
		}
	}

	throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

async function buildSite(entry: FeedEntry, previous: FcircleSite | undefined, now: Date): Promise<SiteResult> {
	const base: FcircleSite = {
		id: siteIdOf(entry),
		name: displayName(entry),
		link: entry.link,
		avatar: entry.avatar,
		icon: entry.icon,
		feed: entry.feed,
		status: 'nofeed',
		items: previous?.items ?? [],
		fetchedAt: previous?.fetchedAt,
	}

	if (!entry.feed) {
		return { site: base, ok: false, count: base.items.length, detail: '未配置订阅源' }
	}

	try {
		const xml = await fetchFeed(entry.feed)
		const { items: rawItems } = parseFeed(xml, entry.feed)

		if (!rawItems.length)
			throw new Error('订阅源里没有可用的文章条目')

		const incoming: FcircleItem[] = rawItems.map(item => ({
			title: item.title,
			link: item.link,
			excerpt: toExcerpt(item.summary),
			date: toIsoDate(item.date, now),
			cover: item.cover,
		}))

		const site: FcircleSite = {
			...base,
			status: 'ok',
			fetchedAt: now.toISOString(),
			items: mergeSiteItems(base.items, incoming, {
				...blogConfig.fcircle,
				now,
			}),
		}

		return { site, ok: true, count: site.items.length, detail: `新抓到 ${incoming.length} 条` }
	}
	catch (error) {
		const detail = error instanceof Error ? error.message : String(error)
		const status: FcircleSiteStatus = base.items.length ? 'stale' : 'error'

		return {
			site: { ...base, status, error: detail },
			ok: false,
			count: base.items.length,
			detail,
		}
	}
}

function readPrevious(): Map<string, FcircleSite> {
	try {
		const raw = fs.readFileSync(dataPath, 'utf-8')
		const data = JSON.parse(raw) as FcircleData
		return new Map((data.sites ?? []).map(site => [site.id, site]))
	}
	catch {
		return new Map()
	}
}

async function main() {
	const now = new Date()
	const previous = readPrevious()
	const startedAt = performance.now()

	log(`🌐 开始抓取 ${entries.length} 个友链的订阅源…`)

	const limit = pLimit(concurrency)
	const results = await Promise.all(entries.map(entry => limit(async () => {
		const result = await buildSite(entry, previous.get(siteIdOf(entry)), now)
		const mark = result.ok ? '✅' : result.site.status === 'nofeed' ? '⏭️' : '⚠️'
		log(`${mark} ${result.site.name}：${result.detail}（共 ${result.count} 条）`)
		return result
	})))

	// 保持 feeds.ts 里的分组顺序，页面展示顺序与友链页一致
	const sites = capGlobalItems(results.map(result => result.site), blogConfig.fcircle.maxItems)

	const data: FcircleData = {
		generatedAt: now.toISOString(),
		sites,
	}

	fs.mkdirSync(dirname(dataPath), { recursive: true })
	fs.writeFileSync(dataPath, JSON.stringify(data, null, 2), 'utf-8')

	const itemCount = sites.reduce((sum, site) => sum + site.items.length, 0)
	const failed = results.filter(result => !result.ok && result.site.status !== 'nofeed')

	log('')
	log(`📄 写入 ${dataPath}`)
	log(`📊 ${sites.length} 个站点 / ${itemCount} 篇文章，失败 ${failed.length} 个，用时 ${Math.round(performance.now() - startedAt)}ms`)

	if (!itemCount)
		process.exitCode = 1
}

await main()
