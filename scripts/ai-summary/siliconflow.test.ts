import assert from 'node:assert/strict'
import test from 'node:test'
import { requestChatCompletion, SiliconFlowError } from './siliconflow.ts'

const messages = [
	{ role: 'system' as const, content: '你是编辑。' },
	{ role: 'user' as const, content: '写摘要。' },
]

const options = { apiKey: 'sk-test', model: 'Qwen/Qwen3-8B', retries: 2 }
async function noSleep() {}

function jsonResponse(body: unknown, status = 200) {
	return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

function success(content: string) {
	return jsonResponse({ choices: [{ message: { content } }], usage: { total_tokens: 100 } })
}

test('请求体带模型、关闭思考、非流式', async () => {
	let requestBody: Record<string, unknown> = {}
	let requestUrl = ''

	await requestChatCompletion(messages, options, {
		sleep: noSleep,
		fetch: async (input, init) => {
			requestUrl = String(input)
			requestBody = JSON.parse(String(init?.body))
			return success('摘要。')
		},
	})

	assert.equal(requestUrl, 'https://api.siliconflow.cn/v1/chat/completions')
	assert.equal(requestBody.model, 'Qwen/Qwen3-8B')
	assert.equal(requestBody.enable_thinking, false)
	assert.equal(requestBody.stream, false)
	assert.deepEqual(requestBody.messages, messages)
})

test('返回内容原样交给调用方', async () => {
	const result = await requestChatCompletion(messages, options, {
		sleep: noSleep,
		fetch: async () => success('  一篇关于 Nuxt 的文章。  '),
	})

	assert.equal(result.content, '一篇关于 Nuxt 的文章。')
	assert.equal(result.usage?.total_tokens, 100)
})

test('429 与 5xx 会重试，成功后返回', async () => {
	let calls = 0

	const result = await requestChatCompletion(messages, options, {
		sleep: noSleep,
		fetch: async () => {
			calls += 1
			if (calls === 1)
				return jsonResponse({ message: 'rate limited' }, 429)
			if (calls === 2)
				return jsonResponse({ message: 'boom' }, 503)
			return success('重试成功的摘要。')
		},
	})

	assert.equal(calls, 3)
	assert.equal(result.content, '重试成功的摘要。')
})

test('4xx 直接失败，不重试，错误里带状态与后端信息', async () => {
	let calls = 0

	await assert.rejects(
		() => requestChatCompletion(messages, options, {
			sleep: noSleep,
			fetch: async () => {
				calls += 1
				return jsonResponse({ message: 'invalid api key' }, 401)
			},
		}),
		(error: unknown) => {
			assert.ok(error instanceof SiliconFlowError)
			assert.equal(error.status, 401)
			assert.match(error.message, /invalid api key/)
			return true
		},
	)

	assert.equal(calls, 1)
})

test('重试耗尽后抛出最后一个错误', async () => {
	let calls = 0

	await assert.rejects(
		() => requestChatCompletion(messages, options, {
			sleep: noSleep,
			fetch: async () => {
				calls += 1
				return jsonResponse({ message: 'down' }, 500)
			},
		}),
		(error: unknown) => {
			assert.ok(error instanceof SiliconFlowError)
			assert.equal(error.status, 500)
			return true
		},
	)

	assert.equal(calls, 3)
})

test('响应缺少 choices 时报错', async () => {
	await assert.rejects(
		() => requestChatCompletion(messages, options, {
			sleep: noSleep,
			fetch: async () => jsonResponse({ choices: [] }),
		}),
		/missing choices/i,
	)
})

test('网络异常也会重试', async () => {
	let calls = 0

	const result = await requestChatCompletion(messages, options, {
		sleep: noSleep,
		fetch: async () => {
			calls += 1
			if (calls === 1)
				throw new TypeError('fetch failed')
			return success('网络恢复。')
		},
	})

	assert.equal(calls, 2)
	assert.equal(result.content, '网络恢复。')
})
