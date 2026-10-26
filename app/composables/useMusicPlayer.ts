import type { LrcLine, MetingConfig, MetingPlaylistConfig, MusicPlaylist, MusicSong, NeteaseUrlConfig, PlayerStatus, PlayMode } from '~/types/music'
import { musicPlaylists } from '~/data/music'
import { metingApiUrl, metingParseSongs, metingServerLabel, metingTypeLabel } from '~/utils/meting'
import { neteaseAudioUrl, neteaseDirectSongApi, neteaseLyricUrl, neteaseParseDirectUrl, neteaseParseLyric, neteaseParseTracks } from '~/utils/netease'

/**
 * 全局音乐播放引擎（模块级单例）
 *
 * 设计要点（相对参考实现的改动）：
 *   - audio 元素只在客户端首次使用时创建，且只在用户手势里 play()，
 *     不需要额外的 `_userInteracted` 标记；iOS Safari 也能正常出声
 *   - 切歌只有一条路径 `loadAt()`，不再出现「先 setPlaylist 加载一次 + 再 playAt 加载一次」的重复请求
 *   - 状态全是模块级 ref，任何组件里调用 useMusicPlayer() 拿到的都是同一份，不会各说各话
 *   - 进度记忆只用于「上次听到哪」的展示与续播起点，恢复后不自动播放
 *   - 支持 MediaSession（锁屏 / 系统媒体键）与跨标签页互斥（同一时刻只允许一个标签页出声）
 */

const STORAGE_KEY = 'kemeow-music-v1'
const STORAGE_VERSION = 1
const CHANNEL_NAME = 'kemeow-music'

interface Persisted {
	v: number
	playlistId: string | null
	songId: string | null
	time: number
	mode: PlayMode
	volume: number
}

// ===================== 模块级状态 =====================

const tabId = Math.random().toString(36).slice(2)

const status = ref<PlayerStatus>('idle')
const playlists = shallowRef<MusicPlaylist[]>([])
const playlistId = ref<string | null>(null)
const queue = shallowRef<MusicSong[]>([])
const index = ref(-1)
const time = ref(0)
const duration = ref(0)
const buffered = ref(0)
const volume = ref(0.6)
const muted = ref(false)
const mode = ref<PlayMode>('list')
const lyric = shallowRef<LrcLine[]>([])
const lyricIndex = ref(-1)
const error = ref('')
const initialized = ref(false)
/** 本地配置的歌单（远程同步后需要它作为合并基准） */
const localPlaylists = shallowRef<MusicPlaylist[]>([])
/** 是否配置了远程歌单，init() 时从配置读一次 */
let metingEnabled = false
/** Netease_url 配置，init() 时缓存（异步回调里不能再调 useAppConfig） */
let neteaseConfig: NeteaseUrlConfig | null = null
/** 「音乐」面板（弹窗）的开关：导航按钮与迷你条都指向它 */
const panelOpen = ref(false)
const remoteLoading = ref(false)
const remoteError = ref('')

const song = computed(() => queue.value[index.value] ?? null)
const playlist = computed(() => playlists.value.find(item => item.id === playlistId.value) ?? null)
/** 当前是否有歌可放（决定胶囊是「能播」还是「加载中/失败」） */
const hasTracks = computed(() => queue.value.length > 0 || playlists.value.some(item => item.songs.length > 0))
/** 是否配置过任何数据源：本地歌单非空，或 meting 里填了歌单 */
const sourceConfigured = computed(() => localPlaylists.value.length > 0 || metingEnabled || !!neteaseConfig)
const isPlaying = computed(() => status.value === 'playing')
const progress = computed(() => duration.value > 0 ? Math.min(100, (time.value / duration.value) * 100) : 0)
const bufferedPercent = computed(() => duration.value > 0 ? Math.min(100, (buffered.value / duration.value) * 100) : 0)
const currentLyric = computed(() => lyric.value[lyricIndex.value]?.text ?? '')
const modeIcon = computed(() => ({
	list: 'tabler:repeat',
	one: 'tabler:repeat-once',
	shuffle: 'tabler:arrows-shuffle',
})[mode.value])
const modeLabel = computed(() => ({
	list: '列表循环',
	one: '单曲循环',
	shuffle: '随机播放',
})[mode.value])

