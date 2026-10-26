<script setup lang="ts">
import type { FcircleSite } from '~/types/fcircle'

const props = defineProps<{
	sites: FcircleSite[]
	activeSite: string
	keyword: string
	total: number
}>()

const emit = defineEmits<{
	'update:activeSite': [value: string]
	'update:keyword': [value: string]
}>()

const activeSite = computed({
	get: () => props.activeSite,
	set: value => emit('update:activeSite', value),
})

const keyword = computed({
	get: () => props.keyword,
	set: value => emit('update:keyword', value),
})

function selectSite(id: string) {
	emit('update:activeSite', props.activeSite === id ? '' : id)
}
</script>

<template>
<div class="fcircle-filter">
	<div v-if="sites.length > 1" class="sites scrollbar-hidden">
		<button
			type="button"
			class="chip"
			:class="{ active: !activeSite }"
			@click="emit('update:activeSite', '')"
		>
			<Icon name="tabler:layout-grid" />
			<span>全部</span>
			<span class="count">{{ total }}</span>
		</button>

		<button
			v-for="site in sites"
			:key="site.id"
			type="button"
			class="chip"
			:class="{ active: activeSite === site.id, stale: site.status !== 'ok' }"
			:title="site.status === 'ok' ? site.link : `${site.name}：近期抓取未成功，展示的是历史数据`"
			@click="selectSite(site.id)"
		>
			<img class="chip-avatar" :src="site.avatar" :alt="site.name" loading="lazy" decoding="async">
			<span class="chip-name" v-text="site.name" />
			<span class="count">{{ site.items.length }}</span>
		</button>
	</div>

	<label class="search">
		<Icon class="search-icon" name="tabler:search" />
		<input
			v-model="keyword"
			type="search"
			placeholder="搜索标题、摘要或站点"
			aria-label="搜索朋友圈文章"
		>
		<button v-if="keyword" type="button" class="clear" aria-label="清空搜索" @click="keyword = ''">
			<Icon name="tabler:x" />
		</button>
	</label>
</div>
</template>

<style scoped>
.fcircle-filter {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5em;
	position: sticky;
	top: 0;
	padding: 0.6em 0.2em;
	background-color: var(--c-bg-a80);
	backdrop-filter: blur(10px);
	z-index: 2;

	.sites {
		display: flex;
		flex: 1 1 16em;
		gap: 0.4em;
		overflow-x: auto;
		/* 阻止 sticky 容器被横向滚动条撑高 */
		padding-bottom: 0.1em;
	}

	.chip {
		display: inline-flex;
		flex: none;
		align-items: center;
		gap: 0.35em;
		padding: 0.3em 0.7em;
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

		&.stale:not(.active) {
			opacity: 0.6;
		}

		.chip-avatar {
			width: 1.5em;
			height: 1.5em;
			margin-inline-start: -0.2em;
			border-radius: 50%;
			background-color: var(--c-bg-2);
			object-fit: cover;
		}

		.chip-name {
			overflow: hidden;
			max-width: 9em;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.count {
			padding: 0 0.3em;
			border-radius: 1em;
			background-color: var(--c-bg-2);
			font-size: 0.85em;
			font-variant-numeric: tabular-nums;
			color: var(--c-text-3);
		}
	}

	.search {
		display: inline-flex;
		flex: 1 1 15em;
		align-items: center;
		gap: 0.35em;
		padding: 0 0.6em;
		border: 1px solid var(--c-flat-card-border);
		border-radius: 2em;
		background-color: var(--c-flat-card-bg);
		transition: border-color 0.2s;

		&:focus-within {
			border-color: var(--c-primary-soft);
		}

		.search-icon {
			flex: none;
			opacity: 0.5;
			color: var(--c-text-3);
		}

		input {
			width: 100%;
			min-width: 0;
			padding: 0.35em 0;
			border: none;
			outline: none;
			background: none;
			font-size: 0.82em;
			color: var(--c-text-1);

			&::placeholder {
				color: var(--c-text-3);
			}

			&::-webkit-search-cancel-button {
				display: none;
			}
		}

		.clear {
			flex: none;
			opacity: 0.5;
			font-size: 0.9em;
			color: var(--c-text-3);
			transition: opacity 0.2s;
			cursor: pointer;

			&:hover {
				opacity: 1;
			}
		}
	}
}

@media (max-width: 768px) {
	.fcircle-filter {
		gap: 0.4em;

		.search {
			flex: 1 1 100%;
		}
	}
}
</style>
