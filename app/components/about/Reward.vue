<script setup lang="ts">
import type { RewardAmountLevel, RewardEntry } from '~/types/reward'
import { rewardList, rewardModule } from '~/reward'

const items = computed(() => rewardList ?? [])
const count = computed(() => items.value.length)

/** 数组顺序即渲染顺序，这里只负责从日期里挑出最晚的一条做脚注 */
const latestDate = computed(() => items.value
	.map(item => item.date)
	.sort()
	.at(-1) ?? '')

function amountText(item: RewardEntry) {
	return `¥${item.amount}${item.unit ?? '元'}`
}

function amountLevel(amount: number): RewardAmountLevel {
	if (amount >= 50)
		return 'gold'
	if (amount >= 10)
		return 'blue'
	return 'plain'
}
</script>

<template>
<section v-if="count" id="reward" class="card about-reward">
	<header class="reward-head">
		<div class="reward-heading">
			<p class="card-tips">
				{{ rewardModule.tips }}
			</p>
			<h2 class="reward-title" v-text="rewardModule.title" />
			<p class="reward-desc" v-text="rewardModule.description" />
		</div>

		<div v-if="rewardModule.chargingUrl" class="reward-charge">
			<a
				class="charge-btn"
				:href="rewardModule.chargingUrl"
				target="_blank"
				rel="noopener"
			>
				<Icon class="charge-bolt" name="tabler:bolt-filled" />
				<span>为TA充电</span>
			</a>

			<!-- 三层同一条走线：灰底、粉色遮罩（hover 时从左展开）、黄色扫描（hover 时循环流过） -->
			<div class="charge-tube" aria-hidden="true">
				<AboutCircuitBoard class="board" />
				<div class="board-pink">
					<AboutCircuitBoard class="board" />
				</div>
				<div class="board-scan">
					<AboutCircuitBoard class="board" />
				</div>
			</div>

			<p class="charge-count">
				共 <b>{{ count }}</b> 人
			</p>
		</div>
		<p v-else class="reward-count">
			共 {{ count }} 人
		</p>
	</header>

	<ul class="reward-list">
		<li
			v-for="(item, index) in items"
			:key="`${item.name}-${item.date}-${index}`"
			class="reward-item"
		>
			<span class="name" :title="item.name" v-text="item.name" />
			<span class="date" v-text="item.date" />
			<span class="amount" :class="amountLevel(item.amount)" v-text="amountText(item)" />
		</li>
	</ul>

	<p v-if="latestDate" class="reward-foot">
		最新更新时间：{{ latestDate }}
	</p>
</section>
</template>

<style scoped>
.about-reward {
	display: flex;
	flex-direction: column;
	gap: 0.6em;
	padding: 1.1em 1.3em;
	border: 1px solid var(--c-flat-card-border);
	background-color: var(--c-flat-card-bg);
	scroll-margin-block-start: 1rem;
}

.reward-head {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	justify-content: space-between;
	gap: 0.6em 1em;
}

.reward-heading {
	display: flex;
	flex-direction: column;
	gap: 0.15em;
	min-width: 0;
}

.reward-title {
	margin: 0;
	font-family: var(--font-creative);
	font-size: clamp(1.4em, 3.6vw, 1.9em);
	font-weight: 700;
	line-height: 1.2;
	color: var(--c-text-1);
}

.reward-desc {
	margin: 0;
	font-size: 0.85em;
	color: var(--c-text-2);
}

/* ── 「为TA充电」：按钮 + 电路板走线，结构与动效照源站 ── */

.reward-charge {
	display: flex;
	flex-wrap: wrap;
	align-items: center;
	gap: 6px;
}

.charge-btn {
	display: flex;
	flex-shrink: 0;
	align-items: center;
	justify-content: center;
	gap: 0.3em;
	position: relative;
	width: 157px;
	height: 50px;
	border-radius: 4px;
	box-shadow: 0 4px 4px #FF709F4D;
	background-color: #F25D8E;
	font-size: 15px;
	font-weight: 500;
	color: #FFF;
	transition: background-color 0.3s;

	&:hover {
		background-color: #FF6B9A;
	}
}

.charge-bolt {
	font-size: 1.25em;
}

.charge-tube {
	flex-shrink: 0;
	position: relative;
	width: 157px;
	height: 55px;
}

.board {
	width: 100%;
	height: 100%;
}

.charge-tube > .board {
	color: #C9CED6;
}

.dark .charge-tube > .board {
	color: #E5E9EF;
}

