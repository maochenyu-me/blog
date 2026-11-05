/**
 * 说说内容的 URL 安全工具（纯函数，无 Nuxt 上下文依赖）。
 *
 * 为什么需要它：Ech0 的 `extension.payload` 是服务端自由 JSON，前端把它直接绑到
 * `:href` 时**没有第二道防线** —— Vue 的 runtime-dom 不做 href 协议净化
 * （`javascript:` 黑名单只存在于 compiler-dom 对模板字面量的检查里，对 `:href` 绑定无效）。
 * 所以所有来自接口的链接都必须先过这里。
 */

/** 绝对地址（含 `//host` 这种协议相对地址） */
const absoluteUrlPattern = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i

/**
 * 只放行 http / https，其余（`javascript:`、`data:`、`blob:`、相对歧义串）一律返回空串。
 * 返回空串时调用方应渲染成不可点的纯文本，而不是留一个 `href=""`。
 */
export function safeHttpUrl(url: string | undefined | null) {
	const value = (url ?? '').trim()
	if (!value)
		return ''
	let parsed: URL
	try {
		// 补 `//` 的平台前缀，让 `//cdn.test/a.png` 这类协议相对地址能正常解析
		parsed = new URL(value.startsWith('//') ? `https:${value}` : value)
	}
	catch {
		return ''
	}
	if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
		return ''
	return parsed.toString()
}

/**
 * 把可能是相对路径的资源地址补成绝对地址（用于附件与正文图片）。
 * 兼容上游的三种形态：`/api/files/x.png`、`files/x.png`、外链绝对地址。
 */
export function resolveAssetUrl(url: string | undefined | null, apiBase: string) {
	const value = (url ?? '').trim()
	if (!value)
		return ''
	if (absoluteUrlPattern.test(value))
		return value.startsWith('//') ? `https:${value}` : value
	const base = apiBase.replace(/\/+$/, '')
	const path = value.startsWith('files/') ? `/api/${value}` : `/${value.replace(/^\/+/, '')}`
	return `${base}${path}`
}

/** GitHub 仓库地址白名单：只接受 github.com 的两段式 `owner/repo` */
export function safeGithubRepoUrl(url: string | undefined | null) {
	const safe = safeHttpUrl(url)
	if (!safe)
		return ''
	const parsed = new URL(safe)
	if (parsed.hostname !== 'github.com' && parsed.hostname !== 'www.github.com')
		return ''
	const segments = parsed.pathname.split('/').filter(Boolean)
	if (segments.length < 2)
		return ''
	return safe
}
