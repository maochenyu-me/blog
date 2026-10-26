<script setup lang="ts">
import { aboutTagColumns } from '~/data/about'

const appConfig = useAppConfig()
</script>

<template>
<section class="about-profile">
	<ul class="about-tags tags-left">
		<li v-for="tag in aboutTagColumns.left" :key="tag" class="tag" v-text="tag" />
	</ul>

	<div class="avatar-box">
		<NuxtImg
			class="avatar"
			:src="appConfig.author.avatar"
			:alt="appConfig.author.name"
			width="180"
			height="180"
			densities="1x 2x"
			loading="eager"
			fetchpriority="high"
		/>
	</div>

	<ul class="about-tags tags-right">
		<li v-for="tag in aboutTagColumns.right" :key="tag" class="tag" v-text="tag" />
	</ul>
</section>
</template>

<style scoped>
.about-profile {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	padding: 1.5em 1em 1.2em;
	user-select: none;
}

.avatar-box {
	flex-shrink: 0;
	position: relative;
	width: clamp(7.5em, 22vw, 11.25em);
	aspect-ratio: 1;
	border-radius: 50%;
	background-image: radial-gradient(circle at 50% 45%, var(--c-primary-soft), transparent 68%);
	transition: transform 0.3s;

	&:hover {
		transform: scale(1.02);
	}

	> .avatar {
		width: 100%;
		height: 100%;
		border-radius: 50%;
		box-shadow: 0 0 0 1px var(--c-border), var(--box-shadow-3);
		object-fit: cover;
	}
}

.about-tags {
	display: flex;
	flex-direction: column;
	gap: 0.45em;
	max-width: 11em;

	&.tags-left {
		align-items: flex-end;

		/* 首尾标签向头像方向错位，形成前后景感 */
		> .tag:first-child,
		> .tag:last-child {
			margin-inline-end: -1em;
		}
	}

	&.tags-right {
		align-items: flex-start;

		> .tag:first-child,
		> .tag:last-child {
			margin-inline-start: -1em;
		}
	}

	> .tag {
		padding: 0.15em 0.7em;
		border: 1px solid var(--c-flat-card-border);
		border-radius: 2em;
		box-shadow: var(--box-shadow-1);
		background-color: var(--c-flat-card-bg);
		font-size: 0.78em;
		white-space: nowrap;
		color: var(--c-text-2);
		animation: tag-float 6s ease-in-out infinite;
		will-change: transform;

		&:nth-child(2) {
			animation-delay: 0.6s;
		}

		&:nth-child(3) {
			animation-delay: 1.2s;
		}

		&:nth-child(4) {
			animation-delay: 1.8s;
		}
	}
}

@keyframes tag-float {
	0%, 100% {
		transform: translateY(-2px);
	}

	50% {
		transform: translateY(2px);
	}
}

@media (max-width: 768px) {
	.about-profile {
		flex-direction: column;
		gap: 0.7em;
		padding: 1.2em 0.5em 0.8em;
	}

	.about-tags {
		flex-direction: row;
		flex-wrap: wrap;
		justify-content: center;
		gap: 0.4em;
		max-width: 100%;

		&.tags-left,
		&.tags-right {
			align-items: center;

			> .tag:first-child,
			> .tag:last-child {
				margin: 0;
			}
		}
	}
}

@media (prefers-reduced-motion: reduce) {
	.about-tags > .tag {
		animation: none;
	}
}
</style>
