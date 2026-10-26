<script setup lang="ts">
import type { LrcLine } from '~/types/music'

const props = defineProps<{
	lines: LrcLine[]
	/** 当前高亮行，-1 表示还没开始 */
	active: number
}>()

const box = useTemplateRef('lyrics-box')
const reducedMotion = usePreferredReducedMotion()

function scrollToActive(smooth = true) {
	const el = box.value
	if (!el)
		return
	const line = el.querySelector<HTMLElement>('[data-active="true"]')
	if (!line)
		return
	// 必须用 rect 差值来算：offsetTop 的参照物是「最近的定位祖先」，这里是 .music-panel 而不是滚动容器，
	// 直接拿 offsetTop 会多滚掉「容器距面板顶部」那段距离，导致高亮行被滚出可视区（实测滚到容器上方 80px）。
	const delta = line.getBoundingClientRect().top - el.getBoundingClientRect().top
	const top = el.scrollTop + delta - el.clientHeight / 2 + line.offsetHeight / 2
	el.scrollTo({
		top,
		behavior: smooth && reducedMotion.value !== 'reduce' ? 'smooth' : 'auto',
	})
}

// active 变化要跟着滚；切歌时 active 可能同为 0 而 lines 换了，所以连 lines 一起监听
watch(() => [props.active, props.lines], () => scrollToActive(), { flush: 'post' })
onMounted(() => scrollToActive(false))
</script>

<template>
<div ref="lyrics-box" class="music-lyrics" aria-hidden="true">
	<p
		v-for="(line, i) in lines"
		:key="`${line.time}-${i}`"
		:data-active="i === active"
		class="line"
	>
		{{ line.text }}
	</p>
</div>
</template>

<style scoped>
.music-lyrics {
	display: flex;
	flex-direction: column;
	gap: 0.35rem;
	overflow: hidden auto;
	max-block-size: 5.5rem;
	/* 上下渐隐，避免文字被硬生生截断 */
	mask-image: linear-gradient(to bottom, transparent, #FFF 22%, #FFF 78%, transparent);
	font-size: 0.8em;
	line-height: 1.5;
	text-align: center;
	scrollbar-width: none;

	&::-webkit-scrollbar {
		display: none;
	}
}

.line {
	color: var(--c-text-3);
	transition: color 0.2s;

	&[data-active="true"] {
		font-weight: 600;
		color: var(--c-primary);
	}
}

@media (prefers-reduced-motion: reduce) {
	.line {
		transition: none;
	}
}
</style>
