<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'

/**
 * 视频扩展卡：`BV` 前缀按 Bilibili 处理，其余按 YouTube id 处理
 * （与 Ech0 上游 `VideoCard.vue` 的嗅探规则一致）。
 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'video' }>
}>()

const isBilibili = computed(() => props.ext.videoId.startsWith('BV'))
const providerLabel = computed(() => (isBilibili.value ? 'Bilibili' : 'YouTube'))

const embedUrl = computed(() => isBilibili.value
	? `https://www.bilibili.com/blackboard/html5mobileplayer.html?bvid=${encodeURIComponent(props.ext.videoId)}&as_wide=1&high_quality=1&danmaku=0`
	: `https://www.youtube.com/embed/${encodeURIComponent(props.ext.videoId)}`)

const pageUrl = computed(() => isBilibili.value
	? `https://www.bilibili.com/video/${props.ext.videoId}`
	: `https://www.youtube.com/watch?v=${props.ext.videoId}`)
</script>

<template>
<MemosExtShell icon="tabler:video" :label="providerLabel" :href="pageUrl" tip="在原站观看">
	<div class="memos-video">
		<iframe
			:src="embedUrl"
			:title="providerLabel"
			loading="lazy"
			referrerpolicy="no-referrer"
			scrolling="no"
			allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
			allowfullscreen
		/>
	</div>
	<p class="memos-video-hint">
		<Icon name="tabler:external-link" />
		<a :href="pageUrl" target="_blank" rel="noopener noreferrer">在原站观看</a>
	</p>
</MemosExtShell>
</template>

<style scoped>
.memos-video {
	overflow: hidden;
	border-radius: 0.4em;
	background-color: var(--c-bg-3);

	iframe {
		display: block;
		width: 100%;
		aspect-ratio: 16 / 9;
		border: none;
	}
}

.memos-video-hint {
	display: flex;
	align-items: center;
	gap: 0.3em;
	font-size: 0.78em;
	color: var(--c-text-3);

	a {
		color: inherit;

		&:hover {
			color: var(--c-primary);
		}
	}
}
</style>
