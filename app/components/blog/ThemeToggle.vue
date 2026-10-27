<script setup lang="ts">
const appConfig = useAppConfig()
const colorMode = useColorMode()
/** 系统「减少动态效果」时不铺任何过渡 */
const reducedMotion = usePreferredReducedMotion()

/** 主题色存储键，与 nuxt.config 里首屏内联脚本保持一致 */
const STORAGE_KEY = 'blog-primary-color'
/** 只接受 #rrggbb，避免历史脏数据把变量写成非法值 */
const HEX_RE = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i
/** 降级过渡用的类名与时长，与 animation.css 里的 --theme-fallback-duration 对应 */
const FALLBACK_CLASS = 'theme-transition'
const FALLBACK_DURATION = 340
/** 圆形扩散的圆心/半径变量，动画结束后清掉，避免影响下一次计算 */
const THEME_VARS = ['--theme-x', '--theme-y', '--theme-radius']

const colorPickerRef = ref<HTMLInputElement>()
const isMounted = ref(false)
/** 空串表示未选色，跟随 color.css 的默认主题色 */
const primaryColor = ref('')

/** 主题按钮的顺序与数量，滑动指示器据此定位 */
const themeNames = computed(() => Object.keys(appConfig.themes))
const activeIndex = computed(() => Math.max(0, themeNames.value.indexOf(colorMode.preference)))
const indicatorStyle = computed(() => ({
	'--theme-count': themeNames.value.length || 1,
	'--theme-index': activeIndex.value,
}))

let fallbackTimer: ReturnType<typeof setTimeout> | undefined
/** 连点作废旧动画的收尾，避免它把新一轮写进去的变量删掉 */
let transitionSeq = 0

interface ViewTransitionHandle {
	ready: Promise<void>
	finished: Promise<void>
}

type DocumentWithViewTransition = Document & {
	startViewTransition?: (callback: () => Promise<void>) => ViewTransitionHandle
}

function hexToHsl(hex: string): { h: number, s: number, l: number } | null {
	const result = HEX_RE.exec(hex)
	if (!result)
		return null

	const r = Number.parseInt(result[1]!, 16) / 255
	const g = Number.parseInt(result[2]!, 16) / 255
	const b = Number.parseInt(result[3]!, 16) / 255

	const max = Math.max(r, g, b)
	const min = Math.min(r, g, b)
	const l = (max + min) / 2
	let h = 0
	let s = 0

	if (max !== min) {
		const d = max - min
		s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

		switch (max) {
			case r:
				h = ((g - b) / d + (g < b ? 6 : 0)) / 6
				break
			case g:
				h = ((b - r) / d + 2) / 6
				break
			case b:
				h = ((r - g) / d + 4) / 6
				break
		}
	}

	return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) }
}

/** 把所选颜色写进根元素变量，全站 --c-primary/--c-primary-soft 随之重算 */
function applyPrimaryColor(color: string) {
	const hsl = color ? hexToHsl(color) : null
	const root = document.documentElement.style

	if (!hsl) {
		// 清空内联变量，回落到 color.css 的默认值
		for (const name of ['--c-primary-h', '--c-primary-s', '--c-primary-l', '--c-primary-base'])
			root.removeProperty(name)
		return
	}

	root.setProperty('--c-primary-h', `${hsl.h}deg`)
	root.setProperty('--c-primary-s', `${hsl.s}%`)
	root.setProperty('--c-primary-l', `${hsl.l}%`)
	root.setProperty('--c-primary-base', color)
}

/**
 * 点击坐标 → 圆形扩散的圆心与半径（半径取到离圆心最远的视口角落）。
 * 键盘回车触发的 click 没有有效坐标，退化到按钮中心。
 */
function resolveOrigin(event: MouseEvent, button: HTMLElement | null) {
	const rect = button?.getBoundingClientRect()
	const hasPoint = event.clientX > 0 || event.clientY > 0
	const x = hasPoint ? event.clientX : (rect ? rect.left + rect.width / 2 : window.innerWidth / 2)
	const y = hasPoint ? event.clientY : (rect ? rect.top + rect.height / 2 : 0)
	const radius = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
	return { x, y, radius }
}

