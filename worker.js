// Cloudflare Worker 代理脚本 - Bilibili API Proxy
// 支持：登录验证、视频推荐、搜索、播放地址获取、用户历史等

export default {
  async fetch(request, env, ctx) {
    // CORS 配置
    const corsHeaders = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, Cookie, SESSDATA',
      'Access-Control-Allow-Credentials': 'true',
    };

    // 处理预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;
    const params = url.searchParams;

    try {
      let targetUrl = '';
      let options = {
        method: request.method,
        headers: {
          'User-Agent': request.headers.get('User-Agent') || 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://www.bilibili.com',
          'Origin': 'https://www.bilibili.com',
        }
      };

      // 从请求头或查询参数获取 SESSDATA
      const sessdata = request.headers.get('SESSDATA') || params.get('SESSDATA') || '';
      if (sessdata) {
        options.headers['Cookie'] = `SESSDATA=${sessdata}`;
      }

      // API 路由映射
      switch (path) {
        // 1. 登录验证 - 获取用户信息
        case '/api/nav':
          targetUrl = 'https://api.bilibili.com/x/web-interface/nav';
          break;

        // 2. 获取二维码（扫码登录）
        case '/api/qrcode/generate':
          targetUrl = 'https://passport.bilibili.com/x/passport-login/web/qrcode/generate';
          break;

        // 3. 检查二维码状态
        case '/api/qrcode/poll':
          const qrcodeKey = params.get('qrcode_key');
          targetUrl = `https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key=${qrcodeKey}`;
          break;

        // 4. 推荐视频（首页）
        case '/api/recommend':
          const idx = params.get('idx') || '0';
          targetUrl = `https://api.bilibili.com/x/web-interface/index/top/rcmd?ps=20&idx=${idx}`;
          break;

        // 5. 分区视频
        case '/api/region':
          const rid = params.get('rid') || '0';
          const pn = params.get('pn') || '1';
          targetUrl = `https://api.bilibili.com/x/web-interface/dynamic/region?ps=20&rid=${rid}&pn=${pn}`;
          break;

        // 6. 搜索视频
        case '/api/search':
          const keyword = encodeURIComponent(params.get('keyword') || '');
          const searchType = params.get('search_type') || 'video';
          const page = params.get('page') || '1';
          targetUrl = `https://api.bilibili.com/x/web-interface/search/type?keyword=${keyword}&search_type=${searchType}&page=${page}`;
          break;

        // 7. 视频详情
        case '/api/video/detail':
          const bvid = params.get('bvid');
          if (!bvid) throw new Error('缺少 bvid 参数');
          targetUrl = `https://api.bilibili.com/x/web-interface/view?bvid=${bvid}`;
          break;

        // 8. 播放地址（需要登录）
        case '/api/playurl':
          const cid = params.get('cid');
          const vid = params.get('bvid') || params.get('avid');
          const qn = params.get('qn') || '80'; // 清晰度
          if (!cid || !vid) throw new Error('缺少必要参数');
          targetUrl = `https://api.bilibili.com/x/player/playurl?bvid=${vid}&cid=${cid}&qn=${qn}&fnver=0&fnval=16&fourk=1`;
          break;

        // 9. 获取历史记录
        case '/api/history':
          targetUrl = 'https://api.bilibili.com/x/web-interface/history/cursor?ps=20';
          break;

        // 10. 热门视频
        case '/api/popular':
          targetUrl = 'https://api.bilibili.com/x/web-interface/popular?ps=20';
          break;

        // 11. 排行榜
        case '/api/ranking':
          const rId = params.get('rid') || '0';
          targetUrl = `https://api.bilibili.com/x/web-interface/ranking/v2?rid=${rId}&type=all`;
          break;

        // 12. 视频弹幕
        case '/api/danmaku':
          const dCid = params.get('cid');
          if (!dCid) throw new Error('缺少 cid 参数');
          targetUrl = `https://api.bilibili.com/x/v1/dm/list.so?oid=${dCid}`;
          // 弹幕需要特殊处理XML
          const dmRes = await fetch(targetUrl, options);
          const dmText = await dmRes.text();
          return new Response(dmText, {
            headers: { ...corsHeaders, 'Content-Type': 'application/xml' }
          });

        // 13. 点赞/投币/收藏（需要POST和登录）
        case '/api/like':
        case '/api/coin':
        case '/api/fav':
          return handleAction(path, params, options, corsHeaders);

        // 14. 获取关注列表
        case '/api/followings':
          const vmid = params.get('vmid');
          const fp = params.get('pn') || '1';
          targetUrl = `https://api.bilibili.com/x/relation/followings?vmid=${vmid}&pn=${fp}&ps=20`;
          break;

        default:
          return new Response(JSON.stringify({ 
            error: '未知接口', 
            available: [
              '/api/nav - 用户信息',
              '/api/recommend - 推荐视频',
              '/api/region?rid=1 - 分区视频',
              '/api/search?keyword=xxx - 搜索',
              '/api/video/detail?bvid=xxx - 视频详情',
              '/api/playurl?bvid=xxx&cid=xxx - 播放地址',
              '/api/history - 历史记录',
              '/api/popular - 热门视频'
            ]
          }), {
            status: 404,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
      }

      // 发送请求到B站
      const response = await fetch(targetUrl, options);
      const data = await response.json();

      // 返回JSON数据
      return new Response(JSON.stringify(data), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });

    } catch (error) {
      return new Response(JSON.stringify({ 
        error: error.message,
        code: -1 
      }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      });
    }
  }
};

// 处理点赞、投币等操作
async function handleAction(path, params, options, corsHeaders) {
  const bvid = params.get('bvid');
  const csrf = params.get('csrf') || '';
  
  if (!bvid) {
    return new Response(JSON.stringify({ error: '缺少 bvid' }), {
      headers: corsHeaders
    });
  }

  let apiUrl = '';
  let body = '';

  switch (path) {
    case '/api/like':
      apiUrl = 'https://api.bilibili.com/x/web-interface/archive/like';
      body = `bvid=${bvid}&like=1&csrf=${csrf}`;
      break;
    case '/api/coin':
      const multiply = params.get('multiply') || '1';
      apiUrl = 'https://api.bilibili.com/x/web-interface/coin/add';
      body = `bvid=${bvid}&multiply=${multiply}&csrf=${csrf}`;
      break;
    case '/api/fav':
      const addMediaIds = params.get('add_media_ids') || '';
      apiUrl = 'https://api.bilibili.com/x/v3/fav/resource/deal';
      body = `rid=${bvid}&type=2&add_media_ids=${addMediaIds}&csrf=${csrf}`;
      break;
  }

  const res = await fetch(apiUrl, {
    ...options,
    method: 'POST',
    headers: {
      ...options.headers,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: body
  });

  const data = await res.json();
  return new Response(JSON.stringify(data), {
    headers: corsHeaders
  });
                              }
