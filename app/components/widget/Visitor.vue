<script setup lang="ts">
import type { VisitorConfig, VisitorGeo } from '~/types/visitor'
import { getGeoDistance, getPartText, getRegionText, isHighlightPart, isLinkPart, isPublicIp, normalizeGeo, pickGreeting } from '~/utils/visitor'

/** 会话内缓存键，版本号变了旧缓存自然失效 */
const CACHE_KEY = 'visitor:v1'

interface VisitorState {
	at: number
	ip: string
	geo: VisitorGeo | null
}

const appConfig = useAppConfig()
// app.config 里用 satisfies 标注过类型，这里取到的就是 VisitorConfig
const config = computed(() => appConfig.component.visitor as VisitorConfig)

const status = ref<'idle' | 'loading' | 'ready' | 'error'>('idle')
const ip = ref('')
const geo = ref<VisitorGeo | null>(null)
/** 挂载后才取值，构建期算出的问候语会与访客本地时间不符 */
const localHour = ref(0)
const mounted = useMounted()

const greeting = computed(() => mounted.value ? pickGreeting(localHour.value, config.value.greetings) : '')
const regionText = computed(() => geo.value && getRegionText(geo.value))
const distance = computed(() => {
	if (geo.value?.lat == null || geo.value?.lng == null)
		return null
	return getGeoDistance(config.value.origin, { lat: geo.value.lat, lng: geo.value.lng })
})
const isDomestic = computed(() => geo.value?.countryCode === 'CN')

function readCache() {
	try {
		const raw = sessionStorage.getItem(CACHE_KEY)
		if (!raw)
			return null
		const cached = JSON.parse(raw) as VisitorState
		if (Date.now() - cached.at > config.value.cacheTtl)
			return null
		return cached
	}
	catch {
		return null
	}
}

function writeCache(state: VisitorState) {
	try {
		sessionStorage.setItem(CACHE_KEY, JSON.stringify(state))
	}
	catch {}
}

/** 接口偶尔抖动，重试一次再判定失败 */
async function requestJson<T>(url: string): Promise<T> {
	const controller = new AbortController()
	const timer = setTimeout(() => controller.abort(), config.value.requestTimeout)
	try {
		return await $fetch<T>(url, { signal: controller.signal })
	}
	catch (error) {
		clearTimeout(timer)
		try {
			return await $fetch<T>(url)
		}
		catch {
			throw error
		}
	}
	finally {
		clearTimeout(timer)
	}
}

async function load() {
	const cached = readCache()
	if (cached) {
		ip.value = cached.ip
		geo.value = cached.geo
		status.value = 'ready'
		return
	}

	status.value = 'loading'
	try {
		const ipResponse = await requestJson<{ data?: { ip?: string } }>(config.value.ipApi)
		const currentIp = ipResponse?.data?.ip?.trim() ?? ''
		if (!currentIp)
			throw new Error('IP 接口未返回地址')

		ip.value = currentIp
		geo.value = null

		const geoApi = config.value.geoApi
		if (geoApi && isPublicIp(currentIp)) {
			const url = geoApi.includes('{ip}') ? geoApi.replace('{ip}', currentIp) : geoApi
			try {
				geo.value = normalizeGeo(await requestJson(url), currentIp)
			}
			catch (error) {
				// 定位失败只影响地区与距离，IP 和问候语照常展示
				console.warn('[visitor] 定位失败', error)
			}
		}

		status.value = 'ready'
		writeCache({ at: Date.now(), ip: currentIp, geo: geo.value })
	}
	catch (error) {
		console.warn('[visitor] 获取访客信息失败', error)
		status.value = 'error'
	}
}

onMounted(() => {
	localHour.value = new Date().getHours()
	void load()
})
</script>

<template>
<BlogWidget card :title="config.title">
	<div class="welcome-copy">
		<p v-for="(paragraph, index) in config.content" :key="index">
			<template v-for="(part, partIndex) in paragraph" :key="partIndex">
				<UtilLink v-if="isLinkPart(part)" :to="part.href" class="welcome-link">
					{{ getPartText(part) }}
				</UtilLink>
				<strong v-else-if="isHighlightPart(part)">{{ getPartText(part) }}</strong>
				<template v-else>
					{{ getPartText(part) }}
				</template>
			</template>
		</p>
	</div>

	<div class="welcome-info" aria-live="polite">
		<template v-if="mounted && status === 'ready'">
			<p v-if="regionText">
				嗷嗷！来自<strong>{{ regionText }}</strong>的朋友！
			</p>
			<p>泥嚎！微我五十！</p>
			<p>{{ isDomestic ? '带我去你的城市逛逛吧' : '带我去你的国家逛逛吧' }} 🍂</p>
			<p v-if="distance !== null">
				你目前距博主约<strong>{{ distance }}</strong> 公里。
			</p>
			<p>
				你的网络 IP 为：<span class="welcome-ip" :class="{ 'hide-ip': config.blurIp }" tabindex="0">{{ ip }}</span>
			</p>
			<p v-if="greeting" class="welcome-greeting">
				{{ greeting }}
			</p>
		</template>

		<p v-else-if="mounted && status === 'error'" class="welcome-placeholder">
			<Icon name="tabler:face-id-error" aria-hidden="true" />
			<span>定位失败，刷新重试呀。</span>
		</p>

		<p v-else class="welcome-placeholder">
			<Icon name="tabler:location" aria-hidden="true" />
			<span>正在辨认风从哪里来...</span>
		</p>
	</div>
</BlogWidget>
</template>

<style scoped>
.welcome-copy {
	display: grid;
	gap: 0.55rem;
	font-size: 0.95em;
	line-height: 1.7;
	color: var(--c-text-2);

	strong, .welcome-link {
		font-weight: 700;
		color: var(--c-primary);
	}

	.welcome-link {
		text-decoration: underline;
		text-underline-offset: 0.16em;
		text-decoration-thickness: 1px;
		transition: opacity 0.2s;

		&:hover {
			opacity: 0.8;
		}
	}
}

.welcome-info {
	margin-top: 0.85rem;
	padding: 0.85rem;
	border: 1px solid var(--c-border);
	border-radius: 0.8rem;
	background-color: var(--c-bg-soft);
	font-size: 0.95em;
	line-height: 1.75;
	text-align: center;
	color: var(--c-text-2);

	> p + p {
		margin-top: 0.35rem;
	}

	strong {
		font-weight: 700;
		color: var(--c-primary);
	}
}

.welcome-ip {
	display: inline-block;
	overflow: hidden;
	max-width: 100%;
	font-family: var(--font-monospace);
	vertical-align: bottom;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-primary);
	transition: filter 0.25s;

	&.hide-ip {
		filter: blur(5px);
	}

	&:hover, &:focus-visible {
		filter: none;
	}
}

.welcome-greeting {
	font-weight: 650;
	color: var(--c-text-1);
}

.welcome-placeholder {
	display: flex;
	place-items: center;
	justify-content: center;
	gap: 0.45rem;
	min-height: 6rem;
	color: var(--c-text-3);

	.iconify {
		font-size: 1.4em;
		color: var(--c-primary);
	}
}
</style>
