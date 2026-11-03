#!/usr/bin/env node

/**
 * 内容包生成入口：把 `.output/public` 打成 `.output/public/app-dist/{manifest.json,content.tar.gz}`。
 *
 * 用法：
 *   node scripts/app/gen-content-bundle.ts                 # 默认内容根 <repo>/.output/public
 *   node scripts/app/gen-content-bundle.ts --root <dir>     # 指定内容根（测试 / 预演）
 *   node scripts/app/gen-content-bundle.ts --out <dir>      # 指定产物目录
 *
 * 逻辑全在 ./content-bundle.ts，本文件只做参数解析与摘要输出。
 *
 * **刻意不写 `import.meta.main` / `argv[1]` 入口守卫**：实测（Node 24.21 + unrun）
 * `pnpm exec unrun <script>` 会把脚本重写到 `node_modules/.unrun/<name>.<hash>.mjs` 再执行，
 * 此时 `import.meta.main` 是 `undefined`、`process.argv[1]` 指向那个临时文件，
 * 任何入口判断都会**静默失效**（CI 绿灯但没有内容包）。逻辑与入口分离后，
 * 本文件用 `node` 或 `pnpm exec unrun` 跑都必然执行。
 */

import { dirname, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { generateContentBundle } from './content-bundle.ts'

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

function readOption(name: string): string | undefined {
	const index = process.argv.indexOf(`--${name}`)
	if (index === -1)
		return undefined
	const value = process.argv[index + 1]
	if (value === undefined || value.startsWith('--'))
		throw new Error(`--${name} 需要一个目录参数`)
	return value
}

const root = resolve(readOption('root') ?? resolve(rootDir, '.output/public'))
const out = readOption('out')
const result = generateContentBundle({ root, outDir: out ? resolve(out) : undefined })

console.log(`内容包已生成：${relative(rootDir, result.outDir).split('\\').join('/')}`)
console.log(`  build      ${result.manifest.build}`)
console.log(`  files      ${result.manifest.fileCount}`)
console.log(`  totalBytes ${result.manifest.totalBytes}`)
console.log(`  archive    ${result.manifest.archive.name} ${result.manifest.archive.bytes} bytes`)
console.log(`  sha256     ${result.manifest.archive.sha256}`)
