// 前台購物網站（單頁應用，網址由 History API 切換）
import { api, auth, authMessage } from '/shared/fb.js';
import { esc, money, renderBlocks, mount, menuHTML, productCard } from '/shared/blocks.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const main = $('#main');
const S = { init: null, customer: null, needProfile: false, user: null };
const date = (t) => new Date(t).toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

/* ---------- 購物車（存在這台裝置） ---------- */
const Cart = {
  get() { try { return { items: [], addons: [], coupon: '', points: 0, ...JSON.parse(localStorage.getItem('cart') || '{}') }; } catch { return { items: [], addons: [], coupon: '', points: 0 }; } },
  set(c) { try { localStorage.setItem('cart', JSON.stringify(c)); } catch {} Cart.badge(); },
  add(pid, vkey, qty) {
    const c = Cart.get();
    const hit = c.items.find((i) => i.pid === pid && i.vkey === vkey);
    if (hit) hit.qty += qty; else c.items.push({ pid, vkey, qty });
    Cart.set(c);
  },
  count() { const c = Cart.get(); return c.items.reduce((a, i) => a + i.qty, 0) + c.addons.reduce((a, i) => a + i.qty, 0); },
  badge() { const n = Cart.count(); const el = $('#cartCount'); el.hidden = !n; el.textContent = n > 99 ? '99+' : n; },
  clear() { Cart.set({ items: [], addons: [], coupon: '', points: 0 }); },
};

/* ---------- 小工具 ---------- */
let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('on'), 2600);
}
function modal(html, cls = '') {
  const m = $('#modal'), box = $('#modalBox');
  box.className = 'modal-box ' + cls;
  box.innerHTML = `<button class="icon-btn modal-x" data-close aria-label="關閉"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg></button>` + html;
  m.hidden = false;
  return box;
}
const closeModal = () => { $('#modal').hidden = true; };
$('#modal').addEventListener('click', (e) => { if (e.target.closest('[data-close]')) closeModal(); });
$('#drawer').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target.closest('a')) $('#drawer').hidden = true; });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeModal(); $('#drawer').hidden = true; } });

async function busy(btn, fn) {
  if (btn) { btn.disabled = true; btn.dataset.t = btn.textContent; btn.textContent = '處理中…'; }
  try { return await fn(); } catch (e) { toast(e.message); throw e; } finally { if (btn) { btn.disabled = false; btn.textContent = btn.dataset.t; } }
}

function setTitle(t) { document.title = t ? `${t}｜${S.init.store.name}` : S.init.store.name; }

const qtyBox = (v, max = 999, cls = '') => `<span class="qty ${cls}"><button type="button" data-q="-1" aria-label="減少">−</button><input type="number" inputmode="numeric" min="1" max="${max}" value="${v}" aria-label="數量"><button type="button" data-q="1" aria-label="增加">+</button></span>`;
function bindQty(root, onChange) {
  $$('.qty', root).forEach((q) => {
    const input = $('input', q);
    const clamp = () => { input.value = Math.max(1, Math.min(+input.max || 999, Math.round(+input.value || 1))); onChange?.(q, +input.value); };
    $$('button', q).forEach((b) => b.addEventListener('click', () => { input.value = +input.value + +b.dataset.q; clamp(); }));
    input.addEventListener('change', clamp);
  });
}

/* ---------- 外觀 ---------- */
function applyTheme() {
  const { theme, store, third } = S.init;
  const c = theme.colors;
  const r = document.documentElement.style;
  r.setProperty('--c-bg', c.bg); r.setProperty('--c-menu-bg', c.menuBg); r.setProperty('--c-menu-text', c.menuText); r.setProperty('--c-text', c.text);
  r.setProperty('--c-primary', c.primary); r.setProperty('--c-line', c.line); r.setProperty('--c-primary-text', c.primaryText);
  r.setProperty('--content-w', (theme.width || 1200) + 'px');
  document.body.classList.add('r-' + (theme.radius || 'soft'));
  if (theme.listButton === 'fill') document.body.classList.add('list-fill');
  if (theme.bgImage) { document.body.classList.add('bg-img'); if (!theme.bgRepeat) document.body.classList.add('bg-cover'); r.setProperty('--bg-img', `url("${theme.bgImage}")`); }
  if (store.favicon) $('link[rel=icon]').href = store.favicon;
  $('#logo').innerHTML = store.logo ? `<picture>${store.logoMobile ? `<source media="(max-width:900px)" srcset="${esc(store.logoMobile)}">` : ''}<img src="${esc(store.logo)}" alt="${esc(store.name)}"></picture>` : esc(store.name);
  const menus = S.init.menus;
  $('#topNav').innerHTML = menuHTML(menus.top || []);
  if (theme.layout === 'top-side' && menus.side?.length) { $('#layout').classList.add('with-side'); $('#sideNav').innerHTML = menuHTML(menus.side); mount($('#sideNav')); }
  const social = [['LINE', third.lineUrl], ['Facebook', third.fbUrl], ['Instagram', third.igUrl]].filter((x) => x[1]);
  $('#foot').innerHTML = `<div class="foot-in">${menus.footer?.length ? menuHTML(menus.footer) : ''}
    ${social.length ? `<div class="foot-social">${social.map(([n, u]) => `<a href="${esc(u)}" target="_blank" rel="noopener">${n}</a>`).join('')}</div>` : ''}
    <div>${[store.phone && `電話：${esc(store.phone)}`, store.email && `Email：${esc(store.email)}`, store.address && esc(store.address)].filter(Boolean).join('　')}</div>
    <div>© ${new Date().getFullYear()} ${esc(store.name)}</div></div>`;
  const an = theme.announce;
  if (an.on && an.text) { const el = $('#announce'); el.hidden = false; el.style.background = an.color; el.innerHTML = an.link ? `<a href="${esc(an.link)}">${esc(an.text)}</a>` : esc(an.text); }
  $('#menuOpen').addEventListener('click', () => {
    $('#drawerBody').innerHTML = `<form class="search" data-search><input type="search" name="q" placeholder="搜尋商品" aria-label="搜尋商品"><button class="icon-btn" aria-label="搜尋"><svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg></button></form>${menuHTML([...(menus.top || []), ...(theme.layout === 'top-side' ? menus.side || [] : [])])}`;
    $('#drawer').hidden = false;
    mount($('#drawerBody'));
  });
  if (third.gscVerify) document.head.insertAdjacentHTML('beforeend', `<meta name="google-site-verification" content="${esc(third.gscVerify)}">`);
  if (third.gtmId) {
    window.dataLayer = window.dataLayer || []; window.dataLayer.push({ 'gtm.start': Date.now(), event: 'gtm.js' });
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtm.js?id=' + encodeURIComponent(third.gtmId); document.head.append(s);
  }
  if (third.fbPixel) {
    /* eslint-disable */ !function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');
    fbq('init', third.fbPixel); fbq('track', 'PageView');
  }
  if (third.gaId || third.adsId) {
    const id = third.gaId || third.adsId;
    const s = document.createElement('script'); s.async = true; s.src = 'https://www.googletagmanager.com/gtag/js?id=' + encodeURIComponent(id); document.head.append(s);
    window.dataLayer = window.dataLayer || []; window.gtag = function () { dataLayer.push(arguments); }; gtag('js', new Date());
    if (third.gaId) gtag('config', third.gaId);
    if (third.adsId) gtag('config', third.adsId);
  }
}

// 右下角：回到頂端、LINE 聯絡
function floaters() {
  const f = S.init.flags;
  const box = document.createElement('div');
  box.className = 'floaters';
  box.innerHTML = `${f.chatLine ? `<a class="fl-btn line" href="${esc(f.chatLine)}" target="_blank" rel="noopener" aria-label="用 LINE 聯絡我們">LINE</a>` : ''}${f.backToTop ? '<button class="fl-btn top" aria-label="回到頂端" hidden><svg viewBox="0 0 24 24"><path d="m6 15 6-6 6 6"/></svg></button>' : ''}`;
  document.body.append(box);
  const top = $('.top', box);
  if (top) {
    top.onclick = () => window.scrollTo({ top: 0, behavior: 'smooth' });
    addEventListener('scroll', () => { top.hidden = scrollY < 600; }, { passive: true });
  }
}

