<script setup lang="ts">
import type { HotItem as HotItemData } from '~/types/hot'

const props = defineProps<{
	item: HotItemData
	rank: number
}>()

const itemLink = computed(() => {
	const url = props.item.url || props.item.mobileUrl || ''
	return typeof url === 'string' ? url.trim() : ''
})
const hasLink = computed(() => !!itemLink.value)

const rankClass = computed(() => ({
	'top-1': props.rank === 1,
	'top-2': props.rank === 2,
	'top-3': props.rank === 3,
}))

/** 微博等平台的 desc 只是标题外面套了 `#`，重复展示只是噪声 */
const normalize = (text: string) => text.replace(/[#\s]/g, '')
/** 接口在缺简介时会回填这类占位文案（B站最常见），一律当没有描述 */
const placeholderPattern = /^(?:该视频|该文章)?(?:暂无|没有)(?:简介|描述|内容|详情)$/

const descText = computed(() => {
	const desc = props.item.desc?.trim() ?? ''
	if (!desc)
		return ''
	const plain = normalize(desc)
	if (placeholderPattern.test(plain))
		return ''
	// 只剩标点的 desc（形如 `-`）同样没有信息量
	if (!/[\p{L}\p{N}]/u.test(plain))
		return ''
	return plain === normalize(props.item.title) ? '' : desc
})

const authorText = computed(() => props.item.author?.trim() || '')

/** 热度按中文习惯压缩：1.2亿 / 12.3万 / 原始值 */
const hotText = computed(() => {
	const hot = props.item.hot
	if (typeof hot !== 'number' || !Number.isFinite(hot) || hot <= 0)
		return ''
	if (hot >= 1e8)
		return `${(hot / 1e8).toFixed(1)}亿`
	if (hot >= 1e4)
		return `${(hot / 1e4).toFixed(1)}万`
	return String(hot)
})

/** 封面多来自各家 CDN 且有防盗链，加载失败就直接收起，不留灰块 */
const coverFailed = ref(false)
const coverSrc = computed(() => coverFailed.value ? '' : (props.item.cover ?? '').trim())
</script>

<template>
<li class="hot-item">
	<component
		:is="hasLink ? 'a' : 'div'"
		class="hot-item-inner"
		:class="{ 'is-link': hasLink }"
		:href="hasLink ? itemLink : undefined"
		:target="hasLink ? '_blank' : undefined"
		:rel="hasLink ? 'noopener noreferrer' : undefined"
	>
		<span class="rank" :class="rankClass" v-text="rank" />

		<div class="body">
			<p class="title">
				<span v-text="item.title" />
				<Icon v-if="hasLink" name="tabler:arrow-up-right" class="ext" />
			</p>
			<p v-if="descText" class="desc" v-text="descText" />
			<p v-if="authorText || hotText" class="meta">
				<span v-if="authorText" class="meta-item">
					<Icon name="tabler:user" />
					<span v-text="authorText" />
				</span>
				<span v-if="hotText" class="meta-item hot">
					<Icon name="tabler:flame" />
					<span v-text="hotText" />
				</span>
			</p>
		</div>

		<div v-if="coverSrc" class="cover">
			<img
				:src="coverSrc"
				:alt="item.title"
				referrerpolicy="no-referrer"
				loading="lazy"
				decoding="async"
				@error="coverFailed = true"
			>
		</div>
	</component>
</li>
</template>

<style scoped>
.hot-item {
	/* 行与行之间用发丝线分隔，整块看起来才像一张完整榜单 */
	border-top: 1px solid var(--c-border);

	&:first-child {
		border-top: none;
	}
}

.hot-item-inner {
	display: grid;
	grid-template-columns: auto minmax(0, 1fr) auto;
	align-items: start;
	gap: 0.7em;
	padding: 0.7em 0.85em;
	border-radius: 0.4em;
	text-decoration: none;
	color: inherit;
	transition: background-color 0.2s;

	&.is-link:hover {
		background-color: var(--c-bg-soft);
	}
}

.rank {
	display: flex;
	flex: none;
	align-items: center;
	justify-content: center;
	width: 1.7em;
	height: 1.7em;
	margin-top: 0.05em;
	border-radius: 0.4em;
	background-color: var(--c-bg-2);
	font-size: 0.82em;
	font-weight: 700;
	font-variant-numeric: tabular-nums;
	color: var(--c-text-3);

	&.top-1 {
		background-color: #EA444D;
		color: #FFF;
	}

	&.top-2 {
		background-color: #ED702D;
		color: #FFF;
	}

	&.top-3 {
		background-color: #EEAD3F;
		color: #FFF;
	}
}

.body {
	display: flex;
	flex-direction: column;
	gap: 0.25em;
	min-width: 0;
}

.title {
	display: flex;
	align-items: baseline;
	gap: 0.25em;
	overflow-wrap: anywhere;
	font-size: 0.94em;
	font-weight: 500;
	line-height: 1.45;
	color: var(--c-text-1);

	> .ext {
		flex: none;
		opacity: 0;
		font-size: 0.85em;
		color: var(--c-primary);
		transition: opacity 0.2s;
	}

	.hot-item-inner:hover & {
		color: var(--c-primary);

		> .ext {
			opacity: 0.8;
		}
	}
}

.desc {
	display: -webkit-box;
	overflow: hidden;
	overflow-wrap: anywhere;
	margin: 0;
	font-size: 0.8em;
	-webkit-line-clamp: 2;
	line-height: 1.55;
	color: var(--c-text-3);
	-webkit-box-orient: vertical;
}

.meta {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.2em 0.8em;
	margin: 0.1em 0 0;
	font-size: 0.75em;
	color: var(--c-text-3);

	> .meta-item {
		display: inline-flex;
		align-items: center;
		gap: 0.25em;
		min-width: 0;

		> span {
			overflow: hidden;
			white-space: nowrap;
			text-overflow: ellipsis;
		}
	}

	> .meta-item.hot {
		color: var(--c-warning);
	}
}

.cover {
	flex: none;
	overflow: hidden;
	width: 4.6em;
	aspect-ratio: 16 / 9;
	border-radius: 0.3em;
	background-color: var(--c-bg-2);

	> img {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
}

@media (max-width: 528px) {
	.hot-item-inner {
		gap: 0.55em;
		padding: 0.65em 0.4em;
	}

	.cover {
		width: 3.6em;
	}

	.desc {
		-webkit-line-clamp: 1;
	}
}
</style>
