<script setup lang="ts">
import { useDocumentVisibility } from '@vueuse/core'

const appConfig = useAppConfig()
const banner = appConfig.hot.banner

const {
	activePlatform,
	activeRoute,
	activeType,
	boardDescription,
	boardTitle,
	failed,
	init,
	items,
	loaded,
	pending,
	perPage,
	platforms,
	refresh,
	refreshIfStale,
	retry,
	selectPlatform,
	selectType,
	sourceLink,
	stale,
	typeLabel,
	typeOptions,
	updateTime,
} = useHot()

useSeoMeta({
	title: '热搜',
	description: `${appConfig.title}的热搜页面，聚合微博、抖音、知乎、哔哩哔哩等平台的实时热榜，点开即看、条目直达原站。`,
})

// ── 相对更新时间 ──
// 服务端渲染时以 0 占位，挂载后再校准，避免两端算出的文案不一致导致的 hydration mismatch
const nowTimestamp = ref(0)
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
	nowTimestamp.value = Date.now()
	timer = setInterval(() => {
		nowTimestamp.value = Date.now()
	}, 60_000)
})

onBeforeUnmount(() => {
	if (timer)
		clearInterval(timer)
})

const relativeUpdateText = computed(() => {
	if (!updateTime.value)
		return '暂无更新时间'
	const updated = new Date(updateTime.value).getTime()
	if (Number.isNaN(updated))
		return '暂无更新时间'
	const minutes = Math.floor((nowTimestamp.value - updated) / 60_000)
	if (minutes < 1)
		return '刚刚更新'
	if (minutes < 60)
		return `${minutes} 分钟前更新`
	const hours = Math.floor(minutes / 60)
	if (hours < 24)
		return `${hours} 小时前更新`
	return `${Math.floor(hours / 24)} 天前更新`
})

// ── 分页（前端切片，接口一次就给全量榜单） ──
const page = ref(1)
const totalPages = computed(() => Math.max(1, Math.ceil(items.value.length / perPage)))
const startIndex = computed(() => (page.value - 1) * perPage)
const pagedItems = computed(() => items.value.slice(startIndex.value, startIndex.value + perPage))

watch([activeRoute, activeType], () => {
	page.value = 1
})

watch(items, () => {
	if (page.value > totalPages.value)
		page.value = 1
})

// 数据只从浏览器直连接口获取，构建期不固化热榜内容
onMounted(init)

// 切回标签页时按 cacheTtl 节流补刷，不叠加窗口焦点判断（焦点丢失太常见）
const visibility = useDocumentVisibility()
watch(visibility, (state) => {
	if (state === 'visible')
		void refreshIfStale()
})
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
	<WidgetBlogLog />
</template>

<div class="hot proper-height">
	<ZPageBanner v-if="banner" v-bind="banner">
		<span class="banner-stat">
			<Icon name="tabler:flame" />
			<span>{{ platforms.length }} 个平台</span>
			<span class="banner-stat-platform">· {{ activePlatform?.name }}</span>
		</span>
	</ZPageBanner>

	<div class="hot-body">
		<HotTabs
			:platforms
			:active-route
			:type-options
			:active-type
			:type-label
			@select-route="selectPlatform"
			@select-type="selectType"
		/>

		<div class="hot-bar">
			<div class="hot-bar-main">
				<strong v-text="activePlatform?.name" />
				<template v-if="boardTitle">
					<span class="dot">·</span>
					<span v-text="boardTitle" />
				</template>
				<span class="dot">·</span>
				<span class="count" v-text="`${items.length} 条`" />
				<span v-if="stale" class="badge">缓存</span>
			</div>

			<div class="hot-bar-side">
				<span class="update" v-text="relativeUpdateText" />
				<button
					type="button"
					class="refresh"
					:disabled="pending"
					aria-label="刷新热榜"
					title="刷新热榜"
					@click="refresh"
				>
					<Icon name="tabler:refresh" :class="{ spinning: pending }" />
				</button>
			</div>
		</div>

		<p v-if="boardDescription || sourceLink" class="hot-sub">
			<span v-if="boardDescription" v-text="boardDescription" />
			<a
				v-if="sourceLink"
				:href="sourceLink"
				target="_blank"
				rel="noopener noreferrer"
			>
				原站榜单
				<Icon name="tabler:arrow-up-right" />
			</a>
		</p>

		<HotSkeleton v-if="!loaded" :count="Math.min(perPage, 8)" />

		<div v-else-if="failed" class="hot-state">
			<Icon name="tabler:cloud-off" />
			<p>{{ activePlatform?.name }}的热榜没取到，可能是接口暂时不可用或该平台已下线。</p>
			<button type="button" @click="retry">
				重试
			</button>
		</div>

		<div v-else-if="!items.length" class="hot-state">
			<Icon name="tabler:mood-empty" />
			<p>这个榜单暂时没有内容，换个平台看看。</p>
		</div>

		<template v-else>
			<HotList :items="pagedItems" :start-index="startIndex" />
			<ZPagination v-if="totalPages > 1" v-model="page" :total-pages="totalPages" />
		</template>

		<footer class="hot-note">
			<Icon name="tabler:database" />
			<span>数据来自</span>
			<a href="https://hot-api.liiiu.cn/all" target="_blank" rel="noopener noreferrer">DailyHotApi 公开实例</a>
			<span class="dot">·</span>
			<span>浏览器直连，不经过本站服务器；接口侧缓存约 1 小时</span>
		</footer>
	</div>
