<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'

/** 网站扩展卡：标题 + 域名，整块可点 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'website' }>
}>()

/** 只认 http(s)，其余（`javascript:` 之类）一律不给链接 */
const safeUrl = computed(() => {
	try {
		const url = new URL(props.ext.site)
		return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
	}
	catch {
		return ''
	}
})

const domain = computed(() => {
	try {
		return new URL(props.ext.site).hostname.replace(/^www\./, '')
	}
	catch {
		return props.ext.site.replace(/^https?:\/\//, '').replace(/\/+$/, '')
	}
})
</script>

<template>
<MemosExtShell icon="tabler:link" label="网站" :href="safeUrl || undefined" tip="打开网站">
	<a
		v-if="safeUrl"
		class="memos-website"
		:href="safeUrl"
		target="_blank"
		rel="noopener noreferrer"
	>
		<span class="title" v-text="ext.title" />
		<span class="domain" v-text="domain" />
	</a>
	<p v-else class="memos-website">
		<span class="title" v-text="ext.title" />
		<span class="domain" v-text="domain" />
	</p>
</MemosExtShell>
</template>

<style scoped>
.memos-website {
	display: flex;
	flex-direction: column;
	gap: 0.1em;
	padding: 0.15em 0.2em;
	border-radius: 0.35em;
	text-decoration: none;
	color: inherit;

	.title {
		font-weight: 600;
		color: var(--c-text-1);
	}

	.domain {
		font-size: 0.8em;
		color: var(--c-text-3);
	}

	&[href] {
		&:hover {
			background-color: var(--c-bg-2);

			.title {
				color: var(--c-primary);
			}
		}

		&:focus-visible {
			outline: 2px solid var(--c-primary);
			outline-offset: 1px;
		}
	}
}
</style>
