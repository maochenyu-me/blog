/**
 * 说说正文的 Markdown 渲染器（懒加载，`markdown-it` 不进首屏 bundle）。
 *
 * 安全约定：`html: false` —— 正文里的裸 HTML 一律被转义，与 Ech0 官方前端的配置一致
 * （上游 `web/src/editor/core/markdown.ts` 用 `html:false / linkify:true / typographer:false`）。
 * 因此**不需要**再挂一层 DOMPurify：渲染结果只包含 Markdown 语法生成的标签，
 * 且 markdown-it 自带的 `validateLink` 会拦掉 `javascript:` 等危险协议。
 *
 * 相比上游额外做了两件事：
 *   1. 外链统一补 `target="_blank" rel="noopener noreferrer nofollow"`（说说里的链接都是外部内容）；
 *   2. 相对路径的图片补上 Ech0 实例域名（`/api/files/...`）。
 */

import { resolveAssetUrl } from './url.ts'

type MarkdownRenderer = (markdown: string) => string

/**
 * 正文图片的 src 补全。
 * 复用 `resolveAssetUrl`（附件与正文图片同一套规则），只保留 `api/files` 前缀差异：
 * 正文里作者写的相对路径通常已经是 `/api/files/...` 或纯外链，不需要再补 `api`。
 */
export function resolveMarkdownImageUrl(src: string, apiBase: string) {
	return resolveAssetUrl(src, apiBase)
}

/** 渲染器配置：同为站点级常量，用 key 区分不同配置实例 */
export interface MarkdownRendererOptions {
	/** 实例地址，用于把相对资源路径补成绝对地址 */
	apiBase: string
	/** 外链是否强制新窗口 + nofollow（说说正文默认开） */
	externalLinks?: boolean
}

/**
 * 已装载的实例，按配置 key 缓存。刻意不用单个模块级单例：
 *  `md.renderer.rules` 是**对象级**改写，单例意味着拉一个配置就永久生效，
 *  以后任何新增调用方都会被前一个调用方的规则静默影响。
 */
const renderers = new Map<string, Promise<MarkdownRenderer>>()

function optionsKey(options: MarkdownRendererOptions) {
	return `${options.apiBase}|${options.externalLinks !== false ? 1 : 0}`
}

/**
 * 取 `markdown-it` 的构造函数。
 * 该包同时提供 CJS / ESM 两份产物，Vite 预打包与 dev 态下 `default` 的层数不一致，
 * 这里两种形态都认，避免 `new undefined()` 直接把渲染链路整条打掉。
 */
function resolveMarkdownItCtor(mod: unknown) {
	const first = (mod as { default?: unknown })?.default ?? mod
	const second = (first as { default?: unknown })?.default
	const candidate = typeof first === 'function' ? first : second
	if (typeof candidate !== 'function')
		throw new Error('markdown-it 构造函数解析失败')
	return candidate as new (options?: Record<string, unknown>) => {
		render: (markdown: string) => string
		renderer: { rules: Record<string, unknown> }
	}
}

/**
 * 装载渲染器。首次调用会 `import('markdown-it')`，之后按配置复用同一个实例。
 * 同一页面里所有说说共用一个实例（配置里的 apiBase 是站点级常量，不需要按条区分）。
 */
export function loadMemosMarkdownRenderer(options: MarkdownRendererOptions | string): Promise<MarkdownRenderer> {
	const normalized: MarkdownRendererOptions = typeof options === 'string' ? { apiBase: options } : options
	const key = optionsKey(normalized)
	const cached = renderers.get(key)
	if (cached)
		return cached

	const apiBase = normalized.apiBase
	const externalLinks = normalized.externalLinks !== false

	const task = import('markdown-it').then((mod) => {
		const MarkdownIt = resolveMarkdownItCtor(mod)
		const md = new MarkdownIt({
			html: false,
			linkify: true,
			typographer: false,
			langPrefix: 'language-',
		})

		// 外链：新窗口打开，且不传递 referrer
		if (externalLinks) {
			md.renderer.rules.link_open = (tokens, index, options, _env, self) => {
				const token = tokens[index]!
				token.attrSet('target', '_blank')
				token.attrSet('rel', 'noopener noreferrer nofollow')
				return self.renderToken(tokens, index, options)
			}
		}

		// 表格：包一层横向滚动容器，窄屏下不把卡片撑破
		const defaultTableOpen = md.renderer.rules.table_open
		md.renderer.rules.table_open = (tokens, index, options, _env, self) =>
			`<div class="memos-table">${defaultTableOpen ? defaultTableOpen(tokens, index, options, _env, self) : self.renderToken(tokens, index, options)}`
		const defaultTableClose = md.renderer.rules.table_close
		md.renderer.rules.table_close = (tokens, index, options, _env, self) =>
			`${defaultTableClose ? defaultTableClose(tokens, index, options, _env, self) : self.renderToken(tokens, index, options)}</div>`

		// 图片：懒加载 + 相对路径补域名
		const defaultImageRule = md.renderer.rules.image
		md.renderer.rules.image = (tokens, index, options, env, self) => {
			const token = tokens[index]!
			const src = token.attrGet('src')
			if (src)
				token.attrSet('src', resolveMarkdownImageUrl(src, apiBase))
			token.attrSet('loading', 'lazy')
			token.attrSet('decoding', 'async')
			if (defaultImageRule)
				return defaultImageRule(tokens, index, options, env, self)
			return self.renderToken(tokens, index, options)
		}

		return (markdown: string) => md.render(markdown)
	})

	renderers.set(key, task)
	return task
}

/** 供单测使用：不加载 markdown-it，直接把源码当 HTML 透传，用于验证映射逻辑 */
export function identityRenderer(markdown: string) {
	return markdown
}
