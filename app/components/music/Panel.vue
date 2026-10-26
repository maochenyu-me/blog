<script setup lang="ts">
import type { MusicPlaylist } from '~/types/music'

/**
 * 音乐面板（弹窗）—— 站点唯一的播放入口
 *
 * 打开方式：
 *   - 左侧栏导航的「音乐」按钮（`BlogSidebar.vue`）
 *   - 播放中时左下角的迷你条（`Player.vue`）
 *
 * 结构：上面是播放器（封面 / 歌词 / 进度 / 控制），下面是歌单抽屉（切歌单 + 选歌）。
 * 关掉弹窗不会中断播放，音频元素挂在模块级单例上。
 */

const player = useMusicPlayer()
const {
	panelOpen,
	closePanel,
	song,
	isPlaying,
	hasTracks,
	playlists,
	playlist: currentPlaylist,
	lyric,
	lyricIndex,
	progress,
	bufferedPercent,
	time,
	duration,
	volume,
	muted,
	modeIcon,
	modeLabel,
	showLyrics,
	remoteLoading,
	remoteError,
	status,
	formatTime,
	toggle,
	next,
	prev,
	seekPercent,
	setVolume,
	toggleMute,
	cycleMode,
	playPlaylist,
	retryRemote,
} = player

const browsingId = ref<string | null>(null)
const browsing = computed(() =>
	playlists.value.find(item => item.id === browsingId.value)
	?? currentPlaylist.value
	?? playlists.value[0]
	?? null,
)

// 引擎的唯一启动点（本组件常驻挂载，弹窗只是开关），不要挪到会被反复创建的组件里
const musicConfig = useAppConfig().music as Partial<{ enabled: boolean }> | undefined
onMounted(() => {
	if (musicConfig?.enabled !== false)
		player.init()
})

const browsingSongs = computed(() => browsing.value?.songs ?? [])
const currentSongId = computed(() => song.value?.id ?? '')

/** 歌单抽屉的两级视图，与参考站一致：先进歌单列表，点进去看歌曲 */
const view = ref<'playlists' | 'songs'>('playlists')

function coverOf(item: MusicPlaylist) {
	return item.cover || item.songs[0]?.cover || ''
}

function enter(item: MusicPlaylist) {
	browsingId.value = item.id
	view.value = 'songs'
}

watch(panelOpen, (open) => {
	if (!open)
		return
	if (!browsingId.value)
		browsingId.value = currentPlaylist.value?.id ?? playlists.value[0]?.id ?? null
	// 上一个歌单被删掉时兜底回到列表
	if (view.value === 'songs' && !browsing.value)
		view.value = 'playlists'
})

useEventListener('keydown', (event) => {
	if (panelOpen.value && event.key === 'Escape')
		closePanel()
})

function onVolumeInput(event: Event) {
	setVolume(Number((event.target as HTMLInputElement).value))
}

function select(songIndex: number) {
	const target: MusicPlaylist | null = browsing.value
	if (target)
		playPlaylist(target, songIndex)
}
</script>

