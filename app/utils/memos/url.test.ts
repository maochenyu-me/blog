import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { resolveAssetUrl, safeGithubRepoUrl, safeHttpUrl } from './url.ts'

describe('safeHttpUrl', () => {
	it('放行 http / https', () => {
		assert.equal(safeHttpUrl('https://example.com/a?b=1'), 'https://example.com/a?b=1')
		assert.equal(safeHttpUrl('http://example.com/'), 'http://example.com/')
	})

	it('拦掉 javascript: 等危险协议（Vue 的 :href 不做净化，这里是唯一防线）', () => {
		assert.equal(safeHttpUrl('javascript:alert(document.cookie)'), '')
		assert.equal(safeHttpUrl('JavaScript:alert(1)'), '')
		assert.equal(safeHttpUrl('  javascript:alert(1)'), '')
		assert.equal(safeHttpUrl('data:text/html,<script>alert(1)</script>'), '')
		assert.equal(safeHttpUrl('vbscript:msgbox(1)'), '')
		assert.equal(safeHttpUrl('file:///etc/passwd'), '')
	})

	it('协议相对地址补成 https', () => {
		assert.equal(safeHttpUrl('//cdn.test/a.png'), 'https://cdn.test/a.png')
	})

	it('空值与非 URL 返回空串', () => {
		assert.equal(safeHttpUrl(''), '')
		assert.equal(safeHttpUrl(undefined), '')
		assert.equal(safeHttpUrl(null), '')
		assert.equal(safeHttpUrl('not a url'), '')
	})
})

describe('safeGithubRepoUrl', () => {
	it('只放行 github.com 的 owner/repo', () => {
		assert.equal(safeGithubRepoUrl('https://github.com/lin-snow/Ech0'), 'https://github.com/lin-snow/Ech0')
		assert.equal(safeGithubRepoUrl('https://www.github.com/a/b'), 'https://www.github.com/a/b')
	})

	it('其他站点 / 非仓库路径 / 危险协议一律拒绝', () => {
		assert.equal(safeGithubRepoUrl('https://evil.test/a/b'), '')
		assert.equal(safeGithubRepoUrl('https://github.com/onlyowner'), '')
		assert.equal(safeGithubRepoUrl('javascript:alert(1)'), '')
		assert.equal(safeGithubRepoUrl(''), '')
	})
})

describe('resolveAssetUrl', () => {
	it('相对路径补实例域名', () => {
		assert.equal(resolveAssetUrl('/api/files/a.png', 'https://m.test'), 'https://m.test/api/files/a.png')
	})

	it('兼容上游的 files/xxx 形态', () => {
		assert.equal(resolveAssetUrl('files/a.png', 'https://m.test'), 'https://m.test/api/files/a.png')
	})

	it('绝对地址与协议相对地址保持可用', () => {
		assert.equal(resolveAssetUrl('https://cdn.test/a.png', 'https://m.test'), 'https://cdn.test/a.png')
		assert.equal(resolveAssetUrl('//cdn.test/a.png', 'https://m.test'), 'https://cdn.test/a.png')
	})

	it('apiBase 末尾斜杠不产生双斜杠', () => {
		assert.equal(resolveAssetUrl('/x.png', 'https://m.test/'), 'https://m.test/x.png')
	})

	it('空值返回空串', () => {
		assert.equal(resolveAssetUrl('', 'https://m.test'), '')
		assert.equal(resolveAssetUrl(undefined, 'https://m.test'), '')
	})
})
