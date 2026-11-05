<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'

/**
 * 扩展卡片分发器：按 `extension.type` 懒加载对应卡片。
 * 全部异步引入，保证 tg 源与没有扩展卡片的说说零额外体积。
 */
defineProps<{
	extension: MemosExtension
}>()

const MemosExtMusic = defineAsyncComponent(() => import('./MemosExtMusic.vue'))
const MemosExtVideo = defineAsyncComponent(() => import('./MemosExtVideo.vue'))
const MemosExtGithub = defineAsyncComponent(() => import('./MemosExtGithub.vue'))
const MemosExtWebsite = defineAsyncComponent(() => import('./MemosExtWebsite.vue'))
const MemosExtTweet = defineAsyncComponent(() => import('./MemosExtTweet.vue'))
const MemosExtLocation = defineAsyncComponent(() => import('./MemosExtLocation.vue'))
</script>

<template>
<div class="memos-extension">
	<MemosExtMusic v-if="extension.type === 'music'" :ext="extension" />
	<MemosExtVideo v-else-if="extension.type === 'video'" :ext="extension" />
	<MemosExtGithub v-else-if="extension.type === 'github'" :ext="extension" />
	<MemosExtWebsite v-else-if="extension.type === 'website'" :ext="extension" />
	<MemosExtTweet v-else-if="extension.type === 'tweet'" :ext="extension" />
	<MemosExtLocation v-else-if="extension.type === 'location'" :ext="extension" />
</div>
</template>
