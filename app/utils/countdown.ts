import { Temporal } from 'temporal-polyfill'
import blogConfig from '~~/blog.config'

/** 1900–2100 年农历数据，每年一个 17 位整数：低 4 位为闰月月份，bit16 为大闰月，其余位表示各月大小 */
const LUNAR_INFO = '04bd8,04ae0,0a570,054d5,0d260,0d950,16554,056a0,09ad0,055d2,04ae0,0a5b6,0a4d0,0d250,1d255,0b540,0d6a0,0ada2,095b0,14977,04970,0a4b0,0b4b5,06a50,06d40,1ab54,02b60,09570,052f2,04970,06566,0d4a0,0ea50,06e95,05ad0,02b60,186e3,092e0,1c8d7,0c950,0d4a0,1d8a6,0b550,056a0,1a5b4,025d0,092d0,0d2b2,0a950,0b557,06ca0,0b550,15355,04da0,0a5d0,14573,052d0,0a9a8,0e950,06aa0,0aea6,0ab50,04b60,0aae4,0a570,05260,0f263,0d950,05b57,056a0,096d0,04dd5,04ad0,0a4d0,0d4d4,0d250,0d558,0b540,0b5a0,195a6,095b0,049b0,0a974,0a4b0,0b27a,06a50,06d40,0af46,0ab60,09570,04af5,04970,064b0,074a3,0ea50,06b58,055c0,0ab60,096d5,092e0,0c960,0d954,0d4a0,0da50,07552,056a0,0abb7,025d0,092d0,0cab5,0a950,0b4a0,0baa4,0ad50,055d9,04ba0,0a5b0,15176,052b0,0a930,07954,06aa0,0ad50,05b52,04b60,0a6e6,0a4e0,0d260,0ea65,0d530,05aa0,076a3,096d0,04bd7,04ad0,0a4d0,1d0b6,0d250,0d520,0dd45,0b5a0,056d0,055b2,049b0,0a577,0a4b0,0aa50,1b255,06d20,0ada0,14b63,09370,049f8,04970,064b0,168a6,0ea50,06b20,1a6c4,0aae0,0a2e0,0d2e3,0c960,0d557,0d4a0,0da50,05d55,056a0,0a6d0,055d4,052d0,0a9b8,0a950,0b4a0,0b6a6,0ad50,055a0,0aba4,0a5b0,052b0,0b273,06930,07337,06aa0,0ad50,14b55,04b60,0a570,054e4,0d160,0e968,0d520,0daa0,16aa6,056d0,04ae0,0a9d4,0a2d0,0d150,0f252,0d520'
	.split(',')
	.map(hex => Number.parseInt(hex, 16))

const MIN_YEAR = 1900
const MAX_YEAR = 2100

/** 干支与生肖以农历年为准，公元 4 年为甲子年 */
const HEAVENLY_STEMS = ['甲', '乙', '丙', '丁', '戊', '己', '庚', '辛', '壬', '癸'] as const
const EARTHLY_BRANCHES = ['子', '丑', '寅', '卯', '辰', '巳', '午', '未', '申', '酉', '戌', '亥'] as const
const ZODIAC_ANIMALS = ['鼠', '牛', '虎', '兔', '龙', '蛇', '马', '羊', '猴', '鸡', '狗', '猪'] as const
/** 十一月、十二月按习惯称冬月、腊月 */
const LUNAR_MONTH_NAMES = ['正', '二', '三', '四', '五', '六', '七', '八', '九', '十', '冬', '腊'] as const
const CHINESE_DIGITS = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十'] as const
const LUNAR_DAY_TENS = ['初', '十', '廿'] as const

export type CountdownUnitKey = 'day' | 'week' | 'month' | 'year'

export interface LunarDate {
	/** 农历年，即正月初一所在的公历年 */
	year: number
	/** 农历月，1–12 */
	month: number
	/** 农历日，1–30 */
	day: number
	/** 是否闰月 */
	isLeap: boolean
	/** 形如「九月十六」「闰六月初三」 */
	text: string
}

