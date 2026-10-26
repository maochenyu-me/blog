/** 单个收款方式：名称 + 收款码图片 */
export interface RewardMethod {
	/** 展示在收款码下方的名称，如「微信」 */
	name: string
	/** 站点路径，图片放 `public/img/reward/` 下，如 `/img/reward/wechat.png` */
	image: string
}

/** 弹窗底部的「赞赏者名单」卡片；`link` 留空时渲染为不可点击的占位 */
export interface RewardListLink {
	title: string
	description: string
	link: string
}

/** 文章打赏配置，见 `blog.config.ts` → `reward` */
export interface RewardConfig {
	/** 关掉后按钮、入口与弹窗都不渲染 */
	enabled: boolean
	/** 弹窗标题 */
	title: string
	/** 收款码上方的引导语 */
	tips: string
	/** 收款方式，按数组顺序渲染；留空数组则不渲染弹窗内容 */
	methods: RewardMethod[]
	/** 赞赏者名单卡片 */
	list: RewardListLink
}

/** 金额徽章的档位，见 `about/Reward.vue` 的配色规则 */
export type RewardAmountLevel = 'plain' | 'blue' | 'gold'

/** 关于页「赞赏名单」的单条记录，见 `app/reward.ts` → `rewardList` */
export interface RewardEntry {
	/** 昵称，超长时单行省略 */
	name: string
	/** 金额（数字），既用于徽章文字也用于分档配色 */
	amount: number
	/** 金额单位，默认「元」；单位不同不影响分档（如「贝壳」） */
	unit?: string
	/** 日期，`YYYY-MM-DD`，用于排序与底部的「最新更新时间」 */
	date: string
	/** 预留：头像地址，当前卡片不渲染 */
	avatar?: string
	/** 预留：留言，当前卡片不渲染 */
	message?: string
	/** 预留：主页链接，当前卡片不渲染 */
	link?: string
}

/** 关于页「赞赏名单」模块的文案与入口，见 `app/reward.ts` → `rewardModule` */
export interface RewardModule {
	/** 标题上方的小标签 */
	tips: string
	/** 模块标题 */
	title: string
	/** 标题下方的说明 */
	description: string
	/** 「为TA充电」按钮的跳转地址；留空则不渲染按钮 */
	chargingUrl: string
}