/** 降级路径：不支持 View Transition 时，一次性把全站颜色纳入同一段过渡 */
function swapWithFallback(preference: string) {
	const root = document.documentElement
	root.classList.add(FALLBACK_CLASS)
	// 强制一次样式计算：过渡属性与配色若在同一帧内一起变，浏览器不会启动过渡
	void getComputedStyle(root).transitionProperty
	colorMode.preference = preference
	clearTimeout(fallbackTimer)
	fallbackTimer = setTimeout(() => root.classList.remove(FALLBACK_CLASS), FALLBACK_DURATION)
}

function switchTheme(preference: string, event: MouseEvent) {
	if (preference === colorMode.preference)
		return

	const root = document.documentElement
	/** 「跟随系统」要换算成实际明暗，才能判断这次是否真会改到视觉 */
	const targetValue = preference === 'system'
		? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')
		: preference

	// 系统要求减少动态效果：直接切，不铺任何过渡
	if (reducedMotion.value === 'reduce') {
		colorMode.preference = preference
		return
	}

	// 实际明暗没变（如从「跟随系统」切到等价的固定值）：只记偏好，不放空动画
	if (targetValue === colorMode.value) {
		colorMode.preference = preference
		return
	}

	// 文章转场正在跑时让位，用整页渐变降级，避免抢占同一个 View Transition
	const startViewTransition = (document as DocumentWithViewTransition).startViewTransition
	if (!startViewTransition || root.hasAttribute('data-article-transition')) {
		swapWithFallback(preference)
		return
	}

	const { x, y, radius } = resolveOrigin(event, event.currentTarget as HTMLElement | null)
	const seq = ++transitionSeq

	root.style.setProperty('--theme-x', `${x}px`)
	root.style.setProperty('--theme-y', `${y}px`)
	root.style.setProperty('--theme-radius', `${radius}px`)
	root.dataset.themeTransition = ''

	let transition: ViewTransitionHandle
	try {
		transition = startViewTransition.call(document, async () => {
			colorMode.preference = preference
			// 等 <html> 上的类名落地，快照才抓得到新配色
			await nextTick()
		})
	}
	catch {
		delete root.dataset.themeTransition
		for (const name of THEME_VARS)
			root.style.removeProperty(name)
		swapWithFallback(preference)
		return
	}

	transition.ready.catch(() => {})
	transition.finished.catch(() => {}).finally(() => {
		if (seq !== transitionSeq)
			return
		delete root.dataset.themeTransition
		for (const name of THEME_VARS)
			root.style.removeProperty(name)
	})
}

function handleColorChange(event: Event) {
	const color = (event.target as HTMLInputElement).value
	primaryColor.value = color
	applyPrimaryColor(color)
	try {
		localStorage.setItem(STORAGE_KEY, color)
	}
	catch {}
}

function openColorPicker() {
	const input = colorPickerRef.value
	if (!input)
		return

	// 还没选过色时，让取色器从当前主题色起步，而不是默认的黑色
	if (!primaryColor.value) {
		const base = getComputedStyle(document.documentElement).getPropertyValue('--c-primary-base').trim()
		if (HEX_RE.test(base))
			input.value = base
	}

	input.click()
}

onMounted(() => {
	isMounted.value = true

	try {
		const stored = localStorage.getItem(STORAGE_KEY) ?? ''
		if (stored)
			primaryColor.value = stored
	}
	catch {}

	// 首屏已由内联脚本应用，这里再对一次，保证与当前存储一致
	applyPrimaryColor(primaryColor.value)
})

onUnmounted(() => {
	clearTimeout(fallbackTimer)
	document.documentElement.classList.remove(FALLBACK_CLASS)
	delete document.documentElement.dataset.themeTransition
	for (const name of THEME_VARS)
		document.documentElement.style.removeProperty(name)
})
</script>