let audio: HTMLAudioElement | null = null
let channel: BroadcastChannel | null = null
/** 每次 loadAt 自增，异步回调只在 token 未过期时落地 */
let loadToken = 0
/** loadedmetadata 时要跳转到的位置（进度恢复） */
let resumeAt = 0
let lastPersistAt = 0
let shuffleOrder: number[] = []
let shufflePos = 0
let volumeBeforeMute = 0.6
/** 当前这首是否已经从 /stream 退回 /download，防止错误事件反复触发时死循环 */
let streamFallbackUsed = false
/** 待恢复的上次播放状态：队列建好后由 ensureQueue() 消费 */
let pendingRestore: Persisted | null = null
/** 是否过滤歌词开头的制作信息行，init() 时从配置读一次 */
let hideLrcMeta = true

// ===================== 工具 =====================

function clamp(value: number, min = 0, max = 1) {
	return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

/** 站内路径补成绝对地址（MediaSession 的封面要求绝对 URL） */
function absoluteUrl(path: string) {
	if (/^https?:\/\//i.test(path) || typeof window === 'undefined')
		return path
	return new URL(path, window.location.origin).toString()
}

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0)
		return '0:00'
	const m = Math.floor(seconds / 60)
	const s = Math.floor(seconds % 60)
	return `${m}:${s.toString().padStart(2, '0')}`
}

/** 解析 LRC：支持一行多个时间标签、[offset:±ms] 校正 */
export function parseLrc(text: string): LrcLine[] {
	const offsetMatch = text.match(/^\[offset:\s*([+-]?\d+)\s*\]/m)
	const offset = offsetMatch ? Number(offsetMatch[1]) / 1000 : 0
	const stamp = /\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g
	const lines: LrcLine[] = []

	for (const row of text.split(/\r?\n/)) {
		const matches = [...row.matchAll(stamp)]
		if (matches.length === 0)
			continue
		const content = row.replace(stamp, '').trim()
		if (!content)
			continue
		for (const match of matches) {
			const minutes = Number(match[1])
			const seconds = Number(match[2])
			const fraction = match[3] ? Number(match[3].padEnd(3, '0')) / 1000 : 0
			lines.push({ time: Math.max(0, minutes * 60 + seconds + fraction + offset), text: content })
		}
	}

	return lines.sort((a, b) => a.time - b.time)
}

/**
 * 网易云歌词里的制作信息角色词（`作词 : xxx`、`吉他 : xxx` 这类署名）。
 * 这些行散落在整首歌词里（不只在开头），所以不能用「只看前几行」的规则。
 */
/** 网易云歌词里的制作信息角色词；踩到新的就往这行后面加 */
const lrcMetaRoles = new Set('作词,词,作曲,曲,编曲,制作,制作人,制作助理,监制,监制人,出品,出品人,发行,发行公司,混音,混音师,混音助理,混音工程,混音棚,母带,母带工程师,母带工程,母带处理,母带棚,录音,录音师,录音室,录音棚,录音助理,人声录音,吉他录音,贝斯录音,鼓录音,和声,合声,和声编写,和声演唱,和音,伴唱,配唱,配唱制作人,人声,人声编辑,音频编辑,声乐,声乐指导,器乐,演奏,调校,调教,vocal,rap,吉他,电吉他,木吉他,贝斯,鼓,架子鼓,键盘,合成器,弦乐,弦乐编写,钢琴,小提琴,大提琴,笛子,二胡,古筝,琵琶,箫,埙,唢呐,尺八,演唱,唱,女声,男声,合唱,童声,原唱,翻唱,念白,旁白,策划,总策划,统筹,总统筹,企划,专辑企划,设计,视觉设计,平面设计,美术,封面,插画,题字,文案,宣发,宣传,摄影,后期,剪辑,字幕,翻译,校对,法务,版权,助理'.split(','))

/**
 * 判断一行是不是制作信息 / 角色标注。
 * 两条规则任一命中即丢：
 *   1. 冒号前每个角色词都在白名单里（`编曲/录音：xxx`、`吉他：xxx`）；
 *   2. 兜底：开头 45 秒内、形如「≤10 字的短标签：≤20 字的短内容」且全行无句读
 *      （覆盖 `缩混/录音：Lennox 子昂`、`(戏腔) 老生：朱旭BooBoo` 这类白名单漏掉的署名）。
 * 带句读符号（，。！？）的行一律当歌词保留。
 */