<template>
<Teleport to="body">
	<Transition name="float-in">
		<div v-if="panelOpen" class="music-mask" @click="closePanel" />
	</Transition>

	<Transition name="float-in">
		<section v-if="panelOpen" class="music-panel" role="dialog" aria-modal="true" aria-label="音乐播放器">
			<header class="panel-header">
				<Icon class="header-icon" name="tabler:music" />
				<strong class="panel-title text-creative">
					音乐
				</strong>
				<span class="panel-hint">{{ modeLabel }}</span>
				<button class="icon-btn" type="button" aria-label="关闭" @click="closePanel">
					<Icon name="tabler:x" />
				</button>
			</header>

			<!-- ============ 播放器 ============ -->
			<div class="player">
				<div class="now">
					<span class="cover" :class="{ 'is-spinning': isPlaying }">
						<img v-if="song?.cover" :src="song.cover" alt="" loading="lazy" decoding="async">
						<Icon v-else :name="status === 'loading' ? 'tabler:loader-2' : 'tabler:music'" />
					</span>
					<span class="meta">
						<span class="title text-creative">{{ song?.title ?? '还没有歌曲' }}</span>
						<span class="artist">{{ song?.artist ?? (hasTracks ? '从下面的歌单里挑一首' : '歌单还没准备好') }}</span>
					</span>
				</div>

				<MusicLyrics v-if="showLyrics && lyric.length" :lines="lyric" :active="lyricIndex" class="lyrics" />
				<p v-else-if="showLyrics" class="lyrics-empty">
					{{ hasTracks ? (isPlaying ? '♪ 纯音乐，请欣赏' : '点播放键开始') : '—' }}
				</p>

				<MusicProgress :value="progress" :buffered="bufferedPercent" label="播放进度" @seek="seekPercent" />
				<div class="times">
					<span>{{ formatTime(time) }}</span>
					<span>{{ duration > 0 ? formatTime(duration) : '--:--' }}</span>
				</div>

				<div class="controls">
					<button class="ctl" type="button" :title="`播放模式：${modeLabel}`" :aria-label="`播放模式：${modeLabel}`" @click="cycleMode">
						<Icon :name="modeIcon" />
					</button>
					<button class="ctl" type="button" title="上一首" aria-label="上一首" :disabled="!hasTracks" @click="prev()">
						<Icon name="tabler:player-skip-back-filled" />
					</button>
					<button
						class="ctl play"
						type="button"
						:title="!hasTracks ? '重新加载' : (isPlaying ? '暂停' : '播放')"
						:aria-label="!hasTracks ? '重新加载' : (isPlaying ? '暂停' : '播放')"
						@click="hasTracks ? toggle() : retryRemote()"
					>
						<Icon :name="!hasTracks ? 'tabler:refresh' : (isPlaying ? 'tabler:player-pause-filled' : 'tabler:player-play-filled')" />
					</button>
					<button class="ctl" type="button" title="下一首" aria-label="下一首" :disabled="!hasTracks" @click="next()">
						<Icon name="tabler:player-skip-forward-filled" />
					</button>
					<button class="ctl" type="button" :title="muted ? '取消静音' : '静音'" :aria-label="muted ? '取消静音' : '静音'" @click="toggleMute()">
						<Icon :name="muted ? 'tabler:volume-off' : 'tabler:volume'" />
					</button>
					<input
						class="vol"
						type="range"
						min="0"
						max="1"
						step="0.01"
						:value="volume"
						aria-label="音量"
						@input="onVolumeInput"
					>
				</div>
			</div>

			<!-- ============ 歌单抽屉：歌单列表 ⇄ 歌曲列表（照参考站的两级浏览） ============ -->
			<div class="drawer">
				<Transition name="view-swap" mode="out-in">
					<!-- 一级：歌单 -->
					<div v-if="view === 'playlists'" key="playlists" class="view">
						<button
							v-for="item in playlists"
							:key="item.id"
							class="pl-row"
							:class="{ 'is-current': item.id === currentPlaylist?.id }"
							type="button"
							@click="enter(item)"
						>
							<span class="pl-cover">
								<img v-if="coverOf(item)" :src="coverOf(item)" alt="" loading="lazy" decoding="async">
								<Icon v-else name="tabler:playlist" />
							</span>
							<span class="pl-meta">
								<span class="pl-name">
									<Icon v-if="item.source && item.source !== 'local'" class="pl-badge" name="tabler:cloud" />
									{{ item.name }}
								</span>
								<span class="pl-desc">{{ item.desc || `${item.songs.length} 首` }}</span>
							</span>
							<span class="pl-count">{{ item.songs.length }} 首</span>
							<Icon class="pl-arrow" name="tabler:chevron-right" />
						</button>

						<p v-if="remoteLoading" class="tip">
							<Icon class="tip-spin" name="tabler:loader-2" />
							正在拉取远程歌单…
						</p>
						<p v-else-if="playlists.length === 0" class="empty">
							<template v-if="remoteError">
								{{ remoteError }}
							</template>
							<template v-else>
								还没有歌单。本地音源：把文件放进 <code>public/music/songs/</code> 到
								<code>app/data/music.ts</code> 登记；远程音源：在 <code>blog.config.ts</code> 的
								<code>music.meting.playlists</code> 里填歌单 id。
							</template>
						</p>
					</div>

					<!-- 二级：歌曲 -->
					<div v-else key="songs" class="view">
						<button class="back" type="button" @click="view = 'playlists'">
							<Icon name="tabler:chevron-left" />
							<span>返回歌单</span>
						</button>
						<p class="view-title">
							{{ browsing?.name }}
						</p>

						<button
							v-for="(track, i) in browsingSongs"
							:key="track.id"
							class="song"
							:class="{ 'is-current': track.id === currentSongId }"
							type="button"
							@click="select(i)"
						>
							<span class="song-index">
								<Icon v-if="track.id === currentSongId" :name="isPlaying ? 'tabler:volume' : 'tabler:player-pause-filled'" />
								<template v-else>{{ i + 1 }}</template>
							</span>
							<span class="song-meta">
								<span class="song-title">{{ track.title }}</span>
								<span class="song-artist">{{ track.artist }}</span>
							</span>
							<span class="song-duration">{{ track.duration ? formatTime(track.duration) : '' }}</span>
						</button>

						<p v-if="browsingSongs.length === 0" class="empty">
							这个歌单还是空的。
						</p>
					</div>
				</Transition>
			</div>
		</section>
	</Transition>
