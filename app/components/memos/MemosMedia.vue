<script setup lang="ts">
import type { MemosMedia } from '~/types/memos'
import { LazyPopoverLightbox } from '#components'

const props = defineProps<{
	media: MemosMedia[]
}>()

const modalStore = useModalStore()
const activeEl = shallowRef<HTMLImageElement | null>(null)
const activeCaption = shallowRef('')
/** 当前灯箱的句柄；每次打开都新建一个，关闭后旧句柄作废 */
const lightbox = shallowRef<ReturnType<typeof modalStore.use> | null>(null)
/** 同步标记：有层在打开/关闭动画中，挡住同帧内的连点 */
let opening = false

function openLightbox(el: HTMLImageElement, caption: string) {
	// 同帧连点直接忽略：close() 是异步的，光看 status 挡不住
	if (opening)
		return

	activeEl.value = el
	activeCaption.value = caption
	opening = true

	// store 的 status 关闭后停在 closed，同一份 ctx 无法复用，每次都得新建
	const handle = modalStore.use(
		() => h(LazyPopoverLightbox, {
			el: activeEl.value!,
			caption: activeCaption.value,
		}),
	)
	lightbox.value = handle
	handle.open()

	// status 初始就是 closed，得先等它真正挂载成 open，之后变回 closed 才代表关闭完成
	let mounted = false
	const stop = watch(handle.status, (state) => {
		if (state === 'open') {
			mounted = true
			return
		}
		// closing 阶段就放开：用户这时再点是「我要重新打开」，
		// 等动画彻底走完再放开会把这期间的点击全部吞掉
		if (mounted && state !== 'open') {
			stop()
			opening = false
		}
	}, { immediate: true })
}

const images = computed(() => props.media.filter(item => item.kind === 'image' && item.status !== 'unavailable'))
const videos = computed(() => props.media.filter(item => item.kind === 'video' && item.status !== 'unavailable'))
const audios = computed(() => props.media.filter(item => item.kind === 'audio' && item.status !== 'unavailable'))
const documents = computed(() => props.media.filter(item => item.kind === 'document' && item.status !== 'unavailable'))
const pendingList = computed(() => props.media.filter(item => item.status === 'pending'))
const unavailableList = computed(() => props.media.filter(item => item.status === 'unavailable' || item.kind === 'unknown'))

/** 单图通栏、双图两列、其余三列 */
const imageColumns = computed(() => images.value.length === 1 ? 1 : images.value.length === 2 ? 2 : 3)

const preloaded = new Map<string, Promise<boolean>>()

/** 预载原图，返回是否成功；失败也 resolve，只是不替换 src */
function preload(url: string) {
	let task = preloaded.get(url)
	if (!task) {
		task = new Promise<boolean>((resolve) => {
			const image = new Image()
			image.onload = () => resolve(true)
			image.onerror = () => resolve(false)
			image.src = url
		})
		preloaded.set(url, task)
	}
	return task
}

/** 灯箱展示原图：先预载原图，避免放大后仍是缩略图 */
async function zoom(event: MouseEvent) {
	// 预载期间重复点击直接忽略，否则会在 await 结束后连开多层
	if (opening)
		return

	const img = (event.currentTarget as HTMLElement | null)?.querySelector('img')
	if (!img)
		return

	const original = img.dataset.original
	if (original && original !== img.src) {
		// 先占位，避免 1.5s 等待期间被连点穿透
		opening = true
		const loaded = await Promise.race([
			preload(original),
			new Promise<false>(resolve => setTimeout(resolve, 1500, false)),
		])
		opening = false

		if (loaded) {
			img.src = original
		}
		else {
			// 灯箱持有的是同一个 img 元素，src 换掉后里面也会跟着变成原图
			void preload(original).then((ok) => {
				if (ok)
					img.src = original
			})
		}
	}

	openLightbox(img, img.alt)
}

function getRatio(width?: number, height?: number) {
	return width && height ? `${width} / ${height}` : undefined
}
</script>

