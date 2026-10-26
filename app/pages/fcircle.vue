<script setup lang="ts">
import type { FcircleData, FcircleItem, FcircleSite } from '~/types/fcircle'
import fcircleData from '~/data/fcircle.json'

const appConfig = useAppConfig()
const fcircle = fcircleData as FcircleData
const banner = appConfig.fcircle.banner

useSeoMeta({
	title: '朋友圈',
	description: `${appConfig.title}的朋友圈，聚合友链朋友们最近发布的文章，每篇文章都指向原站。`,
})

interface CircleEntry {
	item: FcircleItem
	site: FcircleSite
}

/** 只展示有文章的站点，避免给空站点留位置 */
const sites = computed(() => fcircle.sites.filter(site => site.items.length))
const total = computed(() => sites.value.reduce((sum, site) => sum + site.items.length, 0))

/** 全站文章按发布时间倒序，瀑布流从新到旧排布 */
const allEntries = computed<CircleEntry[]>(() => sites.value
	.flatMap(site => site.items.map(item => ({ item, site })))
	.sort((a, b) => new Date(b.item.date).getTime() - new Date(a.item.date).getTime()),
)

const activeSite = ref('')
const keyword = ref('')

const entries = computed<CircleEntry[]>(() => {
	const query = keyword.value.trim().toLowerCase()

	return allEntries.value.filter(({ item, site }) => {
		if (activeSite.value && site.id !== activeSite.value)
			return false
		if (!query)
			return true
		return `${item.title}\n${item.excerpt}\n${site.name}`.toLowerCase().includes(query)
	})
})

const filtering = computed(() => !!activeSite.value || !!keyword.value)

function resetFilters() {
	activeSite.value = ''
	keyword.value = ''
}
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogLog />
</template>

<div class="fcircle proper-height">
	<ZPageBanner v-bind="banner">
		<div class="banner-friends">
			<img
				v-for="site in sites.slice(0, 6)"
				:key="site.id"
				:src="site.avatar"
				:alt="site.name"
				:title="site.name"
				loading="lazy"
				decoding="async"
			>
			<span v-if="sites.length > 6" class="more">+{{ sites.length - 6 }}</span>
		</div>

		<span class="banner-stat">
			<Icon name="tabler:friends" />
			{{ sites.length }} 站 · {{ total }} 篇
		</span>
	</ZPageBanner>

	<div class="fcircle-body">
		<FcircleFilter
			v-if="sites.length"
			v-model:active-site="activeSite"
			v-model:keyword="keyword"
			:sites="sites"
			:total="total"
		/>

		<!-- 一条数据都没有（例如首次部署前还没跑过爬虫） -->
		<div v-if="!sites.length" class="fcircle-state">
			<Icon name="tabler:rss" />
			<p>还没有抓到友链文章。数据由 GitHub Actions 每天自动更新。</p>
		</div>

		<!-- 筛选后为空 -->
		<div v-else-if="!entries.length" class="fcircle-state">
			<Icon name="tabler:mood-empty" />
			<p>没有匹配的文章，换个关键词试试。</p>
			<button type="button" @click="resetFilters">
				重置筛选
			</button>
		</div>

		<template v-else>
			<p class="fcircle-count">
				{{ filtering ? `筛选出 ${entries.length} 篇` : `共 ${entries.length} 篇` }}
			</p>

			<div class="fcircle-list">
				<FcircleCard
					v-for="entry, index in entries"
					:key="entry.item.link"
					:item="entry.item"
					:site="entry.site"
					:style="getFixedDelay(Math.min(index, 20) * 0.025)"
				/>
			</div>
		</template>

		<footer v-if="sites.length" class="fcircle-note">
			<Icon name="tabler:rss" />
			<span>数据来自各站订阅源，每天凌晨自动更新</span>
			<span class="dot">·</span>
			<span>更新于</span>
			<UtilDate :date="fcircle.generatedAt" absolute />
		</footer>
	</div>
</div>
</template>

<style scoped>
.fcircle {
	padding-bottom: 1rem;

	.banner-friends {
		display: flex;
		align-items: center;
		margin-inline-end: 0.2em;

		img {
			width: 2em;
			height: 2em;
			margin-inline-start: -0.55em;
			border-radius: 50%;
			box-shadow: 0 0 0 2px var(--c-bg-1);
			transition: transform 0.2s;
			object-fit: cover;

			&:first-child {
				margin-inline-start: 0;
			}

			&:hover {
				transform: translateY(-0.15em);
			}
		}

		.more {
			margin-inline-start: 0.35em;
			font-size: 0.75em;
			color: var(--c-text-3);
			font-variant-numeric: tabular-nums;
		}
	}

	.banner-stat {
		display: inline-flex;
		align-items: center;
		gap: 0.3em;
		padding: 0.25em 0.7em;
		border: 1px solid var(--c-flat-card-border);
		border-radius: 1em;
		background-color: var(--c-flat-card-bg);
		backdrop-filter: blur(6px);
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

.fcircle-body {
	padding: 0 1rem;
}

.fcircle-count {
	margin: 0.2em 0 0.6em;
	font-size: 0.78em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

/* 多列瀑布流：列数随宽度自适应，卡片高度不齐也能错落排布 */
.fcircle-list {
	columns: 3 17em;
	column-gap: 0.8em;

	> * {
		display: block;
		margin-bottom: 0.8em;
	}
}

.fcircle-state {
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

.fcircle-note {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: center;
	gap: 0.3em;
	padding: 2em 0 1em;
	font-size: 0.78em;
	text-align: center;
	color: var(--c-text-3);

	.dot {
		opacity: 0.5;
	}
}

@media (max-width: 768px) {
	.fcircle-body {
		padding: 0 0.5rem;
	}

	.fcircle-list {
		columns: 2 9em;
		column-gap: 0.6em;

		> * {
			margin-bottom: 0.6em;
		}
	}
}

@media (max-width: 528px) {
	.fcircle-list {
		columns: 1;
	}
}
</style>
