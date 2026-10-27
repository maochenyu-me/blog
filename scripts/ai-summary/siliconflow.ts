/**
 * 硅基流动（SiliconFlow）Chat Completions 客户端。
 *
 * Qwen3 系列默认开启思考链，摘要用不上还慢，所以固定 `enable_thinking: false`；
 * 429 / 5xx / 网络抖动按指数退避重试，401 这类硬错误直接抛。
 */

export interface ChatMessage {
	role: 'system' | 'user' | 'assistant'
	content: string
}

export interface SiliconFlowOptions {
	apiKey: string
	model?: string
	baseUrl?: string
	temperature?: number
	maxTokens?: number
	/** 首次失败后的重试次数（总请求数 = retries + 1） */
	retries?: number
}

export interface SiliconFlowDeps {
	fetch?: typeof globalThis.fetch
	/** 便于测试注入，避免真的 sleep */
	sleep?: (ms: number) => Promise<void>
}

export interface ChatResult {
	content: string
	usage?: { total_tokens?: number }
}

export class SiliconFlowError extends Error {
	status?: number

	constructor(message: string, status?: number) {
		super(message)
		this.name = 'SiliconFlowError'
		this.status = status
	}
}

const defaultBaseUrl = 'https://api.siliconflow.cn/v1'
const defaultModel = 'Qwen/Qwen3-8B'

const defaultSleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

function isRetryable(error: unknown): boolean {
	if (!(error instanceof SiliconFlowError))
		return true

	return error.status === undefined || error.status === 429 || error.status >= 500
}

async function readDetail(response: Response): Promise<string> {
	try {
		const text = await response.text()
		return text.slice(0, 200) || response.statusText
	}
	catch {
		return response.statusText
	}
}

export async function requestChatCompletion(
	messages: ChatMessage[],
	options: SiliconFlowOptions,
	deps: SiliconFlowDeps = {},
): Promise<ChatResult> {
	const fetchImpl = deps.fetch ?? globalThis.fetch
	const sleep = deps.sleep ?? defaultSleep
	const retries = options.retries ?? 2
	const baseUrl = (options.baseUrl ?? defaultBaseUrl).replace(/\/+$/, '')

	const body = {
		model: options.model ?? defaultModel,
		messages,
		stream: false,
		enable_thinking: false,
		temperature: options.temperature ?? 0.3,
		max_tokens: options.maxTokens ?? 512,
	}

	async function once(): Promise<ChatResult> {
		const response = await fetchImpl(`${baseUrl}/chat/completions`, {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${options.apiKey}`,
			},
			body: JSON.stringify(body),
		})

		if (!response.ok)
			throw new SiliconFlowError(`SiliconFlow 请求失败（${response.status}）：${await readDetail(response)}`, response.status)

		const data = await response.json() as {
			choices?: { message?: { content?: string } }[]
			usage?: { total_tokens?: number }
		}
		const content = data.choices?.[0]?.message?.content

		if (!content)
			throw new SiliconFlowError('SiliconFlow 响应 missing choices / content')

		return { content: content.trim(), usage: data.usage }
	}

	let lastError: unknown

	for (let attempt = 0; attempt <= retries; attempt++) {
		if (attempt > 0)
			await sleep(600 * attempt)

		try {
			return await once()
		}
		catch (error) {
			lastError = error

			if (!isRetryable(error))
				throw error
		}
	}

	throw lastError
}
