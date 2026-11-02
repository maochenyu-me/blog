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

function jump() {
	if (!targetInfo.value)
		return
	stopTimer()
	// 用 replace 而非 href：历史栈里不留中转页，外部站点按返回键直接回到博客原位置
	window.location.replace(targetInfo.value.href)
}

function goBack() {
	stopTimer()
	// 同标签页普通点击路径：Vue Router 会带上 back，Nuxt 据此恢复原来的滚动位置
	if (window.history.state?.back) {
		router.back()
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
		<p class="safego-host">{{ targetInfo.host }}</p>
		<p class="safego-url">{{ targetInfo.href }}</p>
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
	font-size: 1.75rem;
	font-weight: 700;
	line-height: 1.2;
	color: var(--c-primary);
	overflow-wrap: anywhere;
}

.safego-url {
	margin-top: 0.5rem;
	font-family: var(--font-monospace);
	font-size: 0.8rem;
	line-height: 1.5;
	color: var(--c-text-3);
	overflow-wrap: anywhere;
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