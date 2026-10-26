/**
 * 安全的 HTTP 探测。
 *
 * 被探测的地址全部由申请人提供，因此这里必须自己挡住内网访问（SSRF）：
 * 只允许 http/https + 常规端口，且在真正建连时用自定义 lookup 校验 DNS 解析结果（防 rebinding）。
 * 不复用 scripts/framework/utils.ts 的 getLinkInfo：它 HEAD-only、不跟重定向、无地址校验。
 */

import type { LookupFunction } from 'node:net'
import { Buffer } from 'node:buffer'
import dns from 'node:dns'
import http from 'node:http'
import https from 'node:https'
import net from 'node:net'

export const userAgent = 'Mozilla/5.0 (compatible; LinkPreflightBot/1.0; +https://blog.kemeow.top/)'

const allowedPorts = new Set(['', '80', '443', '8080', '8443'])
const blockedHosts = new Set(['instance-data', 'localhost', 'metadata', 'metadata.google.internal'])

/** 内网/保留地址判定（IPv4 + IPv6），非法 IP 一律按不安全处理 */
export function isPrivateAddress(address: string): boolean {
	const family = net.isIP(address)
	if (family === 4) {
		const [a, b] = address.split('.').map(Number) as [number, number]
		if (a === 0 || a === 10 || a === 127)
			return true
		if (a === 169 && b === 254)
			return true
		if (a === 172 && b >= 16 && b <= 31)
			return true
		if (a === 192 && b === 168)
			return true
		if (a === 100 && b >= 64 && b <= 127)
			return true
		return a >= 224
	}
	if (family === 6) {
		const value = address.toLowerCase()
		if (value === '::' || value === '::1')
			return true
		if (/^f[cd]/.test(value))
			return true
		if (/^fe[89ab]/.test(value))
			return true
		const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(value)
		if (mapped)
			return isPrivateAddress(mapped[1]!)
		return false
	}
	return true
}

