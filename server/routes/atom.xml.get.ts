import type { ContentCollectionItem } from '@nuxt/content'
import { pascalCase } from 'es-toolkit/string'
import XmlBuilder from 'fast-xml-builder'
import { Temporal } from 'temporal-polyfill'
import blogConfig from '~~/blog.config'
import packageJson from '~~/package.json'
import { toZonedTemporal } from '~~/shared/utils/time'

const runtimeConfig = useRuntimeConfig()

const builder = new XmlBuilder({
	attributeNamePrefix: '$',
	cdataPropName: '$',
	format: true,
	ignoreAttributes: false,
	textNodeName: '_',
})

function formatIsoDate(date?: string) {
	if (!date)
		return
	try {
		return toZonedTemporal(date).toInstant().toString()
	}
	catch {
		console.error('Invalid date format', date)
		return date
	}
}

function getUrl(path: string | undefined) {
	return new URL(path ?? '', blogConfig.url).toString()
}

function renderContent(post: ContentCollectionItem) {
	return [
		post.image && `<img src="${post.image}" alt="${post.title}" />`,
		post.description && `<p>${post.description}</p>`,
		`<a class="view-full" href="${getUrl(post.path)}" target="_blank">点击查看全文</a>`,
	].join(' ')
}

export default defineEventHandler(async (event) => {
	const posts = await queryCollection(event, 'content')
		.where('stem', 'LIKE', 'posts/%')
		.order('updated', 'DESC')
		.limit(blogConfig.feed.limit)
		.all()

	const entries = posts.map(post => ({
		id: getUrl(post.path),
		title: post.title ?? '',
		updated: formatIsoDate(post.updated),
		author: { name: post.author || blogConfig.author.name },
		content: {
			$type: 'html',
			$: renderContent(post),
		},
		link: { $href: getUrl(post.path) },
		summary: post.description,
		category: { $term: post.categories?.[0] },
		published: formatIsoDate(post.published ?? post.date),
	}))

	const feed = {
		$xmlns: 'http://www.w3.org/2005/Atom',
		id: blogConfig.url,
		title: blogConfig.title,
		// buildTime 是带时区名的 ZonedDateTime 字符串，Atom 只接受 RFC3339，先归一化
		updated: formatIsoDate(runtimeConfig.public.buildTime),
		description: blogConfig.description, // RSS 2.0
		author: {
			name: blogConfig.author.name,
			email: blogConfig.author.email,
			uri: blogConfig.author.homepage,
		},
		link: [
			{ $href: getUrl('atom.xml'), $rel: 'self' },
			{ $href: blogConfig.url, $rel: 'alternate' },
		],
		language: blogConfig.language, // RSS 2.0
		generator: {
			$uri: 'https://github.com/L33Z22L11/blog-v3',
			$version: packageJson.version,
			_: pascalCase(packageJson.name),
		},
		icon: blogConfig.favicon,
		logo: blogConfig.author.avatar, // Ratio should be 2:1
		rights: `© ${Temporal.Now.plainDateISO().year.toString()} ${blogConfig.author.name}`,
		subtitle: blogConfig.subtitle || blogConfig.description,
		entry: entries,
	}

	// 不再挂 xml-stylesheet：Chrome 已弃用 XSLT 并会弹「此网站使用了 XSLT」警告，
	// 订阅源保持纯 XML，人类可读版见 /feed 页面
	return builder.build({
		'?xml': { $version: '1.0', $encoding: 'UTF-8' },
		feed,
	})
})
