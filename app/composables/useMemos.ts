import type {
	MemosChannel,
	MemosMedia,
	MemosMediaKind,
	MemosMessage,
	MemosRawChannel,
	MemosRawList,
	MemosRawMedia,
	MemosRawMessage,
} from '~/types/memos'
import { joinURL } from 'ufo'

/** Telegram 媒体类型到前端渲染类型的映射 */
const mediaKindMap: Record<string, MemosMediaKind> = {
	animation: 'image',
	document: 'document',
	photo: 'image',
	sticker: 'image',
	video: 'video',
	voice: 'audio',
}

/** 与 astro-koharu 保持一致的 #话题 匹配规则 */
const hashtagPattern = /(?<![\w/&#])#([\p{L}\p{N}_]{2,32})/gu
const maxTagCount = 8

/** 首屏缓存的新鲜期默认值，可用 blog.config 的 memos.cacheTtl 覆盖 */
const defaultCacheTtl = 2 * 60 * 1000
/** 切回页面时静默刷新的最小间隔默认值，可用 memos.refreshInterval 覆盖 */
const defaultRefreshInterval = 2 * 60 * 1000
/** 单次请求超时默认值，可用 memos.requestTimeout 覆盖；避免弱网下骨架屏一直挂着 */
const defaultRequestTimeout = 15 * 1000

const cacheKey = (id: string) => `memos:first-page:v1:${id}`

interface StoredCache {
	at: number
	items: MemosRawMessage[]
	nextCursor: string | null
}

/** 进程内缓存，同一会话内进出页面时省掉一次 JSON 解析 */
const memoryCache = new Map<string, StoredCache>()

/** 从正文纯文本中提取 #话题 标签 */
export function parseMemosTags(plainText?: string) {
	const tags: string[] = []
	if (!plainText)
		return tags
	for (const match of plainText.matchAll(hashtagPattern)) {
		const tag = `#${match[1]}`
		if (!tags.includes(tag))
			tags.push(tag)
		if (tags.length >= maxTagCount)
			break
	}
	return tags
}

const htmlHashtagPattern = /<a\s[^>]*data-hashtag[^>]*>[\s\S]*?<\/a>\s*/gi
/** 被 <b>/<span> 包住的 #话题，连同包裹标签一起摘掉 */
const wrappedHashtagPattern = /<(b|strong|span|i|em)\b[^>]*>\s*#[\p{L}\p{N}_]{2,32}\s*<\/\1>\s*/giu
const bareHashtagPattern = /(?<![\w/&])#[\p{L}\p{N}_]{2,32}\s*/gu

/**
 * 去掉正文里的 #话题 标记（标签改由卡片底部统一展示，避免重复）。
 * 依次处理：锚点形式的标签 → 被行内标签包住的标签 → 裸文本标签，
 * 剥完只剩标点或空白就整体留空，卡片也就不会留一行空正文。
 */
export function stripMemosTags(html = '', plainText = '') {
	const strippedHtml = html
		.replace(htmlHashtagPattern, '')
		.replace(wrappedHashtagPattern, '')
		.replace(bareHashtagPattern, '')
		.trim()
	const strippedText = plainText.replace(bareHashtagPattern, '').trim()
	const isEmpty = (value: string) => /^[\s\p{P}]*$/u.test(value.replace(/<[^>]+>/g, ''))
	return {
		html: isEmpty(strippedHtml) ? '' : strippedHtml,
		plainText: isEmpty(strippedText) ? undefined : strippedText,
	}
}

/** API 的 fileSize 是字符串形式的字节数 */
function toFileSize(fileSize: string | null) {
	const size = Number(fileSize)
	return Number.isSafeInteger(size) && size > 0 ? size : undefined
}

export function formatMemosFileSize(bytes?: number) {
	if (!bytes)
		return ''
	if (bytes < 1024)
		return `${bytes} B`
	const units = ['KB', 'MB', 'GB']
	let value = bytes / 1024
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export function formatMemosDuration(seconds?: number) {
	if (!seconds)
		return ''
	const total = Math.round(seconds)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

function readCache(key: string): StoredCache | null {
	let cached = memoryCache.get(key)
	if (!cached) {
		try {
			const raw = localStorage.getItem(cacheKey(key))
			if (!raw)
				return null
			cached = JSON.parse(raw) as StoredCache
			memoryCache.set(key, cached)
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

function writeCache(key: string, items: MemosRawMessage[], nextCursor: string | null) {
	const entry: StoredCache = { at: Date.now(), items, nextCursor }
	memoryCache.set(key, entry)
	try {
		localStorage.setItem(cacheKey(key), JSON.stringify(entry))
	}
	catch {}
}

export function useMemos() {
	const appConfig = useAppConfig()
	const config = appConfig.memos
	/** 开发环境经 Vite 代理转发，绕开 koharu-suite 的 CORS 白名单 */
	const apiBase = import.meta.dev ? '/koharu-api' : config.apiBase
	const perPage = Math.min(Math.max(config.perPage || 20, 1), 100)
	const cacheTtl = config.cacheTtl ?? defaultCacheTtl
	const refreshInterval = config.refreshInterval ?? defaultRefreshInterval
	const requestTimeout = config.requestTimeout ?? defaultRequestTimeout

	const channels = ref<MemosChannel[]>([])
	/** 空字符串表示全部频道 */
	const activeChannel = ref('')
	const messages = ref<MemosMessage[]>([])
	const cursor = ref<string | null>(null)
	const exhausted = ref(false)
	/** 有请求正在进行（首次加载、加载更多、切换频道） */
	const pending = ref(false)
	/**
	 * 互斥锁，与 pending 分开：
	 * 静默校准期间不计入 pending，但仍需阻止并发请求
	 */
	const busy = ref(false)
	/** 快照请求独立互斥，避免打断直连 */
	const snapshotting = ref(false)
	/** 首次请求已结束，用于区分骨架屏与空态 */
	const loaded = ref(false)
	const failed = ref(false)
	/** 当前展示的是缓存内容，后台仍在刷新 */
	const stale = ref(false)
	/** 上次成功取到首屏的时间，用于节流「切回页面刷新」 */
	const lastFetchedAt = ref(0)

	const cacheId = computed(() => activeChannel.value || '*')

	/** 媒体是相对路径，统一拼成 API 站点的绝对地址；图片展示不受 CORS 限制 */
	function resolveMediaUrl(url?: string | null) {
		if (!url)
			return ''
		return url.startsWith('/') ? joinURL(config.apiBase, url) : url
	}

	function toMedia(raw: MemosRawMedia): MemosMedia {
		const originalUrl = resolveMediaUrl(raw.originalUrl)
		return {
			id: raw.id,
			kind: mediaKindMap[raw.kind] ?? 'unknown',
			status: raw.cacheStatus === 'ready' || raw.cacheStatus === 'pending' ? raw.cacheStatus : 'unavailable',
			originalUrl,
			thumbnailUrl: resolveMediaUrl(raw.thumbnailUrl) || originalUrl,
			duration: raw.duration ?? undefined,
			fileName: raw.fileName ?? undefined,
			fileSize: toFileSize(raw.fileSize),
			width: raw.width ?? undefined,
			height: raw.height ?? undefined,
		}
	}

	/**
	 * 相邻且 mediaGroupId 相同的消息属于同一相册，合并成一张卡片；
	 * 跨分页边界的相册保持独立，避免隐藏尚未加载的媒体。
	 */
	function toMessages(items: MemosRawMessage[]) {
		const groups: MemosRawMessage[][] = []
		for (const item of items) {
			const last = groups.at(-1)
			const lastItem = last?.at(-1)
			if (last && lastItem?.mediaGroupId && lastItem.mediaGroupId === item.mediaGroupId)
				last.push(item)
			else
				groups.push([item])
		}
		return groups.map((group) => {
			// 相册正文可能挂在任一成员上，优先取有正文的那条
			const primary = group.find(item => item.content?.text?.trim()) ?? group[0]
			const rawText = primary.content?.text?.trim() ?? ''
			const rawHtml = primary.content?.html ?? ''
			const { html, plainText } = stripMemosTags(rawHtml, rawText)
			return {
				id: primary.id,
				channel: primary.channel,
				authorSignature: primary.authorSignature ?? undefined,
				publishedAt: primary.publishedAt,
				revision: Math.max(...group.map(item => item.revision || 1)),
				html,
				plainText,
				sourceUrl: primary.sourceUrl ?? undefined,
				media: group.flatMap(item => (item.media ?? []).map(toMedia)),
				tags: parseMemosTags(rawText),
			} satisfies MemosMessage
		})
	}

	/** 带超时的 fetch，弱网下不再无限等待 */
	async function fetchJson<T>(path: string, query?: Record<string, string | number | string[]>) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), requestTimeout)
		try {
			return await $fetch<T>(joinURL(apiBase, path), { query, signal: controller.signal })
		}
		finally {
			clearTimeout(timer)
		}
	}

	/** 频道列表只在需要切换时才有意义，放在首屏渲染之后拉取 */
	async function requestChannels() {
		try {
			const data = await fetchJson<MemosRawList<MemosRawChannel>>('api/v1/channels')
			const items = data.items ?? []
			channels.value = (config.channelIds.length
				? items.filter(item => config.channelIds.includes(item.id))
				: items)
				.map(item => ({ id: item.id, title: item.title, username: item.username }))
		}
		catch (error) {
			console.warn('[memos] 获取频道列表失败', error)
		}
	}

	function applyPage(data: MemosRawList<MemosRawMessage>, append: boolean) {
		const items = data.items ?? []
		const page = toMessages(items)
		messages.value = append ? [...messages.value, ...page] : page
		cursor.value = data.nextCursor ?? null
		exhausted.value = !data.nextCursor
	}

	async function requestMessages(append: boolean, options: { retries?: number, silent?: boolean } = {}): Promise<void> {
		const { retries = 1, silent = false } = options
		if (busy.value || (append && (!cursor.value || exhausted.value)))
			return

		busy.value = true
		// 静默校准不改变可见加载态，避免内容已经在页面上又闪出「加载中」
		if (!silent)
			pending.value = true
		failed.value = false

		// @keep-sorted
		const query: Record<string, string | number | string[]> = {
			limit: perPage,
		}
		if (activeChannel.value)
			query.channel = activeChannel.value
		else if (config.channelIds.length)
			// 全局最新支持重复传入多个 channel，用于只在这些频道内分页
			query.channel = [...config.channelIds]
		if (append && cursor.value)
			query.cursor = cursor.value

		const path = activeChannel.value ? 'api/v1/messages' : 'api/v1/messages/latest'

		try {
			for (let attempt = 0; ; attempt++) {
				try {
					const data = await fetchJson<MemosRawList<MemosRawMessage>>(path, query)
					applyPage(data, append)
					if (!append)
						writeCache(cacheId.value, data.items ?? [], data.nextCursor ?? null)
					return
				}
				catch (error) {
					// 刚建立的连接容易抖动，首屏失败自动重试一次
					if (attempt >= retries)
						throw error
				}
			}
		}
		catch (error) {
			// 静默校准失败时保留已渲染的内容，不打扰阅读
			if (!silent) {
				// 首屏已有快照内容时不算失败，只是没能刷新
				failed.value = append || !messages.value.length
				if (!append && !messages.value.length)
					messages.value = []
			}
			console.warn('[memos] 获取说说失败', error)
		}
		finally {
			busy.value = false
			pending.value = false
			loaded.value = true
			stale.value = false
			// 失败也记时间，避免切回页面时立刻又打一次必定失败的请求
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
			// 静态托管常把无扩展名文件当 octet-stream，显式指定 json 免得拿到字符串
			const data = await $fetch<MemosRawList<MemosRawMessage>>('/api/memos/latest', {
				signal: controller.signal,
				responseType: 'json',
			})
			// 直连结果已经先到就不再回退到快照
			if (!data?.items?.length || messages.value.length)
				return false
			applyPage(data, false)
			loaded.value = true
			stale.value = true
			return true
		}
		catch (error) {
			console.warn('[memos] 快照不可用', error)
			return false
		}
		finally {
			clearTimeout(timer)
			snapshotting.value = false
		}
	}

	/** 先用缓存立刻出卡片，再在后台校准 */
	function hydrateFromCache() {
		const cached = readCache(cacheId.value)
		if (!cached?.items.length)
			return false
		messages.value = toMessages(cached.items)
		loaded.value = true
		stale.value = true
		// 以缓存写入时间作为基准，切回页面时按 refreshInterval 决定是否补刷
		lastFetchedAt.value = cached.at
		return Date.now() - cached.at < cacheTtl
	}

	/**
	 * 首次进入的取数顺序：
	 * 新鲜缓存 → 直接渲染结束；过期缓存 → 先出内容再静默校准；
	 * 否则快照与直连并行，谁先到用谁，另一个负责后续校准
	 */
	async function init() {
		if (loaded.value || busy.value)
			return

		if (hydrateFromCache()) {
			void requestChannels()
			return
		}

		if (messages.value.length)
			void requestMessages(false, { silent: true })
		else
			await Promise.all([requestSnapshot(), requestMessages(false)])

		void requestChannels()
	}

	async function switchChannel(id: string) {
		if (id === activeChannel.value || busy.value)
			return
		activeChannel.value = id
		cursor.value = null
		exhausted.value = false
		messages.value = []
		loaded.value = false
		stale.value = false
		hydrateFromCache()
		await requestMessages(false)
	}

	async function loadMore() {
		await requestMessages(true)
	}

	async function retry() {
		await requestMessages(false)
	}

	const hasMore = computed(() => !!cursor.value && !exhausted.value)
	/** 只有一个频道时没有切换的必要 */
	const showChannelSwitch = computed(() => channels.value.length > 1)

	/**
	 * 页面切回前台时的静默刷新：
	 * 只重取第一页并合并到已加载列表里，不重置 cursor，用户已加载的更多内容不会丢。
	 * 距上次取数不足 refreshInterval 时直接跳过，避免频繁切标签页打空请求。
	 */
	async function refresh() {
		if (!loaded.value || busy.value)
			return
		if (Date.now() - lastFetchedAt.value < refreshInterval)
			return

		busy.value = true
		try {
			// @keep-sorted
			const query: Record<string, string | number | string[]> = { limit: perPage }
			if (activeChannel.value)
				query.channel = activeChannel.value
			else if (config.channelIds.length)
				query.channel = [...config.channelIds]

			const path = activeChannel.value ? 'api/v1/messages' : 'api/v1/messages/latest'
			const data = await fetchJson<MemosRawList<MemosRawMessage>>(path, query)
			const fresh = toMessages(data.items ?? [])
			if (!fresh.length)
				return

			// 首条没变说明没有新内容，保留原有的 cursor / exhausted 不动
			const newestChanged = fresh[0]?.id !== messages.value[0]?.id
			if (!newestChanged) {
				lastFetchedAt.value = Date.now()
				return
			}

			// 用新首屏替换旧首屏，尾部保留此前「加载更多」得到的条目（按 id 去重）
			const freshIds = new Set(fresh.map(item => item.id))
			const tail = messages.value.filter(item => !freshIds.has(item.id))
			messages.value = [...fresh, ...tail]
			writeCache(cacheId.value, data.items ?? [], data.nextCursor ?? null)
			// 首页被插入新条目后旧游标已经错位，重置为这一页的游标，
			// 已加载的 tail 仍留在列表里，继续下拉会从新游标往后取
			cursor.value = data.nextCursor ?? null
			exhausted.value = !data.nextCursor
			lastFetchedAt.value = Date.now()
			stale.value = false
		}
		catch (error) {
			// 刷新失败不打扰阅读，保留旧内容
			console.warn('[memos] 静默刷新失败', error)
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
