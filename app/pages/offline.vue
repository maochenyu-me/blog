<script setup lang="ts">
useSeoMeta({
	title: '离线',
	description: '当前没有网络连接，这个页面还没有缓存。',
	robots: 'noindex, nofollow',
})

/** 断网时访问未预缓存的网址会落到这里；恢复网络后由读者自己决定何时重新加载 */
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
			等网络恢复后，点下面的按钮重新加载这个页面。
		</p>

		<ZButton
			primary
			icon="tabler:refresh"
			text="重新加载"
			@click="reload"
		/>
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
</style>
