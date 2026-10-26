import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { measureFeed } from './feed-metrics.ts'

const atom = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>纸鹿摸鱼处</title>
	<entry><title>一</title><published>2026-09-01T00:00:00Z</published></entry>
	<entry><title>二</title><published>2025-12-01T00:00:00Z</published></entry>
	<entry><title>三</title><updated>2026-01-01T00:00:00Z</updated></entry>
</feed>`

const rss = `<?xml version="1.0"?>
<rss version="2.0"><channel>
	<title>Example</title>
	<item><title>a</title><pubDate>Tue, 01 Sep 2026 00:00:00 GMT</pubDate></item>
	<item><title>b</title><pubDate>Mon, 01 Dec 2025 00:00:00 GMT</pubDate></item>
</channel></rss>`

describe('measureFeed', () => {
	it('Atom：数条目并取最早时间', () => {
		const metrics = measureFeed(atom)
		assert.equal(metrics.format, 'atom')
		assert.equal(metrics.items, 3)
		assert.equal(metrics.title, '纸鹿摸鱼处')
		assert.equal(metrics.earliest, new Date('2025-12-01T00:00:00Z').toISOString())
	})

	it('RSS：解析 pubDate', () => {
		const metrics = measureFeed(rss)
		assert.equal(metrics.format, 'rss')
		assert.equal(metrics.items, 2)
		assert.equal(metrics.earliest, new Date('2025-12-01T00:00:00Z').toISOString())
	})

	it('JSON Feed', () => {
		const metrics = measureFeed(JSON.stringify({
			title: 'JSON 站',
			items: [
				{ date_published: '2026-09-01T00:00:00Z' },
				{ date_published: '2025-11-01T00:00:00Z' },
			],
		}))
		assert.equal(metrics.format, 'json')
		assert.equal(metrics.items, 2)
		assert.equal(metrics.earliest, new Date('2025-11-01T00:00:00Z').toISOString())
	})

	it('不是订阅源时 items 为 0', () => {
		const metrics = measureFeed('<html><body>404</body></html>')
		assert.equal(metrics.format, 'unknown')
		assert.equal(metrics.items, 0)
		assert.equal(metrics.earliest, undefined)
	})
})
