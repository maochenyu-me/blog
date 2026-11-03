/**
 * 内容包（tar.gz + manifest.json）的纯逻辑层。
 *
 * 为什么是 tar.gz 而不是 zip：
 * 1. 本机与 CI 基础镜像里都没有 `zip` 命令（实测 `which zip` 无输出，只有 `/usr/bin/tar`、`/usr/bin/gzip`）；
 * 2. Node 侧靠 `node:zlib` + 手写 512 字节 ustar 头就能产出，不需要新增任何依赖（仓库脚本零依赖约定）；
 * 3. Rust 侧 `tar::Archive::unpack` 自带路径穿越防护（`..`、绝对路径直接拒绝），比手写 zip-slip 校验更少出错。
 *
 * 可复现性：tar 条目的 mtime 固定 0、uid/gid 固定 0、mode 固定 0644、路径按字典序排列，
 * 因此内容不变时 `build` 指纹不变。`build` 只由「路径 + 文件 sha256」推出，
 * **不使用压缩包自身的 sha256** —— gzip 字节流会随 zlib 版本/平台变化，拿它当版本标识
 * 会让所有客户端凭空「检测到新内容」。
 *
 * 本文件必须保持无副作用：`gen-content-bundle.test.ts` 会直接 import 它。
 */

import { Buffer } from 'node:buffer'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'

/** 产物目录名：固定为内容根下的 `app-dist` */
export const APP_DIST_DIR = 'app-dist'
export const MANIFEST_NAME = 'manifest.json'
export const ARCHIVE_NAME = 'content.tar.gz'
export const SCHEMA_VERSION = 1

/** tar 块大小：头与数据都按 512 字节对齐 */
const BLOCK = 512

export interface BundleFile {
	/** 相对内容根的路径：正斜杠分隔、无前导 `./` */
	path: string
	bytes: number
	/** 文件内容的 sha256，64 位小写 hex */
	sha256: string
}

export interface BundleManifest {
	schema: number
	build: string
	generatedAt: string
	fileCount: number
	totalBytes: number
	archive: { name: string, bytes: number, sha256: string }
	files: Record<string, string>
}

export interface TarEntry {
	path: string
	data: Buffer
}

export interface GenerateOptions {
	/** 内容根目录，生产上是 `<repo>/.output/public` */
	root: string
	/** 产物目录，默认 `<root>/app-dist` */
	outDir?: string
	/** 注入当前时间，测试用；默认 `() => new Date()` */
	now?: () => Date
}

export interface GenerateResult {
	manifest: BundleManifest
	archiveBytes: number
	outDir: string
}

function sha256hex(data: Buffer): string {
	return createHash('sha256').update(data).digest('hex')
}

function comparePath(a: string, b: string): number {
	if (a === b)
		return 0
	return a < b ? -1 : 1
}

/**
 * 收集内容根下的所有普通文件并按路径字典序排序。
 *
 * - 相对路径命中 `exclude` 的整棵子树都跳过（默认排除 `app-dist`，防止把正在写的产物打进包里）；
 * - 符号链接直接跳过（`.output` 里若有软链，跟随可能跳出内容根）；
 * - 返回顺序稳定，tar 条目顺序才可复现。
 */
export function collectFiles(root: string, exclude: string[] = [APP_DIST_DIR]): BundleFile[] {
	const files: BundleFile[] = []

	const walk = (dirAbs: string, relDir: string): void => {
		const entries = readdirSync(dirAbs, { withFileTypes: true }).sort((a, b) => comparePath(a.name, b.name))
		for (const entry of entries) {
			const rel = relDir ? `${relDir}/${entry.name}` : entry.name
			if (exclude.includes(rel))
				continue
			if (entry.isSymbolicLink())
				continue
			const abs = join(dirAbs, entry.name)
			if (entry.isDirectory()) {
				walk(abs, rel)
				continue
			}
			if (!entry.isFile())
				continue
			const data = readFileSync(abs)
			files.push({ path: rel, bytes: data.byteLength, sha256: sha256hex(data) })
		}
	}

	walk(resolve(root), '')
	return files.sort((a, b) => comparePath(a.path, b.path))
}

/** 构建指纹：把「路径 + 文件 sha256」按路径排序拼成 `path\0sha256\n`，取 sha256 前 16 位 hex */
export function computeBuild(files: Array<Pick<BundleFile, 'path' | 'sha256'>>): string {
	const hash = createHash('sha256')
	for (const file of [...files].sort((a, b) => comparePath(a.path, b.path)))
		hash.update(`${file.path}\0${file.sha256}\n`)
	return hash.digest('hex').slice(0, 16)
}

/**
 * tar 条目路径必须能安全落地：相对路径、正斜杠、无 `..`、无绝对路径、无前导 `./`。
 *
 * 任何一条不满足都直接抛错，而不是「清洗」：清洗会悄悄改变部署后的 URL，
 * 而这类路径（`..`、绝对路径、含反斜杠的文件名）本来就不该出现在 Nuxt 产物里。
 */
export function assertSafeTarPath(entryPath: string): void {
	if (!entryPath)
		throw new Error('tar 条目路径不能为空')
	if (entryPath.startsWith('/') || /^[A-Z]:/i.test(entryPath))
		throw new Error(`tar 条目不能是绝对路径：${entryPath}`)
	if (entryPath.includes('\\'))
		throw new Error(`tar 条目必须用正斜杠：${entryPath}`)
	if (entryPath.startsWith('./'))
		throw new Error(`tar 条目不能带前导 ./：${entryPath}`)
	const segments = entryPath.split('/')
	if (segments.some(segment => segment === '' || segment === '.' || segment === '..'))
		throw new Error(`tar 条目含非法路径段（. / .. / 空段）：${entryPath}`)
}

