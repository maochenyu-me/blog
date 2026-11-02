/**
 * 外链中转安全页纯函数回归用例
 *
 * 放在 scripts/ 下是为了被仓库既有的 `pnpm test`
 * （`node --test "scripts/**\/*.test.ts"`）直接收进来，不必改 package.json。
 * 本文件只依赖 node:* 与仓库内的 .ts 模块。
 */
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import {
	buildSafeGoUrl,
	detectRisks,
	isPageInScope,
	matchDomainHost,
	matchPathPattern,
	parseOrigin,
	resolveInterceptedHref,
	resolveTarget,
} from '../../shared/utils/safego.ts'

const includeAll = { include: ['/**'], exclude: ['/go', '/previews/**'] }
const whitelistAll = { mode: 'all' as const, domains: ['518339.xyz', 'github.com'], ignoreAttrs: [] }
const whitelistListed = { mode: 'listed' as const, domains: ['github.com'], ignoreAttrs: [] }
const BASE = 'https://blog.kemeow.top/2026/example'

describe('matchPathPattern', () => {
	it('`/**` 命中任意路径', () => {
		assert.equal(matchPathPattern('/**', '/'), true)
		assert.equal(matchPathPattern('/**', '/posts/a'), true)
	})

	it('精确路径忽略尾部斜杠', () => {
		assert.equal(matchPathPattern('/go', '/go'), true)
		assert.equal(matchPathPattern('/go', '/go/'), true)
		assert.equal(matchPathPattern('/go', '/go2'), false)
	})

	it('结尾的 `/**` 允许整段后缀缺失', () => {
		assert.equal(matchPathPattern('/previews/**', '/previews/a/b'), true)
		assert.equal(matchPathPattern('/previews/**', '/previews'), true)
		assert.equal(matchPathPattern('/previews/**', '/other'), false)
	})

	it('`*` 不跨路径段', () => {
		assert.equal(matchPathPattern('/post/*', '/post/a'), true)
		assert.equal(matchPathPattern('/post/*', '/post/a/b'), false)
	})
})

describe('isPageInScope', () => {
	it('include 命中且未被 exclude 命中时为真', () => {
		assert.equal(isPageInScope('/2026/example', includeAll), true)
	})

	it('exclude 优先于 include', () => {
		assert.equal(isPageInScope('/go', includeAll), false)
		assert.equal(isPageInScope('/previews/draft', includeAll), false)
	})

	it('include 未命中时为假', () => {
		assert.equal(isPageInScope('/2026/example', { include: ['/posts/**'], exclude: [] }), false)
	})
})

describe('matchDomainHost', () => {
	it('精确命中', () => {
		assert.equal(matchDomainHost('github.com', ['github.com']), true)
	})

	it('子域命中', () => {
		assert.equal(matchDomainHost('gist.github.com', ['github.com']), true)
		assert.equal(matchDomainHost('blog.518339.xyz', ['518339.xyz']), true)
	})

	it('伪造后缀不命中', () => {
		assert.equal(matchDomainHost('evilgithub.com', ['github.com']), false)
		assert.equal(matchDomainHost('github.com.evil.net', ['github.com']), false)
	})

	it('大小写与尾点不敏感', () => {
		assert.equal(matchDomainHost('GITHUB.COM', ['github.com']), true)
		assert.equal(matchDomainHost('github.com.', ['github.com']), true)
	})
})

