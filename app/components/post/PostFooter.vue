<script setup lang="ts">
import type { ArticleProps } from '~/types/article'

defineOptions({ inheritAttrs: false })
const props = defineProps<ArticleProps>()

const appConfig = useAppConfig()
const rewardStore = useRewardStore()

const [DefineCardSection, ReuseCardSection] = createReusableTemplate<{
	title: string
}>({ inheritAttrs: false })

const author = computed(() => appConfig.author.name)
/** 卡片网格比正文窄，中文长日期会折行，这里用数字格式保证一行放得下 */
const dateFormat = { year: 'numeric', month: '2-digit', day: '2-digit' } as const
const fullUrl = computed(() => {
	if (!props.path)
		return ''
	try {
		return new URL(props.path, appConfig.url).href
	}
	catch {
		return props.path
	}
})

// 标签后面要带「同标签共几篇」，只查 tags 一列，避免把整份文章索引塞进每篇文章的 payload
const { data: tagIndex } = await useAsyncData(
	'post-footer:tags',
	() => queryCollection('content').where('stem', 'LIKE', 'posts/%').select('tags').all(),
	{ default: () => [] },
)

const tagCount = computed(() => {
	const map: Record<string, number> = {}
	for (const article of tagIndex.value) {
		for (const tag of article.tags ?? [])
			map[tag] = (map[tag] ?? 0) + 1
	}
	return map
})

const tags = computed(() => props.tags ?? [])
const licenseTitle = computed(() => props.meta?.slots?.copyright?.props?.title as string || '许可协议')
</script>

<template>
<div v-if="!meta?.hideInfo" class="post-footer">
	<section class="author-card">
		<!-- 装饰水印，不承担交互 -->
		<div class="copyright-badge" aria-hidden>
			<Icon name="tabler:copyright" />
		</div>

		<div class="card-left">
			<div class="card-header">
				<h3 class="card-title" :class="getPostTypeClassName(type)">
					{{ title }}
				</h3>
				<p v-if="fullUrl" class="card-url">
					{{ fullUrl }}
				</p>
			</div>

			<div class="card-meta">
				<div class="meta-item">
					<span class="label">文章作者</span>
					<span class="value">{{ author }}</span>
				</div>
				<div class="meta-item">
					<span class="label">发布时间</span>
					<UtilDate
						class="value"
						:date
						:format="dateFormat"
					/>
				</div>
				<div v-if="isTimeDiffSignificant(date, updated, 1)" class="meta-item">
					<span class="label">更新时间</span>
					<UtilDate
						class="value"
						:date="updated"
						:format="dateFormat"
					/>
				</div>
			</div>

			<div class="card-copyright">
				<span class="label">版权信息</span>
				<ProseA class="value" :href="appConfig.copyright.url" :title="appConfig.copyright.name" :icon="false">
					{{ appConfig.copyright.abbr }}
				</ProseA>
			</div>
		</div>

		<DefineCardSection v-slot="{ $slots, title: sectionTitle }">
			<section class="card-section">
				<div class="section-title text-creative">
					{{ sectionTitle }}
				</div>
				<div class="section-content">
					<component :is="$slots.default" />
				</div>
			</section>
		</DefineCardSection>

		<ReuseCardSection v-if="references" title="参考链接">
			<ul>
				<li v-for="{ title: refTitle, link }, i in references" :key="i">
					<ProseA :href="link || ''">
						{{ refTitle ?? link }}
					</ProseA>
				</li>
			</ul>
		</ReuseCardSection>

		<ReuseCardSection :title="licenseTitle">
			<ContentRenderer v-if="meta?.slots?.copyright" :value="meta?.slots?.copyright" />
			<p v-else>
				本文采用 <ProseA :href="appConfig.copyright.url">
					{{ appConfig.copyright.name }}
				</ProseA>
				许可协议，转载请注明出处。
			</p>
		</ReuseCardSection>
	</section>

	<section class="post-bottom">
		<div v-if="tags.length" class="tags">
			<UtilLink
				v-for="tag in tags"
				:key="tag"
				class="tag"
				:to="`/tags?tag=${encodeURIComponent(tag)}`"
			>
				{{ tag }}
				<span v-if="tagCount[tag]" class="tag-number">{{ tagCount[tag] }}</span>
			</UtilLink>
		</div>

		<ZButton
			v-if="rewardStore.enabled"
			class="reward-button"
			icon="tabler:sparkles"
			text="打赏"
			@click="rewardStore.open()"
		/>
	</section>
