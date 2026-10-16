// 頁面區塊：前台顯示和後台「頁面設計」預覽共用
// 每個區塊 { id, type, ...欄位, pt, pb（上下留白 px）, bg（背景色）, full（滿版） }
// 群組區塊的欄位存成 cols: [{ blocks: [...] }]（Firestore 不能陣列裡直接放陣列）
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const money = (n) => (n == null ? '' : 'NT$' + Math.round(n).toLocaleString('en-US'));

// 區塊種類（後台元件面板依這個分類）
export const CATALOG = [
  { cat: '區塊', items: [{ type: 'group', name: '群組（多欄）', icon: 'columns' }] },
  { cat: '圖片', items: [{ type: 'image', name: '圖片', icon: 'image' }, { type: 'carousel', name: '圖片輪播', icon: 'slides' }, { type: 'imageText', name: '圖片文字', icon: 'imageText' }] },
  { cat: '文字', items: [{ type: 'text', name: '文字', icon: 'text' }, { type: 'countdown', name: '倒數計時', icon: 'clock' }] },
  { cat: '商品', items: [{ type: 'products', name: '商品列表', icon: 'grid' }] },
  { cat: '影片', items: [{ type: 'video', name: '影片', icon: 'play' }] },
  { cat: '社群', items: [{ type: 'fbPage', name: '臉書粉專', icon: 'fb' }, { type: 'share', name: '社群分享', icon: 'share' }] },
  { cat: '選單', items: [{ type: 'menu', name: '選單', icon: 'list' }] },
  { cat: '其它', items: [{ type: 'map', name: '地圖', icon: 'pin' }, { type: 'spacer', name: '間距', icon: 'spacer' }] },
];

export const DEFAULT_BLOCK = {
  group: () => ({ cols: [{ blocks: [] }, { blocks: [] }], widths: [1, 1], gap: 24 }),
  image: () => ({ src: '', link: '', alt: '', width: 100, align: 'center' }),
  carousel: () => ({ slides: [], autoplay: 5, ratio: '16/7' }),
  imageText: () => ({ src: '', title: '標題', text: '在這裡輸入說明文字', button: '了解更多', link: '', layout: 'left' }),
  text: () => ({ html: '<h2>標題</h2><p>在這裡輸入文字內容</p>', align: 'center' }),
  countdown: () => ({ title: '活動倒數', until: '', done: '活動已結束' }),
  products: () => ({ title: '新品上架', source: 'all', tag: '', ids: [], sort: 'new', limit: 8, cols: 4 }),
  video: () => ({ url: '', ratio: '16/9' }),
  fbPage: () => ({ url: '', height: 500 }),
  share: () => ({ title: '分享給朋友' }),
  menu: () => ({ menuId: 'top', style: 'horizontal', align: 'center' }),
  map: () => ({ address: '', height: 360 }),
  spacer: () => ({ height: 40, line: false }),
};

