<script setup lang="ts">
// const { timeEstablished } = useAppConfig()

const blogLog = [
	{ label: '2026-09-26', value: '再次改动此主题。' },
	{ label: '2025-02-11', value: '第一次使用且改动纸鹿的博客' },
	{ label: '2024-11-01', value: '开启博客之旅' },
	// { label: timeEstablished, value: '发布第一篇文章' },
]
</script>

<template>
<BlogWidget card title="更新日志">
	<ZDlGroup size="large" :items="blogLog" />
</BlogWidget>
</template>
