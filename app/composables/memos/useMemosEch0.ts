/**
 * ech0 数据源（自部署 Ech0）的取数适配器。
 *
 * 契约（实测，v1.0.3 / commit 086219b）：
 *   POST {apiBase}/api/echo/query  body {page, pageSize}  →  {code:1, data:{total, items}}
 *   - page 从 1 开始，pageSize 上限 100（超出静默截断）
 *   - 匿名请求恒被过滤 private
 *   - `content` 是 Markdown 源码，需要前端渲染
 *   - CORS 完全放开（反射 Origin），不需要开发代理
 *
 * 与 `useMemosTg.ts` 对外暴露同一套状态，供 `useMemos.ts` 门面按配置二选一。
 * 分页语义差异全部收敛在这个文件里：tg 是游标，ech0 是页码。
 */
import type { MemosMessage } from '~/types/memos'
import type { Ech0Echo, Ech0Envelope, Ech0Page } from '~/types/memos-ech0'
import { mapEchosToMessages } from '~/utils/memos/ech0'
import { loadMemosMarkdownRenderer } from '~/utils/memos/markdown'

/** 首屏缓存的新鲜期默认值，可用 blog.config 的 memos.cacheTtl 覆盖 */
const defaultCacheTtl = 2 * 60 * 1000
/** 切回页面时静默刷新的最小间隔默认值，可用 memos.refreshInterval 覆盖 */
const defaultRefreshInterval = 2 * 60 * 1000
/** 单次请求超时默认值，可用 memos.requestTimeout 覆盖 */
const defaultRequestTimeout = 15 * 1000

const cacheKey = 'memos:first-page:v2:ech0'

interface StoredCache {
	at: number
	items: MemosMessage[]
	page: number
	total: number
}

/** 进程内缓存，同一会话内进出页面时省掉一次 JSON 解析 */
let memoryCache: StoredCache | null = null

function readCache(): StoredCache | null {
	let cached = memoryCache
	if (!cached) {
		try {
			const raw = localStorage.getItem(cacheKey)
			if (!raw)
				return null
			cached = JSON.parse(raw) as StoredCache
			memoryCache = cached
		}
		catch {
			return null
		}
	}
	if (!Array.isArray(cached?.items) || !cached.items.length)
		return null
	if (Date.now() - cached.at > 24 * 60 * 60 * 1000)
		return null
	return cached
}

function writeCache(entry: StoredCache) {
	memoryCache = entry
	try {
		localStorage.setItem(cacheKey, JSON.stringify(entry))
	}
	catch {}
}