</div>
</template>

<style scoped>
.hot {
	padding-bottom: 1rem;

	.banner-stat {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.25em 0.7em;
		border: 1px solid var(--c-flat-card-border);
		border-radius: 1em;
		background-color: var(--c-flat-card-bg);
		font-size: 0.8em;
		color: var(--c-text-2);
	}
}

/* 有头图时头图是深色蒙版，统计块也要跟着反色 */
:deep(.page-banner.has-image) .banner-stat {
	border-color: #FFF3;
	background-color: #0004;
	color: #FFF;
}

/*
 * 亮色头图会把白色描述文字吃掉，本页把 PageBanner 的底部蒙版再压深一档
 * （只影响本页，其他页面的头图蒙版不动）。描述文案本身按其他页面的惯例保持一句话，
 * 这样右下角的统计块不会和它抢位，也就不需要用 padding 硬留白——那会让文字折行。
 */
.hot :deep(.page-banner.has-image) > .banner-mask {
	background-image:
		linear-gradient(to var(--end), hsl(220deg 10% 4% / 70%), transparent 72%),
		linear-gradient(to top, hsl(220deg 10% 4% / 84%), transparent 80%);
}

.hot-body {
	padding: 0 1rem;
}

.hot-bar {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.4em 0.8em;
	padding: 0.1em 0.2em 0.4em;

	> .hot-bar-main {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.35em;
		font-size: 0.82em;
		color: var(--c-text-3);

		> strong {
			font-family: var(--font-creative);
			font-size: 1.35em;
			font-weight: 700;
			color: var(--c-text-1);
		}

		> .count {
			font-variant-numeric: tabular-nums;
		}

		> .badge {
			padding: 0.05em 0.45em;
			border-radius: 1em;
			background-color: var(--c-warning-soft);
			font-size: 0.9em;
			color: var(--c-warning);
		}
	}

	> .hot-bar-side {
		display: flex;
		align-items: center;
		gap: 0.5em;
		font-size: 0.78em;
		color: var(--c-text-3);

		> .refresh {
			display: inline-flex;
			align-items: center;
			justify-content: center;
			width: 1.9em;
			height: 1.9em;
			border: 1px solid var(--c-flat-card-border);
			border-radius: 50%;
			background-color: var(--c-flat-card-bg);
			color: var(--c-text-2);
			transition: color 0.2s, border-color 0.2s;
			cursor: pointer;

			&:hover:not(:disabled) {
				border-color: var(--c-primary-soft);
				color: var(--c-primary);
			}

			&:disabled {
				opacity: 0.6;
				cursor: progress;
			}

			> .spinning {
				animation: hot-spin 1s linear infinite;
			}
		}
	}
}

.hot-sub {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.4em 0.6em;
	margin: 0 0 0.6em;
	padding: 0 0.2em;
	font-size: 0.78em;
	color: var(--c-text-3);

	> a {
		display: inline-flex;
		align-items: center;
		gap: 0.15em;
		text-decoration: none;
		color: var(--c-primary);

		&:hover {
			text-decoration: underline;
		}
	}
}

.hot-state {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.6em;
	padding: 4em 1em;
	border: 1px dashed var(--c-flat-card-border);
	border-radius: 0.5em;
	text-align: center;
	color: var(--c-text-3);

	> .iconify {
		opacity: 0.6;
		font-size: 2.2em;
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

.hot-note {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 0.3em;
	padding: 2em 0 1em;
	font-size: 0.78em;
	text-align: center;
	color: var(--c-text-3);

	> a {
		text-decoration: none;
		color: var(--c-primary);

		&:hover {
			text-decoration: underline;
		}
	}

	.dot {
		opacity: 0.5;
	}
}

.hot-bar .dot,
.hot-note .dot {
	opacity: 0.5;
}

@keyframes hot-spin {
	to { transform: rotate(360deg); }
}

@media (prefers-reduced-motion: reduce) {
	.hot-bar .refresh .spinning {
		animation: none;
	}
}

@media (max-width: 768px) {
	.hot-body {
		padding: 0 0.5rem;
	}

	.hot-bar > .hot-bar-side {
		justify-content: space-between;
		width: 100%;
	}

	/* 窄屏下给右下角统计块留出安全距离，描述文案再长也不会压上去 */
	.hot :deep(.page-banner.has-image) .banner-desc {
		max-width: 62%;
	}

	/* 当前平台在下面信息条里已有，窄屏的头图药丸只留平台总数，免得挤掉描述 */
	.banner-stat-platform {
		display: none;
	}
}
</style>
