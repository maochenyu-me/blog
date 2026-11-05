<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'
import { safeHttpUrl } from '~/utils/memos/url'

/**
 * 推文扩展卡（默认纯静态）。
 *
 * 上游 Ech0 会加载 `platform.twitter.com/widgets.js` 把推文渲染成官方样式，
 * 但国内网络下该脚本几乎必定超时、且会拖慢首屏，所以这里默认只做一张
 * 「@用户名 + 打开原推」的静态卡；把 `blog.config.ts` 的
 * `memos.ech0.tweetMode` 改成 `'embed'` 才走官方 embed。
 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'tweet' }>
}>()

const appConfig = useAppConfig()
const mode = computed(() => (appConfig.memos.ech0?.tweetMode === 'embed' ? 'embed' : 'static'))
/** 推文地址来自接口，先过协议白名单；非法地址整张卡不给链接 */
const tweetUrl = computed(() => safeHttpUrl(props.ext.url))

const embedFailed = ref(false)
const embedReady = ref(false)
/** 官方 embed 在部分网络下会挂住不返回，超时后回落到静态卡 */
const EMBED_TIMEOUT = 6000

/** 官方脚本只加载一次，多个推文卡共用 */
let widgetsPromise: Promise<void> | null = null
function loadWidgets() {
	if (widgetsPromise)
		return widgetsPromise
	widgetsPromise = new Promise<void>((resolve, reject) => {
		const script = document.createElement('script')
		script.src = 'https://platform.twitter.com/widgets.js'
		script.async = true
		script.onload = () => resolve()
		script.onerror = () => reject(new Error('widgets.js 加载失败'))
		document.head.appendChild(script)
	})
	return widgetsPromise
}

async function setupEmbed() {
	if (mode.value !== 'embed' || !tweetUrl.value)
		return
	const timer = setTimeout(() => {
		embedFailed.value = true
	}, EMBED_TIMEOUT)
	try {
		await loadWidgets()
		embedReady.value = true
	}
	catch {
		embedFailed.value = true
	}
	finally {
		clearTimeout(timer)
	}
}

onMounted(setupEmbed)
</script>

<template>
<MemosExtShell icon="simple-icons:x" label="推文" :href="tweetUrl || undefined" tip="打开原推">
	<!-- embed 模式：沙箱里插 blockquote，由 widgets.js 接管 -->
	<div v-if="mode === 'embed' && embedReady && !embedFailed" class="memos-tweet-embed">
		<blockquote class="twitter-tweet" data-dnt="true" data-conversation="none">
			<a :href="tweetUrl" />
		</blockquote>
	</div>

	<a
		v-else-if="tweetUrl"
		class="memos-tweet"
		:href="tweetUrl"
		target="_blank"
		rel="noopener noreferrer"
	>
		<span class="badge"><Icon name="simple-icons:x" /></span>
		<span class="meta">
			<span class="handle" v-text="ext.username ? `@${ext.username}` : '推文'" />
			<span class="action">打开原推查看</span>
		</span>
		<Icon class="arrow" name="tabler:arrow-up-right" />
	</a>

	<!-- 地址非法：不给链接，只显示 @用户名 -->
	<p v-else class="memos-tweet">
		<span class="badge"><Icon name="simple-icons:x" /></span>
		<span class="meta">
			<span class="handle" v-text="ext.username ? `@${ext.username}` : '推文'" />
			<span class="action">推文地址无效</span>
		</span>
	</p>
</MemosExtShell>
</template>

<style scoped>
.memos-tweet {
	display: flex;
	align-items: center;
	gap: 0.6em;
	padding: 0.15em 0.2em;
	border-radius: 0.35em;
	text-decoration: none;
	color: inherit;

	&:hover {
		background-color: var(--c-bg-2);

		.handle {
			color: var(--c-primary);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 1px;
	}

	.badge {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		width: 2.2em;
		height: 2.2em;
		border-radius: 0.4em;
		background-color: var(--c-bg-3);
		color: var(--c-text-2);
	}

	.meta {
		display: flex;
		flex: 1;
		flex-direction: column;
		min-width: 0;

		.handle {
			font-weight: 600;
			color: var(--c-text-1);
		}

		.action {
			font-size: 0.8em;
			color: var(--c-text-3);
		}
	}

	.arrow {
		flex-shrink: 0;
		color: var(--c-text-3);
	}
}

.memos-tweet-embed {
	:deep(iframe) {
		max-width: 100%;
	}
}
</style>
