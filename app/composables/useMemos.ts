/**
 * 说说数据源门面：按 `blog.config.ts` 的 `memos.source` 选择适配器。
 *
 * 两个适配器（`composables/memos/useMemosTg.ts` / `useMemosEch0.ts`）对外暴露
 * 完全相同的状态与动作，所以 `MemosTimeline.vue` / `MemosCard.vue` 不需要知道
 * 数据来自 Telegram 频道还是 Ech0，只处理统一的 `MemosMessage`。
 */
import type { MemosSource } from '~/types/memos'
import { useMemosEch0 } from './memos/useMemosEch0'
import { useMemosTg } from './memos/useMemosTg'

export function formatMemosFileSize(bytes?: number) {
	if (!bytes)
		return ''
	if (bytes < 1024)
		return `${bytes} B`
	const units = ['KB', 'MB', 'GB']
	let value = bytes / 1024
	let unit = 0
	while (value >= 1024 && unit < units.length - 1) {
		value /= 1024
		unit++
	}
	return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`
}

export function formatMemosDuration(seconds?: number) {
	if (!seconds)
		return ''
	const total = Math.round(seconds)
	return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`
}

export function useMemos() {
	const config = useAppConfig().memos
	const source: MemosSource = config.source ?? 'ech0'
	// 配错值（如 'ech0g'）时开发期喊一声，生产期按 ech0 兜底 —— 比静默回落更容易发现
	if (import.meta.dev && source !== 'tg' && source !== 'ech0')
		console.warn(`[memos] memos.source 配置无效：${String(source)}，已回退到 ech0`)
	return source === 'tg' ? useMemosTg() : useMemosEch0()
}