</div>
</template>

<style scoped>
.post-footer {
	overflow: clip;
	margin: 2rem 0.5rem;
	border: 1px solid var(--c-border);
	border-radius: 1rem;
	background-color: var(--c-bg-2);
}

section {
	padding: 1.2rem;
}

.author-card {
	display: flex;
	flex-direction: column;
	gap: 1rem;
	position: relative;
	padding: 1.5rem;
}

.copyright-badge {
	position: absolute;
	opacity: 0.06;
	inset-block-start: 1.2rem;
	inset-inline-end: 1.2rem;
	font-size: 2rem;
	color: var(--c-text);
	pointer-events: none;
}

.card-left {
	display: flex;
	flex-direction: column;
	gap: 1rem;
}

.card-header {
	display: flex;
	flex-direction: column;
	gap: 0.4rem;
	padding-inline-end: 2.5rem;
}

.card-title {
	margin: 0;
	font-size: 1.1rem;
	font-weight: 700;
	line-height: 1.4;
	color: var(--c-text);
}

.card-url {
	margin: 0;
	font-size: 0.85rem;
	word-break: break-all;
	color: var(--c-text-3);
	user-select: all;
}

.card-meta {
	display: grid;
	grid-template-columns: repeat(auto-fit, minmax(7em, 1fr));
	gap: 0.8rem;
	font-size: 0.8rem;

	> .meta-item {
		display: flex;
		flex-direction: column;
		gap: 0.1rem;

		> .label {
			font-weight: 500;
			color: var(--c-text-2);
		}

		> .value {
			font-size: 0.9rem;
			font-weight: 500;
			word-break: break-word;
			color: var(--c-text);
		}
	}
}

/* 版权协议名比一列宽，单独一行并让 label 与值左右并排 */
.card-copyright {
	display: flex;
	align-items: baseline;
	gap: 0.5em;
	font-size: 0.8rem;
	white-space: nowrap;

	> .label {
		font-weight: 500;
		color: var(--c-text-2);
	}

	> .value {
		font-size: 0.9rem;
		font-weight: 500;
		color: var(--c-text);
	}
}

.card-section {
	padding: 1rem 0 0;
	border-top: 1px solid var(--c-border);
}

.section-title {
	font-weight: 700;
	color: var(--c-text);
}

.section-content {
	margin-block-start: 0.5em;
	font-size: 0.9rem;

	> ul {
		margin: 0;
		padding: 0;
		list-style: none;
	}

	li {
		margin: 0.6em 0;
	}
}

.post-bottom {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.8rem;
	border-top: 1px solid var(--c-border);
}

.tags {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 0.5rem;
}

/* 标签多到换行时，打赏按钮仍贴右边 */
:deep(.reward-button) {
	margin-inline-start: auto;
}

.tag {
	display: inline-flex;
	align-items: center;
	height: 2rem;
	padding-inline: 0.6rem;
	border: 1px solid var(--c-border);
	border-radius: 0.5rem;
	background-color: var(--c-bg);
	font-size: 0.85em;
	white-space: nowrap;
	color: var(--c-text);
	transition: all 0.2s ease-in-out;

	&:hover {
		border-color: var(--c-primary);
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}

	> .tag-number {
		display: inline-block;
		min-width: 1.4rem;
		margin-inline-start: 0.25rem;
		padding: 2px;
		border-radius: 0.25rem;
		background-color: var(--c-text);
		font-size: 0.7rem;
		line-height: 1;
		text-align: center;
		color: var(--c-bg);
		transition: 0.2s;
	}

	&:hover > .tag-number {
		background-color: var(--c-primary);
		color: var(--c-bg);
	}
}

@media (max-width: 768px) {
	.post-footer {
		margin-inline: 0;
		border-radius: 0.8rem;
	}

	.author-card {
		padding: 1.2rem !important;
	}

	.card-meta {
		grid-template-columns: repeat(auto-fit, minmax(5.5em, 1fr));
	}
}
</style>
