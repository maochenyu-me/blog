<script setup lang="ts">
import type { ModalEmits, ModalProps } from '#modals'

const props = withDefaults(defineProps<ModalProps>(), {
	duration: 200,
})

const emit = defineEmits<ModalEmits>()

const appConfig = useAppConfig()
const title = computed(() => appConfig.reward?.title || '打赏')

// 遮罩与点击关闭由 @bikariya/modals 提供（.bikariya-overlay），这里只处理 Esc
useEventListener('keydown', (event) => {
	if (props.open && event.key === 'Escape')
		emit('close')
})
</script>

<template>
<Transition name="float-in">
	<div
		v-if="open"
		class="reward-popover"
		role="dialog"
		aria-modal="true"
		:aria-label="title"
	>
		<header class="panel-header">
			<h2>{{ title }}</h2>
			<button class="close-btn" type="button" aria-label="关闭" @click="emit('close')">
				<Icon name="tabler:x" />
			</button>
		</header>

		<div class="panel-content">
			<CardRewardCard />
		</div>
	</div>
</Transition>
</template>

<style scoped>
.reward-popover {
	--float-distance: 20vh;

	position: fixed;
	overflow-y: auto;
	inset-inline: 0;
	top: 50%;
	width: 95%;
	max-width: 500px;
	max-height: 85vh;
	max-height: 85dvh;
	margin-inline: auto;
	padding: 1.2em;
	border: 1px solid var(--c-primary);
	border-radius: 1em;
	box-shadow: var(--box-shadow-3);
	background-color: var(--ld-bg-card);
	translate: 0 -50%;
	overscroll-behavior: contain;
}

.panel-header {
	display: flex;
	align-items: flex-start;
	justify-content: space-between;
	margin-block-end: 1em;

	> h2 {
		margin: 0;
		font-size: 1.2em;
		font-weight: 600;
		color: var(--c-text);
	}
}

.close-btn {
	padding: 0.4em;
	border: none;
	border-radius: 0.5em;
	background-color: transparent;
	color: var(--c-text-2);
	transition: all 0.1s;
	cursor: pointer;

	&:hover {
		background-color: var(--c-bg-soft);
		color: var(--c-text-1);
	}
}

.panel-content {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 0.2em;
	padding: 0.8rem;
	border: 1px solid var(--c-border);
	border-radius: 0.75em;
	background-color: var(--ld-bg-card);
	font-size: 0.95em;
	line-height: 1.6;
	color: var(--c-text-1);
}

@media (max-width: 768px) {
	.reward-popover {
		max-height: 75vh;
		max-height: 75dvh;
	}
}
</style>
