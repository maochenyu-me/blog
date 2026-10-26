<script setup lang="ts">
withDefaults(defineProps<{
	/** 骨架行数 */
	count?: number
}>(), {
	count: 8,
})
</script>

<template>
<div class="hot-skeleton" role="status" aria-busy="true" aria-label="热榜加载中">
	<div v-for="index in count" :key="index" class="hot-skeleton-row">
		<span class="rank" />
		<div class="body">
			<span class="line w80" />
			<span class="line w56" />
		</div>
	</div>
</div>
</template>

<style scoped>
.hot-skeleton {
	overflow: hidden;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);
}

.hot-skeleton-row {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr);
	align-items: start;
	gap: 0.7em;
	padding: 0.75em 0.85em;
	border-top: 1px solid var(--c-border);

	&:first-child {
		border-top: none;
	}

	> .rank {
		width: 1.7em;
		height: 1.7em;
		border-radius: 0.4em;
	}

	> .body {
		display: flex;
		flex-direction: column;
		gap: 0.45em;

		> .line {
			height: 0.7em;
			border-radius: 0.3em;

			&.w80 { width: 80%; }
			&.w56 { width: 56%; }
		}
	}
}

.hot-skeleton-row,
.hot-skeleton-row .rank,
.hot-skeleton-row .line {
	background-color: var(--c-flat-card-bg-2);
	animation: hot-skeleton-pulse 1.4s ease-in-out infinite;
}

@keyframes hot-skeleton-pulse {
	50% { opacity: 0.5; }
}

@media (prefers-reduced-motion: reduce) {
	.hot-skeleton-row,
	.hot-skeleton-row .rank,
	.hot-skeleton-row .line {
		animation: none;
	}
}
</style>