/* hover 时粉色版本从左往右展开，盖住灰底 */
.board-pink {
	position: absolute;
	overflow: hidden;
	inset-block-start: 0;
	inset-inline-start: 0;
	width: 0;
	height: 100%;
	transition: width 0.5s;

	> .board {
		width: 157px;
		height: 55px;
		color: #F25D8E;
	}
}

.charge-btn:hover ~ .charge-tube .board-pink {
	width: 157px;
}

/* 18px 的窗口来回扫，内部走线反向位移，看上去就是一道电流沿着线跑 */
.board-scan {
	position: absolute;
	overflow: hidden;
	inset-block-start: 0;
	inset-inline-start: -15px;
	width: 18px;
	height: 100%;

	> .board {
		position: absolute;
		inset-block-start: 0;
		inset-inline-start: 15px;
		width: 157px;
		height: 55px;
		color: #FFD52B;
	}
}

.charge-btn:hover ~ .charge-tube .board-scan {
	animation: scan-window 0.5s linear 0.2s infinite;
}

.charge-btn:hover ~ .charge-tube .board-scan > .board {
	animation: scan-board 0.5s linear 0.2s infinite;
}

@keyframes scan-window {
	0% {
		transform: translateX(-15px);
	}

	to {
		transform: translateX(140px);
	}
}

@keyframes scan-board {
	0% {
		transform: translateX(15px);
	}

	to {
		transform: translateX(-140px);
	}
}

.charge-count {
	margin: 0;
	font-size: 12px;
	white-space: nowrap;
	color: var(--c-text-3);

	> b {
		color: var(--c-text-2);
	}
}

.reward-count {
	font-size: 0.8em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

.reward-list {
	display: grid;
	/* 190px 是「昵称 + 日期」能不省略并排的最小宽度，窄于此宁可变少列 */
	grid-template-columns: repeat(auto-fill, minmax(190px, 1fr));
	gap: 0.5em;
	margin: 0;
	padding: 0;
	list-style: none;
}

.reward-item {
	display: grid;
	grid-template-areas:
		"name   date"
		"amount amount";
	grid-template-columns: minmax(0, 1fr) auto;
	gap: 0.4em 0.6em;
	padding: 0.6em 0.8em;
	border: 1px solid var(--c-flat-card-border);
	border-radius: 0.6em;
	background-color: var(--c-bg-2);
	transition: border-color 0.2s;

	&:hover {
		border-color: var(--c-primary);
	}
}

.name {
	grid-area: name;
	overflow: hidden;
	padding-inline-end: 0.4em;
	font-size: 0.92em;
	font-weight: 600;
	white-space: nowrap;
	text-overflow: ellipsis;
	color: var(--c-text-1);
}

.date {
	grid-area: date;
	font-size: 0.78em;
	white-space: nowrap;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

.amount {
	grid-area: amount;
	justify-self: start;
	padding: 0.15em 0.5em;
	border-radius: 0.35em;
	background-color: var(--c-bg-3);
	font-size: 0.78em;
	font-weight: 600;
	white-space: nowrap;
	color: var(--c-text-2);
	font-variant-numeric: tabular-nums;

	&.blue {
		background-color: var(--c-primary-soft);
		color: var(--c-primary);
	}

	&.gold {
		background-color: hsl(38deg 92% 55% / 18%);
		color: hsl(35deg 85% 38%);
	}
}

/* 琥珀色在深色底上要提亮才够对比 */
.dark .amount.gold {
	color: hsl(38deg 90% 66%);
}

.reward-foot {
	margin: 0;
	font-size: 0.78em;
	color: var(--c-text-3);
	font-variant-numeric: tabular-nums;
}

@media (max-width: 528px) {
	.about-reward {
		padding: 1em;
	}

	/* 手机上一列太长、两列放不下日期，这里让日期换到昵称下面 */
	.reward-list {
		grid-template-columns: repeat(auto-fill, minmax(170px, 1fr));
	}

	.reward-item {
		grid-template-areas:
			"name name"
			"date amount";
		grid-template-columns: minmax(0, 1fr) auto;
	}

	.date {
		align-self: center;
	}

	/* 350px 的按钮 + 走线放不下，退回成普通按钮（源站在手机端直接隐藏整块） */
	.charge-tube {
		display: none;
	}

	.charge-btn {
		width: 140px;
		height: 44px;
		font-size: 14px;
	}
}

@media (prefers-reduced-motion: reduce) {
	.charge-btn,
	.board-pink,
	.reward-item {
		transition: none;
	}

	/* 关掉走线动画，hover 时只保留粉色板展开 */
	.charge-btn:hover ~ .charge-tube .board-scan {
		opacity: 0;
		animation: none;
	}

	.charge-btn:hover ~ .charge-tube .board-scan > .board {
		animation: none;
	}
}
</style>
