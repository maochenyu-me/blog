/**
 * 极简 frontmatter 读写：只处理文章头部顶层的标量字段。
 *
 * 不引入 YAML 依赖（脚本零额外依赖），写回时统一用双引号字符串，
 * 既不会被中文冒号、`#` 之类打断，读回时也能用 JSON.parse 还原。
 */

export interface FrontmatterParts {
	/** frontmatter 文本，不含两侧的 `---` */
	frontmatter: string
	/** 正文（head 之后的全部内容） */
	body: string
	hasFrontmatter: boolean
}

const frontmatterRe = /^---\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/
const blockScalarRe = /^[|>][+-]?\d*$/

/** 拆分文章头部与正文；没有头部时整篇都算正文 */
export function splitFrontmatter(raw: string): FrontmatterParts {
	const match = raw.match(frontmatterRe)

	if (!match)
		return { frontmatter: '', body: raw, hasFrontmatter: false }

	return {
		frontmatter: match[1],
		body: raw.slice(match[0].length),
		hasFrontmatter: true,
	}
}

/** 还原 YAML 标量：双引号按 JSON 规则，单引号按 YAML 规则（'' 表示一个 '） */
function unquote(value: string): string {
	if (value.length >= 2) {
		if (value.startsWith('"') && value.endsWith('"')) {
			try {
				return JSON.parse(value) as string
			}
			catch {
				return value.slice(1, -1)
			}
		}

		if (value.startsWith('\'') && value.endsWith('\''))
			return value.slice(1, -1).replaceAll('\'\'', '\'')
	}

	return value
}

/** 读取顶层字段；块标量（`|` / `>`）会把续行拼回来，字段不存在返回 undefined */
export function readField(frontmatter: string, key: string): string | undefined {
	const lines = frontmatter.split(/\r?\n/)
	const pattern = new RegExp(`^${key}:(.*)$`)

	for (let index = 0; index < lines.length; index++) {
		const match = lines[index].match(pattern)

		if (!match)
			continue

		const head = match[1].trim()

		if (!blockScalarRe.test(head))
			return unquote(head)

		const block: string[] = []

		for (let cursor = index + 1; cursor < lines.length; cursor++) {
			const line = lines[cursor]

			if (line.trim() === '') {
				block.push('')
				continue
			}

			if (!/^[ \t]/.test(line))
				break

			block.push(line.replace(/^[ \t]+/, ''))
		}

		while (block.length && block.at(-1) === '')
			block.pop()

		return block.join('\n').trim()
	}

	return undefined
}

/** 字段存在且有非空数据 */
export function hasField(frontmatter: string, key: string): boolean {
	return Boolean(readField(frontmatter, key)?.trim())
}

/** 写回时统一转成单行双引号标量，避免多行摘要撑坏 frontmatter */
function quote(value: string): string {
	const single = value
		.replace(/\r?\n/g, ' ')
		.replace(/\\/g, '\\\\')
		.replace(/"/g, '\\"')

	return `"${single}"`
}

/** 去掉指定字段（含块标量的续行），其余行原样保留 */
function stripFields(frontmatter: string, keys: string[]): string[] {
	if (!frontmatter.trim())
		return []

	const lines = frontmatter.split(/\r?\n/)
	const kept: string[] = []

	for (let index = 0; index < lines.length; index++) {
		const line = lines[index]
		const key = keys.find(name => line.startsWith(`${name}:`))

		if (!key) {
			kept.push(line)
			continue
		}

		if (!blockScalarRe.test(line.slice(key.length + 1).trim()))
			continue

		let cursor = index + 1

		while (cursor < lines.length && (/^[ \t]/.test(lines[cursor]) || lines[cursor].trim() === ''))
			cursor += 1

		index = cursor - 1
	}

	return kept
}

/**
 * 写入若干顶层字段（同名字段就地覆盖，其余顺序与内容保持不变）。
 * 文章没有头部时会补一个。
 */
export function upsertFields(raw: string, fields: Record<string, string>): string {
	const { frontmatter, body } = splitFrontmatter(raw)
	const keys = Object.keys(fields)
	const lines = [
		...stripFields(frontmatter, keys),
		...keys.map(key => `${key}: ${quote(fields[key])}`),
	]

	return `---\n${lines.join('\n')}\n---\n${body}`
}
