import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { assertPublicUrl, isPrivateAddress, pickIconFromHtml } from './probe.ts'

describe('isPrivateAddress', () => {
	it('IPv4 内网/保留段', () => {
		for (const address of ['10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '127.0.0.1', '169.254.169.254', '0.0.0.0', '100.64.0.1', '224.0.0.1'])
			assert.equal(isPrivateAddress(address), true, address)
	})

	it('IPv4 公网', () => {
		for (const address of ['8.8.8.8', '1.1.1.1', '104.21.0.1', '172.32.0.1'])
			assert.equal(isPrivateAddress(address), false, address)
	})

	it('IPv6 内网/映射地址', () => {
		for (const address of ['::1', '::', 'fc00::1', 'fd12:3456::1', 'fe80::1', '::ffff:192.168.1.1'])
			assert.equal(isPrivateAddress(address), true, address)
		assert.equal(isPrivateAddress('2001:4860:4860::8888'), false)
	})

	it('不是 IP 时按不安全处理', () => {
		assert.equal(isPrivateAddress('example.com'), true)
	})
})

describe('assertPublicUrl', () => {
	it('接受正常站点', () => {
		assert.equal(assertPublicUrl('https://blog.kemeow.top/').hostname, 'blog.kemeow.top')
		assert.equal(assertPublicUrl('http://a.example:8080/x').port, '8080')
	})

	it('拒绝非 http(s) 协议', () => {
		assert.throws(() => assertPublicUrl('file:///etc/passwd'), /只支持 http\/https/)
		assert.throws(() => assertPublicUrl('ftp://a.example/'), /只支持 http\/https/)
	})

	it('拒绝本地与内网地址', () => {
		assert.throws(() => assertPublicUrl('http://localhost/'), /本地或内网/)
		assert.throws(() => assertPublicUrl('http://127.0.0.1/'), /内网/)
		assert.throws(() => assertPublicUrl('http://169.254.169.254/latest/meta-data'), /内网/)
		assert.throws(() => assertPublicUrl('http://[::1]/'), /内网/)
		assert.throws(() => assertPublicUrl('http://metadata.google.internal/'), /本地或内网/)
	})

	it('拒绝账号信息、异常端口、无顶级域主机名', () => {
		assert.throws(() => assertPublicUrl('https://user:pass@a.example/'), /账号信息/)
		assert.throws(() => assertPublicUrl('http://a.example:22/'), /端口/)
		assert.throws(() => assertPublicUrl('http://intranet/'), /顶级域/)
	})

	it('拒绝非法 URL', () => {
		assert.throws(() => assertPublicUrl('随便写的'), /不是合法的 URL/)
	})
})

describe('pickIconFromHtml', () => {
	it('优先 32×32，跳过 apple-touch-icon', () => {
		const html = [
			'<link rel="apple-touch-icon" href="/apple.png">',
			'<link rel="icon" sizes="16x16" href="/favicon-16.png">',
			'<link rel="shortcut icon" sizes="32x32" href="/favicon-32.png">',
		].join('')
		assert.equal(pickIconFromHtml(html, 'https://a.example/blog/'), 'https://a.example/favicon-32.png')
	})

	it('相对路径按 base 补全，没有则返回 undefined', () => {
		assert.equal(
			pickIconFromHtml('<link rel="icon" href="favicon.ico">', 'https://a.example/x/'),
			'https://a.example/x/favicon.ico',
		)
		assert.equal(pickIconFromHtml('<meta name="x">', 'https://a.example/'), undefined)
	})
})
