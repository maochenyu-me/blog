<script setup lang="ts">
import type { HotItem as HotItemData } from '~/types/hot'

defineProps<{
	items: HotItemData[]
	/** 当前页第一条的全局名次，用于跨页续排名 */
	startIndex: number
}>()

/** 百度等平台的 id 恒为 0，标题偶有重复，key 用「页内序号 + 标题」保证唯一 */
const keyOf = (item: HotItemData, index: number) => `${index}-${item.title}`
</script>

<template>
<ol class="hot-list">
	<HotItem
		v-for="(item, index) in items"
		:key="keyOf(item, index)"
		:item="item"
		:rank="startIndex + index + 1"
	/>
</ol>
</template>

<style scoped>
.hot-list {
	overflow: hidden;
	margin: 0;
	padding: 0;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);
	list-style: none;
}
</style>
