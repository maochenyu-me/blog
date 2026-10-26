<script setup lang="ts">
/**
 * 「为TA充电」右侧的电路板走线，viewBox 与路径取自源站（1028×385），
 * 描边走 currentColor，由外层 class 决定灰底 / 粉色 / 黄色。
 */
</script>

<template>
<svg
	viewBox="0 0 1028 385"
	fill="none"
	xmlns="http://www.w3.org/2000/svg"
	aria-hidden="true"
	focusable="false"
>
	<path d="M1 77H234.226L307.006 24H790" stroke="currentColor" stroke-width="20" />
	<path d="M0 140H233.035L329.72 71H1028" stroke="currentColor" stroke-width="20" />
	<path d="M1 255H234.226L307.006 307H790" stroke="currentColor" stroke-width="20" />
	<path d="M0 305H233.035L329.72 375H1028" stroke="currentColor" stroke-width="20" />
	<rect y="186" width="236" height="24" fill="currentColor" />
	<ellipse cx="790" cy="25.5" rx="25" ry="25.5" fill="currentColor" />
	<circle r="14" transform="matrix(1 0 0 -1 790 25)" fill="var(--c-flat-card-bg)" />
	<ellipse cx="790" cy="307.5" rx="25" ry="25.5" fill="currentColor" />
	<circle r="14" transform="matrix(1 0 0 -1 790 308)" fill="var(--c-flat-card-bg)" />
</svg>
</template>
