/** 赞助记录的清洗与校验：宁可直接拒绝，也不静默改写用户数据。 */

export interface CleanEntry {
	name: string
	amount: number
	date: string
}

export interface ValidationIssue {
	/** 出问题的字段（中文 label，直接进评论） */
	field: string
	message: string
}

export type FieldResult<T> = { value: T, issue?: undefined } | { value?: undefined, issue: ValidationIssue }

const invisibleRe = /[\u200B-\u200D\uFEFF]/g
/** 名称上限按码位算，卡片是单行省略，太长的名字在手机上只能看到省略号 */
export const maxNameLength = 24
export const maxAmount = 100000
export const minDate = '2015-01-01'

/** 删掉残余控制字符（用码位判断，避免正则里的控制字符转义） */
function stripControl(value: string): string {
	return [...value].filter((char) => {
		const code = char.codePointAt(0) ?? 0
		return code >= 0x20 && code !== 0x7F
	}).join('')
}

export function cleanName(raw: string): FieldResult<string> {
	// 顺序有讲究：先把换行/tab 折成空格，再删残余控制字符，否则「青柚\n不加冰」会被粘成一个词
	const value = stripControl(raw
		.normalize('NFKC')
		.replaceAll(invisibleRe, '')
		.replaceAll(/\s+/g, ' ')
		.trim())

	if (!value)
		return { issue: { field: '名称', message: '名称为空' } }
	const length = [...value].length
	if (length > maxNameLength) {
		return {
			issue: { field: '名称', message: `名称有 ${length} 个字，超过上限 ${maxNameLength} 字，请缩短后重新提交` },
		}
	}
	return { value }
}

export function parseAmount(raw: string): FieldResult<number> {
	// 只剥常见的货币符号与分隔符，不做四舍五入
	const text = raw
		.normalize('NFKC')
		.replaceAll(/[¥￥$，,\s元人民币]/g, '')
		.trim()

	if (!/^\d{1,6}(?:\.\d{1,2})?$/.test(text)) {
		return {
			issue: {
				field: '金额',
				message: `金额「${raw.slice(0, 20)}」不是合法数字（只接受纯数字、最多两位小数，如 66.66）`,
			},
		}
	}
	const value = Number(text)
	if (!Number.isFinite(value) || value <= 0)
		return { issue: { field: '金额', message: '金额必须大于 0' } }
	if (value > maxAmount)
		return { issue: { field: '金额', message: `金额超过上限 ${maxAmount}，请手工录入` } }
	return { value }
}

function pad(value: number): string {
	return String(value).padStart(2, '0')
}

export function parseDate(raw: string, today: string): FieldResult<string> {
	const text = raw.normalize('NFKC').replaceAll(/[./]/g, '-').trim()
	const matched = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(text)
	if (!matched) {
		return {
			issue: {
				field: '时间',
				message: `日期「${raw.slice(0, 20)}」格式不对，请用 YYYY-MM-DD（如 2026-09-12）`,
			},
		}
	}

	const year = Number(matched[1])
	const month = Number(matched[2])
	const day = Number(matched[3])
	const date = `${year}-${pad(month)}-${pad(day)}`
	const parsed = new Date(Date.UTC(year, month - 1, day))
	// 回读三要素，挡住 2026-02-30 这种不存在的日期
	if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day)
		return { issue: { field: '时间', message: `日期 ${date} 不存在，请检查` } }

	if (date < minDate)
		return { issue: { field: '时间', message: `日期 ${date} 早于 ${minDate}，请检查` } }
	if (date > today)
		return { issue: { field: '时间', message: `日期 ${date} 晚于今天（${today}），可能是填错了，请确认后重新提交` } }

	return { value: date }
}

/** 去重键：昵称（NFKC + 去空白 + 小写） + 日期 */
export function entryKey(entry: { name: string, date: string }): string {
	const name = entry.name.normalize('NFKC').replaceAll(/\s+/g, '').toLowerCase()
	return `${name}|${entry.date}`
}

export function validateForm(fields: Partial<{ name: string, amount: string, date: string }>, today: string): {
	entry?: CleanEntry
	issues: ValidationIssue[]
} {
	const issues: ValidationIssue[] = []

	const name = cleanName(fields.name ?? '')
	if (name.issue)
		issues.push(name.issue)

	const amount = parseAmount(fields.amount ?? '')
	if (amount.issue)
		issues.push(amount.issue)

	const date = parseDate(fields.date ?? '', today)
	if (date.issue)
		issues.push(date.issue)

	if (issues.length || name.value === undefined || amount.value === undefined || date.value === undefined)
		return { issues }

	return { entry: { name: name.value, amount: amount.value, date: date.value }, issues }
}
