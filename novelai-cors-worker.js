/*
 * 周纪·千年天下 —— NovelAI 生图 CORS 中转（Cloudflare Worker）
 * 作用：浏览器无法直接调用 NovelAI 官网（跨域被拦），此 Worker 替浏览器转发请求、加上 CORS 头。
 * 特点：Cloudflare Worker 流量不计费（免费额度按请求数，每天 10 万次），不消耗你的 Vercel 带宽。
 *
 * 部署（约 2 分钟）：
 *   1. 登录 https://dash.cloudflare.com → 左侧 Workers & Pages → Create → Create Worker。
 *   2. 起个名字（如 nai-proxy）→ Deploy → 点 Edit code。
 *   3. 把本文件全部内容粘贴进去，覆盖默认代码 → Deploy。
 *   4. 复制它的网址（形如 https://nai-proxy.你的名字.workers.dev）。
 *   5. 回游戏「设置 → 图·生图」：接口风格选「NovelAI 官方」，
 *      接口地址填这个 Worker 网址，密钥填你的 NovelAI 持久 token（NAI 官网
 *      账户设置里「Get Persistent API Token」获取），模型点选即可。
 *   6. 保存 → 测试生图。之后每幕自动出图（或点正文下「✦ 绘此幕」）。
 *
 * 说明：Worker 只做无状态转发，不存储、不记录你的 token 与图片；token 仅在转发那一刻
 *       经过一次。返回的 zip 由游戏内置解压成 PNG，存进你本机浏览器图库。
 */
const UPSTREAM = 'https://image.novelai.net';

export default {
  async fetch(request) {
    const cors = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'authorization, content-type',
      'Access-Control-Max-Age': '86400',
    };
    if (request.method === 'OPTIONS') return new Response(null, { headers: cors });
    if (request.method !== 'POST') {
      return new Response('NovelAI proxy is running. Point the game here.', { headers: cors });
    }
    const url = new URL(request.url);
    try {
      const upstream = await fetch(UPSTREAM + url.pathname + url.search, {
        method: 'POST',
        headers: {
          'authorization': request.headers.get('authorization') || '',
          'content-type': request.headers.get('content-type') || 'application/json',
          'accept': 'application/x-zip-compressed',
        },
        body: await request.arrayBuffer(),
      });
      // 整体读入后以全新响应头返回：不再转发上游的 content-length / content-encoding，
      // 避免与运行时解压后的实际字节数不符导致浏览器中断下载（表现为 Failed to fetch）。
      const buf = await upstream.arrayBuffer();
      return new Response(buf, {
        status: upstream.status,
        headers: { ...cors, 'content-type': upstream.headers.get('content-type') || 'application/octet-stream' },
      });
    } catch (e) {
      // 任何转发异常也带 CORS 头返回，让游戏能读到真实错误而不是 Failed to fetch
      return new Response('proxy error: ' + ((e && e.message) || String(e)), { status: 502, headers: cors });
    }
  },
};