function isLrcMetaLine(line: LrcLine) {
	const text = line.text.trim()
	if (!text)
		return false

	const match = text.match(/^([^:：]{1,24})[:：]\s*(\S.*)$/)
	if (!match)
		return false

	const head = match[1].trim()

	// 规则 1：冒号前全是制作角色 → 一定是制作信息，**不受标点影响**。
	// 实测必需：`作词 : 王朝1982/《琵琶记》元代.高明` 冒号后带书名号和英文句点，
	// 之前用标点提前 return 会把这类真署名放过去。
	const roles = head.split(/\s*[/、&,，]\s*/).filter(Boolean)
	if (roles.length > 0 && roles.every(role => lrcMetaRoles.has(role.trim().toLowerCase())))
		return true

	// 规则 2（兜底）：只认「短标签 + 短内容」，这条才需要标点与时间把关，避免误伤正常歌词
	if (/[，。！？,.!?]/.test(text))
		return false
	// 冒号前出现人称代词说明这是句台词（`她说：我们一起走吧`），不是署名
	if (/[你我他她它咱俺您]/.test(head))
		return false
	return line.time <= 25 && head.length <= 10 && match[2].trim().length <= 20 && text.length <= 32
}

/**
 * 过滤网易云歌词中的制作信息行（`作词 : xxx`、`编曲 : xxx`、`吉他 : xxx`）。
 * 用角色词白名单判断，只丢「冒号前全是制作角色」的行，正常歌词里带冒号的句子不受影响。
 */
export function filterLrcMeta(lines: LrcLine[]): LrcLine[] {
	if (lines.length === 0)
		return lines
	return lines.filter(line => !isLrcMetaLine(line))
}

// ===================== 持久化 =====================

function readPersisted(): Persisted | null {
	if (typeof window === 'undefined')
		return null
	try {
		const raw = window.localStorage.getItem(STORAGE_KEY)
		if (!raw)
			return null
		const parsed = JSON.parse(raw) as Persisted
		return parsed.v === STORAGE_VERSION ? parsed : null
	}
	catch {
		return null
	}
}

function persist(force = false) {
	if (typeof window === 'undefined')
		return
	const now = Date.now()
	if (!force && now - lastPersistAt < 3000)
		return
	lastPersistAt = now
	try {
		const state: Persisted = {
			v: STORAGE_VERSION,
			playlistId: playlistId.value,
			songId: song.value?.id ?? null,
			time: time.value,
			mode: mode.value,
			volume: volume.value,
		}
		window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
	}
	catch {
		// 隐私模式 / 配额不足：静默放弃
	}
}

// ===================== MediaSession =====================

function updateMediaMetadata() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator))
		return
	const track = song.value
	if (!track) {
		navigator.mediaSession.metadata = null
		return
	}
	navigator.mediaSession.metadata = new MediaMetadata({
		title: track.title,
		artist: track.artist,
		album: track.album ?? '',
		artwork: track.cover ? [{ src: absoluteUrl(track.cover), sizes: '300x300' }] : [],
	})
}

function syncPositionState() {
	if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || duration.value <= 0)
		return
	try {
		navigator.mediaSession.setPositionState({
			duration: duration.value,
			position: Math.min(time.value, duration.value),
			playbackRate: 1,
		})
	}
	catch {
		// duration 未就绪时浏览器会抛错，忽略即可
	}
}

// ===================== 随机播放顺序 =====================

function buildShuffleOrder(start: number) {
	const total = queue.value.length
	shuffleOrder = Array.from({ length: total }, (_, i) => i)
	for (let i = total - 1; i > 0; i--) {
		const j = Math.floor(Math.random() * (i + 1))
		const temp = shuffleOrder[i]
		shuffleOrder[i] = shuffleOrder[j]
		shuffleOrder[j] = temp
	}
	shufflePos = Math.max(0, shuffleOrder.indexOf(start))
}

function stepShuffle(forward: boolean) {
	if (shuffleOrder.length !== queue.value.length)
		buildShuffleOrder(index.value)
	const total = shuffleOrder.length
	if (total === 0)
		return 0
	shufflePos = (shufflePos + (forward ? 1 : -1) + total) % total
	return shuffleOrder[shufflePos]
}

// ===================== 音频加载与播放 =====================

function syncLyricIndex() {
	const lines = lyric.value
	if (lines.length === 0)
		return
	let i = lyricIndex.value
	if (i < 0 || i >= lines.length || time.value < lines[i].time) {
		i = -1
		for (let n = 0; n < lines.length; n++) {
			if (time.value >= lines[n].time)
				i = n
			else
				break
		}
	}
	else {
		while (i + 1 < lines.length && time.value >= lines[i + 1].time)
			i++
	}
	if (i !== lyricIndex.value)
		lyricIndex.value = i
}