function popupAd() {
  const p = S.init.theme.popup;
  if (!p.on || !p.image) return;
  const d = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  if ((p.start && d < p.start) || (p.end && d > p.end)) return;
  try { if (sessionStorage.getItem('popupSeen')) return; sessionStorage.setItem('popupSeen', '1'); } catch {}
  setTimeout(() => modal(p.link ? `<a href="${esc(p.link)}"><img src="${esc(p.image)}" alt="活動"></a>` : `<img src="${esc(p.image)}" alt="活動">`, 'popup-ad'), 800);
}

/* ---------- 路由 ---------- */
function go(url, replace) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}
document.addEventListener('click', (e) => {
  const quick = e.target.closest('[data-quick]');
  if (quick) {
    e.preventDefault();
    if (quick.dataset.specs === '1') return go('/products/' + quick.dataset.quick);
    Cart.add(quick.dataset.quick, quick.dataset.vkey || '', 1);
    toast('已加入購物車');
    return;
  }
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || u.pathname.startsWith('/admin') || u.pathname.startsWith('/api')) return;
  e.preventDefault();
  go(u.pathname + u.search + u.hash);
});
document.addEventListener('submit', (e) => {
  if (e.target.matches('#searchForm,[data-search]')) {
    e.preventDefault();
    $('#drawer').hidden = true;
    go('/products?q=' + encodeURIComponent(new FormData(e.target).get('q')));
  }
});
window.addEventListener('popstate', route);

