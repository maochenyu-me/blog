import type { VisitorContentPart, VisitorContentPartObject, VisitorGeo, VisitorGreeting } from '~/types/visitor'

/** 地球平均半径（km） */
const EARTH_RADIUS_KM = 6371

interface VisitorCoord {
	lat: number
	lng: number
}

function toRadians(degree: number) {
	return degree * Math.PI / 180
}

/**
 * 两点间球面距离，单位为公里并取整。
 * 任一坐标缺失或非法时返回 `null`，调用方据此隐藏距离那一行。
 */
export function getGeoDistance(from: VisitorCoord, to: VisitorCoord) {
	const coordinates = [from.lat, from.lng, to.lat, to.lng]
	if (coordinates.some(value => !Number.isFinite(value)))
		return null

	const deltaLat = toRadians(to.lat - from.lat)
	const deltaLng = toRadians(to.lng - from.lng)
	const h = Math.sin(deltaLat / 2) ** 2
		+ Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(deltaLng / 2) ** 2

	return Math.round(EARTH_RADIUS_KM * 2 * Math.asin(Math.min(1, Math.sqrt(h))))
}

/**
 * 按访客本地时间挑一句问候语。
 * 命中规则是「起始小时不超过当前小时的最后一段」，因此跨零点的分段不需额外处理：
 * 例如 `from` 为 `0` 的那段会自动兜住凌晨。
 */
export function pickGreeting(hour: number, greetings: VisitorGreeting[]) {
	if (!greetings.length)
		return ''

	const currentHour = Number.isFinite(hour) ? ((Math.trunc(hour) % 24) + 24) % 24 : 0
	const sorted = [...greetings].sort((a, b) => a.from - b.from)
	const matched = sorted.findLast(item => item.from <= currentHour)

	// 没有配置从 0 点开始的分段时，凌晨会落空，退回到最早的一段
	return (matched ?? sorted[0])?.text ?? ''
}

/** 正文片段是否为带链接的对象 */
export function isLinkPart(part: VisitorContentPart): part is VisitorContentPartObject & { href: string } {
	return typeof part !== 'string' && !!part.href
}

/** 正文片段的文字，字符串与对象都能取到 */
export function getPartText(part: VisitorContentPart) {
	return typeof part === 'string' ? part : part.text
}

/** 正文片段是否为需要强调的对象 */
export function isHighlightPart(part: VisitorContentPart): part is VisitorContentPartObject & { highlight: true } {
	return typeof part !== 'string' && !!part.highlight
}

interface RawGeoResponse {
	success?: boolean
	country?: string
	countryCode?: string
	country_code?: string
	region?: string
	prov?: string
	city?: string
	latitude?: number | string
	longitude?: number | string
	lat?: number | string
	lng?: number | string
}

function toCoordinate(value: number | string | undefined) {
	const parsed = typeof value === 'string' ? Number.parseFloat(value) : value
	return typeof parsed === 'number' && Number.isFinite(parsed) ? parsed : null
}

/**
 * 抹平地理接口的字段差异：ipwho.is 给 `latitude/longitude` 与 `flag.emoji`，
 * ip.sb 给 `latitude/longitude`，60s 风格给 `lat/lng`。
 * 定位字段缺失不算失败，仍有 IP 与问候语可用。
 */
export function normalizeGeo(raw: RawGeoResponse, ip: string): VisitorGeo {
	return {
		ip,
		country: raw.country ?? '',
		countryCode: (raw.countryCode ?? raw.country_code ?? '').toUpperCase(),
		region: raw.region ?? raw.prov ?? '',
		city: raw.city ?? '',
		lat: toCoordinate(raw.latitude ?? raw.lat),
		lng: toCoordinate(raw.longitude ?? raw.lng),
	}
}

/** 国内访客展示「省份 + 城市」，去掉省市重名造成的重复；海外只给国家名 */
export function getRegionText(geo: VisitorGeo) {
	const { country, countryCode, region, city } = geo

	if (countryCode !== 'CN')
		return country

	const parts = [region, city].filter((part, index, list) => part && list.indexOf(part) === index)
	// 省市之间留空格，避免「江苏省南京」这种连读
	return parts.length ? parts.join(' ') : '中国'
}

/** 只对公网 IP 发地理请求，内网 / 回环地址直接跳过 */
export function isPublicIp(ip: string) {
	if (!ip)
		return false
	if (/^(?:\d{1,3}\.){3}\d{1,3}$/.test(ip)) {
		const [first = 0, second = 0] = ip.split('.').map(Number)
		if (first === 10 || first === 127 || (first === 192 && second === 168))
			return false
		if (first === 172 && second >= 16 && second <= 31)
			return false
		if (first === 169 && second === 254)
			return false
	}
	return ip !== '::1' && !ip.startsWith('fe80:')
}
