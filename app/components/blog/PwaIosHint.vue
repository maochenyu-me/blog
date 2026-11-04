<script setup lang="ts">
/**
 * iOS 一次性安装引导。
 *
 * iOS 上 `beforeinstallprompt` 不被支持，Safari 也不给任何安装提示——
 * 入口藏在「分享 → 添加到主屏幕」里。这里补一条一次性提示条，
 * 关闭后写标记，不再出现。桌面与安卓端零 DOM 影响（`visible` 保持 false，不渲染节点）。
 */
const STORAGE_KEY = 'blog-pwa-ios-hint-dismissed'

const appConfig = useAppConfig()
const visible = ref(false)
const hintEl = useTemplateRef('pwa-ios-hint')

// 提示条会压住右下角的悬浮按钮，注册为避让目标让它自动上移（见 app/composables/useAvoid.ts）
useAvoidTarget(hintEl, visible)

function isIos() {
	return /iPad|iPhone|iPod/.test(navigator.userAgent)
		// iPadOS 13+ 的 UA 伪装成 macOS，只能靠触摸点数区分，漏判会让 iPad 看不到引导
		|| (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
	return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone)
		|| window.matchMedia('(display-mode: standalone)').matches
}

function isDismissed() {
	try {
		return localStorage.getItem(STORAGE_KEY) !== null
	}
	catch {
		// 存储不可用时读不到标记，按「未关闭过」处理
		return false
	}
}

function dismiss() {
	visible.value = false
	try {
		localStorage.setItem(STORAGE_KEY, '1')
	}
	catch {}
}

// 判定必须在 onMounted 之后：SSR / 预渲染阶段没有 window
onMounted(() => {
	if (isIos() && !isStandalone() && !isDismissed())
		visible.value = true
})
</script>

<template>
<aside
	v-if="visible"
	ref="pwa-ios-hint"
	class="pwa-ios-hint"
	aria-label="安装到主屏幕提示"
>
	<Icon class="hint-icon" name="tabler:share" aria-hidden="true" />

	<div class="hint-text">
		<p class="hint-title">
			把「{{ appConfig.title }}」装到主屏幕
		</p>
		<p class="hint-desc">
			点「分享」按钮，选「添加到主屏幕」，以后就能像 App 一样打开。
		</p>
	</div>

	<button type="button" class="hint-close" aria-label="关闭安装提示" @click="dismiss">
		<Icon name="tabler:x" />
	</button>
</aside>
</template>

<style scoped>
.pwa-ios-hint {
	display: flex;
	align-items: center;
	gap: 0.6rem;
	position: fixed;
	inset-inline: 0;
	bottom: 0;
	padding: 0.7rem 0.9rem;
	/* 让开 iPhone 底部横条与 Safari 工具栏 */
	padding-bottom: calc(0.7rem + env(safe-area-inset-bottom));
	border-top: 1px solid var(--c-border);
	box-shadow: var(--box-shadow-3);
	background-color: var(--c-bg-a80);
	backdrop-filter: blur(0.5rem);
	color: var(--c-text);
	z-index: var(--z-index-popover);

	@media (min-width: 528px) {
		inset-inline: 1rem;
		bottom: 1rem;
		width: fit-content;
		max-width: min(34rem, calc(100% - 2rem));
		margin-inline: auto;
		padding: 0.7rem 0.9rem;
		border: 1px solid var(--c-border);
		border-radius: 0.75rem;
	}

	@media (min-width: 768px) {
		gap: 0.8rem;
		padding: 0.8rem 1rem;
	}

	@media (min-width: 1080px) {
		max-width: 38rem;
	}
}

.hint-icon {
	flex: none;
	font-size: 1.6rem;
	color: var(--c-primary);
}

.hint-text {
	flex: 1 1 auto;
	min-width: 0;
}

.hint-title {
	font-size: 0.95rem;
	font-weight: 600;
	line-height: 1.4;
}

.hint-desc {
	margin-top: 0.1em;
	font-size: 0.8rem;
	line-height: 1.4;
	color: var(--c-text-2);
}

.hint-close {
	display: grid;
	flex: none;
	place-items: center;
	width: 2.75rem;
	height: 2.75rem;
	border-radius: 50%;
	color: var(--c-text-2);
	transition: color 0.2s, background-color 0.2s;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-text);
	}
}
</style>