function ensureAudio(): HTMLAudioElement {
	if (audio)
		return audio

	const el = new Audio()
	el.preload = 'metadata'
	el.volume = volume.value

	el.addEventListener('loadedmetadata', () => {
		duration.value = Number.isFinite(el.duration) ? el.duration : 0
		if (resumeAt > 0 && duration.value > resumeAt) {
			el.currentTime = resumeAt
			time.value = resumeAt
		}
		resumeAt = 0
		syncPositionState()
	})

	el.addEventListener('timeupdate', () => {
		time.value = el.currentTime
		if (el.buffered.length > 0)
			buffered.value = el.buffered.end(el.buffered.length - 1)
		syncLyricIndex()
		syncPositionState()
		if (status.value === 'playing')
			persist()
	})

	el.addEventListener('progress', () => {
		if (el.buffered.length > 0)
			buffered.value = el.buffered.end(el.buffered.length - 1)
	})

	el.addEventListener('play', () => {
		status.value = 'playing'
		error.value = ''
		channel?.postMessage({ type: 'play', tabId })
	})

	el.addEventListener('playing', () => {
		status.value = 'playing'
	})

	el.addEventListener('pause', () => {
		if (el.ended)
			return
		status.value = 'paused'
		persist(true)
	})

	el.addEventListener('ended', () => {
		if (queue.value.length === 0)
			return
		if (mode.value === 'one') {
			el.currentTime = 0
			void startPlayback()
			return
		}
		nextTrack(true)
	})

	el.addEventListener('error', () => {
		// /stream 补丁没打（或该曲解析失败）时，退回实例自带的 /download：
		// 慢（首字节可能十几秒）但一定能播。每首只退一次，避免死循环。
		const track = queue.value[index.value]
		const config = neteaseConfig
		if (track?.provider === 'netease-url' && track.platformId && config?.api
			&& /\/stream\?/.test(track.src) && !streamFallbackUsed) {
			streamFallbackUsed = true
			track.src = neteaseAudioUrl(config.api, track.platformId, config.level ?? 'exhigh', 'proxy')
			el.src = track.src
			el.load()
			void startPlayback()
			return
		}
		status.value = 'paused'
		error.value = '音频加载失败：检查文件是否存在、编码是否受支持'
	})

	audio = el
	return el
}

/**
 * 取出真正的 LRC 文本。
 * 有的歌词接口（如 Netease_url 的 `/song?type=lyric`）返回的是 JSON 包装，
 * 而不是纯文本，直接 parseLrc 会得到一行垃圾，这里统一剥一层。
 */
function extractLyricText(text: string): string {
	const trimmed = text.trim()
	if (!trimmed.startsWith('{'))
		return text
	try {
		const json = JSON.parse(trimmed) as Record<string, any>
		const candidates = [
			json?.data?.lrc?.lyric,
			json?.data?.lyric,
			json?.lrc?.lyric,
			json?.lyric,
		]
		for (const value of candidates) {
			if (typeof value === 'string' && value.trim())
				return value
		}
	}
	catch {
		// 不是 JSON，当纯文本处理
	}
	return ''
}

async function loadLyric(track: MusicSong, token: number) {
	const source = track.lrc
	if (!source)
		return
	const apply = (raw: string) => {
		if (token !== loadToken)
			return
		const lines = parseLrc(extractLyricText(raw))
		lyric.value = hideLrcMeta ? filterLrcMeta(lines) : lines
	}
	if (source.trimStart().startsWith('[')) {
		apply(source)
		return
	}
	try {
		const response = await fetch(source)
		if (!response.ok)
			return
		apply(await response.text())
	}
	catch {
		// 歌词缺失不影响播放
	}
}

async function startPlayback() {
	const el = ensureAudio()
	const token = loadToken
	try {
		await el.play()
	}
	catch {
		if (token !== loadToken)
			return
		status.value = 'paused'
		error.value = '浏览器拦截了播放，点一下播放键试试'
	}
}

/**
 * 切到队列里的第 target 首
 * @param target 目标曲目在队列中的下标
 * @param autoplay 是否立即播放（false 只预载 metadata，供进度恢复用）
 * @param resumeTime 载入后跳转到的位置（秒）
 */
async function loadAt(target: number, autoplay: boolean, resumeTime = 0) {
	const track = queue.value[target]
	if (!track)
		return

	const el = ensureAudio()
	const token = ++loadToken
	index.value = target
	streamFallbackUsed = false
	error.value = ''
	lyric.value = []
	lyricIndex.value = -1
	time.value = 0
	duration.value = track.duration ?? 0
	buffered.value = 0
	resumeAt = resumeTime
	status.value = autoplay ? 'loading' : 'idle'

	let src = track.src
	// 远程解析型音源且没预填地址（audio: 'direct'）：播放前现取，直链有时效所以不缓存
	if (!src && track.provider) {
		src = await resolveRemoteSong(track)
		if (token !== loadToken)
			return
		if (!src) {
			status.value = 'paused'
			error.value = '这首解析失败，换一首试试'
			return
		}
	}

	el.src = src
	el.load()

	void loadLyric(track, token)
	updateMediaMetadata()
	persist(true)

	if (autoplay)
		void startPlayback()
}

