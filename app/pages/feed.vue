<script setup lang="ts">
import { orderBy } from 'es-toolkit/array'

const appConfig = useAppConfig()

const title = '订阅'
const description = `用 RSS/Atom 阅读器订阅 ${appConfig.title} 的最新文章。`
useSeoMeta({ title, description })

/** 人类看本页，阅读器只认原始 feed：两者分开，避免 XSLT 那套浏览器专属渲染 */
const feedUrl = new URL('/atom.xml', appConfig.url).toString()
const { copy, copied } = useCopy(feedUrl)

const { data: listRaw } = await useAsyncData('posts:index', () => queryArticleIndex(), { default: () => [] })

/** 与 Atom 订阅源同样的条数和排序（updated 倒序），页面看到的就是阅读器收到的 */
const list = computed(() => orderBy(
	listRaw.value,
	article => new Date(article.updated || article.date || 0).getTime(),
	'desc',
).slice(0, appConfig.feed.limit))
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogLog />
</template>

<BlogHeader class="hide-above-mobile" to="/" />

<div class="feed-page">
	<section class="feed-intro card">
		<h1 class="feed-title">
			<Icon name="tabler:rss" />
			订阅
		</h1>

		<p class="feed-desc">
			把下面的地址加进任意 RSS / Atom 阅读器（Follow、Inoreader、Feedly、NetNewsWire…），
			就能收到 {{ appConfig.title }} 的新文章，不用反复回来看。
		</p>

		<div class="feed-address">
			<code class="feed-url">{{ feedUrl }}</code>
			<button class="feed-copy" type="button" :aria-label="copied ? '已复制' : '复制订阅地址'" @click="copy()">
				<Icon :name="copied ? 'tabler:check' : 'tabler:copy'" />
				{{ copied ? '已复制' : '复制' }}
			</button>
		</div>

		<p class="feed-alt">
			也可以直接打开
			<a href="/atom.xml">原始 Atom XML</a>
			，或导出
			<a href="/subscriptions.opml">OPML 订阅列表</a>
			一次导入全部友链。
		</p>
	</section>

	<h2 class="feed-section-title">
		最近 {{ list.length }} 篇
	</h2>

	<menu class="feed-list">
		<PostArticle
			v-for="article, index in list"
			:key="article.path"
			:data-list-key="article.path"
			v-bind="article"
			:to="article.path"
			:style="getFixedDelay(index * 0.05)"
		/>
	</menu>
</div>
</template>

<style scoped>
.feed-page {
	max-width: 800px;
	margin: 1rem auto;
	padding: 2rem 0;
}

.feed-intro {
	display: grid;
	gap: 1rem;
	margin-bottom: 2rem;
	padding: 1.5rem;
	border: 1px solid var(--c-border);
}

.feed-title {
	display: flex;
	align-items: center;
	gap: 0.5rem;
	font-size: 1.6rem;
	color: var(--c-text);

	> .iconify {
		color: var(--c-primary);
	}
}

.feed-desc {
	line-height: 1.7;
	color: var(--c-text-2);
}

.feed-address {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
}

.feed-url {
	flex: 1;
	overflow: auto hidden;
	min-width: 0;
	padding: 0.6em 0.8em;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	background-color: var(--c-bg-2);
	font-family: "JetBrains Mono", monospace;
	font-size: 0.9em;
	white-space: nowrap;
	color: var(--c-text-1);
}

.feed-copy {
	display: inline-flex;
	align-items: center;
	gap: 0.4em;
	padding: 0.6em 1em;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	background-color: var(--c-bg-2);
	color: var(--c-text-1);
	transition: all 0.2s;

	&:hover {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}
}

.feed-alt {
	font-size: 0.85em;
	color: var(--c-text-3);

	a {
		text-decoration: underline;
		text-decoration-color: var(--c-primary-soft);
		color: var(--c-primary);
		text-underline-offset: 0.2em;
	}
}

.feed-section-title {
	margin-bottom: 1rem;
	font-size: 1.1rem;
	color: var(--c-text-2);
}
</style>
