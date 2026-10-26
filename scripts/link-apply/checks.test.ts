import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { freeHostOf, monthsBetween, parseUrl } from './checks.ts'

describe('freeHostOf', () => {
	it('识别常见免费托管域名', () => {
		assert.equal(freeHostOf('kemeow.github.io'), 'github.io')
		assert.equal(freeHostOf('blog.pages.dev'), 'pages.dev')
		assert.equal(freeHostOf('foo.vercel.app'), 'vercel.app')
		assert.equal(freeHostOf('github.io'), 'github.io')
	})

	it('自有域名不算', () => {
		assert.equal(freeHostOf('kemeow.top'), undefined)
		assert.equal(freeHostOf('notgithub.io.evil.com'), undefined)
	})
})

describe('monthsBetween', () => {
	it('按日历月计算整月数', () => {
		assert.equal(monthsBetween(new Date('2026-01-15'), new Date('2026-04-15')), 3)
		assert.equal(monthsBetween(new Date('2026-01-15'), new Date('2026-04-14')), 2)
		assert.equal(monthsBetween(new Date('2025-11-20'), new Date('2026-10-26')), 11)
	})
})

describe('parseUrl', () => {
	it('非法地址返回 undefined 而不是抛错', () => {
		assert.equal(parseUrl('not a url'), undefined)
		assert.equal(parseUrl(''), undefined)
		assert.equal(parseUrl('https://a.example/')?.hostname, 'a.example')
	})
})