function play() {
	if (queue.value.length === 0)
		return
	const el = ensureAudio()
	const current = song.value
	if (!current) {
		void loadAt(0, true)
		return
	}
	// 只预载过 metadata（或根本没载入）时，重新走完整加载
	if (!el.src || el.src !== absoluteUrl(current.src)) {
		void loadAt(index.value, true)
		return
	}
	// 上一首已经播完停在末尾：从头再来，而不是立刻又触发 ended
	if (el.ended && el.currentTime >= (duration.value || 0))
		el.currentTime = 0
	void startPlayback()
}

function pause() {
	const el = ensureAudio()
	if (!el.paused)
		el.pause()
	status.value = 'paused'
	persist(true)
}

function toggle() {
	if (isPlaying.value)
		pause()
	else
		play()
}

function nextTrack(auto = false) {
	const total = queue.value.length
	if (total === 0)
		return
	if (auto && mode.value === 'one') {
		const el = ensureAudio()
		el.currentTime = 0
		void startPlayback()
		return
	}
	const target = mode.value === 'shuffle' ? stepShuffle(true) : (index.value + 1) % total
	void loadAt(target, true)
}

function prevTrack() {
	const total = queue.value.length
	if (total === 0)
		return
	const el = ensureAudio()
	// 播放超过 3 秒：先回到本曲开头
	if (el.currentTime > 3) {
		seek(0)
		return
	}
	const target = mode.value === 'shuffle' ? stepShuffle(false) : (index.value - 1 + total) % total
	void loadAt(target, true)
}

/** 播放当前队列里的第 target 首 */
function playAt(target: number) {
	if (mode.value === 'shuffle')
		buildShuffleOrder(target)
	void loadAt(target, true)
}

/** 切歌单并从第 start 首开始播放（一步到位，不会重复加载） */
function playPlaylist(next: MusicPlaylist, start = 0) {
	if (next.songs.length === 0)
		return
	queue.value = [...next.songs]
	playlistId.value = next.id
	buildShuffleOrder(start)
	void loadAt(Math.min(start, next.songs.length - 1), true)
}

function seek(seconds: number) {
	if (!Number.isFinite(seconds))
		return
	const el = ensureAudio()
	el.currentTime = Math.max(0, Math.min(seconds, duration.value || 0))
	time.value = el.currentTime
	syncLyricIndex()
}

function seekPercent(percent: number) {
	if (duration.value <= 0)
		return
	seek((clamp(percent, 0, 100) / 100) * duration.value)
}

function setVolume(value: number) {
	const next = clamp(value)
	volume.value = next
	muted.value = next === 0
	ensureAudio().volume = next
	persist()
}

function toggleMute() {
	const el = ensureAudio()
	if (el.volume > 0) {
		volumeBeforeMute = el.volume
		setVolume(0)
	}
	else {
		setVolume(volumeBeforeMute > 0 ? volumeBeforeMute : 0.6)
	}
}

function setMode(next: PlayMode) {
	mode.value = next
	if (next === 'shuffle')
		buildShuffleOrder(index.value)
	persist(true)
}

function cycleMode() {
	const order: PlayMode[] = ['list', 'one', 'shuffle']
	setMode(order[(order.indexOf(mode.value) + 1) % order.length])
}

// ===================== 远程歌单（Meting / Netease_url） =====================

const CACHE_KEY = 'kemeow-music-meting-v2'
const NETEASE_CACHE_KEY = 'kemeow-music-netease-v1'

interface RemoteCache {
	v: number
	ts: number
	data: MusicPlaylist[]
}

function readRemoteCache(key: string, ttl: number): MusicPlaylist[] | null {
	if (ttl <= 0 || typeof window === 'undefined')
		return null
	try {
		const raw = window.sessionStorage.getItem(key)
		if (!raw)
			return null
		const cache = JSON.parse(raw) as RemoteCache
		if (cache.v !== STORAGE_VERSION || Date.now() - cache.ts > ttl)
			return null
		return Array.isArray(cache.data) && cache.data.length > 0 ? cache.data : null
	}
	catch {
		return null
	}
}

