<script setup lang="ts">
const bridge = useAppBridge()
const { isApp, bootBroken, status, rollbackContent } = bridge

const rolling = ref(false)
/** 回滚成功后的目标版本；非 null 时页面切到「成功」分支 */
const rolledBackBuild = ref<string | null>(null)
const failure = ref<string | null>(null)

const activeBuild = computed(() => status.value?.activeBuild ?? '未知版本')
const detail = computed(() => status.value?.lastError ?? '内容包没有通过校验')

async function rollback() {
	if (rolling.value)
		return
	rolling.value = true
	failure.value = null

	const result = await rollbackContent()
	rolling.value = false

	if (!result) {
		failure.value = '回滚命令没有响应。可以点「重新加载页面」再试一次；若一直失败，请卸载后重新安装。'
		return
	}
	if (result.ok) {
		rolledBackBuild.value = result.build
		return
	}
	failure.value = `没有可回滚的上一版本（当前 ${result.build}）。请卸载后重新安装，或通过反馈渠道联系作者。`
}

function reload() {
	window.location.reload()
}
</script>

<template>
<div v-if="isApp && bootBroken" class="app-boot-error" role="alert">
	<div class="card">
		<p class="badge">
			内容加载失败
		</p>
		<h1 class="title">
			这个版本的内容没能通过校验
		</h1>
		<p class="description">
			应用已经下载了新版本的内容（{{ activeBuild }}），但它在校验或解压时出了问题，
			所以没有切换到它。你之前下载好的内容都还在。
		</p>
		<code class="detail">{{ detail }}</code>

		<template v-if="rolledBackBuild">
			<p class="description">
				已切回上一版本 {{ rolledBackBuild }}。如果没有自动刷新，点下面的按钮重新加载。
			</p>
			<button type="button" class="button primary" @click="reload">
				重新加载页面
			</button>
		</template>

		<template v-else>
			<p class="description">
				点下面的按钮可以回到上一个能正常阅读的版本，已下载的其它内容不会丢失。
			</p>
			<div class="actions">
				<button type="button" class="button primary" :disabled="rolling" @click="rollback">
					{{ rolling ? '正在回滚…' : '回到上一版本' }}
				</button>
				<button type="button" class="button" @click="reload">
					重新加载页面
				</button>
			</div>
			<p v-if="failure" class="failure">
				{{ failure }}
			</p>
		</template>
	</div>
</div>
</template>

<style scoped>
.app-boot-error {
	display: grid;
	place-items: center;
	position: fixed;
	overflow-y: auto;
	inset: 0;
	padding: 1.5rem;
	background-color: var(--c-bg);
	color: var(--c-text-1);
	z-index: calc(var(--z-index-popover) + 10);

	> .card {
		width: min(32rem, 100%);
		padding: 1.5rem;
		border: 1px solid var(--c-border);
		border-radius: 1rem;
		box-shadow: var(--box-shadow-3);
		background-color: var(--ld-bg-card);
	}

	.badge {
		display: inline-block;
		margin: 0;
		padding: 0.15em 0.6em;
		border-radius: 1em;
		background-color: var(--c-error-soft);
		font-size: 0.8em;
		color: var(--c-error);
	}

	.title {
		margin: 0.8rem 0 0.6rem;
		font-size: 1.25em;
		line-height: 1.3;
		text-wrap: balance;
	}

	.description {
		margin: 0 0 0.8rem;
		font-size: 0.9em;
		line-height: 1.6;
		color: var(--c-text-2);
	}

	.detail {
		display: block;
		margin: 0 0 1rem;
		padding: 0.6em 0.8em;
		border-radius: 0.5em;
		background-color: var(--c-bg-2);
		font-size: 0.8em;
		white-space: pre-wrap;
		word-break: break-all;
		color: var(--c-text-2);
	}

	.actions {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
	}

	.failure {
		margin: 0.8rem 0 0;
		font-size: 0.85em;
		line-height: 1.6;
		color: var(--c-error);
	}

	@media (max-width: 528px) {
		padding: 1rem;

		> .card {
			padding: 1.1rem;
		}

		.title {
			font-size: 1.1em;
		}

		.actions {
			flex-direction: column;
		}
	}
}

.button {
	flex: none;
	padding: 0.45em 1em;
	border: 1px solid var(--c-border);
	border-radius: 0.5em;
	background-color: var(--ld-bg-card);
	font: inherit;
	color: var(--c-text-1);
	transition: border-color 0.2s, color 0.2s, filter 0.2s;
	cursor: pointer;

	&:hover {
		border-color: var(--c-primary);
		color: var(--c-primary);
	}

	&:focus-visible {
		outline: 2px solid var(--c-primary);
		outline-offset: 2px;
	}

	&:disabled {
		opacity: 0.6;
		cursor: progress;
	}

	&.primary {
		border-color: transparent;
		background-color: var(--c-primary);
		/* 同 AppStatusBar：用 --c-bg 保证暗色下的对比度 */
		color: var(--c-bg);

		&:hover {
			color: var(--c-bg);
			filter: brightness(1.08);
		}
	}
}
</style>
