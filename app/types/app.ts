import type { Ref } from 'vue'

/**
 * app（Tauri v2）前端契约 —— 与 Rust 命令面「冻结接口契约 v1」逐字对应。
 *
 * 命令签名与返回结构由 Rust 侧冻结，本文件只做类型映射，不要改字段名：
 * - app_status()            → AppStatus
 * - content_check(url)      → ContentCheckResult
 * - content_install(url)    → ContentInstallResult
 * - content_rollback()      → ContentRollbackResult
 * - 事件 content://progress → ContentProgress
 */

export type AppPlatform = 'android' | 'ios' | 'linux' | 'macos' | 'windows'

export interface AppStatus {
	/** 二进制内嵌的内容版本号（16 位 hex） */
	embeddedBuild: string
	/** 当前实际生效的版本号 */
	activeBuild: string
	/** 当前生效的是内嵌内容还是下载内容 */
	source: 'downloaded' | 'embedded'
	/** 已下载待生效的版本；无则为 null */
	pendingBuild: string | null
	platform: AppPlatform
	/** 上次内容包操作留下的错误；无则为 null */
	lastError: string | null
}

export type ContentCheckResult
	= | { state: 'up-to-date', build: string }
		| { state: 'update-available', build: string, bytes: number, generatedAt: string }
		| { state: 'offline' }
		| { state: 'error', message: string }

export type ContentInstallResult
	= | { ok: true, build: string }
		| { ok: false, message: string }

export interface ContentRollbackResult {
	ok: boolean
	build: string
}

export interface ContentProgress {
	phase: 'download' | 'extract'
	received: number
	total: number
}

/** UI 用来决定状态点颜色的提示级别 */
export type AppNoticeKind = 'error' | 'offline' | 'success'

/** `useAppBridge()` 的返回类型；字段都是 ref，组件里可直接解构 */
export interface AppBridge {
	/** 冻结契约的检测结果，浏览器下恒为 false */
	isApp: boolean
	/** isApp && blogConfig.app.enable */
	enabled: boolean
	/** app_status 的结果；未读到为 null */
	status: Ref<AppStatus | null>
	/** 最近一次 content_check 的结果；未检查过为 null */
	check: Ref<ContentCheckResult | null>
	/** 下载 / 解压进度；空闲为 null */
	progress: Ref<ContentProgress | null>
	/** 要显示给用户的提示文案；null 表示不打扰 */
	notice: Ref<string | null>
	noticeKind: Ref<AppNoticeKind | null>
	hasUpdate: Ref<boolean>
	installing: Ref<boolean>
	/** 内容包损坏，需要用户回滚（由 AppBootError 呈现） */
	bootBroken: Ref<boolean>
	refreshStatus: () => Promise<void>
	/** manual = 用户主动检查；只有主动检查才允许把断网 / 失败说出来 */
	checkContent: (manual?: boolean) => Promise<ContentCheckResult | null>
	installContent: () => Promise<void>
	rollbackContent: () => Promise<ContentRollbackResult | null>
}

/**
 * Tauri 全局 API（`app.withGlobalTauri: true` 时注入）。
 * 只声明本项目用到的两个命名空间：core.invoke 与 event.listen。
 */
interface TauriGlobal {
	core: {
		invoke: <T>(command: string, args?: Record<string, unknown>) => Promise<T>
	}
	event: {
		listen: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>
	}
}

declare global {
	interface Window {
		__TAURI__?: TauriGlobal
	}
}

declare module '#app' {
	interface NuxtApp {
		/** 只在 Tauri WebView 的客户端插件里注入；SSR 预渲染与浏览器下不存在 */
		$appBridge?: AppBridge
	}
}

declare module 'vue' {
	interface ComponentCustomProperties {
		$appBridge?: AppBridge
	}
}
