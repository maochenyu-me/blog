import assert from 'node:assert/strict'
import fs from 'node:fs'
import { dirname, resolve } from 'node:path'
import { describe, it } from 'node:test'
import { fileURLToPath } from 'node:url'
import { applyInsertion, parseSource } from './source.ts'
import { verifyInsertion, verifyRuntimeImport } from './verify.ts'

const here = dirname(fileURLToPath(import.meta.url))
const source = fs.readFileSync(resolve(here, 'fixtures/reward-source.fixture.ts'), 'utf8')

const entry = { name: '新人\'x', amount: 10.5, date: '2026-09-20' }

describe('verifyInsertion', () => {
	const inserted = applyInsertion(source, entry)

	it('正常插入能通过', () => {
		assert.doesNotThrow(() => verifyInsertion(source, inserted.text, inserted.line, entry))
	})

	it('改动其它行会被发现', () => {
		const tampered = inserted.text.replace('amount: 200', 'amount: 999')
		assert.throws(() => verifyInsertion(source, tampered, inserted.line, entry), /文件内容发生了变化/)
	})

	it('少一行会被发现', () => {
		const lines = inserted.text.split('\n')
		lines.splice(inserted.line, 1)
		assert.throws(() => verifyInsertion(source, lines.join('\n'), inserted.line, entry), /行数不对/)
	})

	it('CRLF 会被拒绝', () => {
		const crlf = inserted.text.replaceAll('\n', '\r\n')
		assert.throws(() => verifyInsertion(source, crlf, inserted.line, entry), /CR/)
	})

	it('新条目内容与预期不符会被发现', () => {
		assert.throws(() => verifyInsertion(source, inserted.text, inserted.line, { ...entry, amount: 99 }), /回读出的新条目|原有条目的顺序/)
	})
})

describe('verifyRuntimeImport', () => {
	it('真的把候选内容 import 一遍并数条目', async () => {
		const inserted = applyInsertion(source, { name: 'O\'Brien', amount: 66.6, date: '2026-09-20' })
		await assert.doesNotReject(verifyRuntimeImport(inserted.text, parseSource(inserted.text).entries.length))
	})

	it('条目数不符时报错', async () => {
		const inserted = applyInsertion(source, entry)
		await assert.rejects(verifyRuntimeImport(inserted.text, 999), /条目数/)
	})

	it('语法坏掉时 import 会失败（这条是它存在的理由）', async () => {
		const broken = source.replace('\t{ name: \'无名氏\', amount: 1.01, date: \'2026-07-02\' },', '\t{ name: \'无名氏, amount: 1.01, date: \'2026-07-02\' },')
		await assert.rejects(verifyRuntimeImport(broken, 6))
	})
})
