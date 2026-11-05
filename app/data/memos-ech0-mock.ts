/**
 * 仅开发期使用的 Ech0 造数据（`?memos-mock=1`）。
 *
 * 线上实例里 MUSIC / VIDEO / TWEET 三类扩展与附件都为 0，无法真实验收这四条渲染链路，
 * 所以这里准备一份覆盖全部卡片类型的数据。
 *
 * 该文件只被 `useMemosEch0.ts` 里的 `import.meta.dev` 分支**动态 import**，
 * 生产构建不会把这段数据打进产物。
 */
import type { Ech0Echo, Ech0Page } from '~/types/memos-ech0'

const author = { username: 'kemiao', user_id: 'mock-user', layout: 'waterfall', private: false }

export const mockEch0Items: Ech0Echo[] = [
	{
		...author,
		id: 'mock-01-longform',
		content: [
			'## 一条长说说',
			'',
			'用来验证 **Markdown 排版**：*斜体*、`行内代码`、[外链](https://blog.kemeow.top)、~~删除线~~。',
			'',
			'- 列表项一',
			'- 列表项二',
			'',
			'> 引用一段话，看看左边框和缩进。',
			'',
			'| 项目 | 值 |',
			'| --- | --- |',
			'| 渲染器 | markdown-it |',
			'| 安全策略 | html:false |',
			'',
			'```ts',
			'const hello = (name: string) => \'你好，\' + name',
			'```',
			'',
			'![示例图](https://m.081531.xyz/api/files/images/019f60e3_1784037040_c23f600b.png)',
		].join('\n'),
		tags: [{ id: 't1', name: '测试' }, { id: 't2', name: 'Markdown' }],
		fav_count: 12,
		created_at: 1793600000,
	},
	{
		...author,
		id: 'mock-02-music',
		content: '这首歌单曲循环一整天了。',
		extension: {
			id: 'ext-02',
			echo_id: 'mock-02-music',
			type: 'MUSIC',
			payload: { url: 'https://music.163.com/#/song?id=1901371647' },
		},
		tags: [{ id: 't3', name: '音乐' }],
		fav_count: 3,
		created_at: 1793500000,
	},
	{
		...author,
		id: 'mock-03-video',
		content: '这个视频讲得挺清楚。',
		extension: {
			id: 'ext-03',
			echo_id: 'mock-03-video',
			type: 'VIDEO',
			payload: { videoId: 'BV1GJ411x7h7' },
		},
		fav_count: 0,
		created_at: 1793400000,
	},
	{
		...author,
		id: 'mock-04-tweet',
		content: '转发一条推文。',
		extension: {
			id: 'ext-04',
			echo_id: 'mock-04-tweet',
			type: 'TWEET',
			payload: {
				url: 'https://x.com/elonmusk/status/1800000000000000000',
				username: 'elonmusk',
				statusId: '1800000000000000000',
			},
		},
		fav_count: 1,
		created_at: 1793300000,
	},
	{
		...author,
		id: 'mock-05-location',
		content: '在仙林吃了顿饭。',
		extension: {
			id: 'ext-05',
			echo_id: 'mock-05-location',
			type: 'LOCATION',
			payload: {
				placeholder: '仙林街道, 栖霞区, 南京市, 江苏省, 210033, 中国',
				latitude: 31.83396974349442,
				longitude: 120.46346300000002,
			},
		},
		fav_count: 0,
		created_at: 1793200000,
	},
	{
		...author,
		id: 'mock-06-github',
		content: '在用这个项目。',
		extension: {
			id: 'ext-06',
			echo_id: 'mock-06-github',
			type: 'GITHUBPROJ',
			payload: { repoUrl: 'https://github.com/lin-snow/Ech0' },
		},
		fav_count: 5,
		created_at: 1793100000,
	},
	{
		...author,
		id: 'mock-07-website',
		content: '自荐一个站点。',
		extension: {
			id: 'ext-07',
			echo_id: 'mock-07-website',
			type: 'WEBSITE',
			payload: { title: '塔罗会', site: 'https://mm.081531.xyz' },
		},
		fav_count: 0,
		created_at: 1793000000,
	},
	{
		...author,
		id: 'mock-08-files',
		content: '四个附件都挂上来：图片、音频、视频、压缩包。',
		echo_files: [
			{
				id: 'ef-1',
				echo_id: 'mock-08-files',
				file_id: 'f-1',
				sort_order: 1,
				file: {
					id: 'f-1',
					key: 'images/demo.png',
					storage_type: 'local',
					url: '/api/files/images/019f60e3_1784037040_c23f600b.png',
					name: 'demo.png',
					content_type: 'image/png',
					category: 'image',
					width: 512,
					height: 512,
					size: 182_400,
				},
			},
			{
				id: 'ef-2',
				echo_id: 'mock-08-files',
				file_id: 'f-2',
				sort_order: 2,
				file: {
					id: 'f-2',
					key: 'videos/demo.mp4',
					storage_type: 'external',
					url: 'https://www.w3schools.com/html/mov_bbb.mp4',
					name: 'demo.mp4',
					content_type: 'video/mp4',
					category: 'video',
					size: 788_493,
				},
			},
			{
				id: 'ef-3',
				echo_id: 'mock-08-files',
				file_id: 'f-3',
				sort_order: 3,
				file: {
					id: 'f-3',
					key: 'audios/demo.mp3',
					storage_type: 'external',
					url: 'https://www.w3schools.com/html/horse.mp3',
					name: 'demo.mp3',
					content_type: 'audio/mpeg',
					category: 'audio',
					size: 24_000,
				},
			},
			{
				id: 'ef-4',
				echo_id: 'mock-08-files',
				file_id: 'f-4',
				sort_order: 4,
				file: {
					id: 'f-4',
					key: 'documents/demo.zip',
					storage_type: 'external',
					url: 'https://www.w3schools.com/html/mov_bbb.mp4',
					name: '素材包.zip',
					content_type: 'application/zip',
					category: 'file',
					size: 1_048_576,
				},
			},
		],
		tags: [{ id: 't4', name: '附件' }],
		fav_count: 0,
		created_at: 1792900000,
	},
]

export const mockEch0Page: Ech0Page<Ech0Echo> = {
	total: mockEch0Items.length,
	items: mockEch0Items,
}
