import { safeGoConfig } from '~/data/safego'

/**
 * 外链中转：在 document 捕获阶段接管站外链接的点击。
 *
 * 为什么用捕获阶段就够了：`NuxtLink` 在 `isExternal || hasTarget` 时渲染的是裸
 * `<a target="_blank">`，它的 onClick 第一句就是
 * `if (isExternal.value || hasTarget.value) return`（nuxt-link.js:324-325），
 * 站外链接根本不存在 JS 导航；而 app/components/util/Link.vue 给所有
 * isExtLink() 为真的链接都加了 target="_blank"，所以走的就是这条分支。
 * 因此在捕获阶段 preventDefault() 就能取消浏览器原生「开新标签」的默认行为，
 * 不存在与既有 JS 处理器的竞态。
 */
export default defineNuxtPlugin((nuxtApp) => {
	const config = safeGoConfig
	if (!config.enable)
		return

	function findAnchor(event: MouseEvent) {
		for (const node of event.composedPath()) {
			if (node instanceof HTMLAnchorElement)
				return node
		}
		return event.target instanceof Element ? event.target.closest('a[href]') : null
	}

	function isIgnored(anchor: HTMLAnchorElement) {
		return config.links.ignoreAttrs.some(attribute => anchor.hasAttribute(attribute))
	}

	function handle(event: MouseEvent, middleClick: boolean) {
		if (event.defaultPrevented)
			return
		if (middleClick && !config.behavior.interceptModifiedClick)
			return
		const anchor = findAnchor(event)
		if (!anchor || isIgnored(anchor))
			return
		const href = anchor.getAttribute('href')
		if (!href)
			return
		const target = resolveInterceptedHref(href, window.location.href, config.links)
		if (!target)
			return
		const current = nuxtApp.$router.currentRoute.value
		const { path } = current
		// 中转页自身永不拦截，避免配置被改动后出现死循环
		if (normalizeContentPath(path) === normalizeContentPath(config.route.path))
			return
		if (!isPageInScope(path, config.pages))
			return
		// 修饰键点击表达的是「在新标签打开」的意图，拦截时不要吞掉这个意图
		const newTab = middleClick || event.ctrlKey || event.metaKey || event.shiftKey
		event.preventDefault()
		if (!newTab) {
			// 记下来源页面与滚动位置：返回时由中转页负责恢复。
			// 不能依赖路由器的 savedPosition——实测它落位既晚又有几十像素出入。
			try {
				sessionStorage.setItem(SAFEGO_ORIGIN_KEY, JSON.stringify({ path, y: Math.round(window.scrollY) }))
			}
			catch {
				// 隐私模式下 sessionStorage 可能不可写，退化成只按历史返回
			}
		}
		const url = buildSafeGoUrl(config.route.path, config.route.param, target, config.route.base64)
		if (newTab)
			window.open(url, '_blank')
		else
			nuxtApp.$router.push(url)
	}

	const onClick = (event: MouseEvent) => handle(event, false)
	const onAuxClick = (event: MouseEvent) => {
		if (event.button === 1)
			handle(event, true)
	}

	document.addEventListener('click', onClick, true)
	document.addEventListener('auxclick', onAuxClick, true)
	nuxtApp.vueApp.onUnmount(() => {
		document.removeEventListener('click', onClick, true)
		document.removeEventListener('auxclick', onAuxClick, true)
	})
})
