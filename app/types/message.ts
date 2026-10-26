/** 留言板提示语中的站内链接片段 */
export interface MessageTipLink {
	/** 链接文字 */
	label: string
	/** 站内路径，如 `/link` */
	href: string
}

/** 提示语由若干片段按顺序拼接：纯文本与链接混排 */
export type MessageTipPart = MessageTipLink | string

/** 留言板评论区上方的一条提示语 */
export interface MessageTip {
	/** Iconify 图标名，如 `tabler:link` */
	icon: string
	/** 文案片段，数组项依次渲染 */
	parts: MessageTipPart[]
}