// 文字區塊只允許安全的標籤
const ALLOW = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'S', 'A', 'H1', 'H2', 'H3', 'H4', 'UL', 'OL', 'LI', 'SPAN', 'BLOCKQUOTE', 'HR', 'DIV', 'FONT', 'IMG']);
export function sanitize(html) {
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const walk = (el) => {
    for (const n of [...el.childNodes]) {
      if (n.nodeType === 3) continue;
      if (n.nodeType !== 1 || !ALLOW.has(n.tagName)) { n.replaceWith(...(n.nodeType === 1 ? [...n.childNodes] : [])); continue; }
      for (const a of [...n.attributes]) {
        const ok = (a.name === 'href' && /^(https?:|\/|#|mailto:|tel:)/i.test(a.value)) || (a.name === 'src' && /^https?:/i.test(a.value))
          || (a.name === 'style' && /^[\w\s:;#%.,()-]*$/.test(a.value) && !/url|expression/i.test(a.value)) || a.name === 'color' || a.name === 'target' || a.name === 'alt';
        if (!ok) n.removeAttribute(a.name);
      }
      if (n.tagName === 'A') n.setAttribute('rel', 'noopener');
      walk(n);
    }
  };
  walk(doc.body.firstChild);
  return doc.body.firstChild.innerHTML;
}

function videoEmbed(url) {
  const yt = String(url).match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
  if (yt) return `https://www.youtube.com/embed/${yt[1]}`;
  const vm = String(url).match(/vimeo\.com\/(\d+)/);
  if (vm) return `https://player.vimeo.com/video/${vm[1]}`;
  return '';
}

// 選單連結
export function menuHref(item) {
  switch (item.type) {
    case 'page': return item.value ? `/pages/${encodeURIComponent(item.value)}` : '/';
    case 'tag': return `/products?tag=${encodeURIComponent(item.value)}`;
    case 'all': return '/products';
    case 'url': return item.value || '#';
    case 'cart': return '/cart';
    case 'account': return '/account';
    case 'search': return '/products';
    default: return '';
  }
}

export function menuHTML(items, cls = '') {
  const li = (x) => {
    const href = menuHref(x);
    const kids = x.children?.length ? `<ul>${x.children.map(li).join('')}</ul>` : '';
    const ext = x.type === 'url' && /^https?:/.test(x.value) ? ' target="_blank" rel="noopener"' : '';
    const label = href ? `<a href="${esc(href)}"${ext}>${esc(x.label)}</a>` : `<span>${esc(x.label)}</span>`;
    return `<li class="${kids ? 'has-sub' : ''}">${label}${kids ? '<button class="sub-toggle" aria-label="展開">▾</button>' + kids : ''}</li>`;
  };
  return `<ul class="menu ${cls}">${(items || []).map(li).join('')}</ul>`;
}

// 商品卡（前台列表、商品列表區塊共用）
export function productCard(p, opt = {}) {
  const price = p.price == null ? '<span class="pc-login">登入會員看價格</span>'
    : `${p.listPrice ? `<s>${money(p.listPrice)}</s>` : ''}<b>${money(p.price)}${p.maxPrice > p.price ? ' 起' : ''}</b>`;
  const badges = [p.soldOut ? '<i class="badge out">售完</i>' : '', p.groupbuy ? '<i class="badge gb">湊湊團</i>' : '', ...(p.notes || []).slice(0, 1).map((n) => `<i class="badge">${esc(n)}</i>`)].join('');
  return `<a class="pc${p.soldOut ? ' sold' : ''}" href="/products/${esc(p.id)}" data-pid="${esc(p.id)}">
    <span class="pc-img">${p.img ? `<img src="${esc(p.img)}" alt="" loading="lazy">` : '<span class="ph"></span>'}${p.img2 ? `<img class="alt" src="${esc(p.img2)}" alt="" loading="lazy">` : ''}${badges ? `<span class="badges">${badges}</span>` : ''}</span>
    <span class="pc-name">${esc(p.name)}</span>
    <span class="pc-price">${price}</span>
    ${opt.button && !p.soldOut && p.price != null ? `<span class="pc-btn" data-quick="${esc(p.id)}" data-vkey="${esc(p.vkey ?? '')}" data-specs="${p.hasSpecs ? 1 : 0}">${p.hasSpecs ? '選擇規格' : '加入購物車'}</span>` : ''}
  </a>`;
}

const wrapStyle = (b) => {
  const s = [];
  if (b.pt != null) s.push(`padding-top:${+b.pt}px`);
  if (b.pb != null) s.push(`padding-bottom:${+b.pb}px`);
  if (b.bg) s.push(`background:${esc(b.bg)}`);
  return s.join(';');
};

const RENDER = {
  group(b, ctx) {
    const widths = (b.widths || []).map((w) => `${+w || 1}fr`).join(' ');
    return `<div class="b-group" style="--cols:${widths};gap:${+b.gap || 24}px">${(b.cols || []).map((c) => `<div class="b-col">${renderBlocks(c.blocks, ctx)}</div>`).join('')}</div>`;
  },
  image(b) {
    if (!b.src) return ctx0('圖片', '選擇一張圖片');
    const img = `<img src="${esc(b.src)}" alt="${esc(b.alt)}" loading="lazy" style="width:${+b.width || 100}%">`;
    return `<div class="b-image" style="text-align:${esc(b.align || 'center')}">${b.link ? `<a href="${esc(b.link)}">${img}</a>` : img}</div>`;
  },
  carousel(b) {
    const slides = (b.slides || []).filter((s) => s.src);
    if (!slides.length) return ctx0('圖片輪播', '加入幾張圖片');
    return `<div class="b-carousel" data-autoplay="${+b.autoplay || 0}" style="aspect-ratio:${esc(b.ratio || '16/7')}">
      <div class="track">${slides.map((s) => `<div class="slide">${s.link ? `<a href="${esc(s.link)}">` : ''}<img src="${esc(s.src)}" alt="${esc(s.alt || '')}">${s.link ? '</a>' : ''}</div>`).join('')}</div>
      ${slides.length > 1 ? `<button class="nav prev" aria-label="上一張">‹</button><button class="nav next" aria-label="下一張">›</button><div class="dots">${slides.map((_, i) => `<button aria-label="第 ${i + 1} 張"${i ? '' : ' class="on"'}></button>`).join('')}</div>` : ''}
    </div>`;
  },
  imageText(b) {
    const img = b.src ? `<img src="${esc(b.src)}" alt="" loading="lazy">` : '<span class="ph"></span>';
    return `<div class="b-imgtext ${esc(b.layout || 'left')}"><div class="it-img">${img}</div><div class="it-body"><h3>${esc(b.title)}</h3><p>${esc(b.text).replace(/\n/g, '<br>')}</p>${b.button && b.link ? `<a class="btn" href="${esc(b.link)}">${esc(b.button)}</a>` : ''}</div></div>`;
  },
  text(b) {
    return `<div class="b-text fade-text" style="text-align:${esc(b.align || 'left')}">${sanitize(b.html)}</div>`;
  },
  countdown(b) {
    return `<div class="b-countdown" data-until="${esc(b.until)}" data-done="${esc(b.done)}"><h3>${esc(b.title)}</h3><div class="cd">${b.until ? '' : '請設定結束時間'}</div></div>`;
  },
  products(b, ctx) {
    const items = b.items || [];
    const body = items.length ? items.map((p) => productCard(p, { button: ctx.listButton })).join('') : ctx0('商品列表', ctx.editing ? '依設定帶入商品，存檔後前台會顯示' : '目前沒有商品');
    const more = b.source === 'tag' && b.tag ? `/products?tag=${encodeURIComponent(b.tag)}` : '/products';
    return `${b.title ? `<div class="b-title"><h2>${esc(b.title)}</h2>${b.more !== false ? `<a href="${more}">看更多 ›</a>` : ''}</div>` : ''}<div class="grid" style="--cols:${+b.cols || 4}">${body}</div>`;
  },
  video(b) {
    const src = videoEmbed(b.url);
    if (!src) return ctx0('影片', '貼上 YouTube 或 Vimeo 網址');
    return `<div class="b-video" style="aspect-ratio:${esc(b.ratio || '16/9')}"><iframe src="${esc(src)}" allowfullscreen loading="lazy" title="影片"></iframe></div>`;
  },
  fbPage(b) {
    if (!b.url) return ctx0('臉書粉專', '貼上粉絲專頁網址');
    return `<div class="b-fb"><iframe src="https://www.facebook.com/plugins/page.php?href=${encodeURIComponent(b.url)}&tabs=timeline&width=500&height=${+b.height || 500}&small_header=false&adapt_container_width=true" height="${+b.height || 500}" loading="lazy" title="Facebook"></iframe></div>`;
  },
  share(b) {
    return `<div class="b-share"><span>${esc(b.title)}</span><button data-share="line">LINE</button><button data-share="fb">Facebook</button><button data-share="copy">複製連結</button></div>`;
  },
  menu(b, ctx) {
    const items = ctx.menus?.[b.menuId] || [];
    if (!items.length) return ctx0('選單', '到「選單目錄」設定選單項目');
    return `<nav class="b-menu ${esc(b.style)}" style="justify-content:${esc(b.align || 'center')}">${menuHTML(items)}</nav>`;
  },
  map(b) {
    if (!b.address) return ctx0('地圖', '填入地址');
    return `<div class="b-map"><iframe src="https://www.google.com/maps?q=${encodeURIComponent(b.address)}&output=embed" height="${+b.height || 360}" loading="lazy" title="地圖"></iframe></div>`;
  },
  spacer(b) {
    return `<div class="b-spacer" style="height:${+b.height || 40}px">${b.line ? '<hr>' : ''}</div>`;
  },
};

// 空區塊的提示（只有後台編輯時顯示）
let editingNow = false;
function ctx0(name, hint) {
  return editingNow ? `<div class="b-empty"><b>${esc(name)}</b><span>${esc(hint)}</span></div>` : '';
}

export function renderBlock(b, ctx = {}) {
  const fn = RENDER[b.type];
  if (!fn) return '';
  editingNow = !!ctx.editing;
  const inner = fn(b, ctx);
  if (!inner && !ctx.editing) return '';
  return `<section class="blk b-${esc(b.type)}${b.full ? ' full' : ''}" data-bid="${esc(b.id)}" style="${wrapStyle(b)}"><div class="blk-in">${inner}</div></section>`;
}

export function renderBlocks(blocks, ctx = {}) {
  return (blocks || []).map((b) => renderBlock(b, ctx)).join('');
}

// 互動：輪播、倒數、分享、淡入動畫
export function mount(root, opt = {}) {
  root.querySelectorAll('.b-carousel').forEach((el) => {
    if (el._on) return;
    el._on = true;
    const track = el.querySelector('.track');
    const n = track.children.length;
    let i = 0;
    const go = (k) => {
      i = (k + n) % n;
      track.style.transform = `translateX(${-i * 100}%)`;
      el.querySelectorAll('.dots button').forEach((d, j) => d.classList.toggle('on', j === i));
    };
    el.querySelector('.prev')?.addEventListener('click', () => go(i - 1));
    el.querySelector('.next')?.addEventListener('click', () => go(i + 1));
    el.querySelectorAll('.dots button').forEach((d, j) => d.addEventListener('click', () => go(j)));
    let x0 = null;
    el.addEventListener('touchstart', (e) => { x0 = e.touches[0].clientX; }, { passive: true });
    el.addEventListener('touchend', (e) => { if (x0 == null) return; const dx = e.changedTouches[0].clientX - x0; if (Math.abs(dx) > 40) go(i + (dx < 0 ? 1 : -1)); x0 = null; });
    const sec = +el.dataset.autoplay;
    if (sec && n > 1 && !opt.editing) setInterval(() => { if (!document.hidden) go(i + 1); }, sec * 1000);
  });
  root.querySelectorAll('.b-countdown').forEach((el) => {
    const until = el.dataset.until ? new Date(el.dataset.until).getTime() : 0;
    if (!until || el._on) return;
    el._on = true;
    const cd = el.querySelector('.cd');
    const tick = () => {
      const s = Math.max(0, Math.floor((until - Date.now()) / 1000));
      if (!s) { cd.textContent = el.dataset.done; return; }
      const d = Math.floor(s / 86400), h = Math.floor(s / 3600) % 24, m = Math.floor(s / 60) % 60, ss = s % 60;
      cd.innerHTML = [[d, '天'], [h, '時'], [m, '分'], [ss, '秒']].map(([v, u]) => `<span><b>${String(v).padStart(2, '0')}</b>${u}</span>`).join('');
      setTimeout(tick, 1000);
    };
    tick();
  });
  root.querySelectorAll('[data-share]').forEach((btn) => btn.addEventListener('click', (e) => {
    e.preventDefault();
    const url = location.href;
    if (btn.dataset.share === 'line') window.open('https://social-plugins.line.me/lineit/share?url=' + encodeURIComponent(url));
    if (btn.dataset.share === 'fb') window.open('https://www.facebook.com/sharer/sharer.php?u=' + encodeURIComponent(url));
    if (btn.dataset.share === 'copy') navigator.clipboard?.writeText(url).then(() => { btn.textContent = '已複製'; });
  }));
  root.querySelectorAll('.menu .sub-toggle').forEach((b) => b.addEventListener('click', (e) => { e.preventDefault(); b.parentElement.classList.toggle('open'); }));
  if (opt.fade && 'IntersectionObserver' in window) {
    const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -40px' });
    root.querySelectorAll(opt.fade).forEach((el) => { el.classList.add('fade'); io.observe(el); });
  }
}
