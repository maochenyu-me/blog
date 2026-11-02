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
	left: ['博客魔改者', 'ai编程', '天天熬夜中', '随便写写'],
	right: ['小说爱好者', '资源分享', '日常记录', '开源项目'],
}

/** 渐变问候卡 */
export const aboutGreeting: AboutGreeting = {
	hello: '你好，很高兴认识你 👋',
	namePrefix: '我是',
	roles: ['自动化技术与应用', 'ai编程'],
	highlight: '业余博主',
}

/** 本站介绍卡 */
export const aboutSite: AboutSite = {
	tips: '我在折腾什么',
	lines: ['源于', '好奇，'],
	keywordPrefix: '去',
	keywords: ['学习', '测试', '魔改', '记录'],
}

/** 座右铭 */
export const aboutMotto: AboutMotto = {
	tips: '座右铭',
	text: '每一段旅行，都有终点。',
	from: '龙泽尔·爱德华',
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

/**
 * 心路历程时间线开关。
 * 关闭后「心路历程」卡片只保留卡头与 content/about.md 正文，不再渲染里程碑列表。
 */
export const aboutMilestonesEnabled = false

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