interface LunarMonth {
	month: number
	days: number
	isLeap: boolean
}

/**
 * 将任意时刻换算成博客时区下的同一时刻。
 * 农历日期和天数只在时区一致时才能对齐，否则服务器（多为 UTC）预渲染与访客本地时区会在跨零点后得出不同结果。
 */
export function toBlogTimeZoneDate(now: Date): Date {
	const zoned = Temporal.Instant
		.fromEpochMilliseconds(now.getTime())
		.toZonedDateTimeISO(blogConfig.timeZone)

	return new Date(zoned.year, zoned.month - 1, zoned.day, zoned.hour, zoned.minute)
}

/**
 * 取下一个春节，即正月初一 00:00，也就是除夕 24:00。
 * 正月初一当天即指向下一年，避免全年只在初一显示一次「0 天」。
 */
export function resolveSpringFestivalDate(now: Date): Date | null {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const thisYearDate = getSpringFestivalDate(now.getFullYear())
	if (thisYearDate && today < thisYearDate) {
		return thisYearDate
	}
	return getSpringFestivalDate(now.getFullYear() + 1)
}

/** 春节固定为正月初一，因此目标日期所在公历年就是该春节所属的农历年 */
export function getSpringFestivalLunarYear(springFestivalDate: Date): number {
	return springFestivalDate.getFullYear()
}

/** 形如「丙午马年」 */
export function getLunarYearName(lunarYear: number): string {
	const index = (lunarYear - 4) % 60
	return `${HEAVENLY_STEMS[index % 10]}${EARTHLY_BRANCHES[index % 12]}${ZODIAC_ANIMALS[index % 12]}年`
}

/** 取指定时刻在博客时区下的农历日期 */
export function getLunarDate(now: Date): LunarDate | null {
	const today = toEpochDay(now)
	const lunarYear = getLunarYearOf(today)
	const newYear = getSpringFestivalDate(lunarYear)
	if (!newYear)
		return null

	let offset = today - toEpochDay(newYear)
	for (const item of getLunarMonths(lunarYear)) {
		if (offset < item.days) {
			const day = offset + 1
			return {
				year: lunarYear,
				month: item.month,
				day,
				isLeap: item.isLeap,
				text: `${item.isLeap ? '闰' : ''}${LUNAR_MONTH_NAMES[item.month - 1]}月${getLunarDayName(day)}`,
			}
		}
		offset -= item.days
	}
	return null
}

export function getCountdownProgress(
	unit: CountdownUnitKey,
	now: Date,
	/** 一周的开始日，1=周一 … 7=周日 */
	weekStart = 1,
): { remaining: number, percentage: number } {
	if (unit === 'week')
		return getWeekProgress(now, weekStart)

	if (unit === 'year')
		return getSpringYearProgress(now)

	return unit === 'day' ? getDayProgress(now) : getMonthProgress(now)
}

function getLunarDayName(day: number): string {
	if (day === 10)
		return '初十'
	if (day === 20)
		return '二十'
	if (day === 30)
		return '三十'

	return `${LUNAR_DAY_TENS[Math.floor(day / 10)]}${CHINESE_DIGITS[(day % 10) - 1]}`
}

/** 农历年 `year` 各月的大小，闰月紧跟在同名月份之后 */
function getLunarMonths(year: number): LunarMonth[] {
	const yearInfo = LUNAR_INFO[year - MIN_YEAR] ?? 0
	const months: LunarMonth[] = []
	for (let index = 0; index < 12; index += 1) {
		months.push({
			month: index + 1,
			days: yearInfo & (0x8000 >> index) ? 30 : 29,
			isLeap: false,
		})
	}

	const leapMonth = yearInfo & 0xF
	if (leapMonth) {
		months.splice(leapMonth, 0, {
			month: leapMonth,
			days: yearInfo & 0x10000 ? 30 : 29,
			isLeap: true,
		})
	}
	return months
}

