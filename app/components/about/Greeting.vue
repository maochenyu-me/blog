<script setup lang="ts">
import { aboutGreeting } from '~/data/about'

const appConfig = useAppConfig()

// /api/stats 在 routeRules 中预渲染，构建期即写入快照，与侧栏统计同源
const { data: stats } = useFetch('/api/stats')

const numbers = computed(() => [
	{ label: '运营时长', value: timeElapse(appConfig.timeEstablished) },
	{ label: '文章', value: `${stats.value?.total?.posts ?? 0} 篇` },
	{ label: '总字数', value: formatNumber(stats.value?.total?.words) || '--' },
])
</script>

<template>
<section class="card about-greeting">
	<p class="hello" v-text="aboutGreeting.hello" />

	<h1 class="name">
		{{ aboutGreeting.namePrefix }}
		<span class="inline-word" v-text="appConfig.author.name" />
	</h1>

	<p class="roles">
		<span>一名 {{ aboutGreeting.roles.join('、') }}、</span>
		<span class="inline-word highlight" v-text="aboutGreeting.highlight" />
	</p>

	<ul class="numbers">
		<li v-for="item in numbers" :key="item.label">
			<span class="value" v-text="item.value" />
			<span class="label" v-text="item.label" />
		</li>
	</ul>
</section>
</template>

<style scoped>
.about-greeting {
	display: flex;
	flex-direction: column;
	justify-content: center;
	gap: 0.3em;
	min-height: 11em;
	padding: 1.4em 1.6em;
	border-radius: 0.5em;
	box-shadow: var(--box-shadow-2);
	background-image:
		radial-gradient(120% 140% at 6% 0%, #FFF2, transparent 55%),
		linear-gradient(
			110deg,
			color-mix(in oklab, var(--c-primary) 52%, #4C1D95) 0%,
			color-mix(in oklab, var(--c-primary) 62%, #1D4ED8) 48%,
			color-mix(in oklab, var(--c-accent) 42%, #0F766E) 100%
		);
	background-position: 0% 0%, 0% 50%;
	background-size: auto, 220% 100%;
	color: #FFF;
	animation: greeting-drift 18s ease-in-out infinite alternate;

	> .hello {
		opacity: 0.85;
		font-size: 0.9em;
	}

	> .name {
		font-family: var(--font-creative);
		font-size: clamp(1.6em, 5vw, 2.3em);
		font-weight: 700;
		line-height: 1.15;
	}

	> .roles {
		opacity: 0.9;
		font-size: 0.95em;

		> .highlight {
			font-weight: 600;
		}
	}

	> .numbers {
		display: flex;
		flex-wrap: wrap;
		gap: 0.4em 1.8em;
		margin-top: 0.7em;

		> li {
			display: flex;
			align-items: baseline;
			gap: 0.35em;
		}

		.value {
			font-family: var(--font-creative);
			font-size: 1.1em;
			font-weight: 600;
			font-variant-numeric: tabular-nums;
		}

		.label {
			opacity: 0.72;
			font-size: 0.76em;
		}
	}
}

.inline-word {
	white-space: nowrap;
}

@keyframes greeting-drift {
	from {
		background-position: 0% 0%, 0% 50%;
	}

	to {
		background-position: 0% 0%, 100% 50%;
	}
}

@media (max-width: 768px) {
	.about-greeting {
		min-height: 9em;
		padding: 1.1em 1.2em;
	}
}

@media (prefers-reduced-motion: reduce) {
	.about-greeting {
		animation: none;
	}
}
</style>
