import type { RewardContext } from './context.ts'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { commandKeywords, hasCommand, isTrustedAuthor, trustedAssociations } from './context.ts'

function makeContext(commentBody: string, association = 'OWNER', commentUserType = 'User'): RewardContext {
	return {
		token: '',
		owner: 'maochenyu-me',
		repo: 'blog',
		number: 999,
		issueBody: '### 名称\n\n青柚不加冰',
		commentBody,
		association,
		commentUserType,
		dryRun: true,
		today: '2026-11-02',
	}
}

describe('hasCommand', () => {
	it('现行指令「添加赞助」命中', () => {
		assert.equal(hasCommand(makeContext('添加赞助')), true)
	})

	it('旧指令「加入赞助名单」继续兼容', () => {
		assert.equal(hasCommand(makeContext('加入赞助名单')), true)
	})

	it('无关评论不命中', () => {
		assert.equal(hasCommand(makeContext('看起来不错，已核对截图')), false)
	})

	it('指令词清单同时保留新旧两种写法', () => {
		assert.deepEqual(commandKeywords, ['添加赞助', '加入赞助名单'])
	})
})

describe('isTrustedAuthor', () => {
	it('仓库成员可信', () => {
		for (const association of trustedAssociations)
			assert.equal(isTrustedAuthor(makeContext('添加赞助', association)), true)
	})

	it('外部用户不可信', () => {
		assert.equal(isTrustedAuthor(makeContext('添加赞助', 'NONE')), false)
	})

	it('机器人评论不可信', () => {
		assert.equal(isTrustedAuthor(makeContext('添加赞助', 'OWNER', 'Bot')), false)
	})
})
