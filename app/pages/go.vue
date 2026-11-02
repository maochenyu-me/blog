<script setup lang="ts">
import type { SafeGoTarget } from '~/types/safego'
import { safeGoConfig } from '~/data/safego'

const { route: routeConfig, behavior, text } = safeGoConfig

definePageMeta({ layout: 'safego' })

useSeoMeta({
	title: text.title,
	robots: 'noindex, nofollow',
})

const currentRoute = useRoute()
const router = useRouter()
const appConfig = useAppConfig()

/**
 * 目标地址只在客户端解析：`/go` 会被 nuxt generate 预渲染成不含查询串的静态壳，
 * 若在 setup 里直接读 route.query，预渲染 HTML 与客户端水合结果会不一致。
 */
const target = shallowRef<SafeGoTarget | null>(null)

const remaining = ref(0)
const hovered = ref(false)
const focused = ref(false)
const visibility = useDocumentVisibility()

const loading = computed(() => target.value === null)
const targetInfo = computed(() => (target.value?.ok ? target.value : null))
const targetError = computed(() => (target.value && !target.value.ok ? target.value : null))
const leaveText = computed(() => text.leave.replace('{site}', appConfig.title))
const riskItems = computed(() => targetInfo.value
	? targetInfo.value.risks.map(kind => ({ kind, text: text.risks[kind] }))
	: [])
const hasCountdown = computed(() => behavior.countdown > 0)
const paused = computed(() =>
	(behavior.pauseOnInteraction && (hovered.value || focused.value))
	|| (behavior.pauseWhenHidden && visibility.value === 'hidden'),
)
const progress = computed(() => {
	if (!hasCountdown.value)
		return 0
	return Math.min(Math.max(remaining.value / behavior.countdown, 0), 1)
})
const countdownText = computed(() => text.countdown.replace('{seconds}', String(Math.max(remaining.value, 0))))

let timer: ReturnType<typeof setInterval> | undefined

function stopTimer() {
	if (timer !== undefined) {
		clearInterval(timer)
		timer = undefined
	}
}

/**
 * 在新标签页打开外链。
 *
 * 返回 false 表示被弹窗拦截（倒计时自动跳转不是用户手势，可能被拦），调用方需退回就地跳转。
 * 不用 `noopener` 特性串：那样 window.open 恒返回 null，无法判断是否真的开成功；
 * 改为拿到句柄后手动断开 opener，安全性相同。
 */
function openTargetInNewTab(href: string) {
	try {
		const opened = window.open(href, '_blank')
		if (!opened)
			return false
		opened.opener = null
		return true
	}
	catch {
		return false
	}
}

/**
 * 浏览器是否允许在这个时机开新标签。
 *
 * 弹窗拦截只认「用户激活」：手动点按钮时有效，倒计时到点的定时器回调里无效
 * （实测 `window.open` 与程序化 `<a target="_blank">.click()` 都会被拦，返回 null / 不建标签）。
 */
function canOpenNewTab() {
	const activation = navigator.userActivation
	return !activation || activation.isActive
}

function jump() {
	if (!targetInfo.value)
		return
	stopTimer()
	const href = targetInfo.value.href
	// 在当前标签页里打开外链会把博客文档整个卸载掉：从外链站返回时浏览器只能重新加载整页，
	// 于是出现「先无样式、随后才补上」的一瞬，滚动位置也保不住。
	// 改成外链在新标签打开、当前标签退回来源页——博客文档从不卸载，这一整类问题随之消失。
	if (window.history.state?.back && canOpenNewTab() && openTargetInNewTab(href)) {
		goBack()
		return
	}
	// 本页是自己新开的标签（无历史可退），或此刻没有用户激活（倒计时自动跳转）：就地跳转
	window.location.replace(href)
}

/** 等待路由切回来源页的上限 */
const SCROLL_RETURN_TIMEOUT_MS = 3_000
/**
 * 锁定滚动位置的上限，从路由切回来源页开始计时。
 * 实测本站 Nuxt 默认 scrollBehavior 会迟到 8 秒以上（见下方说明），所以窗口要给够。
 */
const SCROLL_PIN_WINDOW_MS = 12_000
/** 读者一旦自己操作就立刻停止校正，不和读者抢滚动条 */
const SCROLL_RELEASE_EVENTS = ['wheel', 'touchstart', 'keydown', 'mousedown'] as const

