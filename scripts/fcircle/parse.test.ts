import assert from 'node:assert/strict'
import test from 'node:test'
import { parseFeed } from './parse.ts'

const atom = `<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
	<title>纸鹿摸鱼处</title>
	<subtitle>副标题</subtitle>
	<entry>
		<title type="html">Hello &amp; world</title>
		<link rel="alternate" href="https://blog.zhilu.site/hello"/>
		<link rel="self" href="https://blog.zhilu.site/atom.xml"/>
		<published>2026-09-14T14:57:02.925+00:00[UTC]</published>
		<summary type="html">&lt;p&gt;摘要 &lt;img src="/img/a.png"&gt;&lt;/p&gt;</summary>
		<content type="html"><![CDATA[<p>正文</p><img src="https://x.test/b.png">]]></content>
	</entry>
</feed>`

const rss = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:media="http://search.yahoo.com/mrss/" xmlns:dc="http://purl.org/dc/elements/1.1/">
	<channel>
		<title>示例站</title>
		<description>站点描述</description>
		<item>
			<title><![CDATA[标题 <b>加粗</b>]]></title>
			<link>https://ex.test/post/1</link>
			<pubDate>Mon, 14 Sep 2026 10:00:00 +0800</pubDate>
			<description><![CDATA[<p>一段摘要</p>]]></description>
			<content:encoded><![CDATA[<p>全文</p><img src="//cdn.test/c.jpg">]]></content:encoded>
			<enclosure url="https://ex.test/cover.jpg" type="image/jpeg" length="1234"/>
		</item>
		<item>
			<title>无日期但有 dc:date</title>
			<link>/relative/2</link>
			<dc:date>2026-08-01T08:00:00+08:00</dc:date>
			<media:content url="https://ex.test/m.png" medium="image"/>
		</item>
		<item>
			<title>没有链接</title>
		</item>
	</channel>
</rss>`

test('解析 Atom：标题解码、链接取 alternate、封面取正文首图并补全相对地址', () => {
	const { title, items } = parseFeed(atom, 'https://blog.zhilu.site/atom.xml')

	assert.equal(title, '纸鹿摸鱼处')
	assert.equal(items.length, 1)

	const item = items[0]!
	assert.equal(item.title, 'Hello & world')
	assert.equal(item.link, 'https://blog.zhilu.site/hello')
	assert.equal(item.date, '2026-09-14T14:57:02.925Z')
	// 摘要只有 2 个字，太短，回退到正文
	assert.match(item.summary!, /正文/)
	assert.equal(item.cover, 'https://x.test/b.png')
})

test('摘要足够长时优先用作者给的摘要，而不是全文', () => {
	const xml = `<rss version="2.0"><channel><item>
		<title>长摘要</title><link>https://ex.test/long</link>
		<description><![CDATA[<p>${'这是一段足够长的作者摘要，'.repeat(4)}</p>]]></description>
		<content:encoded><![CDATA[<p>全文第一段</p><p>全文第二段</p>]]></content:encoded>
	</item></channel></rss>`

	const item = parseFeed(xml, 'https://ex.test/feed.xml').items[0]!
	assert.match(item.summary!, /作者摘要/)
	assert.doesNotMatch(item.summary!, /全文/)
})

test('解析 RSS 2.0：标题去标签、优先 content:encoded、封面取 enclosure', () => {
	const { title, items } = parseFeed(rss, 'https://ex.test/feed.xml')

	assert.equal(title, '示例站')
	// 缺 link 的条目被丢弃
	assert.equal(items.length, 2)

	const item = items[0]!
	assert.equal(item.title, '标题 加粗')
	assert.equal(item.link, 'https://ex.test/post/1')
	assert.equal(item.date, '2026-09-14T02:00:00.000Z')
	assert.match(item.summary!, /全文/)
	assert.equal(item.cover, 'https://ex.test/cover.jpg')
})

test('相对链接按订阅源地址补全，dc:date 兜底发布日期', () => {
	const [, second] = parseFeed(rss, 'https://ex.test/feed.xml').items

	assert.equal(second!.link, 'https://ex.test/relative/2')
	assert.equal(second!.date, '2026-08-01T00:00:00.000Z')
	assert.equal(second!.cover, 'https://ex.test/m.png')
})

test('无法解析的内容返回空条目而不是抛错', () => {
	assert.deepEqual(parseFeed('<html><body>404 Not Found</body></html>', 'https://ex.test/').items, [])
	assert.deepEqual(parseFeed('这不是 XML', 'https://ex.test/').items, [])
	assert.deepEqual(parseFeed('', 'https://ex.test/').items, [])
})

test('日期无法识别时留空，交给上层回退', () => {
	const xml = `<rss version="2.0"><channel><item>
		<title>无日期</title><link>https://ex.test/a</link><pubDate>不是日期</pubDate>
	</item></channel></rss>`

	assert.equal(parseFeed(xml, 'https://ex.test/feed.xml').items[0]!.date, undefined)
})
