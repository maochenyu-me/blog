<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'

/**
 * 定位扩展卡。
 *
 * 默认只显示地名与坐标；点击后才创建 OpenStreetMap 的 embed iframe
 * （零依赖、不加载任何地图 SDK，也不会在首屏就多打一个跨站请求）。
 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'location' }>
}>()

const appConfig = useAppConfig()
const mapEnabled = computed(() => appConfig.memos.ech0?.locationMap !== false)

const open = ref(false)
const everOpened = ref(false)

const coords = computed(() => {
	const lat = props.ext.latitude.toFixed(4)
	const lng = props.ext.longitude.toFixed(4)
	return `${lat}, ${lng}`
})

const displayText = computed(() => props.ext.placeholder || coords.value)

/** OSM 的 bbox 需要 `left,bottom,right,top`（经度在前），留约 ±1km 视野 */
const mapSrc = computed(() => {
	const pad = 0.008
	const left = (props.ext.longitude - pad).toFixed(5)
	const right = (props.ext.longitude + pad).toFixed(5)
	const top = (props.ext.latitude + pad).toFixed(5)
	const bottom = (props.ext.latitude - pad).toFixed(5)
	const marker = `${props.ext.latitude.toFixed(5)},${props.ext.longitude.toFixed(5)}`
	return `https://www.openstreetmap.org/export/embed.html?bbox=${left},${bottom},${right},${top}&layer=mapnik&marker=${marker}`
})

const externalUrl = computed(() =>
	`https://www.openstreetmap.org/?mlat=${props.ext.latitude}&mlon=${props.ext.longitude}#map=15/${props.ext.latitude}/${props.ext.longitude}`)

function toggle() {
	open.value = !open.value
	if (open.value)
		everOpened.value = true
}
</script>

<template>
<MemosExtShell icon="tabler:map-pin" label="定位" :href="externalUrl" tip="在地图中打开">
	<button
		type="button"
		class="memos-location"
		:aria-expanded="mapEnabled ? open : undefined"
		@click="mapEnabled && toggle()"
	>
		<span class="place" v-text="displayText" />
		<span class="coords" v-text="coords" />
	</button>

	<div v-if="mapEnabled && everOpened" v-show="open" class="map">
		<iframe :src="mapSrc" title="地图" loading="lazy" referrerpolicy="no-referrer" />
	</div>
</MemosExtShell>
</template>

<style scoped>
.memos-location {
	display: flex;
	flex-direction: column;
	gap: 0.1em;
	width: 100%;
	padding: 0.15em 0.2em;
	border: none;
	border-radius: 0.35em;
	background: none;
	text-align: left;
	color: inherit;
	cursor: pointer;

	&:hover {
		background-color: var(--c-bg-2);

		.place {
			color: var(--c-primary);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 1px;
	}

	.place {
		font-weight: 600;
		color: var(--c-text-1);
	}

	.coords {
		font-family: var(--font-monospace);
		font-size: 0.78em;
		color: var(--c-text-3);
	}
}

.map {
	overflow: hidden;
	border-radius: 0.4em;
	background-color: var(--c-bg-3);

	iframe {
		display: block;
		width: 100%;
		height: 12em;
		border: none;
	}
}
</style>
