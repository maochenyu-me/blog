<script setup lang="ts">
import type { NavItem } from '~/types/nav'
import { musicPlaylists } from '~/data/music'

const appConfig = useAppConfig()
const layoutStore = useLayoutStore()
const searchStore = useSearchStore()

const route = useRoute()

const player = useMusicPlayer()
const { isPlaying: musicPlaying, status: musicStatus, openPanel: openMusicPanel } = player
/**
 * 入口可见性按「配置」判断（SSR 即为准确值，避免按钮在 hydration 后突然冒出来）：
 * 本地歌单非空，或 music.meting.playlists 里填了启用的条目，才显示。
 */
const showMusicEntry = computed(() => {
	if (appConfig.music?.enabled === false)
		return false
	if (musicPlaylists.length > 0)
		return true
	if ((appConfig.music?.meting?.playlists ?? []).some(item => !item.disabled))
		return true
	return (appConfig.music?.neteaseUrl?.playlists ?? []).some(item => !item.disabled)
})

/** 父级项的展开状态，按「组序号-项序号」记录，仅内存态 */
const openMenuKeys = ref<Record<string, boolean>>({})
const itemKey = (groupIndex: number, itemIndex: number) => `g${groupIndex}-i${itemIndex}`

const hasChildren = (item: NavItem) => Boolean(item.children?.length)
const isOpen = (key: string) => Boolean(openMenuKeys.value[key])

function toggleChildren(key: string) {
	openMenuKeys.value[key] = !openMenuKeys.value[key]
}

/** 自身或任一子项命中当前路由 */
function isActive(item: NavItem): boolean {
	if (item.url !== '#' && !isExtLink(item.url) && route.path === item.url)
		return true
	return item.children?.some(isActive) ?? false
}

/** 进入子页面时自动展开所属父级，避免当前页面藏在折叠里 */
function openActiveMenus() {
	appConfig.nav.forEach((group, groupIndex) => {
		group.items.forEach((item, itemIndex) => {
			if (hasChildren(item) && isActive(item))
				openMenuKeys.value[itemKey(groupIndex, itemIndex)] = true
		})
	})
}

watch(() => route.path, openActiveMenus, { immediate: true })
</script>

<template>
<BlogMask
	:show="layoutStore.state === 'sidebar'"
	class="hide-above-mobile"
	@click="layoutStore.close()"
/>

<!-- 不能用 Transition 实现弹出收起动画，因为半宽屏状态始终显示 -->
<aside id="blog-sidebar" :class="{ show: layoutStore.state === 'sidebar' }">
	<BlogHeader class="sidebar-header" to="/" />

	<nav class="sidebar-nav scrollcheck-y">
		<div class="search-btn sidebar-nav-item gradient-card" @click="layoutStore.toggle('search')">
			<Icon name="tabler:search" />
			<span class="nav-text">{{ searchStore.label }}</span>
			<Key class="keycut" code="K" cmd prevent @press="layoutStore.toggle('search')" />
		</div>

		<template v-for="(group, groupIndex) in appConfig.nav" :key="groupIndex">
			<h3 v-if="group.title">
				{{ group.title }}
			</h3>

			<menu>
				<li v-for="(item, itemIndex) in group.items" :key="itemIndex">
					<template v-if="hasChildren(item)">
						<button
							class="sidebar-nav-item parent"
							:class="{ active: isActive(item), open: isOpen(itemKey(groupIndex, itemIndex)) }"
							type="button"
							:aria-expanded="isOpen(itemKey(groupIndex, itemIndex))"
							@click="toggleChildren(itemKey(groupIndex, itemIndex))"
						>
							<Icon :name="item.icon" />
							<span class="nav-text">{{ item.text }}</span>
							<Icon
								class="caret"
								:class="{ open: isOpen(itemKey(groupIndex, itemIndex)) }"
								name="tabler:chevron-down"
							/>
						</button>

						<Transition name="collapse">
							<ul v-show="isOpen(itemKey(groupIndex, itemIndex))" class="sidebar-subnav">
								<li v-for="child in item.children" :key="child.url">
									<UtilLink :to="child.url" class="sidebar-nav-item sub">
										<Icon :name="child.icon" />
										<span class="nav-text">{{ child.text }}</span>
										<Icon v-if="isExtLink(child.url)" class="external-tip" name="tabler:arrow-up-right" />
									</UtilLink>
								</li>
							</ul>
						</Transition>
					</template>

					<UtilLink v-else :to="item.url" class="sidebar-nav-item">
						<Icon :name="item.icon" />
						<span class="nav-text">{{ item.text }}</span>
						<Icon v-if="isExtLink(item.url)" class="external-tip" name="tabler:arrow-up-right" />
					</UtilLink>
				</li>
			</menu>
		</template>

		<!-- 音乐入口：点击打开播放面板（弹窗），播放中显示一个小音量图标 -->
		<menu v-if="showMusicEntry">
			<li>
				<button class="sidebar-nav-item music-entry" type="button" @click="openMusicPanel()">
					<Icon name="tabler:music" />
					<span class="nav-text">音乐</span>
					<Icon
						v-if="musicPlaying || musicStatus === 'paused'"
						class="music-indicator"
						:name="musicPlaying ? 'tabler:volume' : 'tabler:player-pause'"
					/>
				</button>
			</li>
		</menu>
	</nav>

	<footer class="sidebar-footer">
		<BlogThemeToggle />
		<ZIconNavList :list="appConfig.footer.iconNav" />
	</footer>
