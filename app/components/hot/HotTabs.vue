<script setup lang="ts">
import type { HotPlatform, HotTypeOption } from '~/types/hot'

const props = defineProps<{
	platforms: HotPlatform[]
	activeRoute: string
	typeOptions: HotTypeOption[]
	activeType: string
	typeLabel: string
}>()

const emit = defineEmits<{
	selectRoute: [route: string]
	selectType: [type: string]
}>()

/** 空串表示还没手动选过，此时高亮接口默认榜（一般就是第一个选项） */
const activeTypeValue = computed(() => props.activeType || props.typeOptions[0]?.value || '')
</script>

<template>
<div class="hot-tabs">
	<div class="hot-tabs-row scrollbar-hidden" role="tablist" aria-label="热榜平台">
		<button
			v-for="platform in platforms"
			:key="platform.route"
			type="button"
			role="tab"
			class="hot-chip"
			:class="{ active: platform.route === activeRoute }"
			:aria-selected="platform.route === activeRoute"
			@click="emit('selectRoute', platform.route)"
		>
			<Icon :name="platform.icon" class="hot-chip-icon" />
			<span v-text="platform.name" />
		</button>
	</div>

	<div v-if="typeOptions.length" class="hot-tabs-row hot-tabs-sub scrollbar-hidden" role="tablist" aria-label="榜单分类">
		<span v-if="typeLabel" class="hot-tabs-label" v-text="typeLabel" />
		<button
			v-for="option in typeOptions"
			:key="option.value"
			type="button"
			role="tab"
			class="hot-chip hot-chip-sm"
			:class="{ active: option.value === activeTypeValue }"
			:aria-selected="option.value === activeTypeValue"
			@click="option.value !== activeTypeValue && emit('selectType', option.value)"
		>
			<span v-text="option.label" />
		</button>
	</div>
</div>
</template>

<style scoped>
.hot-tabs {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	padding: 0.6em 0.2em;

	> .hot-tabs-row {
		display: flex;
		align-items: center;
		gap: 0.4em;
		overflow-x: auto;
		/* 阻止横向滚动条把行撑高 */
		padding-bottom: 0.1em;
	}

	> .hot-tabs-sub {
		font-size: 0.92em;
	}

	.hot-tabs-label {
		flex: none;
		margin-inline-end: 0.1em;
		font-size: 0.78em;
		color: var(--c-text-3);
	}
}

.hot-chip {
	display: inline-flex;
	flex: none;
	align-items: center;
	gap: 0.35em;
	padding: 0.3em 0.75em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 2em;
	background-color: var(--c-flat-card-bg);
	font-size: 0.82em;
	color: var(--c-text-2);
	transition: border-color 0.2s, color 0.2s, background-color 0.2s;
	cursor: pointer;

	&:hover {
		border-color: var(--c-primary-soft);
		color: var(--c-primary);
	}

	&.active {
		border-color: transparent;
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}

	.hot-chip-icon {
		flex: none;
		opacity: 0.85;
		font-size: 1.05em;
	}
}

.hot-chip-sm {
	padding: 0.2em 0.6em;
	font-size: 0.76em;
}
</style>
