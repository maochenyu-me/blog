/**
 * 解析 GitHub issue 表单（issue forms）渲染后的 body。
 *
 * 表单里每个元素都会渲染成 `### <label>` + 空行 + 值，空的可选字段是 `_No response_`；
 * 勾选项（checkboxes）渲染成 `- [X] 文案`，markdown 元素不会出现在 body 里。
 * 这里只认白名单 label，不认识的段落一律忽略，绝不因为多出来的段而抛错。
 */

export interface LinkForm {
	author: string
	sitenick?: string
	title: string
	desc: string
	link: string
	feed: string
	avatar: string
	icon?: string
}

export interface ParseResult {
	fields: Partial<LinkForm>
	/** 缺失的必填字段 label（中文，可直接进评论） */
	missing: string[]
	/** 同一个 label 出现多次：body 可能被手工编辑或伪造，需要管理员复核 */
	duplicated: string[]
	/** 不认识的 `### ` 段标题 */
	unknown: string[]
}

/** 解析锚点。表单里的 label 文案一旦上线就不能改，改了就同步这里。 */
export const labelMap: Record<string, keyof LinkForm> = {
	作者自称: 'author',
	站点简称: 'sitenick',
	站点标题: 'title',
	站点简介: 'desc',
	站点地址: 'link',
	订阅源: 'feed',
	头像地址: 'avatar',
	站点图标: 'icon',
}

/** 必填字段，按表单顺序排列 */
export const requiredFields: Array<keyof LinkForm> = ['author', 'title', 'desc', 'link', 'feed', 'avatar']

/** 字段 → 中文 label 的反查表（评论里提示用） */
export const fieldLabels: Record<keyof LinkForm, string> = Object.fromEntries(
	Object.entries(labelMap).map(([label, key]) => [key, label]),
) as Record<keyof LinkForm, string>

const emptyRe = /^_?no response_?$/i
const invisibleRe = /[\u200B-\u200D\uFEFF]/g

/** 按 `### <label>` 逐行切段（不用一条大正则，避免回溯风险） */
export function splitSections(body: string): Array<{ label: string, value: string }> {
	const lines = body.replaceAll('\r\n', '\n').replaceAll('\r', '\n').split('\n')
	const sections: Array<{ label: string, value: string }> = []
	let label = ''
	let buffer: string[] = []

	const flush = () => {
		if (label)
			sections.push({ label: label.trim(), value: buffer.join('\n').trim() })
	}

	for (const line of lines) {
		if (line.startsWith('### ')) {
			flush()
			label = line.slice(4)
			buffer = []
			continue
		}
		buffer.push(line)
	}
	flush()

	return sections
}

/** 清理单值：去不可见字符、去包裹的反引号/尖括号、空白与 `_No response_` 都算空 */
export function toFieldValue(raw: string): string | undefined {
	const value = raw
		.replaceAll(invisibleRe, '')
		.replaceAll(/^[\s`]+|[\s`]+$/g, '')
		.replaceAll(/^[<\s]+|[>\s]+$/g, '')
		.trim()
	if (!value || emptyRe.test(value))
		return undefined
	return value
}

/** 简介允许换行，但必须删掉伪造的 `### ` 标题行（否则会截断后面的字段） */
export function descText(raw: string): string {
	return raw
		.split('\n')
		.filter(line => !line.trimStart().startsWith('###'))
		.join(' ')
		.replaceAll(/\s+/g, ' ')
		.trim()
}

export function parseIssueForm(body: string): ParseResult {
	const fields: Record<string, string> = {}
	const missing: string[] = []
	const duplicated: string[] = []
	const unknown: string[] = []
	const seen = new Set<string>()

	for (const section of splitSections(body)) {
		const key = labelMap[section.label]
		if (!key) {
			// 勾选项那段（`### 我已阅读并同意…`）属于已知噪音，不算 unknown
			if (!section.label.startsWith('我已阅读'))
				unknown.push(section.label)
			continue
		}
		if (seen.has(key)) {
			duplicated.push(fieldLabels[key])
			continue
		}
		seen.add(key)
		const value = toFieldValue(key === 'desc' ? descText(section.value) : section.value)
		if (value !== undefined)
			fields[key] = value
	}

	for (const key of requiredFields) {
		if (!fields[key])
			missing.push(fieldLabels[key])
	}

	return { fields: fields as Partial<LinkForm>, missing, duplicated, unknown }
}
