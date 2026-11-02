<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'

/**
 * 稳定的 pageKey 引用。
 *
 * 内联箭头函数每次渲染都是新引用，会让 NuxtPage 重启加载条；旧实现用 `v-once` 规避，
 * 但 `v-once` 会连 NuxtPage 的 VNode 一起缓存——一旦路由切换到使用**自定义布局**的页面
 * （如 /go 的 safego 布局），布局组件被整体替换，那个缓存的 VNode 无法重新挂载，
 * 页面就会渲染成空白。改成模块级稳定函数后不再需要 `v-once`，两者都能成立。
 */
const contentPageKey = (route: RouteLocationNormalizedLoaded) => normalizeContentPath(route.path)
</script>

<template>
<NuxtLayout>
	<!-- pageKey 现在是稳定引用，这里不需要 v-once，路由仍由 NuxtPage 内部更新。 -->
	<NuxtPage :page-key="contentPageKey" />
</NuxtLayout>
</template>