async function route() {
  const path = decodeURIComponent(location.pathname).replace(/\/+$/, '') || '/';
  const q = new URLSearchParams(location.search);
  window.scrollTo(0, 0);
  $$('.top-nav a, .side-nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === location.pathname + location.search));
  main.innerHTML = '<div class="loading">載入中…</div>';
  try {
    let m;
    if (path === '/') await viewPage(null);
    else if ((m = path.match(/^\/pages\/(.+)$/))) await viewPage(m[1]);
    else if (path === '/products') await viewList(q);
    else if ((m = path.match(/^\/products\/([\w-]+)$/))) await viewProduct(m[1]);
    else if (path === '/cart') await viewCart();
    else if (path === '/checkout') await viewCheckout();
    else if ((m = path.match(/^\/order\/(\w+)$/))) await viewOrder(m[1], q);
    else if (path === '/login') viewAuth(q.get('next') || '/account');
    else if (path.startsWith('/account')) await viewAccount(path.split('/')[2] || '');
    else notFound();
  } catch (e) {
    main.innerHTML = `<div class="wrap"><div class="empty"><p>${esc(e.message)}</p><a class="btn" href="/">回首頁</a></div></div>`;
  }
  main.focus({ preventScroll: true });
}
function notFound() { setTitle('找不到頁面'); main.innerHTML = '<div class="wrap"><div class="empty"><h1>找不到這個頁面</h1><a class="btn" href="/">回首頁</a></div></div>'; }

/* ---------- 頁面（首頁、自訂分頁） ---------- */
async function viewPage(slug) {
  const { page } = await api('/api/shop?a=page' + (slug ? '&slug=' + encodeURIComponent(slug) : ''));
  setTitle(page.home ? '' : page.settings.seoTitle || page.title);
  if (page.settings.seoDesc) $('meta[name=description]').content = page.settings.seoDesc;
  main.innerHTML = page.blocks.length ? renderBlocks(page.blocks, { menus: S.init.menus, listButton: true }) : '<div class="wrap"><div class="empty">這個頁面還沒有內容</div></div>';
  if (page.settings.bg) main.style.background = page.settings.bg; else main.style.background = '';
  mount(main, { fade: [S.init.theme.fadeImages && '.b-image,.b-imgtext,.b-carousel,.pc', S.init.theme.fadeText && '.b-text'].filter(Boolean).join(',') || null });
}

// 商品版型（後台「頁面設計 → 商品版型」）：列表頁上方、商品頁下方共用的區塊
const tplCache = {};
async function tplHTML(id) {
  tplCache[id] ||= api('/api/shop?a=page&slug=' + id).then((r) => r.page.blocks).catch(() => []);
  const blocks = await tplCache[id];
  return blocks.length ? renderBlocks(blocks, { menus: S.init.menus, listButton: true }) : '';
}

/* ---------- 商品列表 ---------- */
async function viewList(q) {
  const params = new URLSearchParams({ a: 'products', tag: q.get('tag') || '', q: q.get('q') || '', sort: q.get('sort') || 'new', page: q.get('page') || 1 });
  const r = await api('/api/shop?' + params);
  const title = q.get('q') ? `搜尋「${q.get('q')}」` : q.get('tag') || '全部商品';
  setTitle(title);
  const link = (patch) => { const n = new URLSearchParams(location.search); for (const [k, v] of Object.entries(patch)) v ? n.set(k, v) : n.delete(k); return '/products?' + n; };
  const top = await tplHTML('tpl-list');
  main.innerHTML = `${top}<div class="wrap">
    <div class="list-head"><h1 class="page-title">${esc(title)} <small class="muted">${r.total} 件</small></h1>
      <label class="sort">排序 <select id="sort">${[['new', '最新上架'], ['hot', '熱門'], ['priceAsc', '價格低到高'], ['priceDesc', '價格高到低']].map(([v, n]) => `<option value="${v}"${(q.get('sort') || 'new') === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${r.tags.length ? `<div class="chips"><a href="${link({ tag: '', page: '' })}" class="${q.get('tag') ? '' : 'on'}">全部</a>${r.tags.map((t) => `<a href="${link({ tag: t, page: '' })}" class="${q.get('tag') === t ? 'on' : ''}">${esc(t)}</a>`).join('')}</div>` : ''}
    <div style="height:16px"></div>
    ${r.items.length ? `<div class="grid">${r.items.map((p) => productCard(p, { button: true })).join('')}</div>` : '<div class="empty">沒有符合的商品</div>'}
    ${r.pages > 1 ? `<nav class="pager">${Array.from({ length: r.pages }, (_, i) => `<a href="${link({ page: i + 1 })}" class="${r.page === i + 1 ? 'on' : ''}">${i + 1}</a>`).join('')}</nav>` : ''}
  </div>`;
  $('#sort').addEventListener('change', (e) => go(link({ sort: e.target.value, page: '' })));
  mount(main, { fade: S.init.theme.fadeImages ? '.pc' : null });
}

/* ---------- 商品頁 ---------- */
async function viewProduct(pid) {
  const { product: p, questions, related, hidePrice } = await api('/api/shop?a=product&id=' + pid);
  setTitle(p.name);
  const sel = p.specs.map((s, i) => p.variants.find((v) => v.stock > 0)?.opts[i] ?? s.values[0]);
  let img = 0;
  const cur = () => p.variants.find((v) => v.key === sel.join('/')) || (p.specs.length ? null : p.variants[0]);
  const images = p.images.length ? p.images : [''];

  main.innerHTML = `<div class="wrap">
    <div class="pd">
      <div class="gallery"><div class="main" id="gMain"></div>${images.length > 1 ? `<div class="thumbs">${images.map((src, i) => `<button data-i="${i}" aria-label="第 ${i + 1} 張"><img src="${esc(src)}" alt=""></button>`).join('')}</div>` : ''}</div>
      <div class="pd-info">
        <h1>${esc(p.name)}</h1>
        <div class="pd-sku" id="pdSku"></div>
        <div class="pd-price" id="pdPrice"></div>
        ${p.groupbuy ? `<div class="gb-box"><b>${esc(p.groupbuy.name)}</b>：已累計 ${p.groupbuy.sold} 件，賣越多越便宜${p.groupbuy.end ? `（到 ${esc(p.groupbuy.end)}）` : ''}<div class="gb-tiers">${p.groupbuy.tiers.map((t) => `<span class="${p.groupbuy.sold >= t.qty ? 'hit' : ''}">滿 ${t.qty} 件 ${money(t.price)}</span>`).join('')}</div></div>` : ''}
        ${p.specs.map((s, i) => `<div class="spec"><span>${esc(s.name)}</span><div class="opts" data-i="${i}">${s.values.map((v) => `<button type="button" data-v="${esc(v)}">${esc(v)}</button>`).join('')}</div></div>`).join('')}
        <div class="spec"><span>數量</span>${qtyBox(1)} <span class="stock-note" id="stockNote"></span></div>
        <div class="buy-row">
          ${hidePrice ? `<a class="btn block" href="/login?next=${encodeURIComponent(location.pathname)}">登入會員看價格</a>` : `<button class="btn ${S.init.flags.buyNow ? 'ghost' : ''}" id="addCart">加入購物車</button>${S.init.flags.buyNow ? '<button class="btn" id="buyNow">直接購買</button>' : ''}`}
          ${S.init.flags.wishlist ? `<button class="wish${p.wished ? ' on' : ''}" id="wish" aria-label="收藏"><svg viewBox="0 0 24 24"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10Z"/></svg></button>` : ''}
        </div>
        ${p.tags.length ? `<div class="chips">${p.tags.map((t) => `<a href="/products?tag=${encodeURIComponent(t)}">${esc(t)}</a>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="tabs" role="tablist"><button class="on" data-tab="desc">商品介紹</button><button data-tab="qa">商品問答${questions.length ? ` (${questions.length})` : ''}</button></div>
    <div id="tabDesc" class="pd-desc">${p.desc ? descHTML(p.desc) : '<p class="muted">沒有商品介紹</p>'}</div>
    <div id="tabQa" hidden></div>
    ${related.length ? `<div class="offers"><div class="b-title"><h2>你可能也會喜歡</h2></div><div class="grid">${related.map((x) => productCard(x)).join('')}</div></div>` : ''}
  </div>`;

  const draw = () => {
    const v = cur();
    $('#gMain').innerHTML = images[img] ? `<img src="${esc(v?.img && img === 0 ? v.img : images[img])}" alt="${esc(p.name)}">` : '<span class="ph"></span>';
    $$('.thumbs button').forEach((b) => b.classList.toggle('on', +b.dataset.i === img));
    $$('.opts').forEach((box) => {
      const i = +box.dataset.i;
      $$('button', box).forEach((b) => {
        b.classList.toggle('on', sel[i] === b.dataset.v);
        const test = [...sel]; test[i] = b.dataset.v;
        const tv = p.variants.find((x) => x.key === test.join('/'));
        b.classList.toggle('na', !tv || tv.stock <= 0);
      });
    });
    const price = $('#pdPrice');
    if (hidePrice) price.innerHTML = '<span class="muted">登入會員後顯示價格</span>';
    else if (!v) price.innerHTML = '<span class="muted">這個組合沒有販售</span>';
    else price.innerHTML = `<b>${money(v.price)}</b>${v.listPrice ? `<s>${money(v.listPrice)}</s>` : ''}${v.notes.map((n) => `<span class="badge">${esc(n)}</span>`).join('')}`;
    const note = $('#stockNote');
    note.textContent = !v ? '' : v.stock <= 0 ? '已售完' : v.stock <= 5 ? `只剩 ${v.stock} 件` : '';
    if (v && v.stock <= 0 && S.init.flags.restockNotify) note.innerHTML = p.restock.includes(v.key) ? '已售完・<span class="ok">貨到會通知您</span>' : '已售完・<button class="linkbtn" id="restockBtn">貨到通知我</button>';
    $('#restockBtn')?.addEventListener('click', async () => {
      let email = S.user?.email;
      if (!email) {
        const box = modal(`<h2>貨到通知</h2><p class="muted">補貨後店家會通知您</p><form><label class="field"><span>Email</span><input name="email" type="email" required></label><button class="btn block">登記</button></form>`);
        await new Promise((res) => { $('form', box).addEventListener('submit', (e) => { e.preventDefault(); email = new FormData(e.target).get('email'); closeModal(); res(); }); });
      }
      await api('/api/shop', { method: 'POST', body: { a: 'restock', pid: p.id, vkey: v.key, email } });
      p.restock.push(v.key);
      toast('已登記，補貨後會通知您');
      draw();
    });
    $('#pdSku').textContent = p.sku ? `商品編號 ${p.sku}` : '';
    const qi = $('.qty input');
    if (v) { qi.max = Math.max(1, v.stock); if (+qi.value > v.stock) qi.value = Math.max(1, v.stock); }
    const off = !v || v.stock <= 0;
    ['#addCart', '#buyNow'].forEach((s) => { const b = $(s); if (b) { b.disabled = off; } });
    if ($('#addCart')) $('#addCart').textContent = off ? '已售完' : '加入購物車';
  };
  $$('.opts').forEach((box) => box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    sel[+box.dataset.i] = b.dataset.v;
    const v = cur();
    if (v?.img) img = 0;
    draw();
  }));
  $$('.thumbs button').forEach((b) => b.addEventListener('click', () => { img = +b.dataset.i; draw(); }));
  bindQty(main);
  const add = () => {
    const v = cur();
    if (!v || v.stock <= 0) return false;
    Cart.add(p.id, v.key, +$('.qty input').value);
    return true;
  };
  $('#addCart')?.addEventListener('click', () => { if (add()) toast('已加入購物車'); });
  $('#buyNow')?.addEventListener('click', () => { if (add()) go('/cart'); });
  $('#wish')?.addEventListener('click', async (e) => {
    if (!S.customer) return go('/login?next=' + encodeURIComponent(location.pathname));
    const btn = e.currentTarget;
    const on = !btn.classList.contains('on');
    await api('/api/shop', { method: 'POST', body: { a: 'wish', pid: p.id, on } });
    btn.classList.toggle('on', on);
    toast(on ? '已加入收藏' : '已取消收藏');
  });
  $$('.tabs button').forEach((b) => b.addEventListener('click', () => {
    $$('.tabs button').forEach((x) => x.classList.toggle('on', x === b));
    $('#tabDesc').hidden = b.dataset.tab !== 'desc';
    $('#tabQa').hidden = b.dataset.tab !== 'qa';
  }));
  drawQA(p, questions);
  draw();
  const below = await tplHTML('tpl-product');
  if (below) { $('#tabQa').insertAdjacentHTML('afterend', `<div class="tpl-product" style="margin:32px -16px 0">${below}</div>`); mount(main); }
}

// 商品介紹：後台存的是純文字或簡單 HTML
function descHTML(s) {
  if (/<\w+/.test(s)) return sanitizeDesc(s);
  return s.split(/\n{2,}/).map((para) => `<p>${esc(para).replace(/\n/g, '<br>')}</p>`).join('');
}
function sanitizeDesc(s) {
  const doc = new DOMParser().parseFromString(s, 'text/html');
  doc.querySelectorAll('script,style,iframe:not([src*="youtube.com"]),object,embed,form').forEach((n) => n.remove());
  doc.querySelectorAll('*').forEach((n) => [...n.attributes].forEach((a) => { if (/^on/i.test(a.name) || /javascript:/i.test(a.value)) n.removeAttribute(a.name); }));
  return doc.body.innerHTML;
}

function drawQA(p, questions) {
  const box = $('#tabQa');
  const thread = (q) => `<div class="card"><div class="qa">${q.msgs.map((m) => `<div class="msg ${m.from}"><small>${m.from === 'admin' ? '店家回覆' : '我'}・${date(m.at)}</small>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')}</div></div>`;
  box.innerHTML = `${questions.map(thread).join('')}
    <div class="card"><h2>詢問這個商品</h2>${S.customer ? `<form id="askForm"><div class="field"><textarea name="text" required maxlength="1000" placeholder="例如：尺寸、材質、到貨時間"></textarea></div><button class="btn">送出問題</button></form>` : `<p class="muted">登入會員後就能詢問商品，店家回覆會通知你。</p><a class="btn ghost" href="/login?next=${encodeURIComponent(location.pathname)}">登入 / 註冊</a>`}</div>`;
  $('#askForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = new FormData(e.target).get('text');
    await busy(e.submitter, () => api('/api/shop', { method: 'POST', body: { a: 'ask', pid: p.id, text } }));
    toast('已送出，店家回覆後會顯示在這裡');
    const r = await api('/api/shop?a=product&id=' + p.id);
    drawQA(p, r.questions);
  });
}

/* ---------- 購物車 ---------- */
async function quoteNow(cart) {
  const { quote } = await api('/api/shop', { method: 'POST', body: { a: 'quote', cart } });
  return quote;
}

const lineHTML = (l, i, addon) => `<div class="ci" data-i="${i}" data-addon="${addon ? 1 : ''}">
  ${l.img ? `<img src="${esc(l.img)}" alt="">` : '<span class="ph"></span>'}
  <div><a class="ci-name" href="/products/${esc(l.pid)}">${addon ? '<span class="tag">加購</span>' : ''}${esc(l.name)}</a>
    ${l.spec ? `<div class="ci-spec">${esc(l.spec)}</div>` : ''}
    <div class="ci-spec">${money(l.price)}${l.listPrice > l.price ? ` <s>${money(l.listPrice)}</s>` : ''}${(l.notes || []).map((n) => ` ・${esc(n)}`).join('')}</div>
    ${l.error ? `<div class="ci-err">${esc(l.error)}</div>` : ''}
    <div style="margin-top:6px">${qtyBox(l.qty, l.stock || 999, 'sm')}</div></div>
  <div class="ci-right"><b>${money(l.amount)}</b><button class="rm" data-rm>移除</button></div></div>`;

function summaryHTML(q, opt = {}) {
  return `<div class="sum-row"><span>商品小計</span><span>${money(q.subtotal)}</span></div>
    ${q.discounts.map((d) => `<div class="sum-row"><span>${esc(d.name)}</span><span class="minus">−${money(d.amount)}</span></div>`).join('')}
    ${q.points.used ? `<div class="sum-row"><span>購物金折抵（${q.points.used} 點）</span><span class="minus">−${money(q.points.value)}</span></div>` : ''}
    ${q.shipping ? `<div class="sum-row"><span>運費（${esc(q.shipping.name)}）</span><span>${q.shipping.fee ? money(q.shipping.fee) : '免運'}</span></div>` : opt.noShip ? '' : '<div class="sum-row muted"><span>運費</span><span>結帳時計算</span></div>'}
    <div class="sum-row total"><span>合計</span><span>${money(q.total)}</span></div>
    ${q.earn ? `<div class="hint">完成訂單可獲得 <b>${q.earn}</b> 點購物金</div>` : ''}`;
}

async function viewCart() {
  setTitle('購物車');
  const cart = Cart.get();
  if (!cart.items.length && !cart.addons.length) { main.innerHTML = '<div class="wrap"><h1 class="page-title">購物車</h1><div class="empty"><p>購物車是空的</p><a class="btn" href="/products">去逛逛</a></div></div>'; return; }
  const q = await quoteNow(cart);
  // 用伺服器回來的數量（可能被限制）
  const freeGap = q.shippingMethods.filter((m) => m.freeOver).map((m) => m.freeOver - (q.subtotal - q.discountTotal)).filter((g) => g > 0);
  main.innerHTML = `<div class="wrap">
    <h1 class="page-title">購物車</h1>
    <div class="cart">
      <div>
        ${q.lines.map((l, i) => lineHTML(l, i)).join('')}${q.addonLines.map((l, i) => lineHTML(l, i, true)).join('')}
        ${q.giftLines.map((l) => `<div class="ci">${l.img ? `<img src="${esc(l.img)}" alt="">` : '<span class="ph"></span>'}<div><span class="ci-name"><span class="tag">贈品</span>${esc(l.name)}</span>${l.spec ? `<div class="ci-spec">${esc(l.spec)}</div>` : ''}<div class="ci-spec">${esc(l.notes.join('、'))} × ${l.qty}</div></div><div class="ci-right"><b>免費</b></div></div>`).join('')}
        ${q.giftHints.map((h) => `<div class="hint">再買 ${money(h.gap)} 就送「${esc(h.gift)}」（${esc(h.name)}）</div>`).join('')}
        ${q.offers.length ? `<div class="offers"><div class="b-title"><h2>加價購</h2></div><div class="offer-list">${q.offers.map((o, i) => `<div class="offer" data-o="${i}">
          ${o.img ? `<img src="${esc(o.img)}" alt="">` : '<span class="ph"></span>'}<span>${esc(o.name)}</span>
          <span><b>${money(o.price)}</b> <s class="muted">${money(o.listPrice)}</s></span>
          ${o.specs.length ? `<select aria-label="規格">${o.variants.filter((v) => v.stock > 0).map((v) => `<option value="${esc(v.key)}">${esc(v.key)}</option>`).join('')}</select>` : ''}
          <button class="btn sm ghost" data-addoffer ${o.variants.every((v) => v.stock <= 0) ? 'disabled' : ''}>${o.variants.every((v) => v.stock <= 0) ? '已售完' : '加購'}</button></div>`).join('')}</div></div>` : ''}
      </div>
      <aside class="card summary">
        <h2>訂單摘要</h2>
        ${summaryHTML(q)}
        <form class="coupon" id="couponForm"><input class="input" name="code" placeholder="優惠碼" value="${esc(cart.coupon)}" aria-label="優惠碼"><button class="btn sm light">${cart.coupon ? '更新' : '套用'}</button></form>
        ${q.coupon ? `<div class="${q.coupon.ok ? 'ok' : 'danger'}" style="font-size:.88rem">${esc(q.coupon.msg)} ${cart.coupon ? '<button class="linkbtn" id="couponRm">移除</button>' : ''}</div>` : ''}
        ${freeGap.length ? `<div class="hint">再買 ${money(Math.min(...freeGap))} 就有免運方式可選</div>` : ''}
        ${q.errors.length ? `<div class="err">${esc(q.errors[0])}</div>` : ''}
        <button class="btn block" id="toCheckout" ${q.errors.length ? 'disabled' : ''}>前往結帳</button>
        <a class="btn block ghost" href="/products" style="margin-top:8px">繼續購物</a>
      </aside>
    </div></div>`;

  const save = (fn) => { const c = Cart.get(); fn(c); Cart.set(c); viewCart(); };
  $$('.ci').forEach((row) => {
    const i = +row.dataset.i, addon = !!row.dataset.addon;
    $('[data-rm]', row).addEventListener('click', () => save((c) => (addon ? c.addons : c.items).splice(i, 1)));
    bindQty(row, (_, v) => save((c) => { (addon ? c.addons : c.items)[i].qty = v; }));
  });
  $$('[data-addoffer]').forEach((b) => b.addEventListener('click', () => {
    const box = b.closest('.offer');
    const o = q.offers[+box.dataset.o];
    const vkey = $('select', box)?.value ?? o.variants[0].key;
    save((c) => { const hit = c.addons.find((x) => x.zone === o.zone && x.pid === o.pid && x.vkey === vkey); if (hit) hit.qty++; else c.addons.push({ zone: o.zone, pid: o.pid, vkey, qty: 1 }); });
  }));
  $('#couponForm').addEventListener('submit', (e) => { e.preventDefault(); save((c) => { c.coupon = new FormData(e.target).get('code').trim(); }); });
  $('#couponRm')?.addEventListener('click', () => save((c) => { c.coupon = ''; }));
  $('#toCheckout').addEventListener('click', () => go('/checkout'));
}

/* ---------- 結帳 ---------- */
async function viewCheckout() {
  setTitle('結帳');
  const cart = Cart.get();
  if (!cart.items.length) return go('/cart', true);
  if (!S.customer && !S.init.flags.guestCheckout) return go('/login?next=/checkout', true);
  if (S.needProfile) return go('/account', true);
  const c = S.customer;
  const form = { buyer: { name: '', email: '', phone: '' }, receiver: { ...(c?.address || {}) }, same: !c?.address, note: '', saveAddress: !!c, ...JSON.parse(sessionStorage.getItem('checkout') || '{}') };

  const draw = async () => {
    const q = await quoteNow(cart);
    if (!q.shippingMethods.some((m) => m.id === cart.shippingId)) cart.shippingId = q.shippingMethods[0]?.id;
    if (!q.payments.some((m) => m.id === cart.paymentId)) cart.paymentId = q.payments[0]?.id;
    Cart.set(cart);
    const q2 = cart.shippingId !== q.shipping?.id || cart.paymentId ? await quoteNow(cart) : q;
    const ship = q2.shipping;
    main.innerHTML = `<div class="wrap">
      <div class="steps"><span>購物車</span>›<span class="on">填寫資料</span>›<span>完成訂購</span></div>
      <div class="cart"><form id="co">
        ${c ? '' : `<div class="card"><h2>訂購人</h2><p class="muted" style="margin-top:-6px;font-size:.9rem">已經是會員？<a href="/login?next=/checkout">登入</a>可以累積購物金、查詢訂單。</p>
          <div class="row2"><label class="field"><span>姓名 <em>*</em></span><input name="b.name" required value="${esc(form.buyer.name)}" autocomplete="name"></label>
          <label class="field"><span>手機${S.init.flags.requirePhone ? ' <em>*</em>' : ''}</span><input name="b.phone" type="tel" ${S.init.flags.requirePhone ? 'required' : ''} value="${esc(form.buyer.phone)}" autocomplete="tel"></label></div>
          <label class="field"><span>Email <em>*</em>（訂單通知、查詢訂單用）</span><input name="b.email" type="email" required value="${esc(form.buyer.email)}" autocomplete="email"></label></div>`}
        <div class="card"><h2>運送方式</h2><div class="choices">${q2.shippingMethods.map((m) => `<label class="choice${m.id === cart.shippingId ? ' on' : ''}"><input type="radio" name="ship" value="${esc(m.id)}" ${m.id === cart.shippingId ? 'checked' : ''}><span>${esc(m.name)}${m.desc ? `<small>${esc(m.desc)}</small>` : ''}${m.freeOver ? `<small>滿 ${money(m.freeOver)} 免運</small>` : ''}</span><span class="fee">${m.fee ? money(m.fee) : '免運費'}</span></label>`).join('')}</div></div>
        <div class="card"><h2>收件資料</h2>
          <label class="check"><input type="checkbox" name="same" ${form.same ? 'checked' : ''}> 收件人同訂購人${c ? `（${esc(c.name)}）` : ''}</label>
          <div id="recv" ${form.same ? 'hidden' : ''}><div class="row2"><label class="field"><span>收件人姓名 <em>*</em></span><input name="r.name" value="${esc(form.receiver.name || '')}"></label>
          <label class="field"><span>收件人手機 <em>*</em></span><input name="r.phone" type="tel" value="${esc(form.receiver.phone || '')}"></label></div></div>
          ${ship?.type === 'home' ? `<div class="row2" style="grid-template-columns:120px 1fr"><label class="field"><span>郵遞區號</span><input name="r.zip" value="${esc(form.receiver.zip || '')}" inputmode="numeric"></label><label class="field"><span>地址 <em>*</em></span><input name="r.address" required value="${esc(form.receiver.address || '')}" autocomplete="street-address"></label></div>` : ''}
          ${ship?.type === 'cvs' ? `<label class="field"><span>取貨門市 <em>*</em>（門市名稱或店號）</span><input name="r.store" required value="${esc(form.receiver.store || '')}" placeholder="例如：中山門市 123456"></label><p class="muted" style="font-size:.85rem;margin-top:-6px">之後串接綠界後，這裡會改成開地圖選門市。</p>` : ''}
          ${ship?.type === 'pickup' ? `<p class="muted">到店自取，地址：${esc(S.init.store.address || '請洽店家')}</p>` : ''}
          ${c ? `<label class="check"><input type="checkbox" name="saveAddress" ${form.saveAddress ? 'checked' : ''}> 存成我的常用地址</label>` : ''}
          ${wantHTML(q2.shippingMethods.find((m) => m.id === cart.shippingId), form.want)}
        </div>
        <div class="card"><h2>付款方式</h2><div class="choices">${q2.payments.map((m) => `<label class="choice${m.id === cart.paymentId ? ' on' : ''}"><input type="radio" name="pay" value="${esc(m.id)}" ${m.id === cart.paymentId ? 'checked' : ''}><span>${esc(m.name)}${m.note ? `<small>${esc(m.note)}</small>` : ''}</span></label>`).join('')}</div></div>
        ${c && q2.points.available ? `<div class="card"><h2>購物金</h2><p class="muted" style="margin-top:-6px">目前有 ${q2.points.available} 點，這筆最多可折抵 ${q2.points.max} 點（1 點 = ${q2.points.rate} 元）</p>
          <div class="coupon"><input class="input" type="number" name="points" min="0" max="${q2.points.max}" value="${cart.points || 0}" aria-label="使用購物金點數"><button type="button" class="btn sm light" id="ptsMax">全部使用</button></div></div>` : ''}
        ${invoiceHTML(form.invoice)}
        ${S.init.flags.orderNote || S.init.flags.noteRequired ? `<div class="card"><h2>訂單備註${S.init.flags.noteRequired ? ' <em class="danger">*</em>' : ''}</h2><label class="field"><textarea name="note" maxlength="500" ${S.init.flags.noteRequired ? 'required' : ''} placeholder="${esc(S.init.flags.noteHint || '想跟店家說的話（選填）')}">${esc(form.note)}</textarea></label></div>` : ''}
        ${termsHTML()}
      </form>
      <aside class="card summary"><h2>訂單明細</h2>
        ${[...q2.lines, ...q2.addonLines, ...q2.giftLines].map((l) => `<div class="sum-row"><span>${l.gift ? '【贈品】' : l.addon ? '【加購】' : ''}${esc(l.name)}${l.spec ? `<br><small class="muted">${esc(l.spec)}</small>` : ''} × ${l.qty}</span><span>${money(l.amount)}</span></div>`).join('')}
        <div style="height:8px"></div>${summaryHTML(q2)}
        ${q2.errors.length ? `<div class="err">${esc(q2.errors[0])}</div>` : ''}
        <div class="err" id="coErr" hidden></div>
        <button class="btn block" id="place" ${q2.errors.length ? 'disabled' : ''}>確認下單</button>
        <a class="btn block ghost" href="/cart" style="margin-top:8px">回購物車</a>
      </aside></div></div>`;

    const f = $('#co');
    const collect = () => {
      const d = new FormData(f);
      form.buyer = { name: d.get('b.name') || '', email: d.get('b.email') || '', phone: d.get('b.phone') || '' };
      form.same = !!d.get('same');
      form.receiver = { name: d.get('r.name') || form.receiver.name || '', phone: d.get('r.phone') || form.receiver.phone || '', address: d.get('r.address') ?? form.receiver.address ?? '', zip: d.get('r.zip') ?? form.receiver.zip ?? '', store: d.get('r.store') ?? form.receiver.store ?? '' };
      form.note = d.get('note') || '';
      form.want = { date: d.get('wantDate') || '', time: d.get('wantTime') || '' };
      form.invoice = { type: d.get('invType') || form.invoice?.type || '', taxId: d.get('taxId') || '', title: d.get('invTitle') || '', carrier: d.get('carrier') || '', donateCode: d.get('donateCode') || '' };
      form.agree = !!d.get('agree');
      form.saveAddress = !!d.get('saveAddress');
      try { sessionStorage.setItem('checkout', JSON.stringify({ buyer: form.buyer, receiver: form.receiver, same: form.same, note: form.note })); } catch {}
    };
    f.addEventListener('change', async (e) => {
      collect();
      if (e.target.name === 'same') { $('#recv').hidden = form.same; return; }
      if (e.target.name === 'invType') return;
      if (e.target.name === 'ship') { cart.shippingId = e.target.value; Cart.set(cart); draw(); }
      if (e.target.name === 'pay') { cart.paymentId = e.target.value; Cart.set(cart); $$('[name=pay]').forEach((r) => r.closest('.choice').classList.toggle('on', r.checked)); }
      if (e.target.name === 'points') { cart.points = Math.max(0, +e.target.value || 0); Cart.set(cart); draw(); }
    });
    $('#ptsMax')?.addEventListener('click', () => { collect(); cart.points = q2.points.max; Cart.set(cart); draw(); });
    $('#place').addEventListener('click', async (e) => {
      collect();
      if (!f.reportValidity()) return;
      const buyer = c ? { name: c.name, phone: c.phone, email: c.email } : form.buyer;
      const receiver = form.same ? { ...form.receiver, name: buyer.name, phone: buyer.phone } : form.receiver;
      const err = $('#coErr');
      err.hidden = true;
      try {
        const r = await busy(e.currentTarget, () => api('/api/shop', { method: 'POST', body: { a: 'checkout', cart, buyer, receiver, note: form.note, saveAddress: form.saveAddress, want: form.want, invoice: form.invoice, agree: form.agree } }));
        Cart.clear();
        try { sessionStorage.removeItem('checkout'); } catch {}
        // 訪客記住訂單連結（同一台裝置可以回來看）
        if (!c) try { const mine = JSON.parse(localStorage.getItem('guestOrders') || '[]'); localStorage.setItem('guestOrders', JSON.stringify([{ no: r.no, k: r.key, at: Date.now() }, ...mine].slice(0, 20))); } catch {}
        go(`/order/${r.no}?k=${r.key}&new=1`);
      } catch (ex) { err.textContent = ex.message; err.hidden = false; if (ex.status === 409) setTimeout(draw, 1200); }
    });
  };
  await draw();
}

// 期望到貨日、時段
function wantHTML(m, want = {}) {
  if (!m || (m.wantDate === 'off' && m.wantTime === 'off')) return '';
  const days = [];
  for (let i = m.prepDays; i < m.prepDays + m.dateRange; i++) {
    const d = new Date(Date.now() + 8 * 3600e3 + i * 86400e3);
    if (m.noWeekdays.includes(String(d.getUTCDay()))) continue;
    const v = d.toISOString().slice(0, 10);
    days.push(`<option value="${v}"${want.date === v ? ' selected' : ''}>${v.slice(5).replace('-', '/')}（${'日一二三四五六'[d.getUTCDay()]}）</option>`);
  }
  return `<div class="row2">${m.wantDate !== 'off' ? `<label class="field"><span>期望到貨日${m.wantDate === 'required' ? ' <em>*</em>' : ''}</span><select name="wantDate" ${m.wantDate === 'required' ? 'required' : ''}><option value="">${m.wantDate === 'required' ? '請選擇' : '不指定'}</option>${days.join('')}</select></label>` : ''}
    ${m.wantTime !== 'off' && m.slots.length ? `<label class="field"><span>期望到貨時段${m.wantTime === 'required' ? ' <em>*</em>' : ''}</span><select name="wantTime" ${m.wantTime === 'required' ? 'required' : ''}><option value="">${m.wantTime === 'required' ? '請選擇' : '不指定'}</option>${m.slots.map((x) => `<option${want.time === x ? ' selected' : ''}>${esc(x)}</option>`).join('')}</select></label>` : ''}</div>`;
}

function invoiceHTML(iv = {}) {
  const set = S.init.flags.invoice;
  if (!set) return '';
  const types = [['personal', '個人電子發票'], ['carrier', '手機條碼載具'], ['company', '公司（統一編號）'], ['donate', '捐贈發票']].filter(([k]) => set[k]);
  if (!types.length) return '';
  const cur = types.some(([k]) => k === iv?.type) ? iv.type : types[0][0];
  return `<div class="card"><h2>發票</h2><div class="choices" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr));display:grid">${types.map(([k, n]) => `<label class="choice${k === cur ? ' on' : ''}"><input type="radio" name="invType" value="${k}" ${k === cur ? 'checked' : ''}><span>${n}</span></label>`).join('')}</div>
    <div data-inv="carrier" ${cur === 'carrier' ? '' : 'hidden'}><label class="field" style="margin-top:12px"><span>手機條碼（/ 開頭共 8 碼）</span><input name="carrier" value="${esc(iv?.carrier || '')}" placeholder="/ABC1234" maxlength="8" style="text-transform:uppercase"></label></div>
    <div data-inv="company" ${cur === 'company' ? '' : 'hidden'}><div class="row2" style="margin-top:12px"><label class="field"><span>統一編號</span><input name="taxId" value="${esc(iv?.taxId || '')}" inputmode="numeric" maxlength="8"></label><label class="field"><span>公司抬頭</span><input name="invTitle" value="${esc(iv?.title || '')}"></label></div></div>
    <div data-inv="donate" ${cur === 'donate' ? '' : 'hidden'}><label class="field" style="margin-top:12px"><span>捐贈碼（愛心碼）</span><input name="donateCode" value="${esc(iv?.donateCode || '')}" inputmode="numeric"></label></div></div>`;
}
document.addEventListener('change', (e) => { if (e.target.name === 'invType') { $$('[data-inv]').forEach((x) => (x.hidden = x.dataset.inv !== e.target.value)); $$('[name=invType]').forEach((x) => x.closest('.choice').classList.toggle('on', x.checked)); } });

function termsHTML() {
  const t = S.init.flags.terms;
  if (!t?.length) return '';
  return `<label class="check" style="margin:12px 0"><input type="checkbox" name="agree" required> 我已閱讀並同意${t.map((x) => `<a href="/pages/${encodeURIComponent(x.page)}" target="_blank" rel="noopener">${esc(x.name)}</a>`).join('、')}</label>`;
}

/* ---------- 訂單 ---------- */
const pillCls = (t) => (/完成|結案|已到貨/.test(t) ? 'ok' : /等待|處理|未出貨|備貨/.test(t) ? 'warn' : /失敗|取消|退/.test(t) ? 'bad' : '');

async function viewOrder(no, q) {
  const k = q.get('k') || '';
  const r = await api(`/api/shop?a=order&no=${no}&k=${encodeURIComponent(k)}`);
  const o = r.order;
  setTitle('訂單 ' + o.no);
  const post = (body) => api('/api/shop', { method: 'POST', body: { ...body, no: o.no, k } });
  const recv = o.receiver;
  main.innerHTML = `<div class="wrap narrow">
    ${q.get('new') ? `<div class="card" style="text-align:center;margin-bottom:16px"><h1 class="page-title" style="margin:0 0 6px">謝謝您的訂購！</h1><p class="muted" style="margin:0">訂單編號 <b>${esc(o.no)}</b>${S.customer ? '，可以在「會員中心 → 訂單」查看進度' : '，請保存這個頁面的網址以便查詢訂單'}</p></div>` : `<h1 class="page-title">訂單 ${esc(o.no)}</h1>`}
    <div class="status-bar"><span class="pill ${pillCls(o.statusText)}">${esc(o.statusText)}</span><span class="pill ${pillCls(o.payText)}">${esc(o.payText)}</span><span class="pill ${pillCls(o.shipText)}">${esc(o.shipText)}</span>${o.trackingNo ? `<span class="pill">物流編號 ${esc(o.trackingNo)}</span>` : ''}${o.trackingNo && r.trackUrl ? ` <a class="pill" href="${esc(r.trackUrl)}" target="_blank" rel="noopener">查詢貨態 ›</a>` : ''}</div>
    ${(o.payment.kind || (o.payment.id === 'card' ? 'online' : '')) === 'online' && ['unpaid', 'failed'].includes(o.payment.status) && o.status !== 'cancelled' ? `<div class="card"><h2>信用卡付款（模擬）</h2><p class="muted">目前還沒串接綠界，按下方按鈕模擬付款結果。</p><div class="paysim"><button class="btn" data-pay="success">模擬付款成功</button><button class="btn ghost" data-pay="fail">模擬付款失敗</button></div></div>` : ''}
    ${r.bank && o.payment.status !== 'paid' && o.status !== 'cancelled' ? `<div class="card"><h2>轉帳資訊</h2><div class="bank">${r.bank.name ? `銀行：${esc(r.bank.name)}（${esc(r.bank.code)}）<br>帳號：<b>${esc(r.bank.account)}</b><br>戶名：${esc(r.bank.holder)}<br>` : '店家還沒設定匯款帳號，請透過下方訂單問答詢問<br>'}金額：<b>${money(o.total)}</b></div>
      ${o.payment.transfer ? `<p class="ok">已收到您的匯款通知，店家對帳後會更新狀態。</p>` : `<form id="tfForm" style="margin-top:12px"><label class="field"><span>匯款完成後，請填寫以下資料通知我們</span><textarea name="text" required>${esc(r.transferTemplate)}</textarea></label><button class="btn">送出匯款通知</button></form>`}</div>` : ''}
    <div class="card"><h2>商品</h2>
      ${[...o.items, ...o.addonItems.map((l) => ({ ...l, addon: true }))].map((l) => `<div class="ci" style="grid-template-columns:64px 1fr auto">${l.img ? `<img src="${esc(l.img)}" alt="" style="width:64px;height:64px">` : '<span class="ph" style="width:64px;height:64px"></span>'}<div>${l.addon ? `<span class="tag" style="font-size:.75rem">${l.gift ? '贈品' : '加購'}</span> ` : ''}${esc(l.name)}${l.spec ? `<div class="ci-spec">${esc(l.spec)}</div>` : ''}<div class="ci-spec">${money(l.price)} × ${l.qty}</div></div><b>${money(l.amount)}</b></div>`).join('')}
      <div style="height:10px"></div>
      <div class="sum-row"><span>商品小計</span><span>${money(o.subtotal)}</span></div>
      ${o.discounts.map((d) => `<div class="sum-row"><span>${esc(d.name)}</span><span class="minus">−${money(d.amount)}</span></div>`).join('')}
      ${o.pointsUsed ? `<div class="sum-row"><span>購物金折抵</span><span class="minus">−${money(o.pointsValue)}</span></div>` : ''}
      <div class="sum-row"><span>運費</span><span>${o.shipping.fee ? money(o.shipping.fee) : '免運'}</span></div>
      <div class="sum-row total"><span>合計</span><span>${money(o.total)}</span></div>
    </div>
    <div class="card"><h2>訂購資料</h2><div style="line-height:1.9;font-size:.95rem">
      下單時間：${date(o.createdAt)}<br>訂購人：${esc(o.buyer.name)}（${esc(o.buyer.phone || '')}　${esc(o.buyer.email)}）<br>
      付款方式：${esc(o.payment.name)}<br>運送方式：${esc(o.shipping.name)}<br>
      收件人：${esc(recv.name)}　${esc(recv.phone)}<br>${recv.store ? `取貨門市：${esc(recv.store)}` : recv.address ? `地址：${esc(recv.zip || '')} ${esc(recv.address)}` : ''}
      ${o.note ? `<br>備註：${esc(o.note)}` : ''}</div>
      ${o.returnReq ? `<p class="pill warn" style="margin-top:12px">已申請${o.returnReq.type === 'return' ? '退貨' : '換貨'}（${o.returnReq.status === 'pending' ? '等待店家處理' : '店家已受理'}）</p>` : ''}
      <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">
        ${r.canCancel ? '<button class="btn sm ghost" id="cancelBtn">取消訂單</button>' : ''}
        ${r.canReturn ? '<button class="btn sm ghost" data-ret="return">申請退貨</button>' : ''}
        ${r.canExchange ? '<button class="btn sm ghost" data-ret="exchange">申請換貨</button>' : ''}
      </div></div>
    <div class="card"><h2>訂單問答</h2><div class="qa">${o.msgs.length ? o.msgs.map((m) => `<div class="msg ${m.from}"><small>${m.from === 'admin' ? '店家' : '我'}・${date(m.at)}</small>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('') : '<p class="muted">有任何問題都可以在這裡詢問</p>'}</div>
      <form id="msgForm" style="margin-top:12px"><label class="field"><textarea name="text" required maxlength="1000" placeholder="輸入訊息"></textarea></label><button class="btn sm">送出</button></form></div>
    ${S.customer ? '<a href="/account/orders" class="btn ghost">回訂單列表</a>' : ''}
  </div>`;

  const reload = () => viewOrder(no, new URLSearchParams({ k }));
  $$('[data-pay]').forEach((b) => b.addEventListener('click', async () => {
    const { ok } = await busy(b, () => post({ a: 'pay', result: b.dataset.pay }));
    toast(ok ? '付款成功' : '付款失敗，可以再試一次');
    reload();
  }));
  $('#tfForm')?.addEventListener('submit', async (e) => { e.preventDefault(); await busy(e.submitter, () => post({ a: 'transfer', text: new FormData(e.target).get('text') })); toast('已送出匯款通知'); reload(); });
  $('#msgForm').addEventListener('submit', async (e) => { e.preventDefault(); await busy(e.submitter, () => post({ a: 'orderMsg', text: new FormData(e.target).get('text') })); reload(); });
  $('#cancelBtn')?.addEventListener('click', () => {
    const box = modal(`<h2>取消訂單</h2><form><label class="field"><span>取消原因（選填）</span><input name="reason" maxlength="100"></label><button class="btn block">確定取消這筆訂單</button></form>`);
    $('form', box).addEventListener('submit', async (e) => { e.preventDefault(); await busy(e.submitter, () => post({ a: 'cancel', reason: new FormData(e.target).get('reason') })); closeModal(); toast('訂單已取消'); reload(); });
  });
  $$('[data-ret]').forEach((b) => b.addEventListener('click', () => {
    const type = b.dataset.ret;
    const box = modal(`<h2>申請${type === 'return' ? '退貨' : '換貨'}</h2><form><label class="field"><span>請說明原因${type === 'exchange' ? '，以及要換的尺寸／顏色' : ''}</span><textarea name="reason" required maxlength="500"></textarea></label><button class="btn block">送出申請</button></form>`);
    $('form', box).addEventListener('submit', async (e) => { e.preventDefault(); await busy(e.submitter, () => post({ a: 'returnReq', type, reason: new FormData(e.target).get('reason') })); closeModal(); toast('已送出申請，店家會盡快與您聯絡'); reload(); });
  }));
}

/* ---------- 登入、註冊 ---------- */
function viewAuth(next, tab = 'login') {
  setTitle(tab === 'login' ? '會員登入' : '加入會員');
  main.innerHTML = `<div class="wrap"><div class="auth-box card">
    ${S.init.flags.authMsg ? `<div class="hint" style="white-space:pre-wrap;text-align:center">${esc(S.init.flags.authMsg)}</div>` : ''}
    <div class="auth-tabs"><button data-t="login" class="${tab === 'login' ? 'on' : ''}">登入</button><button data-t="signup" class="${tab === 'signup' ? 'on' : ''}">加入會員</button></div>
    <form id="authForm">
      <label class="field"><span>Email</span><input name="email" type="email" required autocomplete="email"></label>
      <label class="field"><span>密碼${tab === 'signup' ? '（至少 6 個字）' : ''}</span><input name="password" type="password" required minlength="6" autocomplete="${tab === 'login' ? 'current-password' : 'new-password'}"></label>
      <div class="err" id="authErr" hidden></div>
      <button class="btn block">${tab === 'login' ? '登入' : '註冊'}</button>
      ${tab === 'login' ? '<p style="text-align:right;margin:8px 0 0"><button type="button" class="linkbtn" id="forgot">忘記密碼？</button></p>' : ''}
    </form>
    <div class="or">或</div>
    <button class="btn block ghost" id="google">使用 Google 帳號${tab === 'login' ? '登入' : '註冊'}</button>
  </div></div>`;
  $$('.auth-tabs button').forEach((b) => b.addEventListener('click', () => viewAuth(next, b.dataset.t)));
  const err = (e) => { const el = $('#authErr'); el.textContent = authMessage(e); el.hidden = false; };
  const done = async () => { await loadMe(); go(S.needProfile ? '/account?next=' + encodeURIComponent(next) : next, true); };
  $('#authForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const F = await auth();
    try {
      await busy(e.submitter, () => (tab === 'login' ? F.signInWithEmailAndPassword(F.auth, d.get('email'), d.get('password')) : F.createUserWithEmailAndPassword(F.auth, d.get('email'), d.get('password'))));
      await done();
    } catch (ex) { err(ex); }
  });
  $('#google').addEventListener('click', async () => {
    const F = await auth();
    try { const p = new F.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); await F.signInWithPopup(F.auth, p); await done(); } catch (ex) { err(ex); }
  });
  $('#forgot')?.addEventListener('click', async () => {
    const email = $('[name=email]').value;
    if (!email) return err({ message: '請先填寫 Email' });
    const F = await auth();
    try { await F.sendPasswordResetEmail(F.auth, email); toast('已寄出重設密碼信'); } catch (ex) { err(ex); }
  });
}

async function loadMe() {
  const F = await auth();
  S.user = F.auth.currentUser;
  if (!S.user) { S.customer = null; S.needProfile = false; return; }
  const r = await api('/api/shop?a=me');
  S.customer = r.customer;
  S.needProfile = !!r.needProfile;
  S.profileHint = r;
}

/* ---------- 會員中心 ---------- */
function profileForm(c, isNew) {
  const f = S.init.flags;
  const fl = f.fields || {};
  const req = (k) => (fl[k] === 'required' ? 'required' : '');
  const F = (k, label, input) => (fl[k] === 'hidden' ? '' : `<label class="field"><span>${label}${fl[k] === 'required' ? ' <em>*</em>' : ''}</span>${input}</label>`);
  const lockB = c?.birthday && f.lockBirthday;
  return `<form id="pf">
    <label class="field"><span>姓名 <em>*</em></span><input name="name" required value="${esc(c?.name || S.profileHint?.name || '')}" autocomplete="name"></label>
    <div class="row2">${F('phone', '手機', `<input name="phone" type="tel" ${req('phone')} value="${esc(c?.phone || '')}" autocomplete="tel">`)}
    ${F('birthday', `生日${lockB ? '（不能修改）' : ''}`, `<input name="birthday" type="date" ${req('birthday')} value="${esc(c?.birthday || '')}" ${lockB ? 'disabled' : ''}>`)}</div>
    ${F('gender', '性別', `<select name="gender" ${req('gender')}>${['', '女', '男', '其他'].map((g) => `<option value="${g}"${(c?.gender || '') === g ? ' selected' : ''}>${g || '請選擇'}</option>`).join('')}</select>`)}
    ${F('tel', '市話', `<input name="tel" type="tel" ${req('tel')} value="${esc(c?.tel || '')}">`)}
    ${F('address', '地址', `<input name="homeAddress" ${req('address')} value="${esc(c?.homeAddress || '')}" autocomplete="street-address">`)}
    ${isNew ? termsHTML() : ''}
    ${isNew ? '<label class="field"><span>特約代碼（選填）</span><input name="code" placeholder="有拿到店家給的代碼請填這裡"></label>' : ''}
    <label class="check"><input type="checkbox" name="newsletter" ${c?.newsletter ? 'checked' : ''}> 接收優惠活動通知</label>
    <div class="err" id="pfErr" hidden></div>
    <button class="btn">${isNew ? '完成註冊' : '儲存'}</button></form>`;
}

async function viewAccount(sub) {
  await loadMe();
  if (!S.user) return viewAuth(location.pathname);
  if (S.needProfile) {
    setTitle('完成會員資料');
    main.innerHTML = `<div class="wrap"><div class="auth-box card"><h1 class="page-title">歡迎加入！</h1><p class="muted">再填一些資料就完成註冊（${esc(S.user.email)}）</p>${profileForm(null, true)}</div></div>`;
    $('#pf').addEventListener('submit', async (e) => {
      e.preventDefault();
      try {
        await busy(e.submitter, () => api('/api/shop', { method: 'POST', body: { a: 'profile', ...Object.fromEntries(new FormData(e.target)), newsletter: !!new FormData(e.target).get('newsletter') } }));
        await loadMe();
        toast('註冊完成');
        go(new URLSearchParams(location.search).get('next') || '/account', true);
      } catch (ex) { $('#pfErr').textContent = ex.message; $('#pfErr').hidden = false; }
    });
    return;
  }
  const c = S.customer;
  const tabs = [['', '會員總覽'], ['orders', '訂單'], ['points', '購物金'], ...(S.init.flags.wishlist ? [['wishlist', '收藏']] : []), ['questions', '商品問答'], ['profile', '會員資料']];
  setTitle(tabs.find((t) => t[0] === sub)?.[1] || '會員中心');
  main.innerHTML = `<div class="wrap"><h1 class="page-title">會員中心</h1><div class="acc"><nav class="acc-nav">${tabs.map(([k, n]) => `<a href="/account${k ? '/' + k : ''}" class="${sub === k ? 'on' : ''}">${n}</a>`).join('')}<a href="#" id="logout">登出</a></nav><div id="accBody"><div class="loading">載入中…</div></div></div></div>`;
  $('#logout').addEventListener('click', async (e) => { e.preventDefault(); const F = await auth(); await F.signOut(F.auth); S.customer = null; S.user = null; toast('已登出'); go('/'); });
  const body = $('#accBody');

  if (sub === '') {
    body.innerHTML = `<div class="stat"><div><span class="muted">會員等級</span><b>${esc(c.groupName)}</b>${c.groupUntil ? `<small class="muted">到 ${new Date(c.groupUntil).toLocaleDateString('zh-TW')}</small>` : ''}</div><div><span class="muted">購物金</span><b>${c.points || 0} 點</b></div><div><span class="muted">累計訂單</span><b>${c.stats?.orders || 0} 筆</b></div></div>
      <div class="card"><h2>${esc(c.name)} 您好</h2><p class="muted" style="margin:0">${esc(c.email)}</p></div>`;
  }
  if (sub === 'orders') {
    const { orders } = await api('/api/shop?a=orders');
    body.innerHTML = orders.length ? `<div class="olist">${orders.map((o) => `<a href="/order/${o.no}">${o.img ? `<img src="${esc(o.img)}" alt="">` : '<span class="ph"></span>'}<span><b>${esc(o.no)}</b>${o.unread ? ' <span class="pill bad">有新回覆</span>' : ''}<br><small class="muted">${date(o.createdAt)}・${o.items} 件商品</small><br><span class="pill ${pillCls(o.statusText)}">${esc(o.statusText)}</span> <span class="pill ${pillCls(o.payText)}">${esc(o.payText)}</span></span><b>${money(o.total)}</b></a>`).join('')}</div>` : '<div class="empty">還沒有訂單</div>';
  }
  if (sub === 'points') {
    body.innerHTML = `<div class="stat"><div><span class="muted">目前購物金</span><b>${c.points || 0} 點</b><small class="muted">結帳時可折抵，1 點 = ${S.init.flags.pointsRate} 元</small></div></div>
      ${c.pointsLog.length ? `<table class="plog">${c.pointsLog.map((l) => `<tr><td>${new Date(l.at).toLocaleDateString('zh-TW')}</td><td>${esc(l.note)}</td><td class="${l.change > 0 ? 'ok' : 'danger'}">${l.change > 0 ? '+' : ''}${l.change}</td></tr>`).join('')}</table>` : '<div class="empty">還沒有購物金紀錄</div>'}`;
  }
  if (sub === 'wishlist') {
    const { items } = await api('/api/shop?a=wishlist');
    body.innerHTML = items.length ? `<div class="grid" style="--cols:3">${items.map((p) => productCard(p, { button: true })).join('')}</div>` : '<div class="empty">還沒有收藏的商品</div>';
  }
  if (sub === 'questions') {
    const { questions } = await api('/api/shop?a=questions');
    body.innerHTML = questions.length ? questions.map((q) => `<div class="card"><h2><a href="/products/${esc(q.pid)}">${esc(q.pname)}</a></h2><div class="qa">${q.msgs.map((m) => `<div class="msg ${m.from}"><small>${m.from === 'admin' ? '店家' : '我'}・${date(m.at)}</small>${esc(m.text).replace(/\n/g, '<br>')}</div>`).join('')}</div></div>`).join('') : '<div class="empty">還沒有商品問答</div>';
  }
  if (sub === 'profile') {
    body.innerHTML = `<div class="card"><h2>會員資料</h2>${profileForm(c, false)}</div>
      <div class="card"><h2>常用地址</h2><form id="addrF"><div class="row2"><label class="field"><span>收件人</span><input name="name" value="${esc(c.address?.name || '')}"></label><label class="field"><span>電話</span><input name="phone" value="${esc(c.address?.phone || '')}"></label></div>
        <div class="row2" style="grid-template-columns:120px 1fr"><label class="field"><span>郵遞區號</span><input name="zip" value="${esc(c.address?.zip || '')}"></label><label class="field"><span>地址</span><input name="address" value="${esc(c.address?.address || '')}"></label></div><button class="btn">儲存地址</button></form></div>
      ${S.user.providerData.some((p) => p.providerId === 'password') ? '<div class="card"><h2>密碼</h2><button class="btn ghost" id="resetPw">寄送重設密碼信</button></div>' : ''}`;
    const save = async (e, extra) => {
      e.preventDefault();
      const d = Object.fromEntries(new FormData($('#pf')));
      try { await busy(e.submitter, () => api('/api/shop', { method: 'POST', body: { a: 'profile', ...d, birthday: d.birthday || c.birthday, newsletter: !!d.newsletter, ...extra } })); toast('已儲存'); await loadMe(); } catch (ex) { $('#pfErr').textContent = ex.message; $('#pfErr').hidden = false; }
    };
    $('#pf').addEventListener('submit', (e) => save(e));
    $('#addrF').addEventListener('submit', (e) => save(e, { address: Object.fromEntries(new FormData(e.target)) }));
    $('#resetPw')?.addEventListener('click', async () => { const F = await auth(); await F.sendPasswordResetEmail(F.auth, S.user.email); toast('已寄出重設密碼信'); });
  }
}

/* ---------- 啟動 ---------- */
(async () => {
  try {
    S.init = await api('/api/shop?a=init');
  } catch (e) {
    main.innerHTML = `<div class="wrap"><div class="empty">${esc(e.message)}</div></div>`;
    return;
  }
  applyTheme();
  if (S.init.store.open === false) {
    main.innerHTML = `<div class="wrap"><div class="empty"><h1>${esc(S.init.store.name)}</h1><p style="white-space:pre-wrap">${esc(S.init.store.closedMsg || '商店暫停營業中')}</p></div></div>`;
    return;
  }
  floaters();
  Cart.badge();
  await loadMe().catch(() => {});
  await route();
  popupAd();
})();