function writeRemoteCache(key: string, data: MusicPlaylist[]) {
	if (typeof window === 'undefined' || data.length === 0)
		return
	try {
		const cache: RemoteCache = { v: STORAGE_VERSION, ts: Date.now(), data }
		window.sessionStorage.setItem(key, JSON.stringify(cache))
	}
	catch {
		// 隐私模式 / 配额不足：不影响播放
	}
}

/**
 * 已合并的远程歌单，按来源分组维护。
 * 多个远程源（Meting / Netease_url）各自同步完成后调 applyRemote()，
 * 最终 playlists = 本地 + 全部远程，不会互相覆盖。
 */
const remotePlaylists = shallowRef<MusicPlaylist[]>([])

function applyRemote(source: MusicPlaylist['source'], list: MusicPlaylist[]) {
	const others = remotePlaylists.value.filter(item => item.source !== source)
	remotePlaylists.value = [...others, ...list]
	playlists.value = mergePlaylists(localPlaylists.value, remotePlaylists.value)
}

/** 远程请求计数，避免多源并发时加载态提前熄灭 */
let remoteLoadingCount = 0
function setRemoteLoading(delta: number) {
	remoteLoadingCount = Math.max(0, remoteLoadingCount + delta)
	remoteLoading.value = remoteLoadingCount > 0
}

/** 拉一个远程歌单；失败返回 null，由调用方决定提示方式 */
async function fetchMetingPlaylist(config: MetingConfig, item: MetingPlaylistConfig): Promise<MusicPlaylist | null> {
	const server = item.server ?? 'netease'
	const type = item.type ?? 'playlist'
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.timeout)
	try {
		const response = await fetch(metingApiUrl(config.api, { server, type, id: item.id }), { signal: controller.signal })
		if (!response.ok)
			throw new Error(`HTTP ${response.status}`)
		const songs = metingParseSongs(await response.json(), config.api, server)
		if (songs.length === 0)
			return null
		return {
			id: `meting:${server}:${type}:${item.id}`,
			name: item.name || `${metingServerLabel(server)}${metingTypeLabel(type)}`,
			desc: item.desc || metingServerLabel(server),
			cover: item.cover || songs[0]?.cover || '',
			songs,
			source: 'meting',
		}
	}
	catch (e) {
		console.warn(`[useMusicPlayer] 远程歌单 ${item.id} 拉取失败:`, e)
		return null
	}
	finally {
		clearTimeout(timer)
	}
}

/** 本地在前、远程在后，按 id 去重 */
function mergePlaylists(local: MusicPlaylist[], remote: MusicPlaylist[]) {
	const seen = new Set<string>()
	const merged: MusicPlaylist[] = []
	for (const item of [...local, ...remote]) {
		if (seen.has(item.id))
			continue
		seen.add(item.id)
		merged.push(item)
	}
	return merged
}

/** 拉取全部远程歌单并合入 playlists；没配置时什么都不做 */
async function syncMeting() {
	const config = useAppConfig().music?.meting as MetingConfig | undefined
	const items = (config?.playlists ?? []).filter(item => !item.disabled)
	if (!config?.api || items.length === 0)
		return

	setRemoteLoading(1)
	try {
		let remote = readRemoteCache(CACHE_KEY, config.cacheTtl)
		if (!remote) {
			const results = await Promise.all(items.map(item => fetchMetingPlaylist(config, item)))
			remote = results.filter((item): item is MusicPlaylist => item !== null)
			writeRemoteCache(CACHE_KEY, remote)
			if (remote.length === 0)
				remoteError.value = '远程歌单拉取失败，请检查接口地址与网络'
		}
		if (remote.length > 0) {
			remoteError.value = ''
			applyRemote('meting', remote)
		}
	}
	finally {
		setRemoteLoading(-1)
		// 远程歌单可能在本地之后才到，这里补一次建队列
		ensureQueue()
	}
}

