/**
 * 把说说正文引用到评论区输入框。
 * 同时兼容 Ecoku 与 Twikoo：两者的输入框选择器不同，且都可能在懒加载后才出现，
 * 所以要轮询等它挂载完成。
 */

/**
 * 两个评论系统的输入框选择器。
 * Ecoku 的正文框类名是 `.ecoku-textarea`（在 `.ecoku-message-field` 里），
 * Twikoo 是 `#twikoo .tk-input textarea`。
 */
const inputSelectors = [
	'#comments .ecoku-textarea',
	'#comments textarea.ecoku-textarea',
	'#comments .ecoku-composer textarea',
	'#twikoo .tk-input textarea',
]

/** 等待评论区输入框出现；超时返回 null，避免无限轮询 */
async function waitInput(timeout = 5000) {
	const deadline = Date.now() + timeout
	while (Date.now() < deadline) {
		for (const selector of inputSelectors) {
			const el = document.querySelector(selector)
			if (el instanceof HTMLTextAreaElement)
				return el
		}
		await new Promise(resolve => setTimeout(resolve, 120))
	}
	return null
}

/** 正文转 Markdown 引用块；空正文返回空串 */
export function toQuoteBlock(content?: string) {
	const text = content?.trim()
	if (!text)
		return ''
	return `${text.split('\n').map(line => `> ${line}`.trimEnd()).join('\n')}\n\n`
}

function prefill(input: HTMLTextAreaElement, value: string) {
	input.value = value
	// 受控组件靠 input 事件同步内部状态，不派发的话提交时会丢内容
	input.dispatchEvent(new InputEvent('input', { bubbles: true }))
	const end = value.length
	input.setSelectionRange(end, end)
	input.focus()
}

/**
 * 引用内容到评论区并滚动过去。
 * 返回是否成功定位到输入框（用于决定要不要只滚动不填充）。
 */
export async function replyToComment(content?: string) {
	const section = document.querySelector('#comments')
	section?.scrollIntoView({ behavior: 'smooth', block: 'start' })

	const quote = toQuoteBlock(content)
	const input = await waitInput()
	if (!input)
		return false

	// 已有内容时把引用插到最前面，不覆盖用户已经写的东西
	prefill(input, quote ? `${quote}${input.value}` : input.value)
	return true
}
