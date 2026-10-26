<script setup lang="ts">
import { useDocumentVisibility } from '@vueuse/core'

const {
	activeChannel,
	channels,
	failed,
	hasMore,
	init,
	loadMore,
	loaded,
	messages,
	pending,
	refresh,
	retry,
	showChannelSwitch,
	switchChannel,
} = useMemos()

// 数据只从浏览器直连 API 获取，避免静态构建时把过期内容固化进 HTML
onMounted(init)

// 标签页重新可见时静默拉一次首页（内部按 refreshInterval 节流）。
// 只判断可见性而不叠加窗口焦点：焦点丢失的情况太常见（窗口被遮挡、副屏、点过别处），
// 盯着它会让刷新几乎不触发。
const visibility = useDocumentVisibility()
watch(visibility, (state) => {
	if (state === 'visible')
		void refresh()
})
</script>

<template>
<div class="memos-timeline proper-height">
	<MemosChannelSwitch
		v-if="showChannelSwitch"
		:channels
		:active="activeChannel"
		@select="switchChannel"
	/>

	<!-- 骨架屏：首次加载 -->
	<div v-if="!loaded" class="memos-skeleton" role="status" aria-busy="true">
		<div
			v-for="index in 3"
			:key="index"
			class="memos-skeleton-card"
			:style="getFixedDelay(index * 0.05)"
		>
			<div class="head">
				<span class="avatar" />
				<div class="meta">
					<span class="line w24" />
					<span class="line w16" />
				</div>
			</div>
			<div class="body">
				<span class="line w90" />
				<span class="line w64" />
			</div>
		</div>

		<p class="memos-loading">
			<Icon name="line-md:loading-twotone-loop" />
			<span>说说加载中…</span>
		</p>
	</div>

	<!-- 首屏加载失败 -->
	<div v-else-if="failed && !messages.length" class="memos-state">
		<Icon name="tabler:cloud-off" />
		<p>说说加载失败了，可能是接口暂时不可用。</p>
		<button type="button" @click="retry">
			重试
		</button>
	</div>

	<!-- 空态 -->
	<div v-else-if="!messages.length" class="memos-state">
		<Icon name="tabler:message-2-off" />
		<p>这里还没有说说。</p>
	</div>

	<template v-else>
		<MemosCard
			v-for="message, index in messages"
			:key="message.id"
			:message
			:style="getFixedDelay(index * 0.04)"
		/>

		<div class="memos-more">
			<p v-if="failed" class="hint">
				加载失败了，请稍后再试。
			</p>

			<button v-if="hasMore" type="button" :disabled="pending" @click="loadMore">
				<Icon v-if="pending" name="line-md:loading-twotone-loop" />
				<span>{{ pending ? '加载中…' : failed ? '重试' : '加载更多' }}</span>
			</button>

			<p v-else-if="!pending" class="end">
				— 已经到底啦 —
			</p>
		</div>
	</template>
</div>
</template>

<style scoped>
.memos-timeline {
	display: flex;
	flex-direction: column;
	gap: 0.8em;
	padding: 1rem;
}

.memos-skeleton {
	display: flex;
	flex-direction: column;
	gap: 0.8em;
}

.memos-skeleton-card {
	display: flex;
	flex-direction: column;
	gap: 0.7em;
	padding: 0.8em 1em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);

	> .head {
		display: flex;
		align-items: center;
		gap: 0.6em;

		> .avatar {
			flex-shrink: 0;
			width: 2.4em;
			height: 2.4em;
			border-radius: 50%;
			background-color: var(--c-flat-card-bg-2);
		}

		> .meta {
			display: flex;
			flex: 1;
			flex-direction: column;
			gap: 0.4em;

			> .line {
				height: 0.65em;
			}
		}
	}

	> .body {
		display: flex;
		flex-direction: column;
		gap: 0.5em;

		> .line {
			height: 0.7em;
		}
	}

	.line {
		border-radius: 0.3em;
		background-color: var(--c-flat-card-bg-2);

		&.w16 { width: 16%; }
		&.w24 { width: 24%; }
		&.w40 { width: 40%; }
		&.w64 { width: 64%; }
		&.w90 { width: 90%; }
	}
}

.memos-skeleton-card,
.memos-skeleton-card .avatar,
.memos-skeleton-card .line {
	animation: memos-pulse 1.4s ease-in-out infinite;
}

.memos-loading {
	display: flex;
	align-items: center;
	justify-content: center;
	gap: 0.4em;
	padding-block: 0.8em 0.2em;
	font-size: 0.85em;
	color: var(--c-text-3);
}

@keyframes memos-pulse {
	50% { opacity: 0.5; }
}

.memos-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6em;
	padding: 3em 1em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);
	text-align: center;
	color: var(--c-text-3);

	> .iconify {
		font-size: 2em;
	}

	> button {
		padding: 0.35em 1em;
		border-radius: 2em;
		background-color: var(--c-primary-soft);
		font-size: 0.85em;
		color: var(--c-primary);
		transition: opacity 0.2s;
		cursor: pointer;

		&:hover {
			opacity: 0.8;
		}
	}
}

.memos-more {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5em;
	padding-block: 1em;

	> button {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.45em 1.4em;
		border: 1px solid var(--c-flat-card-border);
		border-radius: 2em;
		background-color: var(--c-flat-card-bg);
		font-size: 0.9em;
		color: var(--c-text-2);
		transition: all 0.2s;
		cursor: pointer;

		&:hover:not(:disabled) {
			border-color: var(--c-primary-soft);
			color: var(--c-primary);
		}

		&:disabled {
			opacity: 0.6;
			cursor: progress;
		}
	}

	> .hint {
		font-size: 0.8em;
		color: var(--c-warning);
	}

	> .end {
		font-size: 0.85em;
		color: var(--c-text-3);
	}
}

@media (max-width: 768px) {
	.memos-timeline {
		padding: 0.5rem;
	}
}
</style>
