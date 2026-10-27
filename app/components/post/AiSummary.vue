<script setup lang="ts">
import { delay } from 'es-toolkit/promise'

const props = defineProps<{
	/** 摘要正文（frontmatter.aiSummary） */
	summary: string
	/** 生成摘要所用的模型（frontmatter.aiSummaryModel） */
	model?: string
}>()

const appConfig = useAppConfig()
const config = appConfig.component.aiSummary

/** 按模型名挑品牌图标，认不出来就用通用的闪光 */
const modelIcons: [RegExp, string][] = [
	[/qwen/i, 'simple-icons:qwen'],
	[/deepseek/i, 'simple-icons:deepseek'],
	[/glm|chatglm/i, 'tabler:sparkles'],
	[/gpt|openai/i, 'simple-icons:openai'],
	[/claude/i, 'simple-icons:anthropic'],
	[/kimi|moonshot/i, 'simple-icons:moonshotai'],
]

const modelName = computed(() => props.model?.split('/').filter(Boolean).at(-1) ?? '')
const modelLabel = computed(() => [config.provider, modelName.value].filter(Boolean).join(' · '))
const modelIcon = computed(() => modelIcons.find(([pattern]) => pattern.test(props.model ?? ''))?.[1] ?? 'tabler:sparkles')

/** 首屏与无 JS 时直接给出全文，挂载后再倒回去逐字打，SSR 抓到的仍是完整摘要 */
const displayText = ref(props.summary)
const typing = ref(false)
const caret = ref('')

const isNarrow = ref(false)
const folded = ref(true)
const canFold = computed(() => isNarrow.value && [...props.summary].length > config.foldAfter)

let cancelled = false

const { copy, copied } = useCopy(props.summary)

async function typeOut() {
	const chars = [...props.summary]
	// 长摘要按总时长均摊，单字间隔压在 12~60ms，免得读到一半就想走
	const step = Math.min(60, Math.max(12, Math.round(config.duration / Math.max(1, chars.length))))

	typing.value = true
	displayText.value = ''
	caret.value = config.caret

	for (const char of chars) {
		if (cancelled)
			return
		displayText.value += char
		await delay(step)
	}

	caret.value = ''
	typing.value = false
}

onMounted(() => {
	const narrowMedia = window.matchMedia('(max-width: 768px)')
	const updateNarrow = () => {
		isNarrow.value = narrowMedia.matches
	}

	updateNarrow()
	narrowMedia.addEventListener('change', updateNarrow)
	onBeforeUnmount(() => narrowMedia.removeEventListener('change', updateNarrow))

	if (config.animation === false || window.matchMedia('(prefers-reduced-motion: reduce)').matches)
		return

	typeOut()
})

onBeforeUnmount(() => {
	cancelled = true
})
</script>

<template>
<section class="ai-summary" :class="{ 'is-typing': typing }">
	<div class="ai-summary-head">
		<p class="ai-summary-title">
			<span class="ai-summary-icon"><Icon :name="modelIcon" /></span>
			{{ config.label }}
		</p>

		<div class="ai-summary-tools">
			<button
				class="ai-summary-copy"
				type="button"
				:aria-label="copied ? '已复制摘要' : '复制摘要'"
				:title="copied ? '已复制' : '复制摘要'"
				@click="copy()"
			>
				<Icon :name="copied ? 'tabler:check' : 'tabler:copy'" />
			</button>

			<span v-if="modelLabel" class="ai-summary-model">{{ modelLabel }}</span>
		</div>
	</div>

	<div class="ai-summary-body" :class="{ 'is-folded': canFold && folded }">
		<p class="ai-summary-text">
			{{ displayText }}<span v-if="caret" class="ai-summary-caret">{{ caret }}</span>
		</p>
	</div>

	<div v-if="canFold" class="ai-summary-foot">
		<button
			class="ai-summary-toggle"
			type="button"
			:aria-expanded="!folded"
			@click="folded = !folded"
		>
			{{ folded ? '展开全部' : '收起' }}
			<Icon :name="folded ? 'tabler:chevron-down' : 'tabler:chevron-up'" />
		</button>
	</div>
</section>
</template>

<style scoped>
.ai-summary {
	position: relative;
	overflow: hidden;
	margin: 1rem 0.5rem 0.5rem;
	padding: 0.85rem 0.95rem 0.75rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	box-shadow: var(--box-shadow-2);
	background: linear-gradient(180deg, var(--c-bg-1), var(--c-bg) 60%);
	animation: float-in var(--motion-duration) var(--motion-easing) backwards;
	isolation: isolate;

	/* 右上角一团极光，只做背景，不抢文字 */
	&::before {
		content: "";
		position: absolute;
		inset-inline-end: -18%;
		top: -70%;
		width: 55%;
		aspect-ratio: 1;
		border-radius: 50%;
		background: radial-gradient(circle at center, var(--c-primary-soft), transparent 70%);
		animation: ai-summary-drift 16s ease-in-out infinite alternate;
		z-index: -1;
	}

	&:hover .ai-summary-icon {
		transform: rotate(-6deg) scale(1.06);
	}
}

