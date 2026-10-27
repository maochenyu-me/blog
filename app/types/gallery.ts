export type GalleryImage = string | {
	url: string
	title?: string
	width?: number
	height?: number
}

export interface GalleryFolder {
	id: string
	name: string
	cover?: string
	images: GalleryImage[]
	createdAt?: string
	custom?: boolean
}