<template>
<div class="theme-toggle-wrapper">
	<div
		class="theme-toggle"
		:class="{ mounted: isMounted }"
		:style="indicatorStyle"
	>
		<span class="thumb" aria-hidden="true" />
		<button
			v-for="(themeData, themeName) in appConfig.themes"
			:key="themeName"
			v-tip="themeData.tip"
			:aria-label="themeData.tip"
			:aria-pressed="colorMode.preference === themeName"
			:class="{ active: colorMode.preference === themeName }"
			@click="switchTheme(themeName, $event)"
		>
			<Icon :name="themeData.icon" />
		</button>
	</div>

	<!-- 主题色：点击圆点唤起系统取色器 -->
	<button
		v-tip="'切换主题色'"
		class="color-picker-btn"
		aria-label="切换主题色"
		@click="openColorPicker"
	>
		<span class="color-dot" />
	</button>
	<input
		ref="colorPickerRef"
		type="color"
		class="color-input"
		:value="isMounted ? primaryColor || undefined : undefined"
		aria-label="选择主题色"
		tabindex="-1"
		@input="handleColorChange"
	>
</div>
</template>

<style scoped>
.theme-toggle-wrapper {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.5em;
	position: relative;
}

.theme-toggle {
	display: flex;
	gap: 3px;
	position: relative;
	width: fit-content;
	padding: 2px;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--c-bg-2);
	/* 明暗切换时自身也跟着过渡，别在扩散动画结束的瞬间跳一下 */
	transition: background-color 0.3s var(--theme-motion-easing), border-color 0.3s var(--theme-motion-easing);

	/* 滑动指示器：宽度按按钮数量均分（按钮内含同字号单图标，宽度必然一致） */
	/* 位移用「100% + gap」的倍数，纯 CSS 就能跟随 active 索引，无需测量 */
	> .thumb {
		position: absolute;
		top: 2px;
		bottom: 2px;
		left: 2px;
		width: calc((100% - 4px - (var(--theme-count) - 1) * 3px) / var(--theme-count));
		border-radius: 1rem;
		/* 暗色下卡片色与轨道只差几档明度，补一圈内描边让指示器立得住 */
		box-shadow: var(--box-shadow-2), inset 0 0 0 1px var(--c-bg-soft);
		background-color: var(--ld-bg-card);
		transform: translateX(calc(var(--theme-index) * (100% + 3px)));
		pointer-events: none;
		z-index: 0;
	}

	/* 首屏同步偏好前不动，避免水合后指示器从中间「游」到右边 */
	&.mounted > .thumb {
		transition:
			transform 0.42s cubic-bezier(0.16, 1, 0.3, 1),
			background-color 0.3s var(--theme-motion-easing),
			box-shadow 0.3s var(--theme-motion-easing);
	}

	> button {
		flex: none;
		position: relative;
		padding: 4px 1rem;
		border-radius: 1rem;
		color: var(--c-text-2);
		transition:
			color 0.2s var(--theme-motion-easing),
			background-color 0.2s var(--theme-motion-easing);
		z-index: 1;

		&:hover:not(.active) {
			background-color: var(--c-bg-soft);
			color: var(--c-text-1);
		}

		&.active {
			color: var(--c-text-1);
			cursor: auto;

			> .iconify {
				transform: scale(1.08);
			}
		}

		> .iconify {
			transition: transform 0.42s cubic-bezier(0.16, 1, 0.3, 1);
		}
	}
}

.color-picker-btn {
	display: flex;
	align-items: center;
	justify-content: center;
	position: relative;
	width: 1.5em;
	height: 1.5em;
	padding: 0;
	border: none;
	background-color: transparent;
	cursor: pointer;
}

.color-dot {
	display: block;
	position: relative;
	width: 1.25em;
	height: 1.25em;
	border-radius: 50%;
	background-color: var(--c-primary-base);
	transition: transform 0.2s;

	/* 外层描边跟随明暗主题 */
	&::before {
		content: "";
		position: absolute;
		inset: -0.2em;
		border: 2px solid var(--c-text-2);
		border-radius: 50%;
		transition: all 0.2s;
	}

	/* 内层高光，让深色也看得出是色块 */
	&::after {
		content: "";
		position: absolute;
		inset: 0;
		border-radius: 50%;
		box-shadow: inset 0 0 0 1px hsl(0deg 0% 100% / 30%);
	}

	.color-picker-btn:hover & {
		transform: scale(1.12);
	}
}

/* 隐藏但保持可点：display:none 会让部分浏览器拒绝弹出取色器 */
.color-input {
	position: absolute;
	opacity: 0;
	inset: 0;
	width: 100%;
	height: 100%;
	pointer-events: none;
}
</style>