@keyframes ai-summary-drift {
	from {
		opacity: 0.55;
		transform: translate3d(0, 0, 0) scale(1);
	}

	to {
		opacity: 0.9;
		transform: translate3d(-8%, 12%, 0) scale(1.18);
	}
}

.ai-summary-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5rem;
	margin-block-end: 0.6rem;
}

.ai-summary-title {
	display: inline-flex;
	align-items: center;
	gap: 0.42rem;
	font-size: 0.82rem;
	font-weight: 700;
	letter-spacing: 0.02em;
	color: var(--c-primary);
}

.ai-summary-icon {
	display: grid;
	place-items: center;
	width: 1.4rem;
	height: 1.4rem;
	border-radius: 0.5rem;
	box-shadow: 0 0.15rem 0.4rem var(--c-primary-soft);
	background: linear-gradient(135deg, var(--c-primary), var(--c-primary-soft) 160%);
	color: #FFF;
	transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);

	.iconify {
		width: 0.82rem;
		height: 0.82rem;
	}
}

.ai-summary-tools {
	display: inline-flex;
	align-items: center;
	gap: 0.35rem;
}

.ai-summary-model {
	padding: 0.15rem 0.5rem;
	border-radius: 999px;
	background: var(--c-primary-soft);
	font-family: "JetBrains Mono", ui-monospace, monospace;
	font-size: 0.68rem;
	font-weight: 600;
	line-height: 1.5;
	white-space: nowrap;
	color: var(--c-primary);
	transition: box-shadow 0.3s;

	.is-typing & {
		box-shadow: 0 0 0 0.15rem var(--c-primary-soft);
	}
}

.ai-summary-copy {
	display: grid;
	place-items: center;
	width: 1.85rem;
	height: 1.85rem;
	padding: 0;
	border: 0;
	border-radius: 0.5rem;
	background: transparent;
	color: var(--c-text-3);
	transition: color 0.15s, background-color 0.15s;
	cursor: pointer;

	&:hover {
		background: var(--c-primary-soft);
		color: var(--c-primary);
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}

	@media (pointer: coarse) {
		width: 2.25rem;
		height: 2.25rem;
	}
}

.ai-summary-body {
	position: relative;
	overflow: hidden;
	padding: 0.7rem 0.8rem;
	border-inline-start: 2px solid var(--c-primary-soft);
	border-radius: 0.75rem;
	box-shadow: inset 0 0 0 1px var(--c-border);
	background: var(--c-bg-1);
	transition: max-height 0.32s cubic-bezier(0.16, 1, 0.3, 1);

	&.is-folded {
		/* 3 行正文 + 上下内边距，切在行与行之间而不是行中间 */
		max-height: calc(1.4rem + 5.25em);
		mask-image: linear-gradient(#FFF 60%, transparent);
	}
}

.ai-summary-text {
	font-size: 0.88rem;
	line-height: 1.75;
	white-space: pre-wrap;
	word-break: break-word;
	color: var(--c-text-2);
}

.ai-summary-caret {
	margin-inline-start: 0.08em;
	color: var(--c-primary);
	animation: ai-summary-caret 1s steps(1, end) infinite;
}

@keyframes ai-summary-caret {
	50% {
		opacity: 0;
	}
}

.ai-summary-foot {
	display: flex;
	justify-content: flex-end;
	margin-block-start: 0.5rem;
}

.ai-summary-toggle {
	display: inline-flex;
	align-items: center;
	gap: 0.15rem;
	padding: 0.22rem 0.6rem;
	border: 1px solid var(--c-border);
	border-radius: 999px;
	background: var(--c-bg-2);
	font-size: 0.74rem;
	font-weight: 600;
	color: var(--c-text-2);
	transition: color 0.15s, border-color 0.15s;
	cursor: pointer;

	&:hover {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}
}

@media (max-width: 768px) {
	.ai-summary {
		margin-inline: 0;
	}
}

@media (prefers-reduced-motion: reduce) {
	.ai-summary,
	.ai-summary::before,
	.ai-summary-caret {
		animation: none;
	}

	.ai-summary-body,
	.ai-summary-icon,
	.ai-summary-copy,
	.ai-summary-toggle {
		transition: none;
	}
}
</style>
