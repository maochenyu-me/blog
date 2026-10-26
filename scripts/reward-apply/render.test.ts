import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { appliedComment, conflictComment, failureComment, isTrustedShotUrl, markers, rejectedComment, skippedComment, summaryComment } from './render.ts'

const entry = { name: '青柚不加冰', amount: 66.66, date: '2026-09-12' }

describe('isTrustedShotUrl', () => {
	it('只信任 GitHub 附件域名', () => {
		assert.equal(isTrustedShotUrl('https://github.com/user-attachments/assets/abc'), true)
		assert.equal(isTrustedShotUrl('https://avatars.githubusercontent.com/u/1'), true)
		assert.equal(isTrustedShotUrl('https://ev il.com/x.png'), false)
		assert.equal(isTrustedShotUrl('https://github.com/maochenyu-me/blog'), false)
		assert.equal(isTrustedShotUrl('http://github.com/user-attachments/assets/abc'), false)
		assert.equal(isTrustedShotUrl('javascript:alert(1)'), false)
	})
})

describe('summaryComment', () => {
	it('正常申请：表格 + 内联截图 + 提示下指令', () => {
		const body = summaryComment({
			entry,
			note: '用微信打赏的',
			missing: [],
			issues: [],
			duplicated: [],
			screenshots: ['https://github.com/user-attachments/assets/abc'],
		})
		assert.ok(body.startsWith(markers.summary))
		assert.ok(body.includes('| 名称 | `青柚不加冰` |'))
		assert.ok(body.includes('| 金额 | ¥66.66 |'))
		assert.ok(body.includes('![支付截图](https://github.com/user-attachments/assets/abc)'))
		assert.ok(body.includes('加入赞助名单'))
	})

	it('外链截图不内联', () => {
		const body = summaryComment({
			entry,
			missing: [],
			issues: [],
			duplicated: [],
			screenshots: ['https://evil.example/x.png'],
		})
		assert.ok(body.includes('外链（未内联）'))
		assert.ok(!body.includes('![支付截图](https://evil.example/x.png)'))
	})

	it('缺字段时列出来并要求重新提交', () => {
		const body = summaryComment({ missing: ['支付截图'], issues: [], duplicated: [], screenshots: [] })
		assert.ok(body.includes('缺少「支付截图」'))
		assert.ok(body.includes('重新提交一份申请'))
	})

	it('校验不过时不提示下指令', () => {
		const body = summaryComment({
			entry,
			missing: [],
			issues: [{ field: '时间', message: '日期晚于今天' }],
			duplicated: [],
			screenshots: [],
		})
		assert.ok(body.includes('时间：日期晚于今天'))
		assert.ok(!body.includes('加入赞助名单」'))
	})

	it('已存在同名同日记录时给出提示', () => {
		const body = summaryComment({
			entry,
			missing: [],
			issues: [],
			duplicated: [],
			screenshots: [],
			existing: { ...entry, line: 1, raw: '' },
		})
		assert.ok(body.includes('已经有同名同日期的记录'))
	})
})

describe('结果评论', () => {
	it('写入成功', () => {
		const body = appliedComment(entry, 42)
		assert.ok(body.startsWith(markers.applied))
		assert.ok(body.includes('issue #42'))
	})

	it('重复跳过', () => {
		const body = skippedComment(entry, { ...entry, line: 1, raw: '' })
		assert.ok(body.startsWith(markers.skipped))
		assert.ok(body.includes('已存在'))
	})

	it('不合法时列出原因', () => {
		const body = rejectedComment([{ field: '金额', message: '金额必须大于 0' }], [])
		assert.ok(body.startsWith(markers.rejected))
		assert.ok(body.includes('金额必须大于 0'))
	})

	it('推送冲突时给出手工插入的一行', () => {
		const body = conflictComment(entry)
		assert.ok(body.includes('```ts'))
		assert.ok(body.includes('{ name: \'青柚不加冰\', amount: 66.66, date: \'2026-09-12\' },'))
	})

	it('脚本报错', () => {
		const body = failureComment('读取文件失败')
		assert.ok(body.includes('读取文件失败'))
	})
})
