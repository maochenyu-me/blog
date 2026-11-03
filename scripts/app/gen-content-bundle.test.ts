/**
 * 内容包生成回归用例。
 *
 * 只依赖 `node:*` 与同目录的 `./content-bundle.ts`（相对导入带 `.ts`，靠 Node 类型擦除直跑）。
 * 放在 `scripts/app/` 下会被仓库既有的 `pnpm test`（`node --test "scripts/**\/*.test.ts"`）自动收进来。
 */
import type { BundleManifest } from './content-bundle.ts'
import assert from 'node:assert/strict'
import { Buffer } from 'node:buffer'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { after, test } from 'node:test'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { ARCHIVE_NAME, computeBuild, generateContentBundle, makeTar, MANIFEST_NAME } from './content-bundle.ts'

const BLOCK = 512
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const fixedNow = () => new Date('2026-11-03T03:00:00.000Z')

const fixtureFiles: Record<string, string> = {
	'index.html': '<!doctype html><h1>喵洛阁</h1>',
	'about/index.html': '<!doctype html><p>about</p>',
	'_nuxt/entry.js': 'console.log("hi")',
	'img/logo.svg': '<svg xmlns="http://www.w3.org/2000/svg"/>',
}

const tempRoots: string[] = []

after(() => {
	for (const root of tempRoots)
		rmSync(root, { recursive: true, force: true })
})

/** 造一个临时内容根；统一在 after 里删掉 */
function makeFixture(files: Record<string, string>): string {
	const root = mkdtempSync(join(tmpdir(), 'app-dist-'))
	tempRoots.push(root)
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(root, rel)
		mkdirSync(dirname(abs), { recursive: true })
		writeFileSync(abs, content)
	}
	return root
}

interface TarEntryRead {
	path: string
	data: Buffer
	mode: number
	mtime: number
}

/**
 * 极简 tar 读取器。它同时充当「这份 tar 符合 ustar 规范」的校验器：
 * 逐条核对 magic 与头校验和，任何一处不合规都会在这里失败。
 */
function readTarEntries(archive: Buffer): TarEntryRead[] {
	const entries: TarEntryRead[] = []
	let offset = 0

	const field = (header: Buffer, start: number, length: number): string =>
		header.subarray(start, start + length).toString('utf8').replaceAll('\0', '').trim()

	while (offset + BLOCK <= archive.byteLength) {
		const header = archive.subarray(offset, offset + BLOCK)
		if (header.every(byte => byte === 0))
			break

		const name = field(header, 0, 100)
		const prefix = field(header, 345, 155)
		assert.equal(header.subarray(257, 263).toString('utf8'), 'ustar\0', `tar magic 不对：${name}`)

		const expectedSum = header.reduce((sum, byte, index) => sum + (index >= 148 && index < 156 ? 0x20 : byte), 0)
		assert.equal(Number.parseInt(field(header, 148, 8), 8), expectedSum, `tar 头校验和不匹配：${name}`)

		const size = Number.parseInt(field(header, 124, 12), 8)
		const mode = Number.parseInt(field(header, 100, 8), 8)
		const mtime = Number.parseInt(field(header, 136, 12), 8)
		offset += BLOCK
		const data = Buffer.from(archive.subarray(offset, offset + size))
		offset += Math.ceil(size / BLOCK) * BLOCK
		entries.push({ path: prefix ? `${prefix}/${name}` : name, data, mode, mtime })
	}

	return entries
}

function readManifest(outDir: string): BundleManifest {
	return JSON.parse(readFileSync(join(outDir, MANIFEST_NAME), 'utf8')) as BundleManifest
}

function readArchive(outDir: string): Buffer {
	return gunzipSync(readFileSync(join(outDir, ARCHIVE_NAME)))
}

test('同一份内容两次生成得到相同的 build 指纹', () => {
	const first = generateContentBundle({ root: makeFixture(fixtureFiles), now: fixedNow })
	const second = generateContentBundle({ root: makeFixture(fixtureFiles), now: fixedNow })

	assert.match(first.manifest.build, /^[0-9a-f]{16}$/)
	assert.equal(second.manifest.build, first.manifest.build)
	// tar 条目 mtime 固定 0 的收益：内容相同 → 压缩包字节也相同
	assert.equal(second.manifest.archive.sha256, first.manifest.archive.sha256)
})

test('文件内容变化后 build 指纹变化', () => {
	const root = makeFixture(fixtureFiles)
	const before = generateContentBundle({ root, now: fixedNow })

	writeFileSync(join(root, 'index.html'), '<!doctype html><h1>改过了</h1>')
	const after = generateContentBundle({ root, now: fixedNow })

	assert.notEqual(after.manifest.build, before.manifest.build)
})

test('build 等于「按路径排序后的 path\0sha256\n」的 sha256 前 16 位', () => {
	const files = [
		{ path: 'z.html', sha256: 'ff'.repeat(32) },
		{ path: 'a.html', sha256: 'aa'.repeat(32) },
	]
	const expected = createHash('sha256')
		.update(`a.html\0${'aa'.repeat(32)}\nz.html\0${'ff'.repeat(32)}\n`)
		.digest('hex')
		.slice(0, 16)

	assert.equal(computeBuild(files), expected)
})