/** 拉一个 Netease_url 歌单（209 首实测约 5 秒） */
async function fetchNeteasePlaylist(config: NeteaseUrlConfig, item: NeteasePlaylistConfig): Promise<MusicPlaylist | null> {
	const level = config.level ?? 'exhigh'
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.timeout)
	try {
		const response = await fetch(neteaseApiUrl(config.api, 'playlist', { id: item.id }), { signal: controller.signal })
		if (!response.ok)
			throw new Error(`HTTP ${response.status}`)
		const raw = await response.json()
		const songs = neteaseParseTracks(raw).map((track) => {
			const song: MusicSong = { ...track }
			if (!song.platformId)
				return song
			// 代理模式地址是纯拼接、可预填；直链模式留给播放前现取（有时效）
			if (config.audio === 'proxy' || config.audio === 'stream')
				song.src = neteaseAudioUrl(config.api, song.platformId, level, config.audio)
			song.lrc = neteaseLyricUrl(config.api, song.platformId)
			return song
		})
		if (songs.length === 0)
			return null
		const playlist = (raw as { data?: { playlist?: { name?: string, coverImgUrl?: string } } })?.data?.playlist ?? {}
		return {
			id: `netease:playlist:${item.id}`,
			name: item.name || playlist.name || '网易云歌单',
			desc: item.desc || '网易云',
			cover: item.cover || playlist.coverImgUrl || songs[0]?.cover || '',
			songs,
			source: 'netease',
		}
	}
	catch (e) {
		console.warn(`[useMusicPlayer] Netease_url 歌单 ${item.id} 拉取失败:`, e)
		return null
	}
	finally {
		clearTimeout(timer)
	}
}

/** 拉取全部 Netease_url 歌单并合入 playlists */
async function syncNeteaseUrl() {
	const config = neteaseConfig
	const items = (config?.playlists ?? []).filter(item => !item.disabled)
	if (!config?.api || items.length === 0)
		return

	setRemoteLoading(1)
	try {
		let remote = readRemoteCache(NETEASE_CACHE_KEY, config.cacheTtl)
		if (!remote) {
			const results = await Promise.all(items.map(item => fetchNeteasePlaylist(config, item)))
			remote = results.filter((item): item is MusicPlaylist => item !== null)
			writeRemoteCache(NETEASE_CACHE_KEY, remote)
			if (remote.length === 0)
				remoteError.value = '网易云歌单拉取失败，检查实例地址与 cookie 是否有效'
		}
		if (remote.length > 0) {
			remoteError.value = ''
			applyRemote('netease', remote)
		}
	}
	finally {
		setRemoteLoading(-1)
		ensureQueue()
	}
}

/** 播放前解析远程直链（仅 `audio: 'direct'` 需要；代理模式地址已预填） */
async function resolveRemoteSong(track: MusicSong): Promise<string> {
	const config = neteaseConfig
	if (track.provider !== 'netease-url' || !track.platformId || !config?.api)
		return ''
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.timeout)
	try {
		const response = await fetch(neteaseDirectSongApi(config.api, track.platformId, config.level ?? 'exhigh'), { signal: controller.signal })
		if (!response.ok)
			return ''
		// type=json 一次给 url + 歌词，歌词直接当原文塞回 track（loadLyric 认得 `[` 开头的文本）
		const data = await response.json()
		const lyric = neteaseParseLyric(data)
		if (lyric)
			track.lrc = lyric
		return neteaseParseDirectUrl(data)
	}
	catch (e) {
		console.warn('[useMusicPlayer] Netease_url 直链解析失败:', e)
		return ''
	}
	finally {
		clearTimeout(timer)
	}
}

/** 把第一个有歌的歌单挂成当前队列；有待恢复状态时顺带恢复曲目与进度 */
function ensureQueue() {
	if (queue.value.length > 0)
		return
	const pool = playlists.value.filter(item => item.songs.length > 0)
	if (pool.length === 0)
		return

	const restore = pendingRestore
	const target = (restore && pool.find(item => item.id === restore.playlistId)) || pool[0]
	queue.value = [...target.songs]
	playlistId.value = target.id
	buildShuffleOrder(0)

	if (restore) {
		pendingRestore = null
		const restoredIndex = Math.max(0, target.songs.findIndex(item => item.id === restore.songId))
		// 只预载 metadata，不自动播放；进度在 loadedmetadata 时跳转
		void loadAt(restoredIndex, false, Math.max(0, restore.time))
		return
	}
	// 没有记忆时停在第一首：胶囊能显示曲目，但不加载音频、不发声
	index.value = 0
	duration.value = target.songs[0]?.duration ?? 0
}

