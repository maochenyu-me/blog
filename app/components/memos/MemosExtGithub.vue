<script setup lang="ts">
import type { MemosExtension } from '~/types/memos'
import { safeGithubRepoUrl } from '~/utils/memos/url'

/**
 * GitHub 仓库扩展卡。
 *
 * payload 只有 `repoUrl`，仓库名 / 描述 / star / fork 都要另外取：
 * 直接打 `api.github.com`（匿名 60 次/小时/IP），并用 localStorage 缓存 24 小时，
 * 同一仓库并发只发一次请求；取不到就静默降级成 `owner/repo` 静态卡。
 *
 * `repoUrl` 来自接口，先过 hostname 白名单（只认 github.com 的 `owner/repo`），
 * 不是 GitHub 地址就连链接都不给，避免被塞 `javascript:` 之类的协议。
 */
const props = defineProps<{
	ext: Extract<MemosExtension, { type: 'github' }>
}>()

const appConfig = useAppConfig()
/** 关掉后不请求 api.github.com，只渲染 owner/repo 静态卡 */
const liveEnabled = computed(() => appConfig.memos.ech0?.githubLive !== false)

const CACHE_TTL = 24 * 60 * 60 * 1000
const cachePrefix = 'memos:github:v1:'

interface RepoInfo {
	name: string
	description: string
	stars: number
	forks: number
	avatar: string
}

/** 同一仓库的并发请求合并成一个 */
const inFlight = new Map<string, Promise<RepoInfo | null>>()
/** 进程内缓存，避免同一页面多张卡重复解析 localStorage */
const memo = new Map<string, RepoInfo | null>()

const safeUrl = computed(() => safeGithubRepoUrl(props.ext.repoUrl))

const repo = computed(() => {
	const segments = (safeUrl.value || props.ext.repoUrl).split('/').filter(Boolean)
	return { owner: segments.at(-2) ?? '', name: segments.at(-1) ?? '' }
})
const repoSlug = computed(() => (repo.value.owner && repo.value.name ? `${repo.value.owner}/${repo.value.name}` : ''))

const info = ref<RepoInfo | null>(null)
const loading = ref(false)

function readCache(key: string): RepoInfo | null {
	if (memo.has(key))
		return memo.get(key) ?? null
	try {
		const raw = localStorage.getItem(cachePrefix + key)
		if (!raw)
			return null
		// 同一个 key 既可能存成功结果 `{at, info}`，也可能存失败记忆 `{failedAt}`
		const parsed = JSON.parse(raw) as { at?: number, info?: RepoInfo, failedAt?: number }
		if (!parsed?.info || typeof parsed.at !== 'number' || Date.now() - parsed.at > CACHE_TTL)
			return null
		memo.set(key, parsed.info)
		return parsed.info
	}
	catch {
		return null
	}
}

function writeCache(key: string, value: RepoInfo) {
	memo.set(key, value)
	try {
		localStorage.setItem(cachePrefix + key, JSON.stringify({ at: Date.now(), info: value }))
	}
	catch {}
}

/**
 * 把「拿不到仓库信息」也记下来，但用更短的 TTL（30 分钟）。
 *
 * 匿名访问 `api.github.com` 只有 60 次/小时，超了就是 403。旧实现失败时只写内存 memo，
 * 刷新页面又会重打一次：既很快耗光额度，又让控制台反复刷 403 红字。
 * 失败记忆落 localStorage 是为了跨刷新生效，但不能像成功结果那样缓存 24 小时
 * （限流是按小时恢复的），所以单独存 `failedAt`。
 */
const FAILURE_TTL = 30 * 60 * 1000

function writeFailure(key: string) {
	memo.set(key, null)
	try {
		localStorage.setItem(cachePrefix + key, JSON.stringify({ failedAt: Date.now() }))
	}
	catch {}
}

/** 最近 30 分钟内失败过就不再重试，避免刷屏与打空额度 */
function recentlyFailed(key: string) {
	try {
		const raw = localStorage.getItem(cachePrefix + key)
		if (!raw)
			return false
		const parsed = JSON.parse(raw) as { failedAt?: number }
		return typeof parsed?.failedAt === 'number' && Date.now() - parsed.failedAt < FAILURE_TTL
	}
	catch {
		return false
	}
}

