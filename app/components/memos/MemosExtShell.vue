<script setup lang="ts">
import { safeHttpUrl } from '~/utils/memos/url'

/**
 * 扩展卡片的统一外壳：左侧图标 + 说明文案，右侧可选的「前往」链接。
 *
 * 视觉上做成卡片内部的浅色嵌块（`--c-flat-card-bg-2`），
 * 与说说卡片本身的扁平风格保持一致，不引入新色板。
 *
 * `href` 在这里**统一过一遍协议白名单**：payload 来自接口，任何卡都不该自己拼
 * `<a href>` 后再指望调用方记得校验（`javascript:` 会被 Vue 原样绑上去）。
 */
const props = defineProps<{
	icon: string
	/** 卡片类型文案，如「音乐」「视频」 */
	label: string
	/** 右侧跳转地址，留空或非法协议则不渲染 */
	href?: string
	/** 跳转按钮的提示文案 */
	tip?: string
}>()

const jumpUrl = computed(() => safeHttpUrl(props.href))
</script>

<template>
<div class="memos-ext">
	<div class="memos-ext-head">
		<Icon class="type-icon" :name="icon" />
		<span class="type-label" v-text="label" />
		<a
			v-if="jumpUrl"
			class="jump"
			:href="jumpUrl"
			target="_blank"
			rel="noopener noreferrer"
			:aria-label="tip || label"
			:title="tip"
		>
			<Icon name="tabler:arrow-up-right" />
		</a>
	</div>

	<slot />
</div>
</template>

<style scoped>
.memos-ext {
	display: flex;
	flex-direction: column;
	gap: 0.45em;
	padding: 0.6em 0.7em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg-2);
}

.memos-ext-head {
	display: flex;
	align-items: center;
	gap: 0.35em;
	font-size: 0.78em;
	color: var(--c-text-3);

	> .type-icon {
		flex-shrink: 0;
		font-size: 1.1em;
	}

	> .type-label {
		flex: 1;
		overflow: hidden;
		min-width: 0;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	> .jump {
		display: grid;
		flex-shrink: 0;
		place-items: center;
		padding: 0.1em;
		border-radius: 0.3em;
		color: var(--c-text-3);
		transition: color 0.2s, background-color 0.2s;

		&:hover {
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
		}

		&:focus-visible {
			outline: 2px solid var(--c-primary);
			outline-offset: 1px;
		}
	}
}
</style>
