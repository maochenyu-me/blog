<script setup lang="ts">
import type { MessageTipPart } from '~/types/message'

const appConfig = useAppConfig()
const { banner, tips } = appConfig.message

useSeoMeta({
	title: '留言板',
	description: `${appConfig.title}的留言板：${banner.description}。`,
})

/** 片段是链接时渲染成站内链接，否则按纯文本输出 */
function isLink(part: MessageTipPart): part is Exclude<MessageTipPart, string> {
	return typeof part !== 'string'
}
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
	<WidgetBlogLog />
</template>

<ZPageBanner v-bind="banner" />

<div class="page-message">
	<Quote
		v-for="(tip, index) in tips"
		:key="index"
		:icon="tip.icon"
		class="message-tip"
	>
		<template v-for="(part, partIndex) in tip.parts" :key="partIndex">
			<ProseA v-if="isLink(part)" :href="part.href">
				{{ part.label }}
			</ProseA>
			<template v-else>
				{{ part }}
			</template>
		</template>
	</Quote>
</div>

<PostComment page-title="留言板" />
</template>

<style scoped>
.page-message {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 1.5rem;
	margin: 1rem;
	text-align: center;
	animation: float-in 0.2s backwards;

	> .message-tip {
		width: 100%;
		max-width: 700px;
		font-size: 1.2rem;
		font-weight: 500;
		line-height: 1.5;
		text-align: center;
		color: var(--c-text-2);
	}
}

@media (max-width: 768px) {
	.page-message {
		gap: 1rem;
		margin: 0.5rem;
	}
}
</style>
