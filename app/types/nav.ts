export interface NavItem {
	icon: string
	text: string
	url: string
	external?: boolean
	/** 子导航；有值时该项在侧栏渲染为可展开的父级，`url` 一般留 `#` */
	children?: NavItem[]
}

export type Nav = {
	title: string
	items: NavItem[]
}[]
