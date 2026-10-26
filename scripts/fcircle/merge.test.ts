import type { FcircleItem } from '../../app/types/fcircle.ts'
import assert from 'node:assert/strict'
import test from 'node:test'
import { capGlobalItems, mergeSiteItems } from './merge.ts'

const now = new Date('2026-10-24T00:00:00.000Z')
const options = { maxAgeDays: 90, maxItems: 4, now, perSite: 3 }

function item(link: string, date: string, title = link): FcircleItem {
	return { title, link, excerpt: '', date }
}

test('新旧条目按链接去重，新数据覆盖同名条目', () => {
	const previous = [item('https://a.test/1', '2026-10-20T00:00:00.000Z', '旧标题')]
	const incoming = [item('https://a.test/1', '2026-10-20T00:00:00.000Z', '新标题')]

	const merged = mergeSiteItems(previous, incoming, options)

	assert.equal(merged.length, 1)
	assert.equal(merged[0]!.title, '新标题')
})

test('按时间倒序并限制每站条数', () => {
	const incoming = [
		item('https://a.test/1', '2026-10-01T00:00:00.000Z'),
		item('https://a.test/2', '2026-10-20T00:00:00.000Z'),
		item('https://a.test/3', '2026-10-10T00:00:00.000Z'),
		item('https://a.test/4', '2026-10-05T00:00:00.000Z'),
	]

	const merged = mergeSiteItems([], incoming, options)

	assert.deepEqual(merged.map(entry => entry.link), [
		'https://a.test/2',
		'https://a.test/3',
		'https://a.test/4',
	])
})

test('超出保留窗口的条目被丢弃', () => {
	const incoming = [
		item('https://a.test/new', '2026-10-20T00:00:00.000Z'),
		item('https://a.test/old', '2026-01-01T00:00:00.000Z'),
	]

	assert.deepEqual(
		mergeSiteItems([], incoming, options).map(entry => entry.link),
		['https://a.test/new'],
	)
})

test('全部超期时仍保底保留最新一条，避免长期不更新的站点凭空消失', () => {
	const incoming = [
		item('https://a.test/older', '2025-01-01T00:00:00.000Z'),
		item('https://a.test/newer', '2025-06-01T00:00:00.000Z'),
	]

	assert.deepEqual(
		mergeSiteItems([], incoming, options).map(entry => entry.link),
		['https://a.test/newer'],
	)
})

test('本次抓取为空时完整沿用旧数据，不做年龄裁剪', () => {
	const previous = [
		item('https://a.test/1', '2025-01-01T00:00:00.000Z'),
		item('https://a.test/2', '2025-02-01T00:00:00.000Z'),
	]

	const merged = mergeSiteItems(previous, [], options)

	assert.equal(merged.length, 2)
	assert.equal(merged[0]!.link, 'https://a.test/2')
})

test('全局截断只保留最新的若干条', () => {
	const sites = [
		{ id: 'a', items: [item('a1', '2026-10-01T00:00:00.000Z'), item('a2', '2026-10-20T00:00:00.000Z')] },
		{ id: 'b', items: [item('b1', '2026-10-10T00:00:00.000Z')] },
		{ id: 'c', items: [item('c1', '2026-10-05T00:00:00.000Z')] },
	]

	const capped = capGlobalItems(sites, 2)

	assert.equal(capped.length, 2)
	assert.deepEqual(capped.flatMap(site => site.items.map(entry => entry.link)), ['a2', 'b1'])
})