/** 首次挂载时初始化：读配置、读记忆、建跨标签页通道、注册系统媒体键 */
function init() {
	if (initialized.value)
		return
	initialized.value = true

	localPlaylists.value = musicPlaylists.map(item => ({ ...item, source: item.source ?? 'local' }))
	playlists.value = [...localPlaylists.value]

	const config = useAppConfig().music as Partial<{
		defaultVolume: number
		playMode: PlayMode
		remember: boolean
		hideLrcMeta: boolean
		meting: MetingConfig
	}> | undefined
	const modes: PlayMode[] = ['list', 'one', 'shuffle']
	const defaultVolume = clamp(config?.defaultVolume ?? 0.6)
	const defaultMode = modes.includes(config?.playMode as PlayMode) ? config!.playMode as PlayMode : 'list'
	const remember = config?.remember !== false
	hideLrcMeta = config?.hideLrcMeta !== false

	volume.value = defaultVolume
	volumeBeforeMute = defaultVolume
	mode.value = defaultMode
	ensureAudio().volume = defaultVolume

	if (typeof BroadcastChannel !== 'undefined') {
		channel ??= new BroadcastChannel(CHANNEL_NAME)
		channel.onmessage = (event) => {
			const data = event.data as { type?: string, tabId?: string } | null
			// 别的标签页开始播放：本页让位，避免两路声音叠在一起
			if (data?.type === 'play' && data.tabId !== tabId && status.value === 'playing')
				pause()
		}
	}

	if (typeof navigator !== 'undefined' && 'mediaSession' in navigator) {
		navigator.mediaSession.setActionHandler('play', () => play())
		navigator.mediaSession.setActionHandler('pause', () => pause())
		navigator.mediaSession.setActionHandler('previoustrack', () => prevTrack())
		navigator.mediaSession.setActionHandler('nexttrack', () => nextTrack())
		navigator.mediaSession.setActionHandler('seekto', (details) => {
			if (typeof details.seekTime === 'number')
				seek(details.seekTime)
		})
	}

	const persisted = remember ? readPersisted() : null
	pendingRestore = persisted
	if (persisted) {
		volume.value = clamp(persisted.volume)
		ensureAudio().volume = volume.value
		mode.value = persisted.mode
		if (persisted.mode === 'shuffle')
			buildShuffleOrder(0)
	}

	// 记忆里的歌单还没出现在列表里（很可能是远程歌单）→ 等远程同步完再建队列，
	// 否则会先落到本地歌单，恢复出错误的曲目
	metingEnabled = !!config?.meting?.api && (config.meting.playlists ?? []).some(item => !item.disabled)
	const netease = config?.neteaseUrl as NeteaseUrlConfig | undefined
	neteaseConfig = netease?.api && (netease.playlists ?? []).some(item => !item.disabled)
		? { ...netease, cacheTtl: netease.cacheTtl ?? 30 * 60 * 1000, timeout: netease.timeout ?? 30 * 1000, level: netease.level ?? 'exhigh', audio: netease.audio ?? 'proxy' }
		: null

	const waitRemote = !!pendingRestore
		&& !playlists.value.some(item => item.id === pendingRestore!.playlistId)
		&& (metingEnabled || !!neteaseConfig)
	if (!waitRemote)
		ensureQueue()

	void syncMeting()
	void syncNeteaseUrl()
}

/** 手动重试远程歌单（清缓存后重新拉取） */
function retryRemote() {
	if (typeof window !== 'undefined') {
		try {
			window.sessionStorage.removeItem(CACHE_KEY)
			window.sessionStorage.removeItem(NETEASE_CACHE_KEY)
		}
		catch {}
	}
	remoteError.value = ''
	void syncMeting()
	void syncNeteaseUrl()
}

// ===================== 面板（弹窗）开关 =====================

function openPanel() {
	panelOpen.value = true
}

function closePanel() {
	panelOpen.value = false
}

function togglePanel() {
	panelOpen.value ? closePanel() : openPanel()
}

// ===================== 对外接口 =====================

export function useMusicPlayer() {
	const showLyrics = computed(() => {
		const config = useAppConfig().music as Partial<{ showLyrics: boolean }> | undefined
		return config?.showLyrics !== false
	})

	return {
		// 状态
		status,
		isPlaying,
		song,
		playlist,
		playlists,
		queue,
		index,
		time,
		duration,
		buffered,
		progress,
		bufferedPercent,
		volume,
		muted,
		mode,
		modeIcon,
		modeLabel,
		lyric,
		lyricIndex,
		currentLyric,
		error,
		initialized,
		showLyrics,
		remoteLoading,
		remoteError,
		hasTracks,
		sourceConfigured,
		panelOpen,

		// 控制
		init,
		play,
		pause,
		toggle,
		next: nextTrack,
		prev: prevTrack,
		playAt,
		playPlaylist,
		retryRemote,
		openPanel,
		closePanel,
		togglePanel,
		seek,
		seekPercent,
		setVolume,
		toggleMute,
		setMode,
		cycleMode,

		// 工具
		formatTime,
	}
}
