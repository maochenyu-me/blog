<script setup lang="ts">
import type { FcircleItem, FcircleSite } from '~/types/fcircle'

const props = defineProps<{
	item: FcircleItem
	site: FcircleSite
}>()

const coverVisible = ref(!!props.item.cover)
const domain = computed(() => getDomain(props.site.link))
const isStale = computed(() => props.site.status === 'stale' || props.site.status === 'error')
const staleTip = computed(() => props.site.error
	? `最近一次抓取失败：${props.site.error}`
	: '该站订阅源最近一次抓取没有返回新文章')
</script>

<template>
<article class="fcircle-card card gradient-card upraise">
	<UtilLink class="card-link" :to="item.link" rel="noopener">
		<div v-if="coverVisible" class="cover">
			<img
				:src="item.cover"
				alt=""
				loading="lazy"
				decoding="async"
				referrerpolicy="no-referrer"
				@error="coverVisible = false"
			>
		</div>

		<div class="body">
			<header class="meta">
				<img class="avatar round-cobblestone" :src="site.avatar" :alt="site.name" loading="lazy" decoding="async">
				<span class="site" v-text="site.name" />
				<UtilDate class="date" :date="item.date" />
			</header>

			<h3 class="title" v-text="item.title" />

			<p v-if="item.excerpt" class="excerpt" v-text="item.excerpt" />

			<footer class="tail">
				<code class="domain" v-text="domain" />

				<span v-if="isStale" v-tip="staleTip" class="stale">
					<Icon name="tabler:cloud-off" />
					近期未更新
				</span>

				<span class="go">
					<Icon name="tabler:arrow-up-right" />
				</span>
			</footer>
		</div>
	</UtilLink>
</article>
</template>

<style scoped>
.fcircle-card {
	overflow: hidden;
	break-inside: avoid;
	animation: float-in 0.3s var(--delay, 0s) backwards;

	.card-link {
		display: block;
		border-radius: inherit;
	}

	.cover {
		position: relative;
		overflow: hidden;
		aspect-ratio: 16 / 9;
		background-color: var(--c-bg-2);

		img {
			display: block;
			width: 100%;
			height: 100%;
			transition: transform 0.35s ease;
			object-fit: cover;
		}
	}

	&:hover .cover img {
		transform: scale(1.03);
	}

	.body {
		display: flex;
		flex-direction: column;
		gap: 0.5em;
		padding: 0.85em 1em 0.75em;
	}

	.meta {
		display: flex;
		align-items: center;
		gap: 0.45em;
		min-width: 0;
		font-size: 0.8em;
		color: var(--c-text-3);

		.avatar {
			flex: none;
			width: 1.7em;
			height: 1.7em;
			border-radius: 50%;
			box-shadow: var(--box-shadow-1);
			background-color: var(--c-bg-2);
			object-fit: cover;
		}

		.site {
			flex: 1;
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
			color: var(--c-text-2);
		}

		.date {
			flex: none;
			font-family: var(--font-monospace);
			font-variant-numeric: tabular-nums;
		}
	}

	.title {
		display: -webkit-box;
		overflow: hidden;
		font-family: var(--font-creative);
		font-size: 1.02em;
		font-weight: 550;
		-webkit-line-clamp: 2;

		line-clamp: 2;
		line-height: 1.45;
		color: var(--c-text-1);
		transition: color 0.2s;
		-webkit-box-orient: vertical;
	}

	&:hover .title {
		color: var(--c-primary);
	}

	.excerpt {
		display: -webkit-box;
		overflow: hidden;
		overflow-wrap: anywhere;
		font-size: 0.85em;

		-webkit-line-clamp: 3;
		line-clamp: 3;
		line-height: 1.7;
		color: var(--c-text-2);
		-webkit-box-orient: vertical;
	}

	.tail {
		display: flex;
		align-items: center;
		gap: 0.4em;
		margin-top: 0.15em;
		font-size: 0.75em;

		.domain {
			overflow: hidden;
			opacity: 0.55;
			white-space: nowrap;
			text-overflow: ellipsis;
		}

		.stale {
			display: inline-flex;
			flex: none;
			align-items: center;
			gap: 0.2em;
			padding: 0 0.35em;
			border-radius: 0.4em;
			background-color: var(--c-warning-soft);
			color: var(--c-warning);
			cursor: help;
		}

		.go {
			flex: none;
			opacity: 0;
			margin-inline-start: auto;
			color: var(--c-primary);
			transform: translate(-0.2em, 0.2em);
			transition: opacity 0.2s, transform 0.2s;
		}
	}

	&:hover .go {
		opacity: 1;
		transform: none;
	}
}
</style>
