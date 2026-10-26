import type { RewardEntry, RewardModule } from '~/types/reward'

/**
 * 关于页「赞赏名单」模块
 * - 名单数组的**顺序就是渲染顺序**，新增记录按 `date` 降序插入（同日先到在上）
 * - 金额徽章按金额分三档配色：≥ 50 金、≥ 10 主色、其余灰
 */
export const rewardModule: RewardModule = {
	tips: '致谢',
	title: '赞赏名单',
	description: '感谢因为有你们，让我更加有创作的动力。',
	chargingUrl: 'https://example.com',
}

/**
 * 示例数据：金额填数字（配色靠它分档），单位不填默认「元」
 */
export const rewardList: RewardEntry[] = [
	{ name: '应志鹏', amount: 200, date: '2026-09-28' },
	{ name: '青柚不加冰', amount: 66.66, date: '2026-09-12' },
	{ name: 'NullPointer', amount: 50, date: '2026-08-30' },
	{ name: '一只柯基', amount: 8.8, date: '2026-07-25' },
	{ name: '风与影', amount: 5, unit: '贝壳', date: '2026-07-19' },
	{ name: '无名氏', amount: 1.01, date: '2026-07-02' },
]
