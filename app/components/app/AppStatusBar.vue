<script setup lang="ts">
const bridge = useAppBridge()
const {
	isApp,
	enabled,
	status,
	check,
	progress,
	notice,
	noticeKind,
	hasUpdate,
	installing,
	bootBroken,
	checkContent,
	installContent,
} = bridge

/** 用户点过「以后再说」后先收起更新提示；下次检查结果变化时自动展开 */
const dismissed = ref(false)
watch(check, () => {
	dismissed.value = false
})

const percent = computed(() => {
	const value = progress.value
	if (!value || value.total <= 0)
		return null
	return Math.min(100, Math.round(value.received / value.total * 100))
})

/** 状态点颜色：复用既有语义色，不新增配色 */
const level = computed(() => {
	if (noticeKind.value)
		return noticeKind.value
	if (installing.value)
		return 'busy'
	if (hasUpdate.value && !dismissed.value)
		return 'update'
	if (status.value?.lastError)
		return 'error'
	return 'ok'
})

const message = computed(() => {
	if (installing.value) {
		const value = progress.value
		if (!value)
			return '正在准备更新…'
		if (value.phase === 'extract')
			return '正在解压内容…'
		return percent.value === null ? '正在下载内容…' : `正在下载内容… ${percent.value}%`
	}
	if (notice.value)
		return notice.value
	if (hasUpdate.value && !dismissed.value) {
		const result = check.value
		const size = result?.state === 'update-available' ? `（${formatBytes(result.bytes)}）` : ''
		return `发现新内容${size}，更新后就能读到最新文章。`
	}
	if (!status.value)
		return '正在读取内容状态…'
	return status.value.source === 'downloaded'
		? `已加载下载内容 ${status.value.activeBuild}`
		: `已加载内嵌内容 ${status.value.embeddedBuild}`
})

/** 手动检查期间自持的局部锁：桥的 checkContent 无重入锁，防止连点重复 invoke */
const checking = ref(false)

async function onManualCheck() {
	if (checking.value)
		return
	checking.value = true
	try {
		await checkContent(true)
	}
	finally {
		checking.value = false
	}
}

const action = computed(() => {
	if (installing.value)
		return null
	if (hasUpdate.value && !dismissed.value) {
		return {
			label: '更新内容',
			run: () => { void installContent() },
		}
	}
	return {
		label: checking.value ? '正在检查…' : '检查更新',
		run: () => { void onManualCheck() },
	}
})

function formatBytes(bytes: number) {
	if (bytes < 1024)
		return `${bytes} B`
	if (bytes < 1024 * 1024)
		return `${(bytes / 1024).toFixed(1)} KB`
	return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
</script>

<template>
<div
	v-if="isApp && enabled && !bootBroken"
	class="app-status-bar"
	:class="`is-${level}`"
	role="status"
	aria-live="polite"
>
	<span class="dot" aria-hidden="true" />
	<p class="text" :title="message">
		{{ message }}
	</p>
	<div class="actions">
		<button
			v-if="action"
			type="button"
			class="button primary"
			:disabled="checking"
			@click="action.run()"
		>
			{{ action.label }}
		</button>
		<button
			v-if="hasUpdate && !installing && !dismissed"
			type="button"
			class="button"
			:disabled="checking"
			@click="dismissed = true"
		>
			以后再说
		</button>
	</div>
	<div v-if="installing && percent !== null" class="progress" aria-hidden="true">
		<span :style="{ width: `${percent}%` }" />
	</div>
</div>
</template>

<style scoped>
.app-status-bar {
	display: flex;
	align-items: center;
	gap: 0.75rem;
	position: fixed;
	inset-inline: 0;
	bottom: 1rem;
	width: min(44rem, calc(100% - 2rem));
	margin-inline: auto;
	padding: 0.6rem 0.8rem;
	border: 1px solid var(--c-border);
	border-radius: 0.75rem;
	/* 与站点毛玻璃面板同款：半透明底 + backdrop blur */
	box-shadow: var(--box-shadow-2);
	background-color: var(--c-bg-a80);
	backdrop-filter: blur(10px);
	font-size: 0.85rem;
	line-height: 1.4;
	color: var(--c-text-1);
	z-index: var(--z-index-popover);

	> .dot {
		flex: none;
		width: 0.55em;
		height: 0.55em;
		border-radius: 50%;
		background-color: var(--c-text-3);
	}

	&.is-ok > .dot { background-color: var(--c-success); }
	&.is-success > .dot { background-color: var(--c-success); }
	&.is-update > .dot { background-color: var(--c-warning); }
	&.is-offline > .dot { background-color: var(--c-text-3); }
	&.is-error > .dot { background-color: var(--c-error); }
	&.is-busy > .dot {
		background-color: var(--c-primary);
		animation: app-status-pulse 1s infinite alternate;
	}

	> .text {
		flex: 1;
		overflow: hidden;
		min-width: 0;
		margin: 0;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	> .actions {
		display: flex;
		flex: none;
		align-items: center;
		gap: 0.5rem;
	}

	> .progress {
		position: absolute;
		overflow: hidden;
		inset-inline: 0;
		bottom: 0;
		height: 2px;
		background-color: var(--c-bg-soft);

		> span {
			display: block;
			height: 100%;
			background-color: var(--c-primary);
			transition: width 0.2s;
		}
	}

	@media (max-width: 1080px) {
		width: min(36rem, calc(100% - 2rem));
	}

	@media (max-width: 768px) {
		inset-inline: 0;
		bottom: 0;
		width: 100%;
		padding-bottom: calc(0.6rem + env(safe-area-inset-bottom));
		border-width: 1px 0 0;
		border-radius: 0;
	}

	@media (max-width: 528px) {
		flex-wrap: wrap;
		row-gap: 0.5rem;
		padding-inline: 0.7rem;
		font-size: 0.8rem;

		> .text {
			width: 100%;
			white-space: normal;
		}

		> .actions {
			justify-content: flex-end;
			width: 100%;
		}
	}
}

.button {
	flex: none;
	padding: 0.35em 0.8em;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	background-color: var(--ld-bg-card);
	font: inherit;
	color: var(--c-text-1);
	transition: border-color 0.2s, color 0.2s, filter 0.2s;
	cursor: pointer;

	&:hover {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}

	&:disabled {
		opacity: 0.6;
		cursor: default;
		pointer-events: none;
	}

	&.primary {
		border-color: transparent;
		background-color: var(--c-primary);
		/* 用 --c-bg 而不是 #fff：暗色下主色会被提亮，深色文字对比度更好 */
		color: var(--c-bg);

		&:hover {
			color: var(--c-bg);
			filter: brightness(1.08);
		}
	}
}

@keyframes app-status-pulse {
	from { opacity: 0.35; }
	to { opacity: 1; }
}
</style>
