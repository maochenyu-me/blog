import type { MemosRawList, MemosRawMessage } from '~/types/memos'
import type { Ech0Echo, Ech0Envelope, Ech0Page } from '~/types/memos-ech0'
import blogConfig from '~~/blog.config'

/**
 * 构建期把说说首屏抓成静态 JSON（/api/memos/latest）。
 * 客户端先用这份同源快照出内容，再用直连 API 静默校准，
 * 避免每次首访都要等接口站点的 TLS 握手（实测 5s 量级）。
 * 抓取失败时返回空列表，客户端会自动回退到直连。
 *
 * 两个数据源返回各自的原始形态，由客户端对应的适配器负责映射：
 *   - tg   → `{ items: MemosRawMessage[], nextCursor }`
 *   - ech0 → `{ items: Ech0Echo[], total }`
 */
export default defineEventHandler(async () => {
	return blogConfig.memos.source === 'tg' ? fetchTgSnapshot() : fetchEch0Snapshot()
})

/** koharu-suite：游标分页，第一页带 limit + 频道过滤 */
async function fetchTgSnapshot(): Promise<MemosRawList<MemosRawMessage>> {
	const { apiBase, channelIds } = blogConfig.memos.tg
	const { perPage } = blogConfig.memos
	const query = new URLSearchParams({ limit: String(perPage) })
	for (const id of channelIds)
		query.append('channel', id)
	const url = `${apiBase}/api/v1/messages/latest?${query}`

	// prerender 阶段会并发处理所有路由，这里留足时间并重试，避免快照被空数据占位
	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const data = await $fetch<MemosRawList<MemosRawMessage>>(url, { timeout: 30000 })
			if (data?.items?.length)
				return data
		}
		catch (error) {
			console.warn(`[memos] 构建期快照第 ${attempt + 1} 次失败`, error)
		}
	}

	console.warn('[memos] 构建期快照不可用，客户端将直连接口')
	return { items: [], nextCursor: null } satisfies MemosRawList<MemosRawMessage>
}

/** Ech0：页码分页，取第 1 页即可 */
async function fetchEch0Snapshot(): Promise<Ech0Page<Ech0Echo>> {
	const { apiBase } = blogConfig.memos.ech0
	const { perPage } = blogConfig.memos
	const empty: Ech0Page<Ech0Echo> = { total: 0, items: [] }

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const data = await $fetch<Ech0Envelope<Ech0Page<Ech0Echo>>>(`${apiBase}/api/echo/query`, {
				method: 'POST',
				body: { page: 1, pageSize: perPage },
				timeout: 30000,
			})
			if (data?.code === 1 && data.data?.items?.length)
				return data.data
		}
		catch (error) {
			console.warn(`[memos] Ech0 构建期快照第 ${attempt + 1} 次失败`, error)
		}
	}

	console.warn('[memos] Ech0 构建期快照不可用，客户端将直连接口')
	return empty
}
