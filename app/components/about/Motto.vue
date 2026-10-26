<script setup lang="ts">
import { aboutMotto } from '~/data/about'
</script>

<template>
<section class="card about-motto">
	<p class="card-tips" v-text="aboutMotto.tips" />

	<blockquote class="quote" v-text="aboutMotto.text" />

	<p class="from" v-text="aboutMotto.from" />
</section>
</template>

<style scoped>
.about-motto {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	padding: 1.1em 1.3em;
	border: 1px dashed var(--c-flat-card-border);
	background-color: var(--c-flat-card-bg);
}

.quote {
	position: relative;
	margin-block: auto;
	padding-inline-start: 1.1em;
	font-family: var(--font-serif);
	font-size: clamp(1.05em, 2.6vw, 1.35em);
	line-height: 1.6;
	text-wrap: balance;
	color: var(--c-text-1);

	&::before {
		content: "“";
		position: absolute;
		inset-block-start: -0.1em;
		inset-inline-start: -0.1em;
		font-size: 2.6em;
		line-height: 1;
		color: var(--c-primary-soft);
	}
}

.from {
	font-size: 0.76em;
	text-align: end;
	color: var(--c-text-3);
}
</style>