/**
 * 按我们自己记录的来源位置恢复并锁定滚动。
 *
 * 为什么不能只依赖 `router.back()`：实测（2026-11-02，localhost:3000）在本项目里
 * Nuxt 默认的 scrollBehavior 要等 `page:loading:end` 才落位，本站被侧栏 Visitor 的
 * 慢接口拖到 8.5 秒后才开始滚动；而且它用的 savedPosition 与点击时的真实位置
 * 有几十像素出入（实测 627 → 576）。所以两边都不能指望：
 *   1. 先等路由真正切回来源页（切换前就判断「离开」会让循环当场自杀）；
 *   2. 之后每 100ms 校正一次，把迟到的 scrollBehavior 也盖回去；
 *   3. 期间临时关掉 `scroll-behavior: smooth`，避免两股平滑滚动对撞出可见跳动；
 *   4. 读者一动（滚轮/触摸/按键/按住）就立即收手。
 */
function restoreOriginScroll(origin: { path: string, y: number }) {
	const root = document.documentElement
	let waited = 0
	let pinned = 0
	let released = false
	let timer: ReturnType<typeof setInterval> | undefined

	function cleanup() {
		if (released)
			return
		released = true
		if (timer !== undefined)
			clearInterval(timer)
		root.style.removeProperty('scroll-behavior')
		for (const type of SCROLL_RELEASE_EVENTS)
			window.removeEventListener(type, cleanup)
	}

	timer = setInterval(() => {
		if (router.currentRoute.value.path !== origin.path) {
			waited += 100
			// 已经锁定过却又离开了来源页，说明读者去了别处，立即收手
			if (pinned > 0 || waited > SCROLL_RETURN_TIMEOUT_MS)
				cleanup()
			return
		}
		if (pinned === 0) {
			waited = 0
			root.style.setProperty('scroll-behavior', 'auto')
		}
		pinned += 100
		if (pinned > SCROLL_PIN_WINDOW_MS) {
			cleanup()
			return
		}
		const max = document.documentElement.scrollHeight - window.innerHeight
		const top = Math.min(origin.y, Math.max(max, 0))
		if (Math.abs(window.scrollY - top) > 1)
			window.scrollTo({ top, behavior: 'instant' })
	}, 100)

	for (const type of SCROLL_RELEASE_EVENTS)
		window.addEventListener(type, cleanup, { passive: true })
}

function goBack() {
	stopTimer()
	// 同标签页普通点击路径：先退回历史上一页，再用我们自己记录的位置校正滚动
	if (window.history.state?.back) {
		let origin: { path: string, y: number } | null = null
		try {
			origin = parseOrigin(sessionStorage.getItem(SAFEGO_ORIGIN_KEY))
		}
		catch {
			origin = null
		}
		router.back()
		if (origin)
			restoreOriginScroll(origin)
		return
	}
	// 由 window.open 打开的中转页标签可以直接关掉；非脚本打开的标签页浏览器会拒绝 close()
	window.close()
	if (!window.closed)
		navigateTo('/')
}

function startTimer() {
	if (!hasCountdown.value)
		return
	remaining.value = behavior.countdown
	timer = setInterval(() => {
		if (paused.value)
			return
		remaining.value -= 1
		if (remaining.value <= 0)
			jump()
	}, 1000)
}

function onKeydown(event: KeyboardEvent) {
	if (event.key === 'Escape')
		goBack()
}

onMounted(() => {
	const raw = currentRoute.query[routeConfig.param]
	target.value = resolveTarget(typeof raw === 'string' ? raw : undefined, routeConfig.base64)
	if (targetInfo.value)
		startTimer()
	window.addEventListener('keydown', onKeydown)
})

onBeforeUnmount(() => {
	stopTimer()
	window.removeEventListener('keydown', onKeydown)
})
</script>

<template>
<div
	class="safego"
	@mouseenter="hovered = true"
	@mouseleave="hovered = false"
	@focusin="focused = true"
	@focusout="focused = false"
