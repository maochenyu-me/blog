/** 查询列表需要的轻量文章字段；useAsyncData 的缓存键由页面持有。 */
export function queryArticleIndex(path = 'posts/%') {
	return queryCollection('content')
		.where('stem', 'LIKE', path)
		.select('categories', 'date', 'description', 'image', 'path', 'readingTime', 'recommend', 'tags', 'title', 'type', 'updated')
		.all()
}

interface GetPostTypeClassNameOptions {
	prefix?: string
}

export function getPostTypeClassName(type = 'tech', options?: GetPostTypeClassNameOptions) {
	const { prefix = 'text' } = options || {}
	return `${prefix}-${type}`
}

/** 在组件 setup/render 上下文中读取当前应用配置。 */
export function getCategoryIcon(category?: string) {
	return useAppConfig().article.categories[category ?? '']?.icon ?? 'tabler:folder'
}

/**
 * 分类主题色。**必须保证返回非空字符串**。
 *
 * `article.categories` 里分类的 `color` 是可选字段（默认分类就只有 icon 没有 color），
 * 而调用方把它直接绑进 `:style="{ color: ... }"` / `{ '--c-accent': ... }`。
 * 一旦返回 undefined，Vue 会写出空值，浏览器就报
 * `The specified value "" does not conform to the required format. The value must be a valid CSS color.`
 * 因此这里回退到 `--c-accent` 的 CSS 变量名，既合法又能跟随主题。
 */
export function getCategoryColor(category?: string) {
	return useAppConfig().article.categories[category ?? '']?.color ?? 'var(--c-accent)'
}