</Teleport>
</template>

<style scoped>
.music-mask {
	position: fixed;
	inset: 0;
	background-color: var(--c-bg-soft);
	backdrop-filter: blur(0.2rem);
	z-index: calc(var(--z-index-popover) + 10);
}

.music-panel {
	display: flex;
	flex-direction: column;
	position: fixed;
	overflow: hidden;
	inset-block-start: 50%;
	inset-inline-start: 50%;
	/* 固定高度：一级（歌单）和二级（歌曲）切换时面板不跳 */
	block-size: min(88vh, 34rem);
	inline-size: min(25rem, calc(100vw - 2rem));
	max-block-size: min(88vh, 44rem);
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	box-shadow: var(--box-shadow-3);
	background-color: var(--c-bg-1);
	transform: translate(-50%, -50%);
	z-index: calc(var(--z-index-popover) + 20);
}

.panel-header {
	display: flex;
	flex: none;
	align-items: center;
	gap: 0.4rem;
	padding: 0.65rem 0.8rem;
	border-block-end: 1px solid var(--c-border);
	color: var(--c-text-2);
}

.header-icon {
	font-size: 1.1em;
	color: var(--c-primary);
}

.panel-title {
	flex: none;
	font-size: 0.95em;
	color: var(--c-text);
}

.panel-hint {
	flex-grow: 1;
	font-size: 0.72em;
	text-align: end;
	color: var(--c-text-3);
}

.icon-btn {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	block-size: 1.8rem;
	inline-size: 1.8rem;
	border-radius: 0.5rem;
	background-color: transparent;
	font-size: 1.1em;
	color: var(--c-text-2);
	transition: background-color 0.2s, color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-text);
	}
}

/* ============ 播放器 ============ */
.player {
	display: flex;
	flex: none;
	flex-direction: column;
	gap: 0.45rem;
	padding: 0.9rem 0.9rem 0.75rem;
}

.now {
	display: flex;
	align-items: center;
	gap: 0.7rem;
}

.cover {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	block-size: 3.6rem;
	inline-size: 3.6rem;
	border-radius: 50%;
	box-shadow: var(--box-shadow-1);
	background-color: var(--c-bg-2);
	font-size: 1.3em;
	color: var(--c-text-3);

	> img {
		block-size: 100%;
		inline-size: 100%;
		object-fit: cover;
	}

	&.is-spinning > img {
		animation: music-spin 14s linear infinite;
	}
}

.meta {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.1rem;
	min-inline-size: 0;
}

.title {
	overflow: hidden;
	font-size: 0.95em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text);
}

.artist {
	overflow: hidden;
	font-size: 0.76em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-3);
}

.lyrics {
	/* 面板里给歌词更大的窗口 */
	max-block-size: 7.5rem;
}

.lyrics-empty {
	padding-block: 0.9rem;
	font-size: 0.78em;
	text-align: center;
	color: var(--c-text-3);
}

.times {
	display: flex;
	justify-content: space-between;
	margin-block-start: -0.4rem;
	font-size: 0.7em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

.controls {
	display: flex;
	align-items: center;
	gap: 0.25rem;
}

.ctl {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	block-size: 1.9rem;
	inline-size: 1.9rem;
	border-radius: 50%;
	background-color: transparent;
	font-size: 1em;
	color: var(--c-text-1);
	transition: background-color 0.2s, color 0.2s, transform 0.15s;

	&:hover:not(:disabled) {
		background-color: var(--c-bg-soft);
		color: var(--c-primary);
	}

	&:active:not(:disabled) {
		transform: scale(0.9);
	}

	&:disabled {
		color: var(--c-text-3);
	}
}

.ctl.play {
	block-size: 2.3rem;
	inline-size: 2.3rem;
	margin-inline: 0.1rem;
	background-color: var(--c-primary);
	font-size: 1.2em;
	color: var(--c-bg);

	&:hover:not(:disabled) {
		background-color: var(--c-primary);
		color: var(--c-bg);
		filter: brightness(1.08);
	}
}

.vol {
	flex: 1;
	block-size: 1rem;
	min-inline-size: 2.5rem;
	margin-inline-start: 0.2rem;
	accent-color: var(--c-primary);
	cursor: pointer;
}

/* ============ 歌单抽屉：歌单列表 ⇄ 歌曲列表 ============ */
.drawer {
	display: flex;
	flex: 1;
	flex-direction: column;
	overflow: hidden;
	min-block-size: 0;
	border-block-start: 1px solid var(--c-border);
}

.view {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.1rem;
	overflow-y: auto;
	min-block-size: 8rem;
	padding: 0.4rem;
	scrollbar-width: thin;
}

/* 一级：歌单行 */
.pl-row {
	display: flex;
	flex: none;
	align-items: center;
	gap: 0.6rem;
	inline-size: 100%;
	padding: 0.45rem 0.5rem;
	border-radius: 0.6rem;
	background-color: transparent;
	text-align: start;
	color: var(--c-text-1);
	transition: background-color 0.2s, color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
	}

	&.is-current {
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}
}