test('manifest 顶层字段与冻结契约一致', () => {
	const root = makeFixture(fixtureFiles)
	const { manifest, outDir } = generateContentBundle({ root, now: fixedNow })
	const archivePath = join(outDir, ARCHIVE_NAME)

	assert.equal(manifest.schema, 1)
	assert.equal(manifest.generatedAt, '2026-11-03T03:00:00.000Z')
	assert.equal(manifest.fileCount, Object.keys(manifest.files).length)
	assert.equal(manifest.archive.name, 'content.tar.gz')
	assert.equal(manifest.archive.bytes, statSync(archivePath).size)
	assert.equal(manifest.archive.sha256, createHash('sha256').update(readFileSync(archivePath)).digest('hex'))

	const totalBytes = Object.keys(manifest.files).reduce((sum, rel) => sum + statSync(join(root, rel)).size, 0)
	assert.equal(manifest.totalBytes, totalBytes)
	assert.deepEqual(readManifest(outDir), manifest)
})

test('manifest.files 与 tar 条目一一对应，逐文件 sha256 正确', () => {
	const root = makeFixture(fixtureFiles)
	const { manifest, outDir } = generateContentBundle({ root, now: fixedNow })
	const entries = readTarEntries(readArchive(outDir))
	const fromTar = new Map(entries.map(entry => [entry.path, entry.data]))

	assert.equal(entries.length, manifest.fileCount)
	assert.deepEqual([...fromTar.keys()].sort(), Object.keys(manifest.files).sort())
	for (const [rel, digest] of Object.entries(manifest.files)) {
		assert.equal(createHash('sha256').update(readFileSync(join(root, rel))).digest('hex'), digest)
		assert.equal(createHash('sha256').update(fromTar.get(rel)!).digest('hex'), digest)
	}
})

test('tar 条目路径安全、mtime 为 0、mode 为 0644', () => {
	const { outDir } = generateContentBundle({ root: makeFixture(fixtureFiles), now: fixedNow })
	const entries = readTarEntries(readArchive(outDir))

	assert.ok(entries.length >= 4)
	for (const entry of entries) {
		assert.equal(entry.path.startsWith('/'), false, entry.path)
		assert.equal(entry.path.startsWith('./'), false, entry.path)
		assert.equal(entry.path.includes('\\'), false, entry.path)
		assert.equal(entry.path.split('/').includes('..'), false, entry.path)
		assert.equal(entry.path.split('/').includes('.'), false, entry.path)
		assert.equal(entry.mtime, 0, entry.path)
		assert.equal(entry.mode, 0o644, entry.path)
	}
})

test('makeTar 拒绝 `..` 与绝对路径', () => {
	const data = Buffer.from('x')
	for (const bad of ['../evil.html', '/etc/passwd', 'a/../../b', './a.html', 'a\\b.html', 'E:/x.html', '']) {
		assert.throws(() => makeTar([{ path: bad, data }]), /tar 条目/, `应拒绝：${bad}`)
	}
})

test('排除 app-dist 自身：预置的旧产物不会进内容包', () => {
	const root = makeFixture(fixtureFiles)
	mkdirSync(join(root, 'app-dist'), { recursive: true })
	writeFileSync(join(root, 'app-dist', 'content.tar.gz'), 'stale archive')
	writeFileSync(join(root, 'app-dist', 'manifest.json'), '{"stale":true}')

	const { manifest, outDir } = generateContentBundle({ root, now: fixedNow })
	const paths = [...Object.keys(manifest.files), ...readTarEntries(readArchive(outDir)).map(entry => entry.path)]

	assert.deepEqual(Object.keys(manifest.files), ['_nuxt/entry.js', 'about/index.html', 'img/logo.svg', 'index.html'])
	for (const path of paths)
		assert.equal(path.startsWith('app-dist/'), false, path)
})

test('在同一目录重复生成不会自引用膨胀', () => {
	const root = makeFixture(fixtureFiles)
	const first = generateContentBundle({ root, now: fixedNow })
	const firstPaths = readTarEntries(readArchive(first.outDir)).map(entry => entry.path)

	const second = generateContentBundle({ root, now: fixedNow })
	const secondPaths = readTarEntries(readArchive(second.outDir)).map(entry => entry.path)

	assert.deepEqual(secondPaths, firstPaths)
	assert.equal(second.manifest.fileCount, first.manifest.fileCount)
	assert.equal(second.manifest.build, first.manifest.build)
})

test('产物是合法 gzip，解压后是合法 tar', () => {
	const { outDir } = generateContentBundle({ root: makeFixture(fixtureFiles), now: fixedNow })
	const raw = readFileSync(join(outDir, ARCHIVE_NAME))

	assert.equal(raw[0], 0x1F)
	assert.equal(raw[1], 0x8B)
	assert.equal(raw[2], 0x08)
	assert.ok(readTarEntries(gunzipSync(raw)).length > 0)
})

test('内容根里没有任何文件时报错，而不是产出空包', () => {
	const root = makeFixture({ 'app-dist/manifest.json': '{}' })

	assert.throws(() => generateContentBundle({ root, now: fixedNow }), /没有任何文件/)
})

test('CLI 入口直接执行时写出产物并打印摘要', () => {
	const root = makeFixture(fixtureFiles)
	const scriptPath = join(repoRoot, 'scripts/app/gen-content-bundle.ts')
	const result = spawnSync(process.execPath, [scriptPath, '--root', root], { cwd: repoRoot, encoding: 'utf8' })

	assert.equal(result.status, 0, result.stderr)
	assert.match(result.stdout, /内容包已生成/)
	assert.match(result.stdout, /build {6}[0-9a-f]{16}/)
	assert.ok(existsSync(join(root, 'app-dist', MANIFEST_NAME)))
	assert.ok(existsSync(join(root, 'app-dist', ARCHIVE_NAME)))
})
