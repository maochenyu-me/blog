import type {
	AppBridge,
	AppNoticeKind,
	AppStatus,
	ContentCheckResult,
	ContentInstallResult,
	ContentProgress,
	ContentRollbackResult,
} from '~/types/app'
import blogConfig from '~~/blog.config'
import { createDetachedAppBridge } from '~/composables/useAppBridge'

/**
 * app 桥：检测是否运行在 Tauri WebView 内，并封装内容包命令。
 *
 * 冻结接口契约 v1（不要改）：
 * - 检测：`typeof window !== 'undefined' && '__TAURI__' in window`
 * - 调用：`window.__TAURI__.core.invoke('<命令>', { ... })`
 * - 进度：事件 `content://progress`
 *
 * 文件名以 `.client.ts` 结尾：SSR / 静态预渲染阶段根本不执行，
 * 所以浏览器访问站点时既不会渲染 app-only UI，也不会发出任何命令调用。
 */
export default defineNuxtPlugin((nuxtApp) => {
	// ⚠️ 冻结接口契约 v1：检测语句原样保留，不要改写成其它探测方式
	const isApp = typeof window !== 'undefined' && '__TAURI__' in window
	const tauri = typeof window === 'undefined' ? undefined : window.__TAURI__
	const config = blogConfig.app

	if (!isApp || !tauri) {
		nuxtApp.provide('appBridge', createDetachedAppBridge())
		return
	}

	const { core, event } = tauri
	/** 内容清单地址：由 contentBase + manifestPath 拼出后交给 Rust */
	const manifestUrl = `${config.contentBase}${config.manifestPath}`

	const status = ref<AppStatus | null>(null)
	const check = ref<ContentCheckResult | null>(null)
	const progress = ref<ContentProgress | null>(null)
	const notice = ref<string | null>(null)
	const noticeKind = ref<AppNoticeKind | null>(null)
	const hasUpdate = ref(false)
	const installing = ref(false)

	function setNotice(text: string | null, kind: AppNoticeKind | null) {
		notice.value = text
		noticeKind.value = kind
	}

	function toMessage(error: unknown) {
		return error instanceof Error ? error.message : String(error)
	}

	/** 读取 app_status：内嵌 / 生效版本、平台与上次错误 */
	async function refreshStatus() {
		try {
			status.value = await core.invoke<AppStatus>('app_status')
		}
		catch {
			// 读不到状态不影响阅读，UI 会退回「正在读取内容状态…」
			status.value = null
		}
	}

	/**
	 * 检查更新。
	 *
	 * @param manual 只有用户主动点「检查更新」时才允许把断网 / 失败说出来；
	 *               启动时的自动检查一律静默（硬要求：断网不打扰）。
	 */
	async function checkContent(manual = false): Promise<ContentCheckResult | null> {
		if (!config.enable)
			return null

		setNotice(null, null)

		let result: ContentCheckResult
		try {
			result = await core.invoke<ContentCheckResult>('content_check', { manifestUrl })
		}
		catch (error) {
			// invoke 本身抛错（命令未注册 / IPC 异常）也当成一次失败的检查，不往外抛
			result = { state: 'error', message: toMessage(error) }
		}
		check.value = result

		if (result.state === 'update-available') {
			hasUpdate.value = true
			return result
		}

		hasUpdate.value = false
		if (result.state === 'offline') {
			if (manual)
				setNotice('当前没有网络连接，已下载的内容仍可正常阅读。', 'offline')
		}
		else if (result.state === 'error' && manual) {
			setNotice(`检查更新失败：${result.message}`, 'error')
		}
		return result
	}

	/** 下载并应用新内容；失败只解释，不阻断当前内容 */
	async function installContent() {
		if (installing.value || !config.enable)
			return

		installing.value = true
		setNotice(null, null)
		progress.value = null

		try {
			const result = await core.invoke<ContentInstallResult>('content_install', { manifestUrl })
			if (result.ok) {
				hasUpdate.value = false
				// Rust 切换 web 根后会自己重载 webview；前端不再 reload，避免双重跳转
				setNotice(`内容已更新到 ${result.build}，正在应用…`, 'success')
			}
			else {
				setNotice(`更新失败：${result.message}。当前内容不受影响，可稍后重试。`, 'error')
			}
		}
		catch (error) {
			setNotice(`更新失败：${toMessage(error)}。当前内容不受影响，可稍后重试。`, 'error')
		}
		finally {
			installing.value = false
			progress.value = null
		}
	}

	/** 回滚到上一版本（内容包损坏时由 AppBootError 调用） */
	async function rollbackContent(): Promise<ContentRollbackResult | null> {
		try {
			return await core.invoke<ContentRollbackResult>('content_rollback')
		}
		catch {
			return null
		}
	}

	/** 订阅下载 / 解压进度（返回 unlisten；当前无需退订，保留引用避免未用变量） */
	async function subscribeProgress() {
		try {
			const unlisten = await event.listen<ContentProgress>('content://progress', ({ payload }) => {
				progress.value = payload
			})
			void unlisten
		}
		catch {
			// 事件通道不可用（例如 capability 缺 core:event 权限）时只是没有进度条，更新本身照常
		}
	}
	void subscribeProgress()

	/**
	 * 内容包损坏判定。
	 *
	 * 契约 v1 只给了 `lastError: string|null`，没有定义它的语义，这里取最保守的读法：
	 * **当前生效的是「下载」内容，且 Rust 记录了错误** —— 内嵌内容不可能「下载损坏」。
	 * 若 Rust 侧日后细化了语义，只需要改这一个函数。
	 */
	const bootBroken = computed(() =>
		status.value !== null
		&& status.value.lastError !== null
		&& status.value.source === 'downloaded',
	)

	nuxtApp.hook('app:mounted', () => {
		void refreshStatus()
		if (!config.enable || !config.checkOnLaunch)
			return
		window.setTimeout(async () => {
			const result = await checkContent()
			if (result?.state === 'update-available' && config.autoDownload && !installing.value)
				await installContent()
		}, config.checkDelayMs)
	})

	nuxtApp.provide('appBridge', {
		isApp,
		enabled: config.enable,
		status,
		check,
		progress,
		notice,
		noticeKind,
		hasUpdate,
		installing,
		bootBroken,
		refreshStatus,
		checkContent,
		installContent,
		rollbackContent,
	} satisfies AppBridge)
})
