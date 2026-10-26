<script setup lang="ts">
import type { MemosChannel } from '~/types/memos'

defineProps<{
	channels: MemosChannel[]
	/** 空字符串表示全部频道 */
	active: string
}>()

const emit = defineEmits<{
	select: [id: string]
}>()
</script>

<template>
<nav class="memos-channels scrollbar-hidden" aria-label="说说频道切换">
	<button
		type="button"
		:class="{ active: !active }"
		@click="emit('select', '')"
	>
		全部
	</button>

	<button
		v-for="channel in channels"
		:key="channel.id"
		type="button"
		:class="{ active: active === channel.id }"
		@click="emit('select', channel.id)"
	>
		<Icon name="tabler:brand-telegram" />
		<span>{{ channel.title }}</span>
	</button>
</nav>
</template>

<style scoped>
.memos-channels {
	display: flex;
	gap: 0.4em;
	overflow-x: auto;
	margin-bottom: 0.2em;
	padding: 0.2em;

	> button {
		display: inline-flex;
		flex-shrink: 0;
		align-items: center;
		gap: 0.25em;
		padding: 0.3em 0.7em;
		border-radius: 2em;
		background-color: var(--c-bg-2);
		font-size: 0.85em;
		color: var(--c-text-3);
		transition: all 0.2s;
		cursor: pointer;

		&:hover {
			color: var(--c-text-1);
		}

		&.active {
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
		}
	}
}
</style>
