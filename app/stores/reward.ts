import { LazyPopoverReward } from '#components'

/**
 * 打赏弹窗的唯一入口。
 * 文章底部卡片与右侧目录栏都会调用，实例缓存在 store 内，避免开两个弹窗。
 */
export const useRewardStore = defineStore('reward', () => {
	const appConfig = useAppConfig()
	const modalStore = useModalStore()

	/** 未配置收款方式或显式关闭时不给出任何入口 */
	const enabled = computed(() => appConfig.reward?.enabled !== false && !!appConfig.reward?.methods?.length)

	let instance: ReturnType<typeof modalStore.use> | null = null

	function open() {
		if (!enabled.value)
			return
		instance ??= modalStore.use(() => h(LazyPopoverReward), { unique: true, duration: 200 })
		instance.open()
	}

	function close() {
		void instance?.close()
	}

	return { enabled, open, close }
})
