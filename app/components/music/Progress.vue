<script setup lang="ts">
const props = withDefaults(defineProps<{
	/** 播放进度，0~100 */
	value: number
	/** 已缓冲进度，0~100 */
	buffered?: number
	label?: string
}>(), {
	buffered: 0,
	label: '播放进度',
})

const emit = defineEmits<{ seek: [percent: number] }>()

const rail = useTemplateRef('progress-rail')
const dragging = ref(false)
const preview = ref(0)

const shown = computed(() => dragging.value
	? preview.value
	: Math.min(100, Math.max(0, Number.isFinite(props.value) ? props.value : 0)))

function percentAt(event: PointerEvent) {
	const el = rail.value
	if (!el)
		return 0
	const rect = el.getBoundingClientRect()
	if (rect.width <= 0)
		return 0
	return Math.min(100, Math.max(0, ((event.clientX - rect.left) / rect.width) * 100))
}

function onDown(event: PointerEvent) {
	dragging.value = true
	preview.value = percentAt(event)
	;(event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId)
}

function onMove(event: PointerEvent) {
	if (dragging.value)
		preview.value = percentAt(event)
}

function onUp(event: PointerEvent) {
	if (!dragging.value)
		return
	dragging.value = false
	emit('seek', percentAt(event))
}

function nudge(delta: number) {
	emit('seek', Math.min(100, Math.max(0, shown.value + delta)))
}
</script>

<template>
<div
	ref="progress-rail"
	class="music-progress"
	role="slider"
	tabindex="0"
	:aria-label="label"
	aria-valuemin="0"
	aria-valuemax="100"
	:aria-valuenow="Math.round(shown)"
	@pointerdown="onDown"
	@pointermove="onMove"
	@pointerup="onUp"
	@pointercancel="onUp"
	@keydown.left.prevent="nudge(-5)"
	@keydown.right.prevent="nudge(5)"
	@keydown.home.prevent="nudge(-100)"
	@keydown.end.prevent="nudge(100)"
>
	<span class="rail">
		<span class="buffered" :style="{ width: `${Math.max(0, buffered)}%` }" />
		<span class="fill" :style="{ width: `${shown}%` }" />
	</span>
	<span class="thumb" :class="{ 'is-dragging': dragging }" :style="{ left: `${shown}%` }" />
</div>
</template>

<style scoped>
.music-progress {
	display: block;
	position: relative;
	inline-size: 100%;
	padding-block: 0.4rem;
	cursor: pointer;
	touch-action: none;

	&:focus-visible {
		border-radius: 0.5rem;
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}
}

.rail {
	display: block;
	position: relative;
	overflow: hidden;
	block-size: 0.25rem;
	border-radius: 1rem;
	background-color: var(--c-bg-soft);
}

.buffered,
.fill {
	position: absolute;
	inset-block: 0;
	inset-inline-start: 0;
	border-radius: 1rem;
	pointer-events: none;
}

.buffered {
	background-color: var(--c-bg-3);
}

.fill {
	background-color: var(--c-primary);
}

.thumb {
	position: absolute;
	inset-block-start: 50%;
	block-size: 0.6rem;
	inline-size: 0.6rem;
	margin-inline-start: -0.3rem;
	border-radius: 50%;
	box-shadow: 0 0 0 2px var(--c-bg-1);
	background-color: var(--c-primary);
	transform: translateY(-50%) scale(0);
	transition: transform 0.2s;
	pointer-events: none;
}

.music-progress:hover .thumb,
.music-progress:focus-visible .thumb,
.thumb.is-dragging {
	transform: translateY(-50%) scale(1);
}

@media (prefers-reduced-motion: reduce) {
	.thumb {
		transition: none;
	}
}
</style>