/** 指定日期所属的农历年，春节之前仍算上一个农历年 */
function getLunarYearOf(epochDay: number): number {
	const year = new Date(epochDay * 86400000).getUTCFullYear()
	const newYear = getSpringFestivalDate(year)
	if (newYear && epochDay < toEpochDay(newYear))
		return year - 1

	return year
}

/** 统一换算为 UTC 天序号，避免夏令时造成的跨日误差 */
function toEpochDay(date: Date): number {
	return Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
}

function getSpringFestivalDate(year: number): Date | null {
	if (year < MIN_YEAR || year > MAX_YEAR) {
		return null
	}

	let offsetDays = 0
	for (let current = MIN_YEAR; current < year; current += 1) {
		offsetDays += getLunarYearDaysCount(current)
	}

	const date = new Date(Date.UTC(MIN_YEAR, 0, 31) + offsetDays * 86400000)
	return new Date(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate())
}

function getLunarYearDaysCount(year: number): number {
	const yearInfo = LUNAR_INFO[year - MIN_YEAR] ?? 0
	let sum = 348
	for (let i = 0x8000; i > 0x8; i >>= 1) {
		sum += yearInfo & i ? 1 : 0
	}

	const leapMonth = yearInfo & 0xF
	if (leapMonth) {
		sum += yearInfo & 0x10000 ? 30 : 29
	}

	return sum
}

/**
 * 四个进度条统一口径：**剩余量不含当前单位**（今天/本周/本月/本农历年已过部分），
 * 因此「剩余」与「百分比」不会再像旧实现那样互相矛盾，且能真正走到 0 / 100%。
 */

function getDayProgress(now: Date): { remaining: number, percentage: number } {
	// 按分钟计，避免 09:00 与 09:59 显示同样的剩余小时；
	// 不足一小时按一小时计（向上取整），使数值只在整点跳变
	const passedMinutes = now.getHours() * 60 + now.getMinutes()
	const totalMinutes = 24 * 60
	const remainingHours = (totalMinutes - passedMinutes) / 60
	return { remaining: Math.ceil(remainingHours), percentage: (passedMinutes / totalMinutes) * 100 }
}

function getWeekProgress(now: Date, weekStart: number): { remaining: number, percentage: number } {
	// 转为 ISO 星期：1=周一 … 7=周日
	const isoDay = now.getDay() === 0 ? 7 : now.getDay()
	// 本周已过的整天数，今天不算已过
	const passed = (isoDay - weekStart + 7) % 7
	return { remaining: 7 - passed - 1, percentage: (passed / 7) * 100 }
}

function getMonthProgress(now: Date): { remaining: number, percentage: number } {
	const total = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate()
	// 本月已过的整天数，今天不算已过
	const passed = now.getDate() - 1
	return { remaining: total - passed - 1, percentage: (passed / total) * 100 }
}

/**
 * 年进度以春节为界：上一个春节 → 下一个春节，与卡片大字的「距离春节」同源，
 * 避免出现「距离春节 101 天」而「年」只剩 65 天这种自相矛盾的读法。
 */
function getSpringYearProgress(now: Date): { remaining: number, percentage: number } {
	const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
	const next = resolveSpringFestivalDate(now)
	const prev = getSpringFestivalDate(today.getFullYear() - (isBeforeThisYearSpringFestival(today) ? 1 : 0))
	if (!next || !prev)
		return { remaining: 0, percentage: 0 }

	const total = Math.round((next.getTime() - prev.getTime()) / 86400000)
	// 距下一个春节的天数（不含今天、不含目标当天），与大字 daysUntil 一致
	const remaining = Math.round((next.getTime() - today.getTime()) / 86400000)
	return { remaining, percentage: ((total - remaining) / total) * 100 }
}

/** 今天是否还在本年春节之前（此时「上一个春节」属于上一年） */
function isBeforeThisYearSpringFestival(today: Date): boolean {
	const thisYear = getSpringFestivalDate(today.getFullYear())
	return !!thisYear && today < thisYear
}
