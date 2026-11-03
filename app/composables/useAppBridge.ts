import type {
	AppBridge,
	AppNoticeKind,
	AppStatus,
	ContentCheckResult,
	ContentProgress,
	ContentRollbackResult,
} from '~/types/app'

/**
 * 非 app 环境（SSR 预渲染、浏览器访问站点）的空实现。
 *
 * 所有字段都有确定值，`isApp` / `enabled` 恒为 false，因此 app-only UI 完全不渲染。
 * 它的存在是为了让组件和 SSR 里的 `useAppBridge()` 永远拿到一个形状完整的对象，
 * 不必到处写 `?.`。
 */
export function createDetachedAppBridge(): AppBridge {
	const status = ref<AppStatus | null>(null)
	const check = ref<ContentCheckResult | null>(null)
	const progress = ref<ContentProgress | null>(null)
	const notice = ref<string | null>(null)
	const noticeKind = ref<AppNoticeKind | null>(null)
	const hasUpdate = ref(false)
	const installing = ref(false)

	return {
		isApp: false,
		enabled: false,
		status,
		check,
		progress,
		notice,
		noticeKind,
		hasUpdate,
		installing,
		bootBroken: computed(() => false),
		async refreshStatus() {
			status.value = null
		},
		async checkContent() {
			check.value = null
			return null
		},
		async installContent() {
			installing.value = false
		},
		async rollbackContent(): Promise<ContentRollbackResult | null> {
			return null
		},
	}
}

/** app 桥入口，只能在 setup / composable 里调用 */
export default function useAppBridge(): AppBridge {
	// 插件注入的实例；SSR 阶段插件（.client.ts）不会执行，所以这里再兜底一次
	return useNuxtApp().$appBridge ?? createDetachedAppBridge()
}
