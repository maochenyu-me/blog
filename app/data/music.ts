import type { MusicPlaylist } from '~/types/music'

/**
 * 本地歌单数据 —— 播放器的唯一数据源
 *
 * 文件放哪（都走站点路径，不需要 import）：
 *   public/music/songs/   音频，如 /music/songs/example.mp3
 *   public/music/lrc/     歌词，如 /music/lrc/example.lrc（UTF-8 编码）
 *   public/music/covers/  封面，如 /music/covers/example.webp（方图，建议 ≤ 300×300）
 *
 * 说明：
 *   - 音频/封面也可以写站外绝对 URL（如对象存储），只要该地址允许浏览器直接取用。
 *   - `src` 必填；`lrc` 可以填 .lrc 路径，也可以直接把 LRC 文本贴进去。
 *   - 歌单顺序即播放顺序，第一个歌单是默认歌单。
 *   - 一个文件都不放时播放器显示空状态，不会报错，也不会发任何音频请求。
 *   - Cloudflare Pages 单文件上限 25MB，音频不要超过这个体量。
 */

// 想开箱就有声音？复制下面这段取消注释，把文件丢进对应目录即可。
// const example: MusicPlaylist = {
// 	id: 'example',
// 	name: '示例歌单',
// 	desc: '放几首常听的',
// 	songs: [
// 		{
// 			id: 'example-1',
// 			title: '曲名',
// 			artist: '艺人',
// 			src: '/music/songs/example.mp3',
// 			lrc: '/music/lrc/example.lrc',
// 			cover: '/music/covers/example.webp',
// 		},
// 	],
// }

export const musicPlaylists: MusicPlaylist[] = []
