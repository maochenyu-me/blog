<script setup lang="ts">
const appConfig = useAppConfig()
const banner = appConfig.memos.banner

useSeoMeta({
	title: '说说',
	description: `${appConfig.title}的说说页面，收录 Telegram 频道里的日常碎片与随想。`,
})
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
	<WidgetBlogLog />
</template>

<ZPageBanner v-if="banner" v-bind="banner" />

<div v-else class="hide-above-mobile">
	<BlogHeader to="/" suffix="说说" tag="h1" />
</div>

<MemosTimeline />

<PostComment page-title="说说" />
</template>
