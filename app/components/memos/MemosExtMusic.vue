<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'
import { isMetingSupported, metingAudioUrl, metingCoverUrl, metingMetaUrl, musicPageUrl, parseMusicLink } from '~/utils/memos/music'
import { metingForceHttps } from '~/utils/meting'

/**
 * 音乐扩展卡：只做卡片内联播放器。
 *
 * Ech0 的 `payload.url` 是音乐**分享页**地址（网易云 / QQ / Apple），
 * 这里解析出平台 id 后交给 Meting-API 换元信息与音频地址 ——
 * 与本博客悬浮播放器同一条链路（`blog.config.ts` 的 `music.meting.api`）。
 * Apple Music 不被 Meting 支持，直接降级成外链卡。
 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'music' }>
}>()

const appConfig = useAppConfig()
const metingApi = computed(() => (appConfig.music as { meting?: { api?: string } } | undefined)?.meting?.api ?? '')

const info = computed(() => parseMusicLink(props.ext.url))
const supported = computed(() => isMetingSupported(info.value))
/** meting 不支持时给一个能打开的原始音乐页 */
const fallbackUrl = computed(() => (info.value ? musicPageUrl(info.value) : props.ext.url))

const track = ref<{ title: string, artist: string, cover: string } | null>(null)
const loading = ref(false)
/** 元信息取不到（不影响播放）与音频播不了（版权/失效）要分开处理 */
const metaFailed = ref(false)
const unplayable = ref(false)
const audioEl = useTemplateRef<HTMLAudioElement>('audio')
const playing = ref(false)
const currentTime = ref(0)
const duration = ref(0)
const progress = computed(() => (duration.value > 0 ? Math.min(currentTime.value / duration.value, 1) : 0))

/** 同一页面上多张音乐卡互斥播放 */
let currentAudio: HTMLAudioElement | null = null

const audioSrc = computed(() => (supported.value && info.value ? metingAudioUrl(metingApi.value, info.value) : ''))

async function loadMeta() {
	if (!supported.value || !info.value || !metingApi.value)
		return
	loading.value = true
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), 10_000)
	try {
		const list = await $fetch<{ title?: string, name?: string, author?: string, artist?: string, pic?: string, cover?: string }[]>(
			metingMetaUrl(metingApi.value, info.value),
			{ signal: controller.signal },
		)
		const first = Array.isArray(list) ? list[0] : undefined
		if (!first)
			throw new Error('meting 没有返回曲目')
		track.value = {
			title: (first.title ?? first.name ?? '').trim() || '未知曲目',
			artist: (first.author ?? first.artist ?? '').trim(),
			cover: metingForceHttps((first.pic ?? first.cover ?? '').trim()) || (info.value ? metingCoverUrl(metingApi.value, info.value) : ''),
		}
	}
	catch (error) {
		metaFailed.value = true
		console.warn('[memos] 音乐信息获取失败', error)
	}
	finally {
		clearTimeout(timer)
		loading.value = false
	}
}

async function toggle() {
	const audio = audioEl.value
	if (!audio || unplayable.value)
		return
	if (playing.value) {
		audio.pause()
		return
	}
	if (currentAudio && currentAudio !== audio)
		currentAudio.pause()
	currentAudio = audio
	try {
		await audio.play()
	}
	catch (error) {
		// 自动播放被拦或音源失效：按钮回到未播放态并给出提示，不弹窗打扰
		unplayable.value = true
		console.warn('[memos] 音频播放失败', error)
	}
}

function seek(event: MouseEvent) {
	const audio = audioEl.value
	if (!audio || !duration.value)
		return
	const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
	const ratio = Math.min(Math.max((event.clientX - rect.left) / rect.width, 0), 1)
	audio.currentTime = ratio * duration.value
}

