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

/** 骨架屏与真实卡片同高，挂载完成（或失败交给 Ecoku 自己的错误态）后撤掉 */
const loading = ref(true)

onMounted(async () => {
	if (provider.value === 'twikoo') {
		window.twikoo?.init?.({
			envId: appConfig.twikoo?.envId,
			// twikoo 会把挂载后的元素变为 #twikoo
			el: '#twikoo',
		})
		return
	}

	if (provider.value !== 'ecoku') {
		loading.value = false
		return
	}

	// 按需加载 SDK：只有启用 Ecoku 的文章页会下载这段客户端代码
	const { default: EcokuClient } = await import('ecoku')
	if (unmounted || !ecokuMount.value) {
		loading.value = false
		return
	}

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
	finally {
		// 失败时 Ecoku 会渲染自己的「评论暂时不可用」错误态，骨架同样要撤
		loading.value = false
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
<section
	v-if="provider !== 'none'"
	id="comments"
	ref="comment"
	class="z-comment"
	:aria-busy="provider === 'ecoku' && loading"
>
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

	<template v-if="provider === 'ecoku'">
		<!-- 骨架与真实评论区叠在一格里：骨架按真实卡片尺寸占位，加载完直接切换不位移 -->
		<div class="ecoku-body">
			<div
				v-if="loading"
				class="ecoku-skeleton"
				aria-hidden="true"
			>
				<div class="sk-fields">
					<i /><i /><i />
				</div>
				<div class="sk-lines">
					<i /><i /><i />
				</div>
				<div class="sk-bottom">
					<i class="sk-captcha" />
					<div class="sk-actions">
						<i /><i /><i />
					</div>
				</div>
			</div>
			<p v-if="loading" class="sr-only">
				评论加载中…
			</p>
			<div
				ref="ecoku-mount"
				class="ecoku-mount"
				:class="{ 'is-pending': loading }"
				:inert="loading"
			/>
		</div>
	</template>

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

/* 无障碍：仅屏幕阅读器可见 */
.sr-only {
	position: absolute;
	overflow: hidden;
	width: 1px;
	height: 1px;
	clip-path: inset(50%);
	white-space: nowrap;
}

/* 骨架与真实评论区共用一个格子，交叉淡入 */
.ecoku-body {
	display: grid;
}

.ecoku-body > * {
	grid-area: 1 / 1;
	min-width: 0;
}

/* 加载骨架：按真实发布卡片的实测尺寸占位（composer 191.7px：字段 32 + 输入 98 + 底行 58） */
.ecoku-skeleton {
	display: grid;
	align-self: start;
	gap: 6px 12px;
	padding: 8px 14px 10px;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	box-shadow: var(--box-shadow-1);
	box-sizing: border-box;
	background: var(--ld-bg-card);
}

.ecoku-skeleton *,
.ecoku-skeleton *::before,
.ecoku-skeleton *::after {
	box-sizing: border-box;
}

/* 加载期先占位但不绘制：用 visibility 而不是 opacity 过渡，
   后台标签页里 CSS 过渡可能被冻结在起点，opacity 会永久停在 0 */
.ecoku-mount {
	align-self: start;

	&.is-pending {
		visibility: hidden;
	}
}

.ecoku-skeleton i {
	display: block;
	position: relative;
	overflow: hidden;
	border-radius: 0.4em;
	background: var(--c-bg-soft);
}

/* 一道扫光，比整体闪烁更安静 */
.ecoku-skeleton i::after {
	content: "";
	position: absolute;
	inset: 0;
	background: linear-gradient(90deg, transparent, var(--c-bg-a50), transparent);
	transform: translateX(-100%);
	animation: ecoku-skeleton-sheen 1.5s ease-in-out infinite;
}

.sk-fields {
	display: grid;
	grid-template-columns: repeat(3, minmax(0, 1fr));
	gap: 16px;
}

.sk-fields i {
	height: 32px;
}

.sk-lines {
	display: grid;
	align-content: start;
	gap: 12px;
	/* 与真实 textarea（96px + 2px 内边距）等高 */
	min-height: 98px;
	padding-top: 12px;
}

.sk-lines i {
	height: 0.75em;

	&:nth-child(2) {
		width: 84%;
	}

	&:nth-child(3) {
		width: 54%;
	}
}

.sk-bottom {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 12px;
}

.sk-captcha {
	width: min(100%, 260px);
	height: 58px;
	border-radius: 0.5em;
}

.sk-actions {
	display: flex;
	gap: 4px;
}

.sk-actions i {
	width: 56px;
	height: 32px;
	border-radius: 0.5em;
}

@media (max-width: 620px) {
	.sk-fields,
	.sk-bottom {
		grid-template-columns: minmax(0, 1fr);
	}

	.sk-actions {
		justify-content: flex-end;
	}
}

@keyframes ecoku-skeleton-sheen {
	to {
		transform: translateX(100%);
	}
}

@media (prefers-reduced-motion: reduce) {
	.ecoku-skeleton i::after {
		animation: none;
	}
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

/* —— 版式：压掉 Ecoku 默认过大的留白，密度贴近主题正文 —— */

/* 空评论区不再预留 360px */
:deep(.ecoku-mount .ecoku-comment-section) {
	min-height: 0;
}

/* 「N 条评论」标题行：上方 44px 的死空收窄 */
:deep(.ecoku-mount .ecoku-section-heading) {
	min-height: 28px;
	margin: 1.25rem 0 0.25rem;
}

/* 空状态：默认 20/24px 外边距 + 三行散字，收紧成一段灰字 */
:deep(.ecoku-mount .ecoku-empty-state) {
	margin: 0.5rem 0 0;
	font-size: 0.9375rem;
	line-height: 1.7;
}

:deep(.ecoku-mount .ecoku-section-title) {
	font-family: var(--font-creative);
	font-size: 1.125rem;
	line-height: 1.75;
}

/* 发布卡片：贴合主题 .card 的圆角 + 一级阴影，并把 Cap 验证与按钮并排以压低高度 */
:deep(.ecoku-mount .ecoku-composer) {
	display: grid;
	grid-template-columns: minmax(0, 1fr) auto;
	align-items: center;
	gap: 6px 12px;
	padding: 8px 14px 10px;
	box-shadow: var(--box-shadow-1);
	transition: border-color 0.15s, box-shadow 0.15s;
}

/* 整行铺满的区块 */
:deep(.ecoku-mount .ecoku-identity-grid),
:deep(.ecoku-mount .ecoku-message-field),
:deep(.ecoku-mount .ecoku-composer-preview),
:deep(.ecoku-mount .ecoku-form-error) {
	grid-column: 1 / -1;
}

/* 原来的独立外边距交给 grid 的 gap */
:deep(.ecoku-mount .ecoku-composer-preview),
:deep(.ecoku-mount .ecoku-form-error) {
	margin-block: 0;
}

:deep(.ecoku-mount .ecoku-turnstile-slot) {
	grid-column: 1;
	margin-block: 0;
}

:deep(.ecoku-mount .ecoku-composer-footer) {
	grid-column: 2;
	margin-block: 0;
}

@media (max-width: 620px) {
	:deep(.ecoku-mount .ecoku-composer) {
		grid-template-columns: minmax(0, 1fr);
	}

	:deep(.ecoku-mount .ecoku-turnstile-slot),
	:deep(.ecoku-mount .ecoku-composer-footer) {
		grid-column: 1 / -1;
	}
}

:deep(.ecoku-mount .ecoku-composer:focus-within) {
	box-shadow: var(--box-shadow-2);
}

/* 昵称/邮箱/网址：三条孤立的下划线 → 三个内嵌输入槽 */
:deep(.ecoku-mount .ecoku-identity-grid) {
	/* 窄屏会叠成单列，留出行距，避免三个槽粘成一整块 */
	gap: 6px 16px;
}

:deep(.ecoku-mount .ecoku-field) {
	padding: 0 0.55em;
	border: 1px solid transparent;
	border-radius: 0.4em;
	background: var(--c-bg-soft);
	transition: border-color 0.15s;
}

:deep(.ecoku-mount .ecoku-field:focus-within) {
	border-color: var(--c-primary);
}

:deep(.ecoku-mount .ecoku-field:has(.ecoku-input[aria-invalid="true"])) {
	border-color: var(--ecoku-danger);
}

:deep(.ecoku-mount .ecoku-field-label) {
	line-height: 30px;
}

:deep(.ecoku-mount .ecoku-input) {
	height: 30px;
	font-size: 0.9em;
}

/* 正文输入区：7 行 → 3 行，仍可手动拉高 */
:deep(.ecoku-mount .ecoku-textarea) {
	height: calc(1.75em * 3 + 12px);
	min-height: calc(1.75em * 3);
	padding: 10px 0 2px;
}

/* 表情 / 预览 等次级按钮：主题 .button 的细边 + 一级阴影 */
:deep(.ecoku-mount .ecoku-secondary-button),
:deep(.ecoku-mount .ecoku-smoji-trigger) {
	border-color: var(--c-bg-soft);
	box-shadow: var(--box-shadow-1);
	background: var(--ld-bg-card);
	color: var(--c-text-2);
	transition: color 0.15s, box-shadow 0.15s, background-color 0.15s;
}

:deep(.ecoku-mount .ecoku-secondary-button:not(:disabled):hover),
:deep(.ecoku-mount .ecoku-smoji-trigger:not(:disabled):hover) {
	box-shadow: var(--box-shadow-2);
	color: var(--c-text);
}

/* 主按钮跟主题的 .button.primary 一致：品牌色底 + 页面底色文字 */
:deep(.ecoku-primary-button) {
	border-color: var(--c-primary);
	box-shadow: var(--box-shadow-1);
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
