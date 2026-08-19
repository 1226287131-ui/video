# video-v1-studio

视频生成工作台。

特点：

- 只展示请求参数、任务状态和返回参数
- 默认按远程结果链接工作，不把生成视频落到本地服务器磁盘
- 可直接部署到静态站点或前端服务器
- 支持图片、音频、视频参考文件临时上传，过期后自动清理
- 支持 `grok-imagine-1.5-video` 的专用 multipart 创建、轮询和鉴权播放链路

## 开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

## 部署说明

默认 Base URL 是 `https://api.kkone.vip`，可通过 `VITE_API_BASE_URL` 覆盖。legacy 视频模型使用 `/v1/video/generations`；`grok-imagine-1.5-video`、`MiniMax-H3-933-1440P-GF`、`video-v2` 系列和 `video-v3` 系列使用 `/v1/videos`、`/v1/videos/{task_id}` 及可用的 `/v1/videos/{task_id}/content`。Grok 创建任务固定使用 multipart 的 `model`、`prompt`、`aspect_ratio`、`seconds`、`resolution` 字段；时长为 1 到 15 秒，画幅支持 `16:9`、`9:16`、`1:1`、`4:3`、`3:4`、`2:3`、`3:2`。图生视频会按上传顺序重复附加真实文件字段 `input_reference`，不会发送旧协议中的 `size`、`quality`、图片 URL 或 `reference_images` JSON 字段。

`MiniMax-H3-933-1440P-GF` 使用 `/v1/videos` 异步接口。网页请求只发送 `model`、`prompt`、`seconds`（4-15 秒）、`size` 和已选择的参考素材；`audio`、`prompt_enhance`、`clarity`、`megapixels`、`metadata.multiple` 等高级字段一律省略，由上游使用默认值。参考素材使用公网 URL：`images` 最多 9 张、`reference_videos` 最多 3 个、`reference_audios` 最多 3 个；相同 URL 或文件名会去重。H3 Prompt 支持 `@参考图1`、`@参考视频1`、`@参考音频1`，提交前会将其编译为对应数组下标的明确说明。前端会先把用户上传的文件暂存到项目域名，过期后由上传服务自动清理，不把视频文件落到站点目录。

`video-v3`、`seedance-2.5`、`seedance2.5`、`sd-2.5`、`sd2.5` 会按 SD2.5 OpenAI Video 协议使用 `/v1/videos` 创建和查询任务。前端始终提交顶层 `prompt`，并按需附带 `images`（最多 30）、`videos`（最多 10）、`audios`（最多 10）、`duration`（4-29 的整数）、`ratio`（`16:9`、`1:1`、`9:16`）、`resolution`（默认 `480p`，可选 `720p`）、`generate_audio`、`seed`（0-4294967295）、`bypass_face_check`、`grid_strength`（0.01-0.5）、`size`、`start_frame_url`、`end_frame_url`。首帧或尾帧 URL 不能与图片参考同时提交，但可与参考视频或音频组合。参考文件会先经项目域名转为临时公网 URL；同类重复 URL 会在提交前去重。

前端只负责提交任务、轮询状态和播放远程视频。Grok 图生视频只接受本地上传的真实图片文件，最多 7 张；只有在当前 Grok 模型下上传的文件会进入其 `input_reference` 字段，其他模型残留的素材不会被带入。同一个临时上传 ID 即使意外出现在素材列表多次，也只会进入请求体一次。两张及以上参考图时，本站页面仅允许选择 `480p` 或 `720p`，单图和文生视频仍可选择 `1080p`。参考图数量、文件格式和请求体大小以实际渠道返回为准。Grok 的 `/content` 接口需要 Bearer 鉴权，因此视频会临时加载到当前浏览器会话，不会落到本站服务器磁盘。
真正的视频文件应由上游或对象存储托管，站点只保存链接，不保存 mp4 到你的服务器磁盘。

## 临时图片上传服务

除 Grok 的原生 multipart 图生视频外，图生视频及多媒体参考需要先变成公网 URL，上游才能读取。项目提供了一个无数据库的临时上传服务，所有文件以流式方式写入临时目录：图片（JPG/PNG/WebP）单张最多 20MB，音频（MP3/WAV/M4A/AAC/OGG）单个最多 50MB，视频（MP4/WebM/MOV）单个最多 200MB，每次请求最多 15 个文件。Grok 图片会逐张上传，因此可分批累积多张；20MB 和 JPG/PNG/WebP 是本站临时上传服务限制，不是 Grok 上游的承诺。前端对 `video-v2`、`video-v2-fast` 的参考图放宽到 15MB，其他图片上传入口仍按各自的 12MB 校验；服务端图片总上限保持不低于 15MB。文件默认保留 12 小时，服务每 12 小时扫描并清理一次过期文件；提交成功或失败后不会立即删除，用户可以直接复用参考文件重试。

```bash
npm run upload-server
npm run dev
```

部署到项目域名时，把域名的 `/api/uploads` 和 `/api/video-proxy` 反向代理到上传服务（默认 `127.0.0.1:8787`），并设置 `PUBLIC_BASE_URL=https://你的项目域名`。视频代理只做流式转发，不落盘；不要把 `server/tmp-uploads` 暴露为目录，也不要把临时文件目录加入静态站点根目录。Nginx 的上传上限应至少保留到 `210m`，以容纳单个 200MB 视频及 multipart 开销。

Nginx location 示例见 `deploy/nginx-video-v1.conf`。反代配置生效后，启动 `npm run upload-server`，再部署 `dist` 静态文件。
