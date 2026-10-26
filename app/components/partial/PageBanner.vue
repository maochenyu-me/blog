<script setup lang="ts">
withDefaults(defineProps<{
	/** 头图地址，留空时使用主题色渐变兜底 */
	image?: string
	title?: string
	description?: string
	/** 卡片最小高度 */
	height?: string
}>(), {
	image: '',
	title: '',
	description: '',
	height: '16rem',
})
</script>

<template>
<section class="page-banner" :class="{ 'has-image': !!image }" :style="{ '--banner-height': height }">
	<img
		v-if="image"
		class="banner-image"
		:src="image"
		:alt="title"
		fetchpriority="high"
		decoding="async"
	>
	<div class="banner-mask" />

	<div class="banner-content">
		<h1 v-if="title" class="banner-title" v-text="title" />
		<p v-if="description" class="banner-desc" v-text="description" />
	</div>

	<div v-if="$slots.default" class="banner-extra">
		<slot />
	</div>
</section>
</template>

<style scoped>
.page-banner {
	position: relative;
	isolation: isolate;
	display: flex;
	align-items: flex-end;
	overflow: hidden;
	min-height: var(--banner-height, 16rem);
	/* 与下方说说列表的 1rem 内边距对齐，四边留白一致 */
	margin: 1rem;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);
	box-shadow: var(--box-shadow-1);

	> .banner-image {
		position: absolute;
		inset: 0;
		width: 100%;
		height: 100%;
		object-fit: cover;
		z-index: -2;
	}

	/* 无头图时用中性灰层次 + 极淡主题光撑出版面，跟说说卡片保持同一套灰阶 */
	&:not(.has-image) {
		border-color: transparent;
		background-image:
			radial-gradient(110% 150% at 6% 0%, color-mix(in oklab, var(--c-primary) 14%, transparent), transparent 58%),
			linear-gradient(135deg, var(--c-flat-card-bg), var(--c-flat-card-bg-2));

		> .banner-content {
			/* 标题贴顶、描述贴底，版式与有头图时保持一致 */
			justify-content: space-between;
			width: 100%;
			min-height: inherit;
		}
	}

	> .banner-mask {
		display: none;
		position: absolute;
		inset: 0;
		background-image:
			linear-gradient(to var(--end), hsl(220deg 10% 4% / 72%), transparent 75%),
			linear-gradient(to top, hsl(220deg 10% 4% / 65%), transparent 65%);
		z-index: -1;
	}

	> .banner-content {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		padding: 1rem;
		text-shadow: none;
		color: var(--c-text-1);

		> .banner-title {
			font-family: var(--font-creative);
			font-size: clamp(1.75rem, 4vw, 2.4rem);
			font-weight: 700;
			letter-spacing: 0.02em;
			line-height: 1.15;
		}

		> .banner-desc {
			max-width: 32em;
			font-size: clamp(0.85rem, 1.6vw, 0.95rem);
			line-height: 1.5;
			color: var(--c-text-3);
		}
	}

	/* 有头图时文字压在图上看，靠渐变遮罩保证可读性 */
	&.has-image {
		> .banner-mask {
			display: block;
		}

		> .banner-content {
			justify-content: space-between;
			width: 100%;
			height: 100%;
			min-height: inherit;
			text-shadow: var(--text-shadow-black);
			color: #FFF;

			> .banner-desc {
				opacity: 0.88;
				color: inherit;
			}
		}
	}

	> .banner-extra {
		display: flex;
		align-items: flex-end;
		justify-content: flex-end;
		gap: 0.5em;
		position: absolute;
		right: 1rem;
		bottom: 1rem;
	}
}

@media (max-width: 768px) {
	.page-banner {
		margin: 0.5rem;

		> .banner-content {
			padding: 0.75rem 1rem;
		}
	}
}
</style>