function formatTime(seconds: number) {
	if (!Number.isFinite(seconds) || seconds <= 0)
		return '0:00'
	const total = Math.floor(seconds)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

onMounted(loadMeta)
onBeforeUnmount(() => {
	if (currentAudio && currentAudio === audioEl.value) {
		audioEl.value?.pause()
		currentAudio = null
	}
})
</script>

<template>
<MemosExtShell
	v-if="supported"
	icon="tabler:music"
	label="音乐"
	:href="fallbackUrl"
	tip="在音乐平台打开"
>
	<div class="memos-music">
		<audio
			ref="audio"
			:src="audioSrc"
			preload="none"
			@play="playing = true"
			@pause="playing = false"
			@ended="playing = false"
			@timeupdate="currentTime = ($event.target as HTMLAudioElement).currentTime"
			@loadedmetadata="duration = ($event.target as HTMLAudioElement).duration"
			@error="unplayable = true"
		/>

		<button
			type="button"
			class="cover"
			:class="{ 'is-playing': playing, 'is-unplayable': unplayable }"
			:aria-label="playing ? '暂停' : '播放'"
			:disabled="loading && !track"
			@click="toggle"
		>
			<img v-if="track?.cover" :src="track.cover" alt="" loading="lazy" decoding="async">
			<span v-else class="placeholder"><Icon :name="loading ? 'line-md:loading-twotone-loop' : 'tabler:music'" /></span>
			<span class="badge">
				<Icon :name="unplayable ? 'tabler:volume-off' : playing ? 'tabler:player-pause-filled' : 'tabler:player-play-filled'" />
			</span>
		</button>

		<div class="body">
			<p class="title" v-text="track?.title ?? (loading ? '正在获取曲目…' : '未知曲目')" />
			<p v-if="track?.artist" class="artist" v-text="track.artist" />

			<div class="seek" role="presentation" @click="seek">
				<span class="bar" :style="{ '--progress': progress }" />
			</div>
			<div class="time">
				<span v-if="unplayable" class="hint">音源暂不可用（版权限制），可在音乐平台收听</span>
				<template v-else>
					<span>{{ formatTime(currentTime) }}</span>
					<span>{{ duration ? formatTime(duration) : '--:--' }}</span>
				</template>
			</div>
		</div>
	</div>

	<p v-if="metaFailed && !track" class="memos-music-note">
		曲目信息获取失败，仍可尝试播放
	</p>
</MemosExtShell>

<!-- meting 不支持（Apple Music）或链接解析不了：退化成可点的外链卡 -->
<MemosExtShell v-else icon="tabler:music" label="音乐" :href="fallbackUrl" tip="在音乐平台打开">
	<p class="memos-music-fallback">
		<Icon name="tabler:external-link" />
		<span>在音乐平台打开这首歌</span>
	</p>
</MemosExtShell>
</template>

<style scoped>
.memos-music {
	display: flex;
	align-items: center;
	gap: 0.7em;
}

.cover {
	flex-shrink: 0;
	position: relative;
	overflow: hidden;
	width: 3.5em;
	height: 3.5em;
	padding: 0;
	border: none;
	border-radius: 0.4em;
	background-color: var(--c-bg-3);
	cursor: pointer;

	img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.placeholder {
		display: grid;
		place-items: center;
		width: 100%;
		height: 100%;
		color: var(--c-text-3);
	}

	.badge {
		display: grid;
		place-items: center;
		position: absolute;
		opacity: 0;
		inset: 0;
		background-color: rgb(0 0 0 / 35%);
		color: #FFF;
		transition: opacity 0.2s;
	}

	&:hover .badge,
	&.is-playing .badge {
		opacity: 1;
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}
}

.body {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.15em;
	min-width: 0;
}

.title {
	overflow: hidden;
	font-weight: 600;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-1);
}

.artist {
	overflow: hidden;
	font-size: 0.8em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-3);
}

.seek {
	padding-block: 0.35em;
	cursor: pointer;

	.bar {
		display: block;
		height: 0.25em;
		border-radius: 1em;
		background:
			linear-gradient(
				to right,
				var(--c-primary) calc(var(--progress, 0) * 100%),
				var(--c-bg-3) calc(var(--progress, 0) * 100%)
			);
	}
}

.time {
	display: flex;
	justify-content: space-between;
	font-family: var(--font-monospace);
	font-size: 0.7em;
	color: var(--c-text-3);

	> .hint {
		font-family: var(--font-sans);
		color: var(--c-warning, var(--c-text-3));
	}
}

.cover.is-unplayable .badge {
	opacity: 1;
}

.memos-music-note {
	font-size: 0.75em;
	color: var(--c-text-3);
}

.memos-music-fallback {
	display: flex;
	align-items: center;
	gap: 0.4em;
	font-size: 0.85em;
	color: var(--c-text-2);
}
</style>
