/** 把「赞助登记」issue 表单渲染出的 body 还原成字段。 */

import { splitSections, toFieldValue } from '../link-apply/parse.ts'

export interface RewardForm {
	name: string
	amount: string
	date: string
	screenshot: string
	note?: string
}

export interface RewardParseResult {
	fields: Partial<RewardForm>
	/** 缺失的必填字段 label（中文，可直接进评论） */
	missing: string[]
	/** 同一个 label 出现多次：body 可能被手工编辑过 */
	duplicated: string[]
	/** 从「支付截图」里抽出的图片地址（不校验可达性） */
	screenshots: string[]
}

/** 解析锚点：表单 label 文案。上线后不可改，改了要同步这里。 */
export const labelMap: Record<string, keyof RewardForm> = {
	名称: 'name',
	金额: 'amount',
	时间: 'date',
	支付截图: 'screenshot',
	备注: 'note',
}

const fieldLabels: Record<keyof RewardForm, string> = Object.fromEntries(
	Object.entries(labelMap).map(([label, key]) => [key, label]),
) as Record<keyof RewardForm, string>

/** 必填字段，按表单顺序 */
export const requiredFields: Array<keyof RewardForm> = ['name', 'amount', 'date', 'screenshot']

const markdownImageRe = /!\[[^\]]*\]\(([^)\s]+)\)/g
const bareAttachmentRe = /https?:\/\/[^\s)\]"']*(?:user-attachments|githubusercontent\.com)[^\s)\]"']*/g

/** 从截图字段里抽图片地址：先认 markdown 图片，再兜住直接粘贴的附件链接 */
export function extractImageUrls(raw: string): string[] {
	const urls = new Set<string>()
	for (const match of raw.matchAll(markdownImageRe))
		urls.add(match[1]!.trim())
	for (const match of raw.matchAll(bareAttachmentRe))
		urls.add(match[0].trim())
	return [...urls].filter(url => /^https:\/\//.test(url))
}

export function parseRewardForm(body: string): RewardParseResult {
	const fields: Record<string, string> = {}
	const missing: string[] = []
	const duplicated: string[] = []
	const seen = new Set<string>()

	for (const section of splitSections(body)) {
		const key = labelMap[section.label]
		// 勾选确认那段（`### 提交前请确认`）与 markdown 说明都不在白名单里，直接跳过
		if (!key)
			continue
		if (seen.has(key)) {
			duplicated.push(fieldLabels[key])
			continue
		}
		seen.add(key)
		const value = toFieldValue(section.value)
		if (value !== undefined)
			fields[key] = value
	}

	for (const key of requiredFields) {
		if (!fields[key])
			missing.push(fieldLabels[key])
	}

	const screenshots = fields.screenshot ? extractImageUrls(fields.screenshot) : []

	return { fields: fields as Partial<RewardForm>, missing, duplicated, screenshots }
}
