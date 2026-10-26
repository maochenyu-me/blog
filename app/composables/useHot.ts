import type { HotItem, HotPlatform, HotResponse, HotTypeOption } from '~/types/hot'
import { hotAllRoutes, hotFallbackIcon, hotPlatformMeta } from '~/data/hot'

/** 首屏缓存的新鲜期默认值，可用 blog.config 的 hot.cacheTtl 覆盖 */
const defaultCacheTtl = 5 * 60 * 1000
/** 单次请求超时默认值，可用 hot.requestTimeout 覆盖 */
const defaultRequestTimeout = 15 * 1000
/** 缓存最长保留时长（超出直接丢弃，免得展示几天前的热榜） */
const maxCacheAge = 24 * 60 * 60 * 1000
/** 子分类的查询参数名兜底值（实测各平台都是 `type`） */
const defaultParamKey = 'type'

interface StoredCache {
	at: number
	payload: HotResponse
}

/** 进程内缓存，同一会话内来回切平台时省掉一次 JSON 解析 */
const memoryCache = new Map<string, StoredCache>()

/** 平台路由 + 子分类共同决定一份缓存，子分类空串表示「平台默认榜」 */
const storageKey = (route: string, type: string) => `hot:v1:${route}:${type || '_'}`

function readCache(key: string): StoredCache | null {
	let cached = memoryCache.get(key)
	if (!cached) {
		try {
			const raw = sessionStorage.getItem(key)
			if (!raw)
				return null
			cached = JSON.parse(raw) as StoredCache
			memoryCache.set(key, cached)
		}
		catch {
			return null
		}
	}
	// 空榜（接口返回 0 条）不写缓存，这里再兜一层，避免把坏数据当成可用缓存
	if (!cached?.payload?.data?.length)
		return null
	if (Date.now() - cached.at > maxCacheAge)
		return null
	return cached
}

function writeCache(key: string, payload: HotResponse) {
	const entry: StoredCache = { at: Date.now(), payload }
	memoryCache.set(key, entry)
	try {
		sessionStorage.setItem(key, JSON.stringify(entry))
	}
	catch {}
}

function dropCache(key: string) {
	memoryCache.delete(key)
	try {
		sessionStorage.removeItem(key)
	}
	catch {}
}

/** 路由名 → 页面用的平台项，缺元数据时回退为路由名 + 通用图标 */
function toPlatform(route: string): HotPlatform {
	const meta = hotPlatformMeta[route]
	return {
		route,
		name: meta?.name ?? route,
		icon: meta?.icon ?? hotFallbackIcon,
	}
}

/**
 * 热搜数据取用。
 *
 * 约定：只在浏览器端取数（页面 `onMounted` 调 `init`），站点是 SSG，
 * 构建期不固化热榜内容，否则数据会在部署那一刻冻住。
 * 接口已开放 `access-control-allow-origin: *`，无需 nitro 代理。
 */