>
	<!-- 骨架：预渲染与首帧都用它，避免水合不一致 -->
	<div v-if="loading" class="safego-card safego-card-skeleton" aria-hidden="true">
		<div class="safego-skeleton-line" style="width: 45%" />
		<div class="safego-skeleton-line" style="width: 70%" />
		<div class="safego-skeleton-line" style="width: 100%" />
		<div class="safego-skeleton-line" style="width: 30%" />
	</div>

	<div v-else-if="targetError" class="safego-card safego-card-error">
		<ZError icon="tabler:link-off" :title="text.invalid" :message="text.invalidDesc">
			<template #operation>
				<ZButton :text="text.home" to="/" />
			</template>
		</ZError>
	</div>

	<div v-else-if="targetInfo" class="safego-card">
		<div
			v-if="hasCountdown"
			class="safego-progress"
			:style="{ transform: `scaleX(${progress})` }"
			aria-hidden="true"
		/>
		<h1 class="safego-leave">
			<Icon name="tabler:alert-triangle" />
			{{ leaveText }}
		</h1>
		<p class="safego-host">
			{{ targetInfo.host }}
		</p>
		<p class="safego-url">
			{{ targetInfo.href }}
		</p>
		<ul v-if="riskItems.length" class="safego-risks">
			<li v-for="risk in riskItems" :key="risk.kind">
				<Icon name="tabler:alert-circle" />
				<span>{{ risk.text }}</span>
			</li>
		</ul>
		<p class="safego-countdown" aria-live="polite">
			{{ hasCountdown ? countdownText : text.manual }}
		</p>
		<div class="safego-actions">
			<ZButton primary icon="tabler:external-link" :text="text.jump" @click="jump" />
			<ZButton icon="tabler:arrow-back-up" :text="text.back" @click="goBack" />
		</div>
	</div>
</div>
</template>

<style scoped>
.safego {
	width: 100%;
	max-width: 560px;
	/* 在布局的 flex 容器里双向居中，且内容超出时不会被裁掉顶部 */
	margin: auto;
}

.safego-card {
	position: relative;
	overflow: hidden;
	width: 100%;
	padding: 2rem;
	border: 1px solid var(--c-border);
	border-radius: 0.75rem;
	box-shadow: var(--box-shadow-2);
	background-color: var(--ld-bg-card);
	animation: float-in var(--motion-duration) var(--motion-easing) backwards;
}

/* 贴在卡片顶边、从左向右收缩的倒计时进度条 */
.safego-progress {
	position: absolute;
	inset-block-start: 0;
	inset-inline: 0;
	height: 2px;
	background-color: var(--c-primary);
	/* --start 在 RTL 下会自动变成 right */
	transform-origin: var(--start) center;
	transition: transform 1s linear;
}

.safego-card-skeleton {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	min-height: 11rem;
}

.safego-skeleton-line {
	height: 0.9rem;
	border-radius: 0.3rem;
	background-color: var(--c-bg-2);
}

.safego-card-error {
	padding-block: 2.5rem;
}

.safego-leave {
	display: flex;
	align-items: center;
	gap: 0.4em;
	margin-bottom: 1.25rem;
	font-size: 1rem;
	font-weight: 600;
	color: var(--c-text-2);

	> .iconify {
		color: var(--c-warning);
	}
}

.safego-host {
	overflow-wrap: anywhere;
	font-size: 1.75rem;
	font-weight: 700;
	line-height: 1.2;
	color: var(--c-primary);
}

.safego-url {
	overflow-wrap: anywhere;
	margin-top: 0.5rem;
	font-family: var(--font-monospace);
	font-size: 0.8rem;
	line-height: 1.5;
	color: var(--c-text-3);
}

.safego-risks {
	display: flex;
	flex-direction: column;
	gap: 0.3rem;
	margin-top: 1rem;
	font-size: 0.85rem;
	color: var(--c-warning);

	> li {
		display: flex;
		align-items: baseline;
		gap: 0.35em;
	}
}

.safego-countdown {
	margin-top: 1.5rem;
	font-size: 0.9rem;
	color: var(--c-text-2);
}

.safego-actions {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	margin-top: 1.25rem;
}

@media (max-width: 528px) {
	.safego-card {
		padding: 1.25rem;
	}

	.safego-host {
		font-size: 1.375rem;
	}
}

/* 全局的 prefers-reduced-motion 规则只覆盖 :root 的 transition 与 .float-in-* 过渡类，
   不会关掉本卡片自己的 animation，需要在这里单独降级 */
@media (prefers-reduced-motion: reduce) {
	.safego-card {
		animation: none;
	}

	.safego-progress {
		transition: none;
	}
}
</style>