function padOctal(value: number, length: number): string {
	return `${value.toString(8).padStart(length - 1, '0')}\0`
}

function writeField(header: Buffer, offset: number, length: number, value: string): void {
	const bytes = Buffer.from(value, 'utf8')
	if (bytes.byteLength > length)
		throw new Error(`tar 头字段溢出（上限 ${length} 字节）：${value}`)
	bytes.copy(header, offset)
}

/**
 * 路径超过 100 字节时按 ustar 规则拆进 prefix 字段（prefix ≤ 155、name ≤ 100）。
 * 绝不截断文件名 —— 截断会让解压出来的路径和 manifest 对不上。
 */
function splitUstarPath(entryPath: string): { prefix: string, name: string } {
	const segments = entryPath.split('/')
	for (let index = segments.length - 1; index > 0; index--) {
		const prefix = segments.slice(0, index).join('/')
		const name = segments.slice(index).join('/')
		if (Buffer.byteLength(prefix, 'utf8') <= 155 && Buffer.byteLength(name, 'utf8') <= 100)
			return { prefix, name }
	}
	throw new Error(`tar 路径超过 ustar 上限（prefix 155 + name 100 字节）：${entryPath}`)
}

/** 生成一个 ustar 头：mtime 固定 0、uid/gid 固定 0、mode 固定 0644、typeflag 普通文件 */
function tarHeader(entryPath: string, size: number): Buffer {
	const header = Buffer.alloc(BLOCK)

	if (Buffer.byteLength(entryPath, 'utf8') <= 100) {
		writeField(header, 0, 100, entryPath)
	}
	else {
		const split = splitUstarPath(entryPath)
		writeField(header, 0, 100, split.name)
		writeField(header, 345, 155, split.prefix)
	}

	writeField(header, 100, 8, padOctal(0o644, 8))
	writeField(header, 108, 8, padOctal(0, 8))
	writeField(header, 116, 8, padOctal(0, 8))
	writeField(header, 124, 12, padOctal(size, 12))
	writeField(header, 136, 12, padOctal(0, 12))

	// 校验和：先按 8 个空格计算，再写回「6 位八进制 + NUL + 空格」
	writeField(header, 148, 8, '        ')
	writeField(header, 156, 1, '0')
	writeField(header, 257, 6, 'ustar\0')
	writeField(header, 263, 2, '00')
	writeField(header, 265, 32, 'root')
	writeField(header, 297, 32, 'root')

	let sum = 0
	for (const byte of header)
		sum += byte
	writeField(header, 148, 8, `${sum.toString(8).padStart(6, '0')}\0 `)

	return header
}

/** 把若干条目打成未压缩 tar（ustar），结尾两个全零块 */
export function makeTar(entries: TarEntry[]): Buffer {
	const chunks: Buffer[] = []
	for (const entry of entries) {
		assertSafeTarPath(entry.path)
		chunks.push(tarHeader(entry.path, entry.data.byteLength))
		chunks.push(entry.data)
		const padding = (BLOCK - (entry.data.byteLength % BLOCK)) % BLOCK
		if (padding > 0)
			chunks.push(Buffer.alloc(padding))
	}
	chunks.push(Buffer.alloc(BLOCK * 2))
	return Buffer.concat(chunks)
}

/**
 * 生成 `manifest.json` + `content.tar.gz`。
 *
 * 写入前先删掉整个产物目录再重建：上一次残留的旧文件不会混进部署目录，脚本本身幂等。
 * 内容根里一个文件都没有时直接报错 —— 空内容包会让所有客户端「更新」到空白页面。
 */
export function generateContentBundle(options: GenerateOptions): GenerateResult {
	const root = resolve(options.root)
	if (!existsSync(root) || !statSync(root).isDirectory())
		throw new Error(`内容根目录不存在或不是目录：${root}（先跑 pnpm generate）`)

	const outDir = resolve(options.outDir ?? join(root, APP_DIST_DIR))
	const now = options.now ?? (() => new Date())

	// 产物目录若落在内容根内部，必须排除，否则会把上一次的产物打进这一次的包里
	const exclude = [APP_DIST_DIR]
	const relativeOut = relative(root, outDir).split('\\').join('/')
	if (relativeOut && relativeOut !== '..' && !relativeOut.startsWith('../'))
		exclude.push(relativeOut)

	const files = collectFiles(root, exclude)
	if (files.length === 0)
		throw new Error(`内容根里没有任何文件：${root}（先跑 pnpm generate）`)

	const entries: TarEntry[] = files.map(file => ({ path: file.path, data: readFileSync(join(root, file.path)) }))
	const archive = gzipSync(makeTar(entries), { level: 9 })

	const manifest: BundleManifest = {
		schema: SCHEMA_VERSION,
		build: computeBuild(files),
		generatedAt: now().toISOString(),
		fileCount: files.length,
		totalBytes: files.reduce((sum, file) => sum + file.bytes, 0),
		archive: {
			name: ARCHIVE_NAME,
			bytes: archive.byteLength,
			sha256: sha256hex(archive),
		},
		files: Object.fromEntries(files.map(file => [file.path, file.sha256])),
	}

	rmSync(outDir, { recursive: true, force: true })
	mkdirSync(outDir, { recursive: true })
	writeFileSync(join(outDir, ARCHIVE_NAME), archive)
	writeFileSync(join(outDir, MANIFEST_NAME), `${JSON.stringify(manifest, null, '\t')}\n`)

	return { manifest, archiveBytes: archive.byteLength, outDir }
}