describe('resolveInterceptedHref', () => {
	it('站外 https 链接被接管并规范化', () => {
		assert.equal(resolveInterceptedHref('https://example.com/a', BASE, whitelistAll), 'https://example.com/a')
	})

	it('协议相对链接按当前协议解析', () => {
		assert.equal(resolveInterceptedHref('//example.com/a', BASE, whitelistAll), 'https://example.com/a')
	})

	it('站内链接放行', () => {
		assert.equal(resolveInterceptedHref('/posts/a', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('https://blog.kemeow.top/x', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('#hash', BASE, whitelistAll), null)
	})

	it('非 http(s) 协议放行', () => {
		assert.equal(resolveInterceptedHref('mailto:a@b.c', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('tel:+8613800000000', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('javascript:alert(1)', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('data:text/html,x', BASE, whitelistAll), null)
	})

	it('mode=all 时 domains 是豁免名单', () => {
		assert.equal(resolveInterceptedHref('https://github.com/x', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('https://gist.github.com/x', BASE, whitelistAll), null)
		assert.equal(resolveInterceptedHref('https://other.com/x', BASE, whitelistAll), 'https://other.com/x')
	})

	it('mode=listed 时 domains 是命中名单', () => {
		assert.equal(resolveInterceptedHref('https://github.com/x', BASE, whitelistListed), 'https://github.com/x')
		assert.equal(resolveInterceptedHref('https://other.com/x', BASE, whitelistListed), null)
	})
})

describe('resolveTarget', () => {
	it('缺参报 missing', () => {
		assert.deepEqual(resolveTarget(undefined, false), { ok: false, reason: 'missing' })
		assert.deepEqual(resolveTarget('', false), { ok: false, reason: 'missing' })
	})

	it('正常 https 目标通过', () => {
		const result = resolveTarget('https://example.com/a?b=1', false)
		assert.equal(result.ok, true)
		assert.equal(result.ok && result.host, 'example.com')
	})

	it('只放行 http 与 https，其余报 protocol', () => {
		assert.deepEqual(resolveTarget('javascript:alert(1)', false), { ok: false, reason: 'protocol' })
		assert.deepEqual(resolveTarget('ftp://example.com/a', false), { ok: false, reason: 'protocol' })
		assert.deepEqual(resolveTarget('data:text/html,x', false), { ok: false, reason: 'protocol' })
	})

	it('无法解析的地址报 malformed', () => {
		assert.deepEqual(resolveTarget('not a url', false), { ok: false, reason: 'malformed' })
		assert.deepEqual(resolveTarget('aHR0cHM6', true), { ok: false, reason: 'malformed' })
	})

	it('不再重复解码：百分号转义按原样保留', () => {
		const result = resolveTarget('https://example.com/a%20b', false)
		assert.equal(result.ok && result.href, 'https://example.com/a%20b')
	})

	it('base64url 往返，含中文', () => {
		const target = 'https://example.com/搜索?q=你好 世界'
		const url = buildSafeGoUrl('/go', 'u', target, true)
		const raw = new URLSearchParams(url.slice(url.indexOf('?'))).get('u')!
		const result = resolveTarget(raw, true)
		assert.equal(result.ok && result.href, new URL(target).href)
		assert.equal(raw.includes('+'), false)
		assert.equal(raw.includes('='), false)
	})
})

describe('detectRisks', () => {
	it('干净的 https 地址没有风险提示', () => {
		assert.deepEqual(detectRisks(new URL('https://example.com/a')), [])
	})

	it('http 明文', () => {
		assert.deepEqual(detectRisks(new URL('http://example.com/a')), ['http'])
	})

	it('IPv4 / IPv6 字面量', () => {
		assert.deepEqual(detectRisks(new URL('http://127.0.0.1/a')), ['http', 'ip'])
		assert.deepEqual(detectRisks(new URL('http://[::1]/a')), ['http', 'ip'])
	})

	it('punycode 域名', () => {
		assert.deepEqual(detectRisks(new URL('https://xn--fiq228c.com/')), ['punycode'])
	})

	it('非标准端口', () => {
		assert.deepEqual(detectRisks(new URL('https://example.com:8443/a')), ['port'])
		assert.deepEqual(detectRisks(new URL('https://example.com:443/a')), [])
	})

	it('超长地址', () => {
		assert.deepEqual(detectRisks(new URL(`https://example.com/${'a'.repeat(200)}`)), ['long'])
	})
})

describe('buildSafeGoUrl', () => {
	it('普通模式把目标地址编码进查询串且能原样取回', () => {
		const url = buildSafeGoUrl('/go', 'u', 'https://example.com/a?b=1&c=2', false)
		assert.equal(url.startsWith('/go?u='), true)
		const raw = new URLSearchParams(url.slice(url.indexOf('?'))).get('u')
		assert.equal(raw, 'https://example.com/a?b=1&c=2')
	})

	it('参数名可配', () => {
		assert.equal(buildSafeGoUrl('/jump', 'target', 'https://a.com/', false).startsWith('/jump?target='), true)
	})
})

describe('parseOrigin', () => {
	it('正常来源信息通过', () => {
		assert.deepEqual(parseOrigin('{"path":"/about","y":627}'), { path: '/about', y: 627 })
		assert.deepEqual(parseOrigin('{"path":"/","y":0}'), { path: '/', y: 0 })
	})

	it('空值与非法 JSON 返回 null', () => {
		assert.equal(parseOrigin(null), null)
		assert.equal(parseOrigin(undefined), null)
		assert.equal(parseOrigin(''), null)
		assert.equal(parseOrigin('not json'), null)
		assert.equal(parseOrigin('[]'), null)
	})

	it('脏数据返回 null，绝不把访客送到错误位置', () => {
		assert.equal(parseOrigin('{"path":"about","y":10}'), null)
		assert.equal(parseOrigin('{"path":"/about"}'), null)
		assert.equal(parseOrigin('{"path":"/about","y":"10"}'), null)
		assert.equal(parseOrigin('{"path":"/about","y":-1}'), null)
		assert.equal(parseOrigin('{"path":"/about","y":null}'), null)
	})
})
