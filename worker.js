addEventListener('fetch', e => e.respondWith(handle(e.request)));

async handle(req){
  const url = new URL(req.url).searchParams.get('url');
  if(!url) return new Response('need url');
  const h = new Headers();
  h.set('User-Agent','Mozilla/5.0');
  h.set('Referer','https://www.bilibili.com/');
  const res = await fetch(url,{headers:h});
  const body = res.body;
  const headers = new Headers(res.headers);
  headers.set('Access-Control-Allow-Origin','*');
  return new Response(body,{status:res.status,headers});
}
