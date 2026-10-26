<script setup lang="ts">
const appConfig = useAppConfig()

const reward = computed(() => appConfig.reward)
const tips = computed(() => reward.value?.tips)
const methods = computed(() => reward.value?.methods ?? [])
const list = computed(() => reward.value?.list)
</script>

<template>
<span v-if="tips" class="reward-tips">{{ tips }}</span>

<ul class="reward-group">
	<li v-for="method in methods" :key="method.name" class="reward-item">
		<a
			class="reward-image-url"
			:href="method.image"
			target="_blank"
			rel="noopener"
			:aria-label="`打开${method.name}收款码`"
		>
			<img class="reward-image" :src="method.image" :alt="`${method.name}收款码`" loading="lazy">
		</a>
		<div class="reward-desc">
			{{ method.name }}
		</div>
	</li>
</ul>

<template v-if="list?.title">
	<UtilLink v-if="list.link" class="reward-all-info" :to="list.link">
		<div class="reward-all-info-text">
			{{ list.title }}
		</div>
		<div class="reward-all-info-desc">
			{{ list.description }}
		</div>
	</UtilLink>
	<div v-else class="reward-all-info is-placeholder">
		<div class="reward-all-info-text">
			{{ list.title }}
		</div>
		<div class="reward-all-info-desc">
			{{ list.description }}
		</div>
	</div>
</template>
</template>

<style scoped>
.reward-tips {
	font-weight: 700;
	color: var(--c-error);
}

.reward-group {
	display: flex;
	flex-wrap: wrap;
	justify-content: center;
	gap: 0 1em;
	margin: 0.5em 0 0;
	padding: 0;
	list-style: none;
}

.reward-item {
	display: flex;
	flex-direction: column;
	align-items: center;
}

.reward-image {
	display: block;
	width: clamp(6rem, 32vw, 8.125rem);
	aspect-ratio: 1;
	border: 1px solid var(--c-border);
	border-radius: 0.5rem;
	background-color: #FFF;
	transition: transform 0.3s ease-out, box-shadow 0.3s ease-out, border-color 0.3s ease-out;
	object-fit: cover;
}

/* 参考站把两张码分别描成微信绿与支付宝蓝（原实现里两条 :first-child 规则互相覆盖，这里按序号区分） */
.reward-item:nth-child(1) .reward-image {
	border-color: #3E9F50;
}

.reward-item:nth-child(2) .reward-image {
	border-color: #425AEF;
}

.reward-image-url:hover .reward-image,
.reward-image-url:focus-visible .reward-image {
	box-shadow: var(--box-shadow-2);
	transform: translateY(-0.15em);
}

/* 参考站的 margin-top: -8px 会让文字钻进图片白底被裁掉，这里改成正常间距 */
.reward-desc {
	margin-block-start: 0.4em;
	font-size: 0.85rem;
	line-height: 1.2;
	color: var(--c-text-2);
}

.reward-all-info {
	display: flex;
	flex-direction: column;
	gap: 0.1em;
	width: 100%;
	margin-block-start: 0.5em;
	padding: 0.7em 1.2em;
	border: 1px solid var(--c-border);
	border-radius: 0.75em;
	background-color: var(--c-bg-2);
	text-align: center;
	color: var(--c-text);
	transition: all 0.3s ease-out;

	&:not(.is-placeholder):hover {
		border-color: var(--c-error);
		box-shadow: var(--box-shadow-2);
		background-color: var(--c-error);
		background-image: radial-gradient(circle at 50% 0%, hsl(0deg 0% 100% / 22%), transparent 70%);
		color: #FFF;
	}

	&.is-placeholder {
		opacity: 0.8;
		cursor: default;
	}
}

.reward-all-info-text {
	display: flex;
	justify-content: center;
	font-size: 1rem;
	font-weight: 700;
}

.reward-all-info-desc {
	display: flex;
	justify-content: center;
	opacity: 0.8;
	font-size: 0.78rem;
}

@media (prefers-reduced-motion: reduce) {
	.reward-image,
	.reward-all-info {
		transition: none;
	}
}
</style>