export function useMemosEch0() {
	const appConfig = useAppConfig()
	const config = appConfig.memos
	const ech0Config = config.ech0
	const apiBase = (ech0Config?.apiBase ?? '').replace(/\/+$/, '')
	const siteUrl = (ech0Config?.siteUrl || apiBase).replace(/\/+$/, '')
	const perPage = Math.min(Math.max(config.perPage || 20, 1), 100)
	const cacheTtl = config.cacheTtl ?? defaultCacheTtl
	const refreshInterval = config.refreshInterval ?? defaultRefreshInterval
	const requestTimeout = config.requestTimeout ?? defaultRequestTimeout

	/**
	 * 开发期造数据模式（`?memos-mock=1`）。
	 * 必须在 setup 同步阶段取一次 route：异步回调里再调 `useRoute()` 会丢 Nuxt 上下文。
	 * 该模式下不读写 localStorage，改一行 mock 数据也能立刻看到。
	 */
	const route = useRoute()
	const mockMode = computed(() => import.meta.dev && String(route.query['memos-mock'] ?? '') === '1')

	/**
	 * 造数据入口只走这里。
	 *
	 * 关键：`import.meta.dev` 必须在**分支外**用普通 `if` 判断（构建期常量折叠），
	 * 否则 Rollup 无法把动态 import 判定为不可达，mock 数据会被当作独立 chunk 打进生产产物
	 * （实测 `.output/public/_nuxt` 里曾出现 `mock-01-longform`）。
	 */
	async function loadMockPage(): Promise<Ech0Page<Ech0Echo> | null> {
		if (!import.meta.dev)
			return null
		if (!mockMode.value)
			return null
		const { mockEch0Page } = await import('~/data/memos-ech0-mock')
		return mockEch0Page
	}

	const messages = ref<MemosMessage[]>([])
	/** 已成功加载到第几页（0 表示还没有数据） */
	const loadedPage = ref(0)
	/** 服务端返回的总条数，用于判断「到底」 */
	const total = ref(0)
	const pending = ref(false)
	/** 静默校准期间不计入 pending，但仍需阻止并发请求 */
	const busy = ref(false)
	const snapshotting = ref(false)
	const loaded = ref(false)
	const failed = ref(false)
	const stale = ref(false)
	const lastFetchedAt = ref(0)

	/** ech0 没有频道概念，保留空数组以维持与 tg 版一致的对外形状 */
	const channels = ref<never[]>([])
	const activeChannel = ref('')
	const exhausted = ref(false)

	const mapCtx = computed(() => ({ apiBase, siteUrl }))

	/** 带超时的 JSON 请求，弱网下不再无限等待 */
	async function postQuery(page: number): Promise<Ech0Page<Ech0Echo>> {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), requestTimeout)
		try {
			const data = await $fetch<Ech0Envelope<Ech0Page<Ech0Echo>>>(`${apiBase}/api/echo/query`, {
				method: 'POST',
				body: { page, pageSize: perPage },
				signal: controller.signal,
			})
			if (data?.code !== 1)
				throw new Error(data?.msg || 'Ech0 返回了失败状态')
			return data.data ?? { total: 0, items: [] }
		}
		finally {
			clearTimeout(timer)
		}
	}

	/** 原始 Echo → 卡片数据（需要先装载 Markdown 渲染器） */
	async function toMessages(items: Ech0Echo[]) {
		let render: ((markdown: string) => string) | undefined
		try {
			render = await loadMemosMarkdownRenderer(apiBase)
		}
		catch (error) {
			// 渲染器加载失败时退化成纯文本卡片，内容不至于整段消失
			console.warn('[memos] Markdown 渲染器加载失败', error)
		}
		return mapEchosToMessages(items, { ...mapCtx.value, render })
	}

	function applyPage(items: MemosMessage[], page: number, pageTotal: number, append: boolean) {
		messages.value = append ? [...messages.value, ...items] : items
		loadedPage.value = page
		// 后端没给 total（老版本/异常响应）时把它当「至少已有这么多」，否则第一页就会被判成到底
		total.value = pageTotal > 0 ? pageTotal : messages.value.length
		exhausted.value = !items.length || messages.value.length >= total.value
	}

	async function requestMessages(append: boolean, options: { retries?: number, silent?: boolean } = {}): Promise<void> {
		const { retries = 1, silent = false } = options
		if (busy.value || (append && exhausted.value))
			return

		busy.value = true
		if (!silent)
			pending.value = true
		failed.value = false

		const page = append ? loadedPage.value + 1 : 1

		try {
			let raw: Ech0Page<Ech0Echo> | null = null
			// 只在首屏尝试 mock，翻页仍然走真实接口
			if (!append)
				raw = await loadMockPage()

			for (let attempt = 0; !raw; attempt++) {
				try {
					raw = await postQuery(page)
				}
				catch (error) {
					// 刚建立的连接容易抖动，首屏失败自动重试一次
					if (attempt >= retries)
						throw error
				}
			}

			const items = await toMessages(raw.items ?? [])
			applyPage(items, page, raw.total ?? 0, append)
			if (!append && !mockMode.value)
				writeCache({ at: Date.now(), items, page, total: total.value })
		}
		catch (error) {
			if (!silent) {
				failed.value = append || !messages.value.length
				if (!append && !messages.value.length)
					messages.value = []
			}
			console.warn('[memos] 获取 Ech0 说说失败', error)
		}
		finally {
			busy.value = false
			pending.value = false
			loaded.value = true
			stale.value = false
			lastFetchedAt.value = Date.now()
		}
	}

	/** 构建期抓好的同源快照，站点部署后 CDN 直出，首访无需等跨站握手 */
	async function requestSnapshot() {
		if (snapshotting.value)
			return false
		snapshotting.value = true
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), requestTimeout)
		try {
			const data = await $fetch<Ech0Page<Ech0Echo>>('/api/memos/latest', {
				signal: controller.signal,
				responseType: 'json',
			})
			if (!data?.items?.length || messages.value.length)
				return false
			const items = await toMessages(data.items)
			applyPage(items, 1, data.total ?? items.length, false)
			loaded.value = true
			stale.value = true
			return true
		}
		catch (error) {
			console.warn('[memos] Ech0 快照不可用', error)
			return false
		}
		finally {
			clearTimeout(timer)
			snapshotting.value = false
		}
	}

	/** 先用缓存立刻出卡片，再在后台校准；造数据模式下跳过缓存，保证改 mock 立刻生效 */
	function hydrateFromCache() {
		if (mockMode.value)
			return false
		const cached = readCache()
		if (!cached?.items.length)
			return false
		messages.value = cached.items
		loadedPage.value = cached.page
		total.value = cached.total
		exhausted.value = cached.items.length >= cached.total
		loaded.value = true
		stale.value = true
		lastFetchedAt.value = cached.at
		return Date.now() - cached.at < cacheTtl
	}

	/** 首次进入：新鲜缓存 → 直接用；过期缓存 → 先出内容再静默校准；否则快照与直连并行 */
	async function init() {
		if (loaded.value || busy.value)
			return

		if (hydrateFromCache())
			return

		if (messages.value.length)
			void requestMessages(false, { silent: true })
		else
			await Promise.all([requestSnapshot(), requestMessages(false)])
	}

	async function loadMore() {
		await requestMessages(true)
	}

	async function retry() {
		await requestMessages(false)
	}

	const hasMore = computed(() => !exhausted.value && messages.value.length < total.value)
	/** ech0 没有频道，永远不显示切换器 */
	const showChannelSwitch = computed(() => false)

	async function switchChannel() {
		// ech0 源没有频道切换，留空实现让门面接口保持同形
	}

	/** 切回前台时的静默刷新：只重取第一页并合并，已加载的更多内容不丢 */
	async function refresh() {
		if (!loaded.value || busy.value)
			return
		if (Date.now() - lastFetchedAt.value < refreshInterval)
			return

		busy.value = true
		try {
			const raw = await postQuery(1)
			const fresh = await toMessages(raw.items ?? [])
			if (!fresh.length)
				return

			const newestChanged = fresh[0]?.id !== messages.value[0]?.id
			if (!newestChanged) {
				lastFetchedAt.value = Date.now()
				return
			}

			const freshIds = new Set(fresh.map(item => item.id))
			const tail = messages.value.filter(item => !freshIds.has(item.id))
			messages.value = [...fresh, ...tail]
			loadedPage.value = 1
			total.value = raw.total ?? messages.value.length
			exhausted.value = messages.value.length >= total.value
			// 缓存只存**第一页**（与 tg 版一致）：把「加载更多」累积出来的整段列表写进去，
			// 下次首屏 hydrate 会一次性渲染几十条，且 exhausted 判断也会跟着错。
			if (!mockMode.value)
				writeCache({ at: Date.now(), items: fresh, page: 1, total: total.value })
			lastFetchedAt.value = Date.now()
			stale.value = false
		}
		catch (error) {
			console.warn('[memos] Ech0 静默刷新失败', error)
		}
		finally {
			busy.value = false
		}
	}

	return {
		activeChannel,
		channels,
		exhausted,
		failed,
		hasMore,
		init,
		loadMore,
		loaded,
		messages,
		pending,
		refresh,
		retry,
		showChannelSwitch,
		stale,
		switchChannel,
	}
}
