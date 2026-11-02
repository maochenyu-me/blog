import type { RewardEntry, RewardModule } from '~/types/reward'

/**
 * 关于页「赞赏名单」模块
 * - 名单数组的**顺序就是渲染顺序**，新增记录按 `date` 降序插入（同日先到在上），见 scripts/reward-apply
 * - 金额徽章按金额分三档配色：≥ 50 金、≥ 10 主色、其余灰
 */
export const rewardModule: RewardModule = {
	tips: '致谢',
	title: '赞赏名单',
	description: '感谢因为有你们，让我更加有创作的动力。',
	/** ⚠️ 占位地址：上线前换成真实的赞赏页（爱发电 / 赞赏码页等）；留空则不渲染整个充电模块 */
	chargingUrl: 'https://github.com/maochenyu-me/blog/issues/new?template=reward-application.yml',
}

/**
 * ⚠️ 以下是示例数据，上线前请替换成真实名单
 * 金额填数字（配色靠它分档），单位不填默认「元」
 */
export const rewardList: RewardEntry[] = [
	{ name: '深度求索', amount: 11.14, date: '2026-10-15' },
]