async function load() {
	const key = repoSlug.value
	// 不是合法 GitHub 地址，或配置里关掉了实时拉取，都只渲染静态卡
	if (!safeUrl.value || !key || !liveEnabled.value)
		return

	const cached = readCache(key)
	if (cached) {
		info.value = cached
		return
	}
	// 刚失败过就不要再打，直接渲染静态卡
	if (recentlyFailed(key))
		return

	let task = inFlight.get(key)
	if (!task) {
		const controller = new AbortController()
		const timer = setTimeout(() => controller.abort(), 10_000)
		task = $fetch<{
			full_name?: string
			name?: string
			description?: string | null
			stargazers_count?: number
			forks_count?: number
			owner?: { avatar_url?: string }
		}>(`https://api.github.com/repos/${repo.value.owner}/${repo.value.name}`, {
			signal: controller.signal,
			// 403 是匿名限流的常态，别让它冒泡成未捕获错误刷到控制台
			ignoreResponseError: true,
		})
			.then((data) => {
				// 限流/私有仓库时 GitHub 返回 4xx，ofetch 不抛错但 body 不是仓库对象；
				// 用 `name` 是否存在判断拿到的是不是有效数据。
				if (!data?.name)
					throw new Error('GitHub 返回了非仓库数据（多为限流）')
				const value: RepoInfo = {
					name: data.name,
					description: (data.description ?? '').trim(),
					stars: data.stargazers_count ?? 0,
					forks: data.forks_count ?? 0,
					avatar: data.owner?.avatar_url ?? '',
				}
				writeCache(key, value)
				return value
			})
			.catch(() => {
				writeFailure(key)
				return null
			})
			.finally(() => {
				clearTimeout(timer)
				inFlight.delete(key)
			})
		inFlight.set(key, task)
	}

	loading.value = true
	info.value = await task
	loading.value = false
}

onMounted(load)
</script>

<template>
<MemosExtShell icon="tabler:brand-github" label="GitHub" :href="safeUrl || undefined" tip="在 GitHub 打开">
	<a v-if="safeUrl" class="memos-github" :href="safeUrl" target="_blank" rel="noopener noreferrer">
		<img v-if="info?.avatar" class="avatar" :src="info.avatar" alt="" loading="lazy" decoding="async">
		<span v-else class="avatar placeholder"><Icon name="tabler:brand-github" /></span>

		<div class="meta">
			<span class="name" v-text="info?.name || repo.name || repoSlug" />
			<p v-if="info?.description" class="desc" v-text="info.description" />
			<p v-else-if="loading" class="desc">正在获取仓库信息…</p>
			<p v-else class="desc" v-text="repoSlug" />

			<div v-if="info" class="stats">
				<span><Icon name="tabler:star" />{{ info.stars }}</span>
				<span><Icon name="tabler:git-fork" />{{ info.forks }}</span>
			</div>
		</div>
	</a>

	<!-- 地址不是 GitHub 仓库：退化成纯文本，不给可点链接 -->
	<div v-else class="memos-github">
		<span class="avatar placeholder"><Icon name="tabler:brand-github" /></span>
		<div class="meta">
			<span class="name" v-text="repoSlug || '仓库地址无效'" />
		</div>
	</div>
</MemosExtShell>
</template>

<style scoped>
.memos-github {
	display: flex;
	align-items: flex-start;
	gap: 0.6em;
	padding: 0.15em 0.2em;
	border-radius: 0.35em;
	text-decoration: none;
	color: inherit;

	&:hover {
		background-color: var(--c-bg-2);

		.name {
			color: var(--c-primary);
		}
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 1px;
	}
}

.avatar {
	flex-shrink: 0;
	width: 2.2em;
	height: 2.2em;
	border-radius: 0.4em;
	object-fit: cover;

	&.placeholder {
		display: grid;
		place-items: center;
		background-color: var(--c-bg-3);
		color: var(--c-text-3);
	}
}

.meta {
	display: flex;
	flex: 1;
	flex-direction: column;
	gap: 0.15em;
	min-width: 0;

	.name {
		font-weight: 600;
		color: var(--c-text-1);
	}

	.desc {
		display: -webkit-box;
		overflow: hidden;
		font-size: 0.8em;
		-webkit-line-clamp: 2;
		color: var(--c-text-3);
		-webkit-box-orient: vertical;
	}

	.stats {
		display: flex;
		gap: 0.7em;
		font-size: 0.78em;
		color: var(--c-text-3);

		span {
			display: inline-flex;
			align-items: center;
			gap: 0.2em;
		}
	}
}
</style>
