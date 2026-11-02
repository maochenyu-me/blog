<template>
<main class="layout-safego">
	<slot />
</main>
</template>

<style scoped>
/* 用 fixed 脱离文档流：default.vue 的非 scoped 样式把 #blog-root 设成了三列 grid，
   普通流式元素会被放进 280px 的第一列。inset: 0 + 内部滚动对 grid 完全免疫。 */
.layout-safego {
	position: fixed;
	inset: 0;
	z-index: 1;
	display: flex;
	overflow-y: auto;
	padding: 1rem;
	background-color: var(--c-bg-1);
}
</style>
