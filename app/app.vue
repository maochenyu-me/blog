<script setup lang="ts">
import type { RouteLocationNormalizedLoaded } from 'vue-router'
// 目录 app/components/app/ 会被 Nuxt 自动加目录前缀（注册名是 AppAppStatusBar / AppAppBootError），
// 这里显式导入，模板里才能用直觉上的名字；也避免为两个组件去改 nuxt.config.ts 的 components 数组。
import AppBootError from '~/components/app/AppBootError.vue'
import AppStatusBar from '~/components/app/AppStatusBar.vue'

/**
 * 稳定的 pageKey 引用。
 *
 * 内联箭头函数每次渲染都是新引用，会让 NuxtPage 重启加载条；旧实现用 `v-once` 规避，
 * 但 `v-once` 会连 NuxtPage 的 VNode 一起缓存——一旦路由切换到使用**自定义布局**的页面
 * （如 /go 的 safego 布局），布局组件被整体替换，那个缓存的 VNode 无法重新挂载，
 * 页面就会渲染成空白。改成模块级稳定函数后不再需要 `v-once`，两者都能成立。
 */
const contentPageKey = (route: RouteLocationNormalizedLoaded) => normalizeContentPath(route.path)

// app-only UI 的数据源。非 Tauri 环境（含 SSR 预渲染）拿到的是 isApp=false 的空实现。
const appBridge = useAppBridge()
</script>

<template>
<NuxtLayout>
	<!-- pageKey 现在是稳定引用，这里不需要 v-once，路由仍由 NuxtPage 内部更新。 -->
	<NuxtPage :page-key="contentPageKey" />
</NuxtLayout>
<!--
	app-only UI。ClientOnly 是必须的：静态产物在服务端预渲染时 `__TAURI__` 不存在，
	直接渲染会造成水合不匹配。浏览器访问站点时 isApp 恒为 false，这两块 DOM 完全不渲染。
-->
<ClientOnly>
	<AppStatusBar v-if="appBridge.isApp" />
	<AppBootError v-if="appBridge.isApp" />
</ClientOnly>
</template>