export function assertPublicUrl(raw: string): URL {
	let url: URL
	try {
		url = new URL(raw)
	}
	catch {
		throw new Error('不是合法的 URL')
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:')
		throw new Error('只支持 http/https 地址')
	if (url.username || url.password)
		throw new Error('地址里不能包含账号信息')
	if (!allowedPorts.has(url.port))
		throw new Error(`不允许访问 ${url.port} 端口`)
	const host = url.hostname.toLowerCase().replaceAll(/^\[|\]$/g, '')
	if (!host)
		throw new Error('地址缺少主机名')
	if (blockedHosts.has(host) || /\.(?:localhost|internal|local)$/.test(host))
		throw new Error('不允许访问本地或内网地址')
	if (net.isIP(host)) {
		if (isPrivateAddress(host))
			throw new Error('不允许访问内网地址')
	}
	else if (!host.includes('.')) {
		throw new Error('主机名不合法（缺少顶级域）')
	}
	return url
}

const safeLookup: LookupFunction = (hostname, options, callback) => {
	dns.lookup(hostname, { family: typeof options.family === 'number' ? options.family : 0, all: false }, (err, address, family) => {
		if (err) {
			callback(err, '', 0)
			return
		}
		if (isPrivateAddress(address)) {
			callback(new Error(`${hostname} 解析到内网地址，已拒绝访问`), '', 0)
			return
		}
		callback(null, address, family)
	})
}

/** 把 Node 的底层错误翻译成人话，评论里别直接抛原始报错 */
export function humanizeError(message: string): string {
	const raw = message.trim()
	if (!raw)
		return '请求失败'
	if (/ENOTFOUND|EAI_AGAIN|getaddrinfo/i.test(raw))
		return '域名解析失败（域名可能已失效或 DNS 异常）'
	if (/ECONNREFUSED/i.test(raw))
		return '连接被拒绝（服务器未监听该端口）'
	if (/ETIMEDOUT|timed? ?out|请求超时/i.test(raw))
		return '连接超时'
	if (/ECONNRESET|ECONNABORTED|socket (?:disconnected|hang up)/i.test(raw))
		return '连接被服务器中断'
	if (/CERT|SELF_SIGNED|UNABLE_TO_VERIFY|ERR_TLS/i.test(raw))
		return 'HTTPS 证书异常（过期或与域名不匹配）'
	if (/EHOSTUNREACH|ENETUNREACH/i.test(raw))
		return '网络不可达'
	return raw
}

interface RawResponse {
	status: number
	headers: http.IncomingHttpHeaders
	body: string
	truncated: boolean
}

function requestOnce(url: URL, timeoutMs: number, maxBytes: number, readBody: boolean): Promise<RawResponse> {
	return new Promise((resolve, reject) => {
		const lib = url.protocol === 'https:' ? https : http
		let settled = false
		const finish = (value: RawResponse) => {
			if (settled)
				return
			settled = true
			resolve(value)
		}

		const req = lib.request(url, {
			// autoSelectFamily 会要求 lookup 返回多个地址，这里关掉以便逐个校验
			autoSelectFamily: false,
			headers: {
				'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,application/atom+xml;q=0.9,application/rss+xml;q=0.9,application/feed+json;q=0.9,*/*;q=0.8',
				'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
				'user-agent': userAgent,
			},
			lookup: safeLookup,
			method: 'GET',
			timeout: timeoutMs,
		}, (res) => {
			const chunks: Buffer[] = []
			let size = 0
			let truncated = false

			res.on('data', (chunk: Buffer) => {
				if (!readBody)
					return
				const rest = maxBytes - size
				if (chunk.length >= rest) {
					truncated = true
					chunks.push(chunk.subarray(0, Math.max(0, rest)))
					size = maxBytes
					res.destroy()
					return
				}
				size += chunk.length
				chunks.push(chunk)
			})
			res.on('end', () => finish({
				status: res.statusCode ?? 0,
				headers: res.headers,
				body: Buffer.concat(chunks).toString('utf8'),
				truncated,
			}))
			res.on('close', () => finish({
				status: res.statusCode ?? 0,
				headers: res.headers,
				body: Buffer.concat(chunks).toString('utf8'),
				truncated,
			}))
			res.on('error', () => finish({
				status: res.statusCode ?? 0,
				headers: res.headers,
				body: Buffer.concat(chunks).toString('utf8'),
				truncated,
			}))
		})

		req.on('timeout', () => req.destroy(new Error(`请求超时（${timeoutMs}ms）`)))
		req.on('error', reject)
		req.end()
	})
}

export interface ProbeResult {
	url: string
	finalUrl: string
	ok: boolean
	status: number
	redirects: string[]
	contentType: string
	elapsedMs: number
	body: string
	truncated: boolean
	error: string
}

export interface ProbeOptions {
	timeoutMs?: number
	maxRedirects?: number
	maxBytes?: number
	readBody?: boolean
}

export async function probeUrl(raw: string, options: ProbeOptions = {}): Promise<ProbeResult> {
	const { timeoutMs = 8000, maxRedirects = 3, maxBytes = 512 * 1024, readBody = true } = options
	const startedAt = Date.now()
	const result: ProbeResult = {
		url: raw,
		finalUrl: raw,
		ok: false,
		status: 0,
		redirects: [],
		contentType: '',
		elapsedMs: 0,
		body: '',
		truncated: false,
		error: '',
	}

	let current: URL
	try {
		current = assertPublicUrl(raw)
	}
	catch (err) {
		result.error = (err as Error).message
		result.elapsedMs = Date.now() - startedAt
		return result
	}

	for (let hop = 0; hop <= maxRedirects; hop++) {
		result.finalUrl = current.toString()
		let res: RawResponse
		try {
			res = await requestOnce(current, timeoutMs, maxBytes, readBody)
		}
		catch (err) {
			result.error = humanizeError((err as Error).message)
			result.elapsedMs = Date.now() - startedAt
			return result
		}

		result.status = res.status
		result.contentType = String(res.headers['content-type'] ?? '')
		const location = res.headers.location
		const isRedirect = res.status >= 300 && res.status < 400 && typeof location === 'string' && location.length > 0

		if (!isRedirect) {
			result.body = res.body
			result.truncated = res.truncated
			result.ok = res.status >= 200 && res.status < 400
			result.elapsedMs = Date.now() - startedAt
			return result
		}

		let next: URL
		try {
			next = assertPublicUrl(new URL(location, current).toString())
		}
		catch (err) {
			result.error = `跳转目标不合规：${(err as Error).message}`
			result.elapsedMs = Date.now() - startedAt
			return result
		}
		result.redirects.push(next.toString())
		current = next
	}

	result.error = `跳转超过 ${maxRedirects} 次`
	result.elapsedMs = Date.now() - startedAt
	return result
}

/** 从首页 HTML 抠 `<link rel="icon">`，优先 32×32 / any，跳过 apple-touch-icon */
export function pickIconFromHtml(html: string, base: string): string | undefined {
	const candidates: Array<{ href: string, score: number }> = []
	for (const tag of html.matchAll(/<link\b[^>]*>/gi)) {
		const raw = tag[0]
		const rel = (/rel\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw)?.slice(1).find(Boolean) ?? '').toLowerCase()
		if (!rel.includes('icon') || rel.includes('apple-touch-icon'))
			continue
		const href = /href\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw)?.slice(1).find(Boolean)
		if (!href)
			continue
		const sizes = /sizes\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(raw)?.slice(1).find(Boolean) ?? ''
		let score = 1
		if (/\b32x32\b|\bany\b/i.test(sizes))
			score += 2
		if (/\bsvg\b/i.test(href))
			score += 1
		try {
			candidates.push({ href: new URL(href, base).toString(), score })
		}
		catch {
			// 非法 href 直接跳过
		}
	}
	candidates.sort((a, b) => b.score - a.score)
	return candidates[0]?.href
}

/** icon 兜底探测：先首页 `link[rel=icon]`，再 `/favicon.ico`，都没有就返回空串 */
export async function resolveIcon(link: string, html: string, options: ProbeOptions = {}): Promise<string> {
	const base = (() => {
		try {
			return new URL(link)
		}
		catch {
			return undefined
		}
	})()
	if (!base)
		return ''

	const picked = pickIconFromHtml(html, base.toString())
	const fallback = new URL('/favicon.ico', base).toString()

	for (const candidate of [picked, fallback]) {
		if (!candidate)
			continue
		const probe = await probeUrl(candidate, { ...options, readBody: false, timeoutMs: 5000 })
		if (probe.ok)
			return candidate
	}
	return ''
}
