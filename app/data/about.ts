import type {
	AboutGreeting,
	AboutMilestone,
	AboutMotto,
	AboutSite,
	AboutSkill,
	AboutTagColumns,
} from '~/types/about'

/** 头像两侧的浮动标签 */
export const aboutTagColumns: AboutTagColumns = {
	left: ['🐍 Python 数据党', '📈 建模仿真', '☕ 咖啡续命', '🧱 造轮子的人'],
	right: ['🐱 喵星人', '🌙 夜猫子', '📝 记录踩坑', '🚀 折腾不止'],
}

/** 渐变问候卡 */
export const aboutGreeting: AboutGreeting = {
	hello: '你好，很高兴认识你 👋',
	namePrefix: '我是',
	roles: ['数据科学与仿真', 'Node 脚本'],
	highlight: '业余博主',
}

/** 本站介绍卡 */
export const aboutSite: AboutSite = {
	tips: '我在折腾什么',
	lines: ['源于', '好奇，'],
	keywordPrefix: '去',
	keywords: ['学习', '建模', '仿真', '记录'],
}

/** 座右铭 */
export const aboutMotto: AboutMotto = {
	tips: '座右铭',
	text: '每一段旅行，都有终点。',
	from: '本站副标题',
}

/** 技能墙，图标走 Iconify，构建期扫描内联 */
export const aboutSkills: AboutSkill[] = [
	{ name: 'Python', icon: 'devicon:python' },
	{ name: 'MATLAB / Simulink', icon: 'devicon:matlab' },
	{ name: 'Node.js', icon: 'devicon:nodejs' },
	{ name: 'TypeScript', icon: 'devicon:typescript' },
	{ name: 'Astro', icon: 'devicon:astro' },
	{ name: 'Vue', icon: 'devicon:vuejs' },
	{ name: 'Jupyter', icon: 'devicon:jupyter' },
	{ name: 'LaTeX', icon: 'devicon:latex' },
	{ name: 'Git', icon: 'devicon:git' },
]

/** 心路历程，最新的排最后 */
export const aboutMilestones: AboutMilestone[] = [
	{
		time: '2024.11',
		title: '开张',
		desc: '用 Nuxt + Clarity 主题搭起第一版，开始把踩过的坑和跑完的结果记下来。',
	},
	{
		time: '2026.10',
		title: '归档与标签',
		desc: '补齐归档页和标签页，文章第一次能按年份、按标签翻。',
	},
	{
		time: '2026.10',
		title: '朋友圈',
		desc: '友链文章聚合上线，每天凌晨自动抓一次，友邻写了什么一眼就能看到。',
	},
	{
		time: '现在',
		title: '关于页',
		desc: '就是你正在看的这一页。',
	},
]
