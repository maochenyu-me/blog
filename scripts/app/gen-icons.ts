#!/usr/bin/env node

/**
 * 把 `scripts/app/svg/*.svg` 光栅化成 `tauri icon` 需要的 PNG 图源。
 *
 * 为什么用 createRequire 从项目根解析 sharp：
 * sharp 是本仓库的传递依赖（0.35.4，pnpm 嵌套 store 里），直接 `import 'sharp'`
 * 在脚本的解析路径下不可靠；以项目根的 package.json 为基准建 require 才能稳定拿到它。
 *
 * 用法：
 *   node scripts/app/gen-icons.ts             # → src-tauri/icons/app-icon*.png（1024×1024）
 *   node scripts/app/gen-icons.ts --preview   # 额外导出 16/24/32/48/64 目视校核图
 *                                             # → .output/icon-preview/（.output 已被 gitignore）
 *
 * 本文件是入口脚本（无 import 守卫），逻辑简单到不需要独立模块，也没有测试 import 它。
 */

import { mkdirSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath, pathToFileURL } from 'node:url'

interface SharpPipeline {
	resize: (width: number, height: number) => SharpPipeline
	png: (options?: { compressionLevel?: number }) => SharpPipeline
	toFile: (file: string) => Promise<{ width: number, height: number, size: number }>
}

type SharpFactory = (input: Uint8Array) => SharpPipeline

const rootDir = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const svgDir = join(rootDir, 'scripts/app/svg')
const iconDir = join(rootDir, 'src-tauri/icons')
const previewDir = join(rootDir, '.output/icon-preview')
const size = 1024

const require = createRequire(pathToFileURL(join(rootDir, 'package.json')))

function loadSharp(): SharpFactory {
	try {
		return require('sharp') as SharpFactory
	}
	catch (error) {
		throw new Error(`解析不到 sharp（${(error as Error).message}）；先在仓库根跑 pnpm i`)
	}
}

const sharp = loadSharp()

/** SVG 源 → PNG 产物；全部 1024×1024（tauri icon 的最低要求，且必须是正方形带 alpha） */
const targets = [
	{ svg: 'icon-desktop.svg', png: 'app-icon.png' },
	{ svg: 'icon-android-fg.svg', png: 'app-icon-android-fg.png' },
	{ svg: 'icon-android-bg.svg', png: 'app-icon-android-bg.png' },
	{ svg: 'icon-android-mono.svg', png: 'app-icon-android-mono.png' },
]

async function render(svg: string, png: string): Promise<void> {
	const source = readFileSync(join(svgDir, svg))
	const out = join(iconDir, png)
	const info = await sharp(source).resize(size, size).png({ compressionLevel: 9 }).toFile(out)
	if (info.width !== size || info.height !== size)
		throw new Error(`${png} 尺寸不对：${info.width}×${info.height}，应为 ${size}×${size}`)
	console.log(`  ${png}  ${info.width}×${info.height}  ${info.size} bytes  ← svg/${svg}`)
}

mkdirSync(iconDir, { recursive: true })
for (const target of targets)
	await render(target.svg, target.png)

if (process.argv.includes('--preview')) {
	mkdirSync(previewDir, { recursive: true })
	for (const px of [16, 24, 32, 48, 64]) {
		// 从 1024 成品图缩小，而不是用 16px 重新渲染 SVG：
		// 系统与 tauri icon 走的都是「大图缩小」这条路，校核必须看同一路径的结果
		const out = join(previewDir, `icon-${px}.png`)
		const info = await sharp(readFileSync(join(iconDir, 'app-icon.png'))).resize(px, px).png({ compressionLevel: 9 }).toFile(out)
		console.log(`  preview icon-${px}.png  ${info.width}×${info.height}  ${info.size} bytes`)
	}
	console.log(`目视校核图目录：${relative(rootDir, previewDir).split('\\').join('/')}`)
}
