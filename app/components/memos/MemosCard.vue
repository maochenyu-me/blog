<script setup lang="ts">
import type { MemosMessage } from '~/types/memos'

const props = withDefaults(defineProps<{
	message: MemosMessage
	/** 展示消息所属频道（多频道或全局时间线时有用） */
	showChannel?: boolean
}>(), {
	showChannel: true,
})

const appConfig = useAppConfig()

const channelLabel = computed(() => {
	if (!props.showChannel)
		return ''
	const { username, title } = props.message.channel
	return username ? `@${username}` : title
})

const verifiedTip = '这个说说来自博客作者本人的 Telegram 频道'

/** 评论区是否启用，未启用时不必显示按钮 */
const commentEnabled = computed(() => useAppConfig().comment.provider !== 'none')

const replying = ref(false)

/** 引用的正文：优先用剥离过标签的纯文本，避免把 HTML 塞进评论框 */
const quoteText = computed(() => props.message.plainText || '')

async function onReply() {
	if (replying.value)
		return
	replying.value = true
	try {
		await replyToComment(quoteText.value)
	}
	finally {
		replying.value = false
	}
}
</script>

<template>
<article class="memos-card">
	<header class="memos-meta">
		<NuxtImg
			class="avatar round-cobblestone"
			:src="appConfig.author.avatar"
			:alt="appConfig.author.name"
			width="44"
			height="44"
		/>

		<div class="info">
			<div class="nick">
				<span class="name">{{ appConfig.author.name }}</span>
				<Icon
					v-tip="verifiedTip"
					class="verified"
					name="tabler:rosette-discount-check-filled"
				/>
			</div>

			<div class="sub">
				<UtilDate class="date" :date="message.publishedAt" />
				<span v-if="channelLabel" class="channel" v-text="channelLabel" />
				<span v-if="message.revision > 1" v-tip="'这条说说在 Telegram 中被编辑过'" class="edited">已编辑</span>
			</div>
		</div>

		<UtilLink
			v-if="message.sourceUrl"
			v-tip="'在 Telegram 中查看源消息'"
			class="source"
			:to="message.sourceUrl"
		>
			<Icon name="tabler:brand-telegram" />
		</UtilLink>
	</header>

	<div v-if="message.html" class="memos-content" v-html="message.html" />

	<MemosMedia v-if="message.media.length" :media="message.media" />

	<footer class="memos-footer">
		<div v-if="message.tags.length" class="memos-tags">
			<span v-for="tag in message.tags" :key="tag" class="tag">
				<Icon name="tabler:hash" />
				<span>{{ tag.slice(1) }}</span>
			</span>
		</div>

		<button
			v-if="commentEnabled"
			v-tip="replying ? '正在定位输入框…' : '引用这条说说去评论'"
			type="button"
			class="comment-btn"
			aria-label="评论这条说说"
			@click="onReply"
		>
			<Icon :name="replying ? 'line-md:loading-twotone-loop' : 'tabler:brand-hipchat'" />
		</button>
	</footer>
</article>
</template>

<style scoped>
.memos-card {
	display: flex;
	flex-direction: column;
	gap: 0.6em;
	padding: 0.8em 1em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.5em;
	background-color: var(--c-flat-card-bg);
	transition: border-color 0.2s;
	animation: float-in var(--motion-duration) var(--motion-easing) backwards;
	animation-delay: var(--delay, 0s);

	&:hover {
		border-color: var(--c-bg-soft);
	}
}

.memos-meta {
	display: flex;
	align-items: center;
	gap: 0.6em;

	> .avatar {
		flex-shrink: 0;
		width: 2.4em;
		height: 2.4em;
		border-radius: 50%;
		box-shadow: var(--box-shadow-1);
		object-fit: cover;
	}

	> .info {
		flex: 1;
		min-width: 0;

		> .nick {
			display: flex;
			align-items: center;
			gap: 0.25em;
			font-weight: 600;
			color: var(--c-text-1);

			> .verified {
				font-size: 1.1em;
				color: var(--c-primary);
			}
		}

		> .sub {
			display: flex;
			flex-wrap: wrap;
			align-items: center;
			gap: 0.4em;
			font-size: 0.8em;
			color: var(--c-text-3);

			> .date {
				font-family: var(--font-monospace);
			}

			> .channel {
				overflow: hidden;
				white-space: nowrap;
				text-overflow: ellipsis;
			}

			> .edited {
				padding: 0 0.35em;
				border-radius: 0.3em;
				background-color: var(--c-flat-card-bg-2);
				cursor: help;
			}
		}
	}

	> .source {
		flex-shrink: 0;
		padding: 0.4em;
		border-radius: 50%;
		font-size: 1.1em;
		color: var(--c-text-3);
		transition: all 0.2s;

		&:hover {
			background-color: var(--c-primary-soft);
			color: var(--c-primary);
		}
	}
}

.memos-content {
	overflow-wrap: anywhere;
	line-height: 1.65;
	white-space: pre-wrap;
	color: var(--c-text-2);

	:deep(a) {
		text-decoration: underline;
		text-decoration-color: var(--c-primary-soft);
		color: var(--c-primary);
		transition: text-decoration-color 0.2s;
		text-underline-offset: 0.2em;

		&:hover {
			text-decoration-color: var(--c-primary);
		}
	}

	:deep(b), :deep(strong) {
		color: var(--c-text-1);
	}

	:deep(code) {
		padding: 0.1em 0.3em;
		border-radius: 0.3em;
		background-color: var(--c-flat-card-bg-2);
		font-family: var(--font-monospace);
		font-size: 0.9em;
	}

	:deep(pre) {
		overflow: auto;
		padding: 0.6em 0.8em;
		border-radius: 0.5em;
		background-color: var(--c-flat-card-bg-2);

		> code {
			padding: 0;
			background: none;
		}
	}

	:deep(blockquote) {
		margin: 0;
		padding-inline-start: 0.8em;
		border-inline-start: 3px solid var(--c-border);
		color: var(--c-text-3);
	}
}

.memos-footer {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.5em;
	min-height: 1.6em;
}

.memos-tags {
	display: flex;
	flex-wrap: wrap;
	gap: 0.35em;
	min-width: 0;

	> .tag {
		display: inline-flex;
		align-items: center;
		gap: 0.15em;
		padding: 0.1em 0.45em;
		border-radius: 0.4em;
		background-color: var(--c-flat-card-bg-2);
		font-size: 0.78em;
		color: var(--c-text-3);
		user-select: none;
	}
}

.comment-btn {
	display: inline-flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	margin-inline-start: auto;
	padding: 0.25em;
	border-radius: 0.4em;
	background-color: transparent;
	font-size: 1em;
	color: var(--c-text-3);
	transition: color 0.2s, background-color 0.2s;

	&:hover {
		background-color: var(--c-flat-card-bg-2);
		color: var(--c-primary);
	}
}
</style>
