/* 全局常量 */
const PROXY = 'https://your-worker.your-subdomain.workers.dev'; // 反向代理地址
const LOGIN_KEY = 'bili-lite-token';

/* 工具函数 */
const $ = s => document.querySelector(s);
const get = (url,headers={}) => fetch(PROXY + '?url=' + encodeURIComponent(url),{headers}).then(r=>r.json());

/* 页面元素 */
const loginSec = $('#login-section');
const videoSec = $('#video-section');
const qrImg   = $('#qr');
const qrTip   = $('#qr-tip');
const userBox = $('#user');
const bvInput = $('#bv');
const loadBtn = $('#load');
const player  = $('#player');

/* 1. 登录流程 */
async function login(){
  // 1.1 申请二维码
  const {data:{url,qrcode_key}} = await get('https://passport.bilibili.com/x/passport-login/web/qrcode/generate');
  qrImg.src = url;
  qrTip.textContent = '请打开 哔哩哔哩 App 扫码';

  // 1.2 轮询扫码结果
  const timer = setInterval(async ()=>{
    const {data:{code:message},data} = await get('https://passport.bilibili.com/x/passport-login/web/qrcode/poll?qrcode_key='+qrcode_key);
    if(data.code===0){          // 成功
      clearInterval(timer);
      const cookie = data.refresh_token; // 简化：实际应把完整 Cookie 存下来
      localStorage.setItem(LOGIN_KEY, cookie);
      await loadUserInfo();
      loginSec.hidden = true;
      videoSec.hidden = false;
    }
    if(message===86038){        // 二维码过期
      clearInterval(timer);
      qrTip.textContent='二维码已过期，刷新页面重试';
    }
  },1500);
}

/* 2. 拉取用户信息 */
async function loadUserInfo(){
  const {data} = await get('https://api.bilibili.com/x/web-interface/nav');
  if(data.isLogin){
    userBox.innerHTML = `
      <img src="${data.face}" />
      <span>${data.uname}</span>`;
  }
}

/* 3. 根据 BV 号取直链并播放 */
loadBtn.onclick = async ()=>{
  let bv = bvInput.value.trim();
  if(!bv) return;
  if(bv.startsWith('http')) bv = bv.match(/BV[a-zA-Z0-9]+/)[0];
  const cidResp = await get(`https://api.bilibili.com/x/web-interface/view?bvid=${bv}`);
  const cid = cidResp.data.cid;
  const playResp = await get(`https://api.bilibili.com/x/player/playurl?bvid=${bv}&cid=${cid}&qn=64&type=&otype=json`);
  const url = playResp.data.durl[0].url;
  player.src = PROXY + '?url=' + encodeURIComponent(url) + '&referer=https://www.bilibili.com/';
  player.play();
};

/* 初始化 */
window.onload = ()=>{
  if(localStorage.getItem(LOGIN_KEY)){
    loginSec.hidden = true;
    videoSec.hidden = false;
    loadUserInfo();
  }else{
    login();
  }
};
