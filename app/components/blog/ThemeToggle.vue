<script setup lang="ts">
const appConfig = useAppConfig()
const colorMode = useColorMode()

/** 主题色存储键，与 nuxt.config 里首屏内联脚本保持一致 */
const STORAGE_KEY = 'blog-primary-color'
/** 只接受 #rrggbb，避免历史脏数据把变量写成非法值 */
const HEX_RE = /^#([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i

const colorPickerRef = ref<HTMLInputElement>()
const isMounted = ref(false)
/** 空串表示未选色，跟随 color.css 的默认主题色 */
const primaryColor = ref('')

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
</script>

<template>
<div class="theme-toggle-wrapper">
	<div class="theme-toggle">
		<button
			v-for="(themeData, themeName) in appConfig.themes"
			:key="themeName"
			v-tip="themeData.tip"
			:aria-label="themeData.tip"
			:class="{ active: colorMode.preference === themeName }"
			@click="colorMode.preference = themeName"
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
	width: fit-content;
	padding: 2px;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--c-bg-2);

	> button {
		padding: 4px 1rem;
		border-radius: 1rem;
		transition: all 0.1s;

		&:hover {
			background-color: var(--c-bg-soft);
			color: var(--c-text-1);
		}

		&.active {
			box-shadow: var(--box-shadow-2);
			background-color: var(--ld-bg-card);
			color: var(--c-text-1);
			cursor: auto;
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
