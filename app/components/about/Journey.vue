<script setup lang="ts">
import { aboutMilestones } from '~/data/about'

// 与友链页同构：长文写在 content/about.md，页面只负责渲染
const { data: post } = await useAsyncData(
	'content:/about',
	() => queryCollection('content').path('/about').first(),
)
</script>

<template>
<section class="card about-journey">
	<p class="card-tips">
		心路历程
	</p>

	<ol class="milestones">
		<li v-for="milestone in aboutMilestones" :key="`${milestone.time}-${milestone.title}`">
			<span class="time" v-text="milestone.time" />

			<div class="body">
				<h3 v-text="milestone.title" />
				<p v-text="milestone.desc" />
			</div>
		</li>
	</ol>

	<div class="doc">
		<ContentRenderer
			v-if="post"
			class="article"
			:value="post"
		/>
		<p v-else class="text-center">
			可于 content/about.md 补充本站说明。
		</p>
	</div>
</section>
</template>

<style scoped>
.about-journey {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	padding: 1.1em 1.3em;
	border: 1px solid var(--c-flat-card-border);
	background-color: var(--c-flat-card-bg);
}

.milestones {
	display: flex;
	flex-direction: column;
	margin-block: 0.3em 0.6em;

	> li {
		display: grid;
		grid-template-columns: 4.5em minmax(0, 1fr);
		column-gap: 0.9em;

		&:last-child > .body {
			padding-bottom: 0;
		}
	}

	> li > .time {
		padding-block-start: 0.25em;
		font-size: 0.78em;
		text-align: end;
		color: var(--c-text-3);
		font-variant-numeric: tabular-nums;
	}

	> li > .body {
		position: relative;
		padding-block-end: 1.1em;
		padding-inline-start: 1em;
		border-inline-start: 1px solid var(--c-border);

		&::before {
			content: "";
			position: absolute;
			inset-block-start: 0.55em;
			inset-inline-start: -0.3em;
			width: 0.6em;
			height: 0.6em;
			border-radius: 50%;
			box-shadow: 0 0 0 3px var(--c-flat-card-bg);
			background-color: var(--c-primary);
		}

		> h3 {
			font-family: var(--font-creative);
			font-size: 1em;
			font-weight: 600;
			line-height: 1.4;
			color: var(--c-text-1);
		}

		> p {
			margin-block-start: 0.2em;
			font-size: 0.85em;
			line-height: 1.7;
			color: var(--c-text-2);
		}
	}
}

.doc {
	padding-block-start: 0.4em;
	border-block-start: 1px dashed var(--c-flat-card-border);

	/* 正文卡片自带外边距，这里贴着卡片内边距排 */
	:deep(.article) {
		margin: 0.6em 0 0;

		> :first-child {
			margin-block-start: 0;
		}
	}
}

@media (max-width: 528px) {
	.milestones {
		> li {
			grid-template-columns: minmax(0, 1fr);
			row-gap: 0.15em;
		}

		> li > .time {
			padding-inline-start: 1em;
			text-align: start;
		}

		> li > .body {
			padding-inline-start: 1em;
			border-inline-start: none;
		}
	}
}
</style>
