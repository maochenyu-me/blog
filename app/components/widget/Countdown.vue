<script setup lang="ts">
import {
	getCountdownProgress,
	getLunarDate,
	getLunarYearName,
	getSpringFestivalLunarYear,
	resolveSpringFestivalDate,
	toBlogTimeZoneDate,
} from '~/utils/countdown'

const units = [
	{ key: 'day', text: '日', unit: '小时' },
	{ key: 'week', text: '周', unit: '天' },
	{ key: 'month', text: '月', unit: '天' },
	{ key: 'year', text: '年', unit: '天' },
] as const

const appConfig = useAppConfig()
const countdownConfig = computed(() => appConfig.component.countdown)
const targetName = computed(() => countdownConfig.value.targetName || '春节')

const initialNow = useState('countdown:now', () => Date.now())
const mounted = useMounted()
const canHover = useMediaQuery('(hover: hover) and (pointer: fine)')
const showRemaining = ref(false)
const rawNow = useNow({ interval: 60 * 1000 })
// 统一换算到博客时区，避免预渲染环境与访客本地时区在跨零点时算出不同结果
const currentDate = computed(() => toBlogTimeZoneDate(new Date(mounted.value ? rawNow.value : initialNow.value)))

const targetDate = computed(() => resolveSpringFestivalDate(currentDate.value))
const daysUntil = computed(() => {
	const target = targetDate.value
	if (!target)
		return '--'

	const today = new Date(currentDate.value.getFullYear(), currentDate.value.getMonth(), currentDate.value.getDate())
	return Math.round((target.getTime() - today.getTime()) / 86400000)
})

const progressRows = computed(() => units.map((item) => {
	const { remaining, percentage } = getCountdownProgress(item.key, currentDate.value, countdownConfig.value.weekStart)
	return {
		...item,
		remaining,
		percentage,
		style: { width: `${percentage}%` },
		highlight: percentage >= 50,
	}
}))

const targetDateText = computed(() => {
	const target = targetDate.value
	if (!target)
		return '-'

	const year = target.getFullYear()
	const month = String(target.getMonth() + 1).padStart(2, '0')
	const day = String(target.getDate()).padStart(2, '0')
	return `${year}-${month}-${day}`
})

/** 当天农历日期与目标春节的干支生肖，同时开启时用间隔号连成一行 */
const lunarText = computed(() => {
	const parts: string[] = []
	if (countdownConfig.value.showLunar) {
		const lunar = getLunarDate(currentDate.value)
		if (lunar)
			parts.push(lunar.text)
	}

	const target = targetDate.value
	if (target && countdownConfig.value.showZodiac)
		parts.push(getLunarYearName(getSpringFestivalLunarYear(target)))

	return parts.join(' · ')
})

function setHovering(value: boolean) {
	if (canHover.value)
		showRemaining.value = value
}
</script>

<template>
<BlogWidget card title="倒计时">
	<div class="countdown" :class="{ 'show-remaining': showRemaining }" @mouseenter="setHovering(true)" @mouseleave="setHovering(false)">
		<div class="left">
			<div class="text">
				距离
			</div>
			<div class="name">
				{{ targetName }}
			</div>
			<div class="days">
				{{ daysUntil }}
			</div>
			<div class="date">
				{{ targetDateText }}
			</div>
			<div v-if="lunarText" class="lunar">
				{{ lunarText }}
			</div>
		</div>

		<div class="right">
			<div v-for="item in progressRows" :key="item.key" class="row">
				<div class="row-name">
					{{ item.text }}
				</div>
				<button
					class="bar-wrap"
					type="button"
					:aria-label="`${item.text}进度 ${item.percentage.toFixed(2)}%，剩余${item.remaining}${item.unit}，点击切换显示`"
					:aria-pressed="showRemaining"
					@click="showRemaining = !showRemaining"
				>
					<span class="bar" :style="item.style" aria-hidden="true" />
					<span class="percent" :class="{ highlight: item.highlight }" aria-hidden="true">{{ item.percentage.toFixed(2) }}%</span>
					<span class="remain" :class="{ highlight: item.highlight }" aria-hidden="true">剩余{{ item.remaining }}{{ item.unit }}</span>
				</button>
			</div>
		</div>
	</div>
</BlogWidget>
</template>

<style scoped>
.countdown {
	display: flex;
	gap: 0.8rem;
}

.left {
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	position: relative;
	min-width: 5.2rem;
	line-height: 1.5;

	&::after {
		content: "";
		position: absolute;
		opacity: 0.8;
		right: -0.4rem;
		width: 2px;
		height: 80%;
		background-color: var(--c-border);
	}

	.text {
		font-size: 0.9rem;
		color: var(--c-text-2);
	}

	.name {
		font-size: 1.8rem;
		font-weight: 700;
		line-height: 1.2;
		color: var(--c-text-1);
	}

	.days {
		font-size: 2.2rem;
		font-weight: 800;
		line-height: 1.1;
		color: var(--c-primary);
	}

	.date {
		font-size: 0.85rem;
		color: var(--c-text-3);
	}

	.lunar {
		font-size: 0.75rem;
		line-height: 1.4;
		text-align: center;
		color: var(--c-text-3);
	}
}

.right {
	display: flex;
	flex: 1;
	flex-direction: column;
	justify-content: space-between;
	gap: 0.35rem;
}

.row {
	display: flex;
	align-items: center;
	gap: 0.45rem;
}

.row-name {
	font-size: 0.9rem;
	white-space: nowrap;
	color: var(--c-text-2);
}

.bar-wrap {
	flex: 1;
	position: relative;
	overflow: hidden;
	height: 1.9rem;
	border-radius: 8px;
	background-color: var(--c-bg-soft);
}

.bar {
	display: block;
	height: 100%;
	border-radius: 8px;
	background-color: hsl(var(--hue-theme) 100% 70%);
	transition: width var(--motion-duration);
}

.dark .bar {
	background-color: hsl(var(--hue-theme) 100% 55%);
}

.percent,
.remain {
	position: absolute;
	inset-block-start: 50%;
	font-size: 0.8rem;
	font-weight: 400;
	color: var(--c-text-1);
	transform: translateY(-50%);
	transition: opacity var(--motion-duration), transform 0.3s;
}

.percent {
	inset-inline-start: 0.45rem;
}

.remain {
	opacity: 0;
	inset-inline-end: 0.45rem;
	transform: translateY(-50%) translateX(0.625rem);
}

.highlight {
	font-weight: 600;
}

.countdown.show-remaining {
	.remain {
		opacity: 1;
		transform: translateY(-50%) translateX(0);
	}

	.percent {
		opacity: 0;
		transform: translateY(-50%) translateX(-0.625rem);
	}
}

@media (max-width: 768px) {
	.countdown {
		flex-direction: column;
	}

	.left {
		padding-bottom: 0.6rem;

		&::after {
			right: auto;
			bottom: 0;
			left: 10%;
			width: 80%;
			height: 1px;
		}
	}
}
</style>