export function useHot() {
	const appConfig = useAppConfig()
	const config = appConfig.hot
	const apiBase = config.apiBase.replace(/\/+$/, '')
	const perPage = Math.max(config.perPage || 20, 1)
	const cacheTtl = config.cacheTtl ?? defaultCacheTtl
	const requestTimeout = config.requestTimeout ?? defaultRequestTimeout

	/** 配置里给了就用配置，留空表示全量展示接口 `/all` 的全部平台 */
	const platforms = (config.platforms?.length ? [...config.platforms] : [...hotAllRoutes]).map(toPlatform)

	const activeRoute = ref(platforms[0]?.route ?? '')
	/** 空串表示平台默认榜 */
	const activeType = ref('')

	const payload = ref<HotResponse | null>(null)
	const pending = ref(false)
	const failed = ref(false)
	/** 首次请求已结束，用于区分骨架屏与空态 */
	const loaded = ref(false)
	/** 当前展示的是过期缓存，后台可能仍在校准 */
	const stale = ref(false)
	const lastFetchedAt = ref(0)

	/** 请求代次，切平台 / 切子分类后旧请求的返回直接丢弃 */
	let requestId = 0
	let started = false

	const items = computed<HotItem[]>(() => Array.isArray(payload.value?.data) ? payload.value.data : [])
	const activePlatform = computed(() => platforms.find(item => item.route === activeRoute.value) ?? platforms[0])

	/** 子分类参数名，取自接口返回的 params 键（实测都是 `type`） */
	const paramKey = computed(() => Object.keys(payload.value?.params ?? {})[0] ?? defaultParamKey)

	const typeOptions = computed<HotTypeOption[]>(() => {
		const entry = Object.values(payload.value?.params ?? {})[0]
		if (!entry?.type)
			return []
		return Object.entries(entry.type).map(([value, label]) => ({ value, label }))
	})

	const typeLabel = computed(() => Object.values(payload.value?.params ?? {})[0]?.name ?? '')

	/** 榜单自身的名称与描述，用于信息条与 SEO 无关的展示 */
	const boardTitle = computed(() => payload.value?.type ?? '')
	const boardDescription = computed(() => payload.value?.description ?? '')
	const sourceLink = computed(() => payload.value?.link ?? '')
	const updateTime = computed(() => payload.value?.updateTime ?? '')

	async function request(route: string, type: string): Promise<HotResponse> {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), requestTimeout)
		try {
			const query: Record<string, string> = {}
			if (type)
				query[paramKey.value] = type
			const data = await $fetch<HotResponse>(`${apiBase}/${route}`, {
				query: Object.keys(query).length ? query : undefined,
				signal: controller.signal,
			})
			if (!Array.isArray(data?.data) || !data.data.length)
				throw new Error('接口返回空数据')
			return data
		}
		finally {
			clearTimeout(timer)
		}
	}

	/** 刚建立的连接容易抖动，失败自动重试一次 */
	async function requestWithRetry(route: string, type: string) {
		try {
			return await request(route, type)
		}
		catch {
			return await request(route, type)
		}
	}

	async function fetchInto(route: string, type: string, id: number, silent: boolean) {
		try {
			const data = await requestWithRetry(route, type)
			if (id !== requestId)
				return
			payload.value = data
			failed.value = false
			stale.value = false
			lastFetchedAt.value = Date.now()
			writeCache(storageKey(route, type), data)
		}
		catch (error) {
			if (id !== requestId)
				return
			console.warn('[hot] 获取热榜失败', route, error)
			// 静默校准失败保留已渲染的内容，不打扰阅读
			if (!silent) {
				payload.value = null
				failed.value = true
			}
		}
		finally {
			if (id === requestId) {
				pending.value = false
				loaded.value = true
			}
		}
	}

	/** 取数顺序：新鲜缓存直接出；过期缓存先出内容再后台校准；都没有才走骨架屏 */
	async function load() {
		const route = activeRoute.value
		if (!route)
			return

		const id = ++requestId
		const key = storageKey(route, activeType.value)
		const cached = readCache(key)

		if (cached) {
			payload.value = cached.payload
			failed.value = false
			loaded.value = true
			lastFetchedAt.value = cached.at
			stale.value = Date.now() - cached.at >= cacheTtl
			if (stale.value)
				void fetchInto(route, activeType.value, id, true)
			return
		}

		payload.value = null
		failed.value = false
		loaded.value = false
		stale.value = false
		pending.value = true
		await fetchInto(route, activeType.value, id, false)
	}

	async function init() {
		if (started)
			return
		started = true
		await load()
	}

	async function selectPlatform(route: string) {
		if (route === activeRoute.value)
			return
		activeRoute.value = route
		activeType.value = ''
		await load()
	}

	async function selectType(type: string) {
		if (type === activeType.value)
			return
		activeType.value = type
		await load()
	}

	/** 手动重试：先丢掉这份缓存，避免又把坏结果读回来 */
	async function retry() {
		dropCache(storageKey(activeRoute.value, activeType.value))
		await load()
	}

	/** 手动刷新：不动已渲染内容，静默替换 */
	async function refresh() {
		const route = activeRoute.value
		if (!route || pending.value)
			return
		pending.value = true
		await fetchInto(route, activeType.value, ++requestId, true)
	}

	/** 切回标签页时按 cacheTtl 节流补刷，避免频繁切页打空请求 */
	async function refreshIfStale() {
		if (!loaded.value || pending.value)
			return
		if (Date.now() - lastFetchedAt.value < cacheTtl)
			return
		await refresh()
	}

	return {
		activePlatform,
		activeRoute,
		activeType,
		boardDescription,
		boardTitle,
		failed,
		init,
		items,
		loaded,
		paramKey,
		pending,
		perPage,
		platforms,
		refresh,
		refreshIfStale,
		retry,
		selectPlatform,
		selectType,
		sourceLink,
		stale,
		typeLabel,
		typeOptions,
		updateTime,
	}
}
