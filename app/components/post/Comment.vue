<script setup lang="tsx">
import type Ecoku from 'ecoku'
import type { TippyComponent } from 'vue-tippy'

const props = defineProps<{
	/** 页面标题，用于 Ecoku 的通知邮件；留空则不带标题 */
	pageTitle?: string
}>()

const appConfig = useAppConfig()
const route = useRoute()

const provider = computed(() => appConfig.comment.provider)

/**
 * Ecoku 的 pageKey 必须是站内相对路径（不含 `?`/`#`），且一旦上线不能再改，
 * 这里统一以路由路径为准并去掉末尾斜杠，避免 `/post` 与 `/post/` 分裂成两个评论区。
 */
const pageKey = computed(() => (route.path.split(/[?#]/)[0] ?? '').replace(/\/+$/, '') || '/')

const commentEl = useTemplateRef('comment')
const popoverEl = useTemplateRef<TippyComponent>('popover')
const popoverJumpTo = ref('')
const popoverInputEl = useTemplateRef('popover-input')
const showUndo = ref(false)

const popoverBind = ref<TippyComponent['$props']>({})

/** 评论区链接守卫 */
useEventListener(commentEl, 'click', (e) => {
	if (!(e.target instanceof Element))
		return

	if (e.target.matches('.tk-avatar-img'))
		e.stopPropagation()

	const popoverTarget = e.target.closest('a[target="_blank"]')
	if (!(popoverTarget instanceof HTMLAnchorElement))
		return

	e.preventDefault()
	popoverEl.value?.hide()

	popoverJumpTo.value = safelyDecodeUriComponent(popoverTarget.href)
	popoverBind.value = {
		getReferenceClientRect: () => popoverTarget.getBoundingClientRect(),
		triggerTarget: popoverTarget,
	}

	nextTick(checkUndoable)
	popoverEl.value?.show()
}, { capture: true })

function checkUndoable() {
	showUndo.value = popoverInputEl.value?.textContent !== popoverJumpTo.value
}

function undo() {
	if (!popoverInputEl.value)
		return
	popoverInputEl.value.textContent = popoverJumpTo.value
	checkUndoable()
}

function confirmOpen() {
	window.open(popoverInputEl.value?.textContent, '_blank')
}

/** Ecoku 挂载点：SDK 会清空并接管这里的子节点 */
const ecokuMount = useTemplateRef('ecoku-mount')
let ecoku: Ecoku | null = null
let unmounted = false

onMounted(async () => {
	if (provider.value === 'twikoo') {
		window.twikoo?.init?.({
			envId: appConfig.twikoo?.envId,
			// twikoo 会把挂载后的元素变为 #twikoo
			el: '#twikoo',
		})
		return
	}

	if (provider.value !== 'ecoku')
		return

	// 按需加载 SDK：只有启用 Ecoku 的文章页会下载这段客户端代码
	const { default: EcokuClient } = await import('ecoku')
	if (unmounted || !ecokuMount.value)
		return

	const { serverURL, siteId, pageSize, i18n } = appConfig.comment.ecoku
	const instance = new EcokuClient({
		container: ecokuMount.value,
		serverURL,
		siteId,
		pageKey: pageKey.value,
		pageTitle: props.pageTitle ?? '',
		pageSize,
		// 颜色全部由下方 CSS 变量接管，auto 只用来继承站点的 color-scheme
		theme: 'auto',
		...(i18n ? { i18n } : {}),
	})
	ecoku = instance
	const initialPageKey = pageKey.value

	try {
		await instance.init()
	}
	catch (error) {
		console.error('[Ecoku] 初始化失败', error)
		return
	}

	// init 期间路由可能已经切换，补一次 setPageKey，否则评论区还停在上一篇文章
	if (ecoku === instance && pageKey.value !== initialPageKey)
		instance.setPageKey(pageKey.value, props.pageTitle ?? '').catch(logPageKeyError)
})

watch([pageKey, () => props.pageTitle], ([key, title]) => {
	if (!ecoku?.isInitialized())
		return
	ecoku.setPageKey(key, title ?? '').catch(logPageKeyError)
}, { flush: 'post' })

onBeforeUnmount(() => {
	unmounted = true
	ecoku?.destroy()
	ecoku = null
})

function logPageKeyError(error: unknown) {
	console.error('[Ecoku] 切换评论区失败', error)
}
</script>

<template>
<section v-if="provider !== 'none'" id="comments" ref="comment" class="z-comment">
	<h3 class="text-creative">
		评论区
	</h3>

	<!-- interactive 默认会把气泡移动到 triggerTarget 的父元素上 -->
	<Tooltip
		ref="popover"
		v-bind="popoverBind"
		:append-to="() => commentEl!"
		interactive
		:aria="{ expanded: false }"
		trigger="focusin"
	>
		<template #content>
			<div class="popover-confirm">
				<span
					ref="popover-input"
					class="input"
					contenteditable="plaintext-only"
					spellcheck="false"
					@input="checkUndoable"
					@keydown.enter.prevent="confirmOpen"
					v-text="popoverJumpTo"
				/>

				<button
					v-if="showUndo"
					aria-label="恢复原始内容"
					@click="undo()"
				>
					<Icon name="tabler:arrow-back-up" />
				</button>

				<ZButton
					primary
					text="访问"
					@click="confirmOpen"
				/>
			</div>
		</template>
	</Tooltip>

	<div v-if="provider === 'ecoku'" ref="ecoku-mount" class="ecoku-mount">
		<p>评论加载中...</p>
	</div>

	<div v-else id="twikoo">
		<p>评论加载中...</p>
	</div>
</section>
</template>

<style scoped>
.z-comment {
	margin: 3rem 1rem;

	> h3 {
		margin-top: 3rem;
		font-size: 1.25rem;
	}
}

:deep() > [data-tippy-root] > .tippy-box {
	padding: 0;
}

.popover-confirm {
	display: flex;
	align-items: center;
	overflow-wrap: anywhere;

	> .input {
		min-width: 0;
		padding: 0.3em 0.6em;
		outline: none;
	}

	> button {
		flex-shrink: 0;
		align-self: stretch;
		padding: 0.3em;
		border-radius: 0 0.5em 0.5em 0;
	}
}

/* 首屏占位高度，避免评论挂载时把页脚顶下去 */
.ecoku-mount {
	min-height: 12rem;
}

/* Ecoku：把默认的「纸墨」配色整体换成主题令牌，明暗模式随 --c-* 自动切换 */
:deep(.ecoku-comments) {
	/* 主按钮文字 / Cap 复选框底色 */
	--ecoku-theme: var(--c-bg);
	/* 发布卡片、排序菜单、表情面板底色 */
	--ecoku-entry: var(--ld-bg-card);
	/* 标题、昵称、输入文字 */
	--ecoku-primary: var(--c-text-1);
	/* 时间、字数、字段标签 */
	--ecoku-secondary: var(--c-text-3);
	/* 评论正文 */
	--ecoku-content: var(--c-text-2);
	--ecoku-border: var(--c-border);
	--ecoku-border-soft: var(--c-border);
	--ecoku-surface-muted: var(--c-bg-soft);
	--ecoku-code-bg: var(--c-bg-2);
	--ecoku-accent: var(--c-primary);
	--ecoku-danger: var(--c-error);
	--ecoku-focus: color-mix(in srgb, var(--c-primary) 40%, transparent);
	--ecoku-shadow: var(--box-shadow-2);
	--ecoku-radius: 0.5em;
	--ecoku-radius-sm: 0.3em;
	--ecoku-font-mono: var(--font-monospace);
	--ecoku-font-size: 1rem;
	--ecoku-font-size-small: 0.8125rem;
	--ecoku-font-size-title: 1.125rem;

	/* 与正文左右对齐，不用 Ecoku 默认的 720px 居中栏宽 */
	width: auto;
	max-width: none;
	margin-inline: 0;
}

:deep(.ecoku-section-title) {
	font-family: var(--font-creative);
}

/* 主按钮跟主题的 .button.primary 一致：品牌色底 + 页面底色文字 */
:deep(.ecoku-primary-button) {
	border-color: var(--c-primary);
	background: var(--c-primary);
	color: var(--c-bg);
}

:deep(.ecoku-thread-list) {
	overflow-wrap: anywhere;
}

:deep(#twikoo) {
	margin: 2em 0;

	.tk-admin-container {
		position: fixed;
		z-index: calc(var(--z-index-popover) + 1);
	}

	.tk-input {
		font-family: var(--font-monospace);
	}

	.tk-avatar {
		border-radius: 50%;

		@supports (corner-shape: squircle) {
			corner-shape: superellipse(1.2);
		}
	}

	.tk-avatar.tk-clickable {
		cursor: auto;
	}

	.tk-time {
		color: var(--c-text-3);
	}

	/* 防止 a 被 overflow hidden */
	.tk-content {
		margin: -0.2em;
		padding: 0.2em;
	}

	.tk-comments-title, .tk-nick {
		font-family: var(--font-creative);
	}

	.tk-owo-emotion {
		width: auto;
		height: 1.4em;
		vertical-align: text-bottom;
	}

	.tk-extras, .tk-footer {
		font-size: 0.7em;
		color: var(--c-text-3);
	}

	.tk-replies:not(.tk-replies-expand) {
		mask-image: linear-gradient(to top, transparent, #FFF 4em);
	}

	.tk-expand {
		border-radius: 0.5em;
		transition: background-color 0.1s;
	}

	.tippy-svg-arrow > svg {
		fill: inherit;
		width: auto;
		height: auto;
	}
}

:deep(:where(.tk-preview-container,.tk-content)) {
	pre {
		overflow: auto;
		border-radius: 0.5em;
		font-size: 0.85em;
	}

	a {
		margin: -0.1em -0.2em;
		padding: 0.1em 0.2em;
		background: linear-gradient(var(--c-primary-soft), var(--c-primary-soft)) no-repeat center bottom / 100% 0.1em;
		color: var(--c-primary);
		transition: all 0.2s;

		&:hover {
			border-radius: 0.3em;
			background-size: 100% 100%;
		}
	}

	p {
		margin: 0.2em 0;
	}

	img {
		border-radius: 0.5em;
	}

	menu, ol, ul {
		margin: 0.5em 0;
		padding-inline-start: 1.5em;
		font-size: 0.9rem;
		list-style: revert;

		> li {
			margin: 0.2em 0;

			&::marker {
				color: var(--c-primary);
			}
		}
	}

	blockquote {
		margin: 0.5em 0;
		padding: 0.2em 0.5em;
		border-inline-start: 4px solid var(--c-border);
		border-radius: 4px;
		background-color: var(--c-bg-2);
		font-size: 0.9em;
	}
}
</style>
