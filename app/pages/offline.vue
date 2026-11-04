<script setup lang="ts">
useSeoMeta({
	title: '离线',
	description: '当前没有网络连接，这个页面还没有缓存。',
	robots: 'noindex, nofollow',
})

/**
 * 断网时访问未预缓存的网址会落到这里。
 *
 * 注意：本页是被 Service Worker 当作离线兜底渲染的，Nuxt 随后会把地址栏归一到 `/offline`，
 * 所以「重新加载」重载的是这一页本身，拿不回读者原本要去的地址。因此额外给一个「返回首页」——
 * 首页在预缓存里，断网时也照样能打开，是真正回得去的出口。
 */
function reload() {
	location.reload()
}
</script>

<template>
<div class="offline proper-height">
	<div class="offline-card card">
		<Icon class="offline-icon" name="tabler:wifi-off" />

		<h1>当前没有网络连接</h1>

		<p class="offline-desc">
			这个页面还没有缓存到本地，所以现在打不开它。
		</p>
		<p class="offline-desc">
			网络恢复后可以回到首页继续阅读；也可以点「重新加载」再试一次。
		</p>

		<div class="offline-actions">
			<ZButton
				primary
				icon="tabler:home"
				text="返回首页"
				to="/"
			/>
			<ZButton
				icon="tabler:refresh"
				text="重新加载"
				@click="reload"
			/>
		</div>
	</div>
</div>
</template>

<style scoped>
.offline {
	display: grid;
	place-items: center;
	padding: 1rem;

	@media (max-width: 528px) {
		padding: 0.5rem;
	}
}

.offline-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.5rem;
	max-width: 28rem;
	padding: 2rem 1.5rem;
	text-align: center;

	@media (max-width: 528px) {
		padding: 1.5rem 1rem;
	}

	h1 {
		font-size: 1.4rem;
	}
}

.offline-icon {
	font-size: 3rem;
	color: var(--c-text-3);
}

.offline-desc {
	color: var(--c-text-2);
}

.offline-actions {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0.5rem;
	margin-top: 0.5rem;
}
</style>
