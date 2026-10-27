<script setup lang="ts">
import type { GalleryFolder, GalleryImage } from '~/types/gallery'
import { shuffle } from 'es-toolkit/array'
import galleryBase from '~/gallery'

const router = useRouter()
const folderQuery = useHydratedQuery('c', useRouteQuery('c', ''))

const title = '相册'
const description = '用镜头记录生活。'
const image = '/img/banner/1.jpg'
useSeoMeta({ title, description, ogImage: image })

const mounted = useMounted()

function getImageUrl(image?: GalleryImage): string {
	if (!image)
		return ''
	return typeof image === 'string' ? image : image.url
}

function getStableIndex(seed: string, length: number): number {
	let hash = 0
	for (let i = 0; i < seed.length; i += 1)
		hash = (hash * 31 + seed.charCodeAt(i)) >>> 0
	return hash % length
}

function pickStableImage(images: GalleryImage[], seed: string): string | undefined {
	if (!images.length)
		return undefined
	const index = getStableIndex(seed, images.length)
	return getImageUrl(images[index]) || undefined
}

const gallery: GalleryFolder[] = galleryBase.map(folder => ({
	...folder,
	cover: pickStableImage(folder.images, folder.id),
}))

function resolveFolderId(value?: string | string[]): string {
	const target = (Array.isArray(value) ? value[0] : value) || ''
	if (!target)
		return ''
	return gallery.some(folder => folder.id === target) ? target : ''
}

const activeFolderId = computed(() => resolveFolderId(folderQuery.value))
const activeFolder = computed(() => gallery.find(folder => folder.id === activeFolderId.value))
const showingFolder = computed(() => Boolean(activeFolder.value))
const shuffledImages = ref<GalleryImage[]>([])

function getImageAlt(image: GalleryImage, index: number): string {
	if (typeof image !== 'string' && image.title)
		return image.title
	return `${activeFolder.value?.name || '相册'}-${index + 1}`
}

function getFolderPath(id: string): { path: string, query: { c: string } } {
	return { path: '/gallery', query: { c: id } }
}

watch([activeFolderId, mounted], () => {
	const images = activeFolder.value?.images || []
	shuffledImages.value = mounted.value ? shuffle(images) : [...images]
}, { immediate: true })

function backToFolders(): void {
	router.replace('/gallery')
}
</script>

<template>
<template #aside>
	<WidgetBlogStats />
	<WidgetBlogTech />
	<WidgetBlogLog />
</template>

<ZPageBanner :title :description :image />

<div class="gallery-page" data-transition-enter>
	<div v-if="!showingFolder" class="folder-panel">
		<header class="panel-head">
			<h2>分类</h2>
			<span>共 {{ gallery.length }} 个</span>
		</header>

		<div class="folder-grid">
			<NuxtLink
				v-for="folder in gallery"
				:key="folder.id"
				class="folder-card"
				:to="getFolderPath(folder.id)"
			>
				<div class="folder-cover">
					<NuxtImg
						class="cover-image"
						:src="folder.cover || getImageUrl(folder.images[0])"
						:alt="folder.name"
						loading="lazy"
					/>
				</div>

				<div class="folder-meta">
					<h3>{{ folder.name }}</h3>
					<p class="folder-count">
						{{ folder.images.length }} 张图片
					</p>
				</div>
			</NuxtLink>
		</div>
	</div>

	<div v-else class="images-panel">
		<header class="images-head">
			<button class="back-btn" @click="backToFolders">
				<Icon name="tabler:chevron-left" />
				返回分类
			</button>

			<div class="head-main">
				<h2>{{ activeFolder?.name }}</h2>
				<span>共 {{ shuffledImages.length }} 张</span>
			</div>
		</header>

		<div v-if="shuffledImages.length" class="image-grid">
			<article
				v-for="(pic, index) in shuffledImages"
				:key="`${getImageUrl(pic)}-${index}`"
				class="image-card"
			>
				<Pic
					class="image"
					:src="getImageUrl(pic)"
					:alt="getImageAlt(pic, index)"
				/>
			</article>
		</div>

		<p v-else class="empty-tip">
			当前分类暂无图片。
		</p>
	</div>
</div>
</template>

<style scoped>
.gallery-page {
	margin: 1rem;
	animation: float-in var(--motion-fade-duration) var(--motion-easing) backwards;
}

.folder-panel,
.images-panel {
	padding: 1rem;
	border-radius: 8px;
}

.panel-head {
	display: flex;
	align-items: baseline;
	justify-content: space-between;
	gap: 1rem;
	margin-bottom: 1rem;

	h2 {
		margin: 0;
		font: inherit;
		font-weight: 700;
	}

	span {
		font-size: 0.85rem;
		color: var(--c-text-3);
	}
}

.folder-grid {
	display: grid;
	grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
	gap: 0.8rem;

	@media (max-width: 768px) {
		grid-template-columns: 1fr;
	}
}

.folder-card {
	display: block;
	overflow: hidden;
	border-radius: 0.6rem;
	box-shadow: 0 0 0 1px var(--c-bg-soft);
	text-align: left;
	text-decoration: none;
	color: inherit;
	transition: transform var(--motion-fade-duration), box-shadow var(--motion-fade-duration);

	&:hover {
		transform: translateY(-2px);
	}

	.folder-cover {
		position: relative;
		overflow: hidden;
		aspect-ratio: 16 / 9;
	}

	.cover-image {
		display: block;
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.folder-meta {
		padding: 0.65rem 0.75rem;
		background-color: var(--ld-bg-card);

		h3 {
			margin: 0;
			font-size: 0.95rem;
		}

		.folder-count {
			margin: 0.25rem 0 0;
			font-size: 0.82rem;
			color: var(--c-text-3);
		}
	}
}

.images-head {
	display: flex;
	align-items: center;
	justify-content: space-between;
	gap: 0.8rem;
	margin-bottom: 1rem;

	@media (max-width: 768px) {
		flex-wrap: wrap;
	}

	.head-main {
		display: flex;
		align-items: baseline;
		gap: 0.6rem;
		margin-inline-end: auto;

		h2 {
			color: var(--c-text-3);
		}
	}
}

.back-btn {
	display: inline-flex;
	align-items: center;
	gap: 0.25rem;
	padding: 0.3rem 0.7rem;
	border-radius: 0.5rem;
	background-color: var(--c-bg-2);
	font-size: 0.85rem;
	color: var(--c-text-2);
	transition: background-color var(--motion-fade-duration), color var(--motion-fade-duration);

	&:hover {
		background-color: var(--c-bg-3);
		color: var(--c-text);
	}
}

.image-grid {
	column-count: 3;
	column-gap: 0.8rem;

	@media (max-width: 768px) {
		column-count: 2;
	}
}

.image-card {
	overflow: hidden;
	margin-bottom: 0.8rem;
	border-radius: 0.6rem;
	box-shadow: 0 0 0 1px var(--c-bg-soft);
	transition: transform var(--motion-fade-duration), box-shadow var(--motion-fade-duration);
	break-inside: avoid;

	&:hover {
		transform: translateY(-2px);
	}

	.image {
		display: block;
		overflow: hidden;
		line-height: 0;

		:deep(img) {
			display: block;
			width: 100%;
			height: auto;
		}
	}
}

.empty-tip {
	margin: 2rem 0;
	text-align: center;
	color: var(--c-text-3);
}
</style>
