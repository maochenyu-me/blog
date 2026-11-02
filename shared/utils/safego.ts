/**
 * 外链中转安全页的纯判定层
 *
 * 这里只做与宿主环境无关的计算：不读写 document、不依赖任何第三方包，
 * 因此既可以被浏览器端的拦截器与中转页复用，也能被 node --test 直接导入。
 */
import type { SafeGoConfig, SafeGoRiskKind, SafeGoTarget } from '~/types/safego'

/** 允许跳转的协议白名单；中转页只认这两个，其余一律拒绝 */
const ALLOWED_PROTOCOLS = new Set(['http:', 'https:'])
/** 默认端口；其余端口视为可疑 */
const DEFAULT_PORTS = new Set(['', '80', '443'])
/** 超过这个长度视为可疑地址 */
const SUSPICIOUS_URL_LENGTH = 160
const IPV4_PATTERN = /^\d{1,3}(?:\.\d{1,3}){3}$/

/** 去掉尾部斜杠，让 `/go/` 与 `/go` 等价；空串归一成 `/` */
function normalizePath(path: string) {
	return path.replace(/\/+$/, '') || '/'
}

/** 把 glob 模式编译成正则：`**` 跨路径段，`*` 只在单个路径段内匹配 */
function globToRegExp(pattern: string) {
	let source = ''
	for (let index = 0; index < pattern.length; index++) {
		const char = pattern[index]
		if (char !== '*') {
			source += /[.+^${}()|[\]\\]/.test(char) ? `\\${char}` : char
			continue
		}
		if (pattern[index + 1] === '*') {
			index += 1
			source += '.*'
			continue
		}
		source += '[^/]*'
	}
	// 结尾的 `/**` 允许整段后缀缺失，让 `/previews/**` 同时命中 `/previews`
	if (source.length > 3 && source.endsWith('/.*'))
		source = `${source.slice(0, -3)}(?:/.*)?`
	return new RegExp(`^${source}$`)
}

/** 页面路径是否命中 glob 模式 */
export function matchPathPattern(pattern: string, path: string) {
	return globToRegExp(normalizePath(pattern)).test(normalizePath(path))
}

/** 当前页面是否在中转页的生效范围内 */
export function isPageInScope(path: string, pages: SafeGoConfig['pages']) {
	if (!pages.include.some(pattern => matchPathPattern(pattern, path)))
		return false
	return !pages.exclude.some(pattern => matchPathPattern(pattern, path))
}

/** 主机名后缀匹配：`github.com` 命中 github.com 与 gist.github.com，但不命中 evilgithub.com */
export function matchDomainHost(host: string, domains: string[]) {
	const normalized = host.toLowerCase().replace(/\.$/, '')
	return domains.some((domain) => {
		const target = domain.toLowerCase().replace(/\.$/, '')
		return normalized === target || normalized.endsWith(`.${target}`)
	})
}

/**
 * 判断一个锚点 href 是否应该被中转，命中则返回规范化后的目标地址。
 *
 * 返回 null 表示放行（站内链接、非 http(s) 协议、命中名单规则之外）。
 */
export function resolveInterceptedHref(href: string, base: string, links: SafeGoConfig['links']) {
	let baseUrl: URL
	try {
		baseUrl = new URL(base)
	}
	catch {
		return null
	}
	let url: URL
	try {
		url = new URL(href, baseUrl)
	}
	catch {
		return null
	}
	if (!ALLOWED_PROTOCOLS.has(url.protocol))
		return null
	if (url.origin === baseUrl.origin)
		return null
	const listed = matchDomainHost(url.hostname, links.domains)
	// mode=all 时 domains 是豁免名单；mode=listed 时 domains 是命中名单
	if (links.mode === 'all' ? listed : !listed)
		return null
	return url.href
}

/**
 * 解析中转页参数。
 *
 * 注意：查询参数在 Vue Router 里已经解过一次码，这里**不能再解码**，
 * 否则目标地址里的百分号转义会被二次破坏；只有 base64 模式才需要自己解码。
 */
export function resolveTarget(raw: string | undefined, base64: boolean): SafeGoTarget {
	if (!raw)
		return { ok: false, reason: 'missing' }
	const decoded = base64 ? decodeBase64Url(raw) : raw
	if (decoded === null)
		return { ok: false, reason: 'malformed' }
	let url: URL
	try {
		url = new URL(decoded)
	}
	catch {
		return { ok: false, reason: 'malformed' }
	}
	if (!ALLOWED_PROTOCOLS.has(url.protocol))
		return { ok: false, reason: 'protocol' }
	return { ok: true, href: url.href, host: url.host, risks: detectRisks(url) }
}

/** 目标地址的可疑特征；顺序固定，便于展示与测试 */
export function detectRisks(url: URL): SafeGoRiskKind[] {
	const risks: SafeGoRiskKind[] = []
	if (url.protocol === 'http:')
		risks.push('http')
	const host = url.hostname.toLowerCase()
	if (IPV4_PATTERN.test(host) || (host.startsWith('[') && host.endsWith(']')))
		risks.push('ip')
	if (host.split('.').some(label => label.startsWith('xn--')))
		risks.push('punycode')
	if (url.href.length > SUSPICIOUS_URL_LENGTH)
		risks.push('long')
	if (!DEFAULT_PORTS.has(url.port))
		risks.push('port')
	return risks
}

/** 构造中转页地址 */
export function buildSafeGoUrl(path: string, param: string, target: string, base64: boolean) {
	const value = base64 ? encodeBase64Url(target) : target
	return `${path}?${new URLSearchParams({ [param]: value }).toString()}`
}

function encodeBase64Url(value: string) {
	const bytes = new TextEncoder().encode(value)
	let binary = ''
	for (const byte of bytes)
		binary += String.fromCodePoint(byte)
	return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

/** base64url 解码，同时容忍标准 base64 与缺失的填充；失败返回 null */
function decodeBase64Url(value: string) {
	const normalized = value.replace(/-/g, '+').replace(/_/g, '/')
	const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
	try {
		const binary = atob(padded)
		const bytes = Uint8Array.from(binary, char => char.codePointAt(0) ?? 0)
		return new TextDecoder().decode(bytes)
	}
	catch {
		return null
	}
}