<template>
<div class="memos-media">
	<div
		v-if="images.length"
		class="memos-images"
		:class="{ single: images.length === 1 }"
		:style="{ '--memos-image-columns': imageColumns }"
	>
		<button
			v-for="image, index in images"
			:key="image.id"
			type="button"
			class="memos-image"
			:aria-label="`查看大图 ${index + 1}/${images.length}`"
			@click="zoom"
		>
			<img
				:src="image.thumbnailUrl"
				:data-original="image.originalUrl"
				:alt="image.fileName || `图片 ${index + 1}`"
				:style="{ aspectRatio: images.length === 1 ? getRatio(image.width, image.height) : undefined }"
				loading="lazy"
				decoding="async"
			>
		</button>
	</div>

	<div v-for="video in videos" :key="video.id" class="memos-video">
		<video
			controls
			playsinline
			preload="metadata"
			:src="video.originalUrl"
			:poster="video.thumbnailUrl || undefined"
			:style="{ aspectRatio: getRatio(video.width, video.height) }"
		/>
	</div>

	<div v-for="audio in audios" :key="audio.id" class="memos-audio">
		<Icon name="tabler:microphone" />
		<audio controls preload="none" :src="audio.originalUrl" />
		<span v-if="audio.duration" class="duration">{{ formatMemosDuration(audio.duration) }}</span>
	</div>

	<ul v-if="documents.length" class="memos-documents">
		<li v-for="document in documents" :key="document.id">
			<a :href="document.originalUrl" target="_blank" rel="noopener noreferrer">
				<Icon name="tabler:file" />
				<span class="name">{{ document.fileName || '附件' }}</span>
				<span v-if="document.fileSize" class="size">{{ formatMemosFileSize(document.fileSize) }}</span>
			</a>
		</li>
	</ul>

	<p v-for="item in pendingList" :key="item.id" class="memos-media-note">
		<Icon name="line-md:loading-twotone-loop" />
		<span>媒体处理中，稍后刷新查看</span>
	</p>

	<p v-for="item in unavailableList" :key="item.id" class="memos-media-note">
		<Icon name="tabler:photo-off" />
		<span>媒体暂不可用，可前往源消息查看</span>
	</p>
</div>
</template>

<style scoped>
.memos-media {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
}

.memos-images {
	display: grid;
	grid-template-columns: repeat(var(--memos-image-columns, 3), 1fr);
	gap: 0.4em;
}

.memos-image {
	position: relative;
	overflow: hidden;
	padding: 0;
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
	transition: box-shadow 0.2s;
	cursor: zoom-in;

	> img {
		display: block;
		width: 100%;
		height: 100%;
		transition: transform 0.3s;
		object-fit: cover;
	}

	&:not(.single) > img {
		aspect-ratio: 1;
	}

	&:hover {
		box-shadow: var(--box-shadow-2);

		> img {
			transform: scale(1.04);
		}
	}
}

.memos-images.single .memos-image > img {
	height: auto;
	max-height: 30em;
	object-fit: contain;
}

.memos-video > video {
	display: block;
	width: 100%;
	max-height: 30em;
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
}

.memos-audio {
	display: flex;
	align-items: center;
	gap: 0.5em;
	padding: 0.4em 0.6em;
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
	color: var(--c-text-2);

	> audio {
		flex: 1;
		height: 2.2em;
		min-width: 0;
	}

	> .duration {
		font-family: var(--font-monospace);
		font-size: 0.8em;
		color: var(--c-text-3);
	}
}

.memos-documents {
	display: flex;
	flex-direction: column;
	gap: 0.3em;

	> li > a {
		display: flex;
		align-items: center;
		gap: 0.4em;
		padding: 0.5em 0.7em;
		border-radius: 0.5em;
		background-color: var(--c-flat-card-bg-2);
		font-size: 0.9em;
		color: var(--c-text-2);
		transition: all 0.2s;

		&:hover {
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
		}

		> .name {
			flex: 1;
			overflow: hidden;
			min-width: 0;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		> .size {
			flex-shrink: 0;
			font-family: var(--font-monospace);
			font-size: 0.85em;
			color: var(--c-text-3);
		}
	}
}

.memos-media-note {
	display: flex;
	align-items: center;
	gap: 0.4em;
	padding: 0.6em 0.8em;
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
	font-size: 0.85em;
	color: var(--c-text-3);
}
</style>