.pl-cover {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	overflow: hidden;
	block-size: 2.6rem;
	inline-size: 2.6rem;
	border-radius: 0.5rem;
	background-color: var(--c-bg-2);
	font-size: 1.1em;
	color: var(--c-text-3);

	> img {
		block-size: 100%;
		inline-size: 100%;
		object-fit: cover;
	}
}

.pl-meta {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-inline-size: 0;
}

.pl-name {
	display: flex;
	align-items: center;
	gap: 0.25rem;
	overflow: hidden;
	font-size: 0.85em;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.pl-badge {
	flex: none;
	opacity: 0.6;
	font-size: 0.9em;
}

.pl-desc {
	overflow: hidden;
	font-size: 0.72em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-3);
}

.pl-count {
	flex: none;
	font-size: 0.72em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

.pl-arrow {
	flex: none;
	opacity: 0.5;
	font-size: 1em;
}

/* 二级：返回条与歌单名 */
.back {
	display: flex;
	flex: none;
	align-items: center;
	align-self: flex-start;
	gap: 0.2rem;
	padding: 0.25rem 0.5rem;
	border-radius: 0.4rem;
	background-color: transparent;
	font-size: 0.74em;
	color: var(--c-text-2);
	transition: background-color 0.2s, color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-text);
	}
}

.view-title {
	flex: none;
	overflow: hidden;
	padding: 0.1rem 0.5rem 0.35rem;
	font-size: 0.76em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-3);
}

.tip {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	gap: 0.3rem;
	padding: 0.9rem;
	font-size: 0.74em;
	color: var(--c-text-3);
}

.tip-spin {
	animation: music-spin 1s linear infinite;
}

/* 歌曲行 */
.song {
	display: flex;
	flex: none;
	align-items: center;
	gap: 0.5rem;
	padding: 0.4rem 0.5rem;
	border-radius: 0.5rem;
	background-color: transparent;
	text-align: start;
	color: var(--c-text-1);
	transition: background-color 0.2s, color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
	}

	&.is-current {
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}
}

.song-index {
	flex: none;
	inline-size: 1.4rem;
	font-size: 0.75em;
	text-align: center;
	color: var(--c-text-3);
}

.song-meta {
	display: flex;
	flex: 1;
	flex-direction: column;
	min-inline-size: 0;
}

.song-title {
	overflow: hidden;
	font-size: 0.82em;
	white-space: nowrap;
	text-overflow: ellipsis;
}

.song-artist {
	overflow: hidden;
	font-size: 0.7em;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-3);
}

.song-duration {
	flex: none;
	font-size: 0.72em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

.empty {
	padding: 1.2rem 0.8rem;
	font-size: 0.76em;
	line-height: 1.7;
	text-align: center;
	color: var(--c-text-3);

	> code {
		font-family: var(--font-monospace);
		font-size: 0.95em;
		word-break: break-all;
		color: var(--c-text-2);
	}
}

/* 两级视图切换 */
.view-swap-enter-active,
.view-swap-leave-active {
	transition: opacity 0.15s ease, transform 0.15s ease;
}

.view-swap-enter-from {
	opacity: 0;
	transform: translateX(0.5rem);
}

.view-swap-leave-to {
	opacity: 0;
	transform: translateX(-0.5rem);
}

@keyframes music-spin {
	to {
		transform: rotate(360deg);
	}
}

@media (max-width: 528px) {
	.music-panel {
		inset-block-start: auto;
		inset-block-end: 0.6rem;
		max-block-size: 88dvh;
		transform: translateX(-50%);
	}
}

@media (prefers-reduced-motion: reduce) {
	.cover.is-spinning > img,
	.tab-spin {
		animation: none;
	}
}
</style>
