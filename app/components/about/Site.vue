<script setup lang="ts">
import { aboutSite } from '~/data/about'
</script>

<template>
<section class="card about-site">
	<p class="card-tips" v-text="aboutSite.tips" />

	<h2 class="statement">
		<span v-for="line in aboutSite.lines" :key="line" class="line" v-text="line" />

		<span class="keyword">
			<span v-text="aboutSite.keywordPrefix" />
			<span class="roller" aria-hidden="true">
				<span
					v-for="(word, index) in aboutSite.keywords"
					:key="word"
					class="word"
					:style="{ '--index': index }"
					v-text="word"
				/>
			</span>
			<span class="sr-only" v-text="aboutSite.keywords.join('、')" />
		</span>
	</h2>
</section>
</template>

<style scoped>
.about-site {
	display: flex;
	flex-direction: column;
	gap: 0.5em;
	padding: 1.1em 1.3em;
	border: 1px solid var(--c-flat-card-border);
	background-color: var(--c-flat-card-bg);
}

.statement {
	display: flex;
	flex-direction: column;
	margin-block: auto;
	font-family: var(--font-creative);
	font-size: clamp(1.4em, 4.2vw, 2.1em);
	font-weight: 700;
	line-height: 1.28;
	color: var(--c-text-1);

	> .keyword {
		display: flex;
		align-items: baseline;
		gap: 0.12em;
		font-weight: 500;
		color: var(--c-text-3);
	}
}

.roller {
	display: inline-grid;
	overflow: hidden;
	height: 1.3em;

	> .word {
		grid-area: 1 / 1;
		-webkit-background-clip: text;
		background-clip: text;
		font-weight: 700;
		color: transparent;
		animation: word-cycle 16s ease-in-out infinite;
		animation-delay: calc(var(--index) * -4s);
		will-change: transform, opacity;

		&:nth-child(4n + 1) {
			background-image: linear-gradient(45deg, var(--c-primary), var(--c-accent));
		}

		&:nth-child(4n + 2) {
			background-image: linear-gradient(45deg, #18E198, #0EC15D);
		}

		&:nth-child(4n + 3) {
			background-image: linear-gradient(45deg, #8A7CFB, #633E9C);
		}

		&:nth-child(4n + 4) {
			background-image: linear-gradient(45deg, #FA7671, #F45F7F);
		}
	}
}

.sr-only {
	position: absolute;
	overflow: hidden;
	width: 1px;
	height: 1px;
	margin: -1px;
	padding: 0;
	clip-path: inset(50%);
	white-space: nowrap;
}

@keyframes word-cycle {
	0% {
		opacity: 0;
		transform: translateY(65%);
	}

	1.5%, 22% {
		opacity: 1;
		transform: translateY(0);
	}

	25% {
		opacity: 0;
		transform: translateY(-65%);
	}

	25.1%, 100% {
		opacity: 0;
		transform: translateY(65%);
	}
}

@media (prefers-reduced-motion: reduce) {
	.roller > .word {
		animation: none;

		&:not(:first-child) {
			opacity: 0;
		}

		&:first-child {
			opacity: 1;
			color: transparent;
		}
	}
}
</style>