</aside>
</template>

<style scoped>
#blog-sidebar {
	display: flex;
	flex-direction: column;
	color: var(--c-text-2);

	@media not (max-width: 768px) {
		:root[data-article-transition] & { view-transition-name: article-navigation; }
	}

	&:hover {
		color: currentcolor;
	}

	@media (max-width: 768px) {
		position: fixed;
		inset-inline-start: 0;
		width: 320px;
		max-width: 100%;
		background-color: var(--ld-bg-blur);
		backdrop-filter: blur(0.5rem);
		color: currentcolor;
		transform: var(--transform-start-far);
		transition: transform 0.2s;
		z-index: var(--z-index-popover);

		&.show {
			box-shadow: var(--box-shadow-1), var(--box-shadow-3);
			transform: none;
		}
	}
}

.sidebar-nav {
	flex-grow: 1;
	padding: 0 5%;
	font-size: 0.9em;

	h3 {
		margin: 2em 0 1em 1em;
		font: inherit;
		color: var(--c-text-2);
	}

	li {
		margin: 0.5em 0;
	}
}

.sidebar-nav-item {
	display: flex;
	align-items: center;
	gap: 0.5em;
	padding: 0.5em 1em;
	border-radius: 0.5em;
	transition: all 0.2s;

	&:hover,
	&.router-link-active {
		background-color: var(--c-bg-soft);
		color: var(--c-text);
	}

	&.router-link-active::after {
		content: "⦁";
		width: 1em;
		text-align: center;
		color: var(--c-text-3);
	}

	> .iconify {
		font-size: 1.5em;
	}

	> .nav-text {
		flex-grow: 1;
		overflow: hidden;
		white-space: nowrap;
		text-overflow: ellipsis;
	}

	> .external-tip {
		opacity: 0.5;
		font-size: 1em;
	}
}

/* 带子项的父级：与普通导航项同构，多一个展开箭头 */
.sidebar-nav-item.parent {
	justify-content: space-between;
	width: 100%;
	text-align: start;

	&:hover,
	&.active {
		background-color: var(--c-bg-soft);
		color: var(--c-text);
	}

	> .caret {
		opacity: 0.5;
		font-size: 1em;
		transition: transform 0.2s;

		&.open {
			transform: scaleY(-1);
		}
	}
}

/* 子级：缩进 + 一条竖直引线表示层级 */
.sidebar-subnav {
	overflow: hidden;
	margin-inline-start: 1.2em;
	padding-inline-start: 0.35em;
	border-inline-start: 1px solid var(--c-border);

	li {
		margin: 0.2em 0;
	}
}

.sidebar-nav-item.sub {
	padding: 0.4em 0.8em;
	font-size: 0.92em;

	> .iconify {
		font-size: 1.2em;
	}
}

.search-btn {
	opacity: 0.5;
	margin: 1rem 0;
	outline: 2px solid var(--c-border);
	outline-offset: -2px;
	cursor: text;
	user-select: none;

	&:hover {
		opacity: 1;
		outline-color: transparent;
		background-color: transparent;
	}
}

/* 音乐入口：和普通导航项同构，只是点了打开弹窗而不是跳路由 */
.music-entry {
	width: 100%;
	background-color: transparent;
	font-size: inherit;
	text-align: start;
	color: inherit;

	> .music-indicator {
		flex: none;
		opacity: 0.6;
		font-size: 1em;
	}
}

.sidebar-footer {
	--gap: clamp(0.5rem, 3vh, 1rem);

	display: grid;
	gap: var(--gap);
	padding: var(--gap);
	font-size: 0.8em;
	text-align: center;
	color: var(--c-text-2);
}
</style>
