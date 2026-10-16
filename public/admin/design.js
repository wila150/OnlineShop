// 商店設計：頁面列表、頁面編輯器（拖拉元件）、選單目錄、全站外觀
import { api, $, $$, esc, icon, toast, modal, busy, fmt, pill, emptyBox, confirmBox, go, guard, sw, imageField, pickMedia, pickProducts, pickData, richText } from './app.js';
import { CATALOG, DEFAULT_BLOCK, renderBlocks, mount } from '/shared/blocks.js';

/* ---------- 頁面列表 ---------- */
export async function pages(el) {
  const { pages: list } = await api.get('pages');
  el.innerHTML = `<div class="page-head"><h1>頁面設計</h1><div class="actions"><a class="btn" href="/admin/theme">${icon('sparkle')}全站外觀</a><button class="btn primary" id="addP">${icon('plus')}新增頁面</button></div>
    <div class="sub">首頁和自訂分頁（例如品牌故事、門市資訊、活動頁）都在這裡編輯。商品列表頁和商品頁的樣式跟著全站外觀走。</div></div>
    <div class="card">${list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>頁面</th><th>網址</th><th class="num">區塊</th><th>更新時間</th><th></th></tr></thead><tbody>
      ${list.map((p) => `<tr class="click" data-id="${p.id}"><td class="strong">${p.home ? icon('home') + ' ' : ''}${esc(p.title)} ${p.home ? pill('首頁', 'accent') : ''}${p.hidden ? pill('隱藏') : ''}</td><td class="muted">${p.home ? '/' : '/pages/' + esc(p.slug)}</td><td class="num">${p.blocks}</td><td>${fmt.time(p.updatedAt)}</td>
        <td class="right nowrap"><a class="btn sm" href="${p.home ? '/' : '/pages/' + esc(p.slug)}" target="_blank" rel="noopener">${icon('eye')}</a> <button class="btn sm primary" data-edit>編輯</button>${p.home ? '' : ` <button class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button>`}</td></tr>`).join('')}</tbody></table></div>` : emptyBox('還沒有頁面')}</div>`;
  $$('tr[data-id]', el).forEach((tr) => {
    tr.onclick = (e) => {
      if (e.target.closest('a')) return;
      if (e.target.closest('[data-del]')) return;
      go('/admin/pages/' + tr.dataset.id);
    };
    $('[data-del]', tr)?.addEventListener('click', async () => {
      if (!(await confirmBox('刪除這個頁面？選單裡指到這頁的連結會失效。', { danger: true, ok: '刪除' }))) return;
      await api.post('pageDelete', { id: tr.dataset.id });
      pages(el);
    });
  });
  $('#addP', el).onclick = () => {
    const { box, close } = modal({ title: '新增頁面', body: `<label class="field"><span>頁面名稱</span><input class="input" name="title" placeholder="例如：品牌故事"></label><label class="field"><span>網址名稱（英文、數字、-）</span><input class="input" name="slug" placeholder="about"></label><label class="check"><input type="checkbox" name="home"> 設為首頁</label>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>建立</button>' });
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => {
      const home = $('[name=home]', box).checked;
      const r = await busy(e.currentTarget, () => api.post('pageSave', { title: $('[name=title]', box).value, slug: $('[name=slug]', box).value || (home ? 'home' : ''), home, blocks: [] }));
      close();
      go('/admin/pages/' + r.page.id);
    };
  };
}

/* ---------- 全站外觀表單（全站設定頁、編輯器左欄共用） ---------- */
const PALETTES = [
  { name: '霧藍', c: { bg: '#FFFFFF', menuBg: '#FFFFFF', menuText: '#5F5F5F', text: '#323232', primary: '#2F4A6D', line: '#E4DED8', primaryText: '#FFFFFF' } },
  { name: '米白', c: { bg: '#FBF8F3', menuBg: '#FBF8F3', menuText: '#6B5E50', text: '#3A322A', primary: '#8C6A4A', line: '#E8DFD3', primaryText: '#FFFFFF' } },
  { name: '墨黑', c: { bg: '#FFFFFF', menuBg: '#111111', menuText: '#EDEDED', text: '#1A1A1A', primary: '#111111', line: '#E5E5E5', primaryText: '#FFFFFF' } },
  { name: '森林', c: { bg: '#F6F7F2', menuBg: '#FFFFFF', menuText: '#4C5A4A', text: '#26302A', primary: '#2F5D46', line: '#DDE3D6', primaryText: '#FFFFFF' } },
  { name: '玫瑰', c: { bg: '#FFFFFF', menuBg: '#FFF6F6', menuText: '#7A5559', text: '#3B2B2D', primary: '#B4566A', line: '#F0DCDD', primaryText: '#FFFFFF' } },
  { name: '暖橘', c: { bg: '#FFFFFF', menuBg: '#FFFFFF', menuText: '#555555', text: '#2B2B2B', primary: '#D9622B', line: '#EFE3D8', primaryText: '#FFFFFF' } },
];
const COLOR_FIELDS = [['bg', '#1 網頁背景'], ['menuBg', '#2 選單背景'], ['menuText', '#3 選單文字'], ['text', '#4 網頁文字'], ['primary', '#5 主要按鈕'], ['line', '#6 框線與分隔線'], ['primaryText', '#7 主要按鈕文字']];

export function themeForm(box, t, onChange) {
  const sec = (key, title, body, open) => `<div class="acc-sec${open ? ' open' : ''}" data-sec="${key}"><button type="button">${title}${icon('chev')}</button><div>${body}</div></div>`;
  box.innerHTML = `<div class="pal-cat">視覺設計</div>
    ${sec('colors', '色彩配置', `<div class="field"><span>配色組合</span><div class="palette-pick">${PALETTES.map((p, i) => `<button type="button" data-pal="${i}" title="${p.name}">${['bg', 'menuText', 'text', 'primary', 'line'].map((k) => `<span style="background:${p.c[k]}"></span>`).join('')}</button>`).join('')}</div></div>
      ${COLOR_FIELDS.map(([k, n]) => `<div class="field"><span>${n}</span><div class="color-in"><input type="color" data-c="${k}" value="${esc(t.colors[k])}"><input class="input" data-ch="${k}" value="${esc(t.colors[k])}" maxlength="7"></div></div>`).join('')}`, true)}
    ${sec('btn', '按鈕', `<div class="field"><span>按鈕圓角</span><div class="seg" data-seg="radius">${[['round', '圓'], ['soft', '微圓'], ['square', '直角']].map(([v, n]) => `<button type="button" data-v="${v}" class="${t.radius === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>
      <div class="field"><span>商品列表按鈕</span><div class="seg" data-seg="listButton">${[['fill', '填色'], ['outline', '線框']].map(([v, n]) => `<button type="button" data-v="${v}" class="${t.listButton === v ? 'on' : ''}">${n}</button>`).join('')}</div></div>`)}
    ${sec('anim', '元件動畫', `<div class="switch-row"><div class="sr-body"><b>圖片淡入</b><small>捲動到圖片時淡入</small></div>${sw('', t.fadeImages, 'data-b="fadeImages"')}</div><div class="switch-row"><div class="sr-body"><b>文字淡入</b></div>${sw('', t.fadeText, 'data-b="fadeText"')}</div>`)}
    ${sec('layout', '版型', `<div class="field"><span>選單版型</span><select class="input" data-s="layout"><option value="top"${t.layout === 'top' ? ' selected' : ''}>置頂選單</option><option value="top-side"${t.layout === 'top-side' ? ' selected' : ''}>置頂＋側邊選單</option></select><span class="help">側邊選單的項目在「選單目錄 → 側邊選單」設定</span></div>
      <div class="field"><span>內容最大寬度</span><select class="input" data-n="width">${[1000, 1200, 1400, 1600].map((w) => `<option value="${w}"${t.width === w ? ' selected' : ''}>${w}px</option>`).join('')}</select></div>`)}
    ${sec('bg', '網頁背景', `<div class="field"><span>背景圖片</span><div id="bgImg"></div></div><label class="check"><input type="checkbox" data-b="bgRepeat" ${t.bgRepeat ? 'checked' : ''}> 重複背景圖（取消就是延展滿版）</label>`)}
    <div class="pal-cat">行銷推廣</div>
    ${sec('announce', '全站公告', `<div class="switch-row"><div class="sr-body"><b>顯示公告列</b><small>顯示在每一頁最上方</small></div>${sw('', t.announce.on, 'data-b="announce.on"')}</div>
      <div class="field"><span>公告文字</span><input class="input" data-t="announce.text" value="${esc(t.announce.text)}" placeholder="例如：全館滿 999 免運"></div>
      <div class="field"><span>連結（選填）</span><input class="input" data-t="announce.link" value="${esc(t.announce.link)}"></div>
      <div class="field"><span>背景顏色</span><div class="color-in"><input type="color" data-t="announce.color" value="${esc(t.announce.color)}"></div></div>`)}
    ${sec('popup', '彈窗廣告', `<div class="switch-row"><div class="sr-body"><b>前台彈窗</b><small>顧客每次造訪顯示一次</small></div>${sw('', t.popup.on, 'data-b="popup.on"')}</div>
      <div class="field"><span>圖片</span><div id="popImg"></div></div>
      <div class="field"><span>點擊連結（選填）</span><input class="input" data-t="popup.link" value="${esc(t.popup.link)}"></div>
      <div class="row"><label class="field"><span>開始日期</span><input class="input" type="date" data-t="popup.start" value="${esc(t.popup.start)}"></label><label class="field"><span>結束日期</span><input class="input" type="date" data-t="popup.end" value="${esc(t.popup.end)}"></label></div>`)}`;
  const set = (path, v) => { const [a, b] = path.split('.'); if (b) t[a][b] = v; else t[a] = v; onChange(t); };
  $$('.acc-sec>button', box).forEach((b) => (b.onclick = () => b.parentElement.classList.toggle('open')));
  $$('[data-pal]', box).forEach((b) => (b.onclick = () => { Object.assign(t.colors, PALETTES[+b.dataset.pal].c); $$('[data-c]', box).forEach((i) => (i.value = t.colors[i.dataset.c])); $$('[data-ch]', box).forEach((i) => (i.value = t.colors[i.dataset.ch])); onChange(t); }));
  $$('[data-c]', box).forEach((i) => (i.oninput = () => { t.colors[i.dataset.c] = i.value; $(`[data-ch=${i.dataset.c}]`, box).value = i.value; onChange(t); }));
  $$('[data-ch]', box).forEach((i) => (i.onchange = () => { if (/^#[0-9a-f]{6}$/i.test(i.value)) { t.colors[i.dataset.ch] = i.value; $(`[data-c=${i.dataset.ch}]`, box).value = i.value; onChange(t); } }));
  $$('[data-seg]', box).forEach((g) => $$('button', g).forEach((b) => (b.onclick = () => { $$('button', g).forEach((x) => x.classList.toggle('on', x === b)); set(g.dataset.seg, b.dataset.v); })));
  $$('[data-b]', box).forEach((i) => (i.onchange = () => set(i.dataset.b, i.checked)));
  $$('[data-t]', box).forEach((i) => (i.oninput = () => set(i.dataset.t, i.value)));
  $$('[data-s]', box).forEach((i) => (i.onchange = () => set(i.dataset.s, i.value)));
  $$('[data-n]', box).forEach((i) => (i.onchange = () => set(i.dataset.n, +i.value)));
  imageField($('#bgImg', box), t.bgImage, (u) => set('bgImage', u));
  imageField($('#popImg', box), t.popup.image, (u) => set('popup.image', u));
}

// 主題變數套到預覽（iframe 文件）
function applyTheme(doc, t) {
  const r = doc.documentElement.style;
  const c = t.colors;
  r.setProperty('--c-bg', c.bg); r.setProperty('--c-menu-bg', c.menuBg); r.setProperty('--c-menu-text', c.menuText); r.setProperty('--c-text', c.text);
  r.setProperty('--c-primary', c.primary); r.setProperty('--c-line', c.line); r.setProperty('--c-primary-text', c.primaryText);
  r.setProperty('--content-w', (t.width || 1200) + 'px');
  doc.body.className = `r-${t.radius}${t.listButton === 'fill' ? ' list-fill' : ''}`;
  doc.body.style.backgroundImage = t.bgImage ? `url("${t.bgImage}")` : '';
  doc.body.style.backgroundSize = t.bgRepeat ? '' : 'cover';
}

export async function theme(el) {
  const { settings } = await api.get('settings');
  const t = settings.theme;
  let dirty = false;
  guard(() => dirty);
  el.innerHTML = `<div class="page-head"><h1>全站外觀</h1><div class="actions"><a class="btn" href="/" target="_blank" rel="noopener">${icon('eye')}查看前台</a><button class="btn primary" id="save">儲存</button></div><div class="sub">色彩、按鈕、背景、全站公告、彈窗廣告。改完右邊會即時預覽。</div></div>
    <div class="split" style="grid-template-columns:360px minmax(0,1fr)"><div class="card" style="padding:0;overflow:hidden" id="tf"></div><div class="card" style="padding:0;overflow:hidden"><iframe id="pv" title="預覽" style="width:100%;height:70vh;border:0;display:block"></iframe></div></div>`;
  const frame = $('#pv', el);
  const sample = [{ id: 'a', type: 'text', html: '<h2>預覽標題</h2><p>這是內文的樣子，<a href="#">這是連結</a>。</p>', align: 'center' }, { id: 'b', type: 'products', title: '新品上架', source: 'all', cols: 4, limit: 4 }, { id: 'c', type: 'imageText', title: '圖片文字', text: '說明文字', button: '了解更多', link: '#', layout: 'left' }];
  const { products } = await pickData();
  const prev = (await api.get('pages')).menus;
  const menus = Object.fromEntries(prev.map((m) => [m.id, m.items]));
  const html = () => `${t.announce.on && t.announce.text ? `<div style="background:${esc(t.announce.color)};color:#fff;text-align:center;padding:6px;font-size:.85rem">${esc(t.announce.text)}</div>` : ''}<div class="fake-head" style="display:flex;gap:18px;align-items:center;padding:14px 20px;background:var(--c-menu-bg);color:var(--c-menu-text);border-bottom:1px solid var(--c-line)"><b style="color:var(--c-text)">${esc(settings.store.name)}</b>${(menus.top || []).slice(0, 6).map((m) => `<span>${esc(m.label)}</span>`).join('')}</div>${renderBlocks(fillProducts(sample, products), { menus, listButton: true })}`;
  await frameReady(frame);
  const draw = () => { applyTheme(frame.contentDocument, t); frame.contentDocument.body.innerHTML = html(); };
  draw();
  themeForm($('#tf', el), t, () => { dirty = true; draw(); });
  $('#save', el).onclick = async (e) => { await busy(e.currentTarget, () => api.post('settingsSave', { name: 'theme', value: t })); dirty = false; toast('已儲存，前台重新整理就會看到'); };
}

// iframe 預覽：載入前台樣式
function frameReady(frame, extraCss = '') {
  return new Promise((res) => {
    frame.onload = () => res(frame.contentDocument);
    frame.srcdoc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link href="https://fonts.googleapis.com/css2?family=Noto+Sans+TC:wght@400;500;700&display=swap" rel="stylesheet"><link rel="stylesheet" href="/store.css"><link rel="stylesheet" href="/shared/blocks.css"><style>body{min-height:100vh}${extraCss}</style></head><body></body></html>`;
  });
}

// 編輯器裡的商品列表區塊：用後台的商品資料先帶入
function fillProducts(blocks, products) {
  return blocks.map((b) => {
    if (b.type === 'group') return { ...b, cols: (b.cols || []).map((c) => ({ blocks: fillProducts(c.blocks, products) })) };
    if (b.type !== 'products') return b;
    let list = products.filter((p) => p.on);
    if (b.source === 'tag' && b.tag) list = list.filter((p) => p.tags.includes(b.tag));
    if (b.source === 'ids') list = (b.ids || []).map((id) => products.find((p) => p.id === id)).filter(Boolean);
    return { ...b, items: list.slice(0, b.limit || 8).map((p) => ({ id: p.id, name: p.name, img: p.img, price: p.price, soldOut: p.variants.every((v) => v.stock <= 0), hasSpecs: p.specs.length > 0, vkey: p.variants[0]?.key ?? '', notes: [] })) };
  });
}

/* ---------- 頁面編輯器 ---------- */
const EDIT_CSS = `.blk{position:relative;cursor:pointer;outline:1px dashed transparent;outline-offset:-1px;transition:outline-color .1s}
.blk:hover{outline-color:#7AA9F7}.blk.sel{outline:2px solid #2F6FE4;outline-offset:-2px}
.blk a,.blk iframe{pointer-events:none}
.tools{position:absolute;top:6px;right:6px;display:none;gap:2px;z-index:5;background:#2F6FE4;border-radius:6px;padding:2px}
.blk.sel>.tools{display:flex}
.tools button{border:0;background:transparent;color:#fff;width:28px;height:26px;border-radius:4px;display:grid;place-items:center;cursor:pointer;font-size:14px}
.tools button:hover{background:rgba(255,255,255,.22)}
.b-col{min-height:70px;outline:1px dashed #C9D3E2;outline-offset:-1px;position:relative}
.b-col:empty::after{content:"把元件拖到這一欄";position:absolute;inset:0;display:grid;place-items:center;color:#9AA4B2;font-size:13px}
.drop-line{height:4px;background:#2F6FE4;border-radius:2px;margin:-2px 12px;position:relative;z-index:6;pointer-events:none}
.canvas-empty{padding:120px 24px;text-align:center;color:#8A8F8C;border:2px dashed #D6DCE5;margin:24px;border-radius:12px}
.fake-head{display:flex;gap:18px;align-items:center;padding:14px 20px;background:var(--c-menu-bg);color:var(--c-menu-text);border-bottom:1px solid var(--c-line);font-size:14px;pointer-events:none}
.fake-head b{color:var(--c-text);font-size:16px}`;

const NAMES = Object.fromEntries(CATALOG.flatMap((c) => c.items.map((i) => [i.type, i.name])));
const uid = () => Math.random().toString(36).slice(2, 10);

export async function editor(el, id) {
  const [{ page }, { settings }, pick, { menus: menuList, pages: pageList }] = await Promise.all([api.get('page', { id }), api.get('settings'), pickData(true), api.get('menus')]);
  const theme = settings.theme;
  const menus = Object.fromEntries(menuList.map((m) => [m.id, m.items]));
  page.blocks ||= [];
  page.settings ||= {};
  let sel = null; // 選取的區塊 id
  let dirty = false, themeDirty = false;
  const undo = [], redo = [];
  guard(() => dirty || themeDirty);
  let dragType = null; // 從元件面板拖進來的類型
  let dragMove = null; // 拖曳中的既有區塊 id
  let mobile = false;

  document.body.classList.add('designing');
  el.innerHTML = `<div class="designer" id="dz">
    <div class="panel left">
      <div class="ptabs"><button class="on" data-pt="add" title="頁面元件">元件</button><button data-pt="page" title="頁面設定">頁面</button><button data-pt="site" title="全站設定">全站</button></div>
      <div id="ptAdd">${CATALOG.map((c) => `<div class="pal-cat">${c.cat}</div><div class="pal">${c.items.map((i) => `<button type="button" draggable="true" data-add="${i.type}">${icon(i.icon)}${i.name}</button>`).join('')}</div>`).join('')}<p class="muted small" style="padding:12px 16px">點一下加到選取區塊的下面，或直接拖到預覽畫面上。</p></div>
      <div id="ptPage" hidden class="props-body"></div>
      <div id="ptSite" hidden></div>
    </div>
    <div class="canvas-wrap">
      <div class="canvas-bar">
        <a class="btn sm" href="/admin/pages">‹ 返回</a><h2>${esc(page.title)}</h2>
        <button class="btn sm" id="undo" title="復原（⌘Z）">↶</button><button class="btn sm" id="redo" title="重做（⇧⌘Z）">↷</button>
        <div class="seg"><button type="button" class="on" data-dev="d" title="電腦">${icon('desktop')}</button><button type="button" data-dev="m" title="手機">${icon('phone')}</button></div>
        <a class="btn sm" href="${page.home ? '/' : '/pages/' + esc(page.slug)}" target="_blank" rel="noopener">${icon('eye')}前台</a>
        <button class="btn sm primary" id="save">儲存</button>
      </div>
      <iframe id="cv" title="頁面預覽" style="width:100%;max-width:1280px;flex:1;min-height:70vh;border:0;background:#fff;box-shadow:0 2px 20px rgba(0,0,0,.08);transition:max-width .25s"></iframe>
    </div>
    <div class="panel props" id="props"></div>
  </div>`;
  const frame = $('#cv', el);
  const doc = await frameReady(frame, EDIT_CSS);

  // 找區塊：回傳 { list, index, block }（可能在群組的某一欄裡）
  const find = (bid, list = page.blocks) => {
    for (let i = 0; i < list.length; i++) {
      if (list[i].id === bid) return { list, index: i, block: list[i] };
      if (list[i].type === 'group') for (const col of list[i].cols || []) { const r = find(bid, col.blocks); if (r) return r; }
    }
    return null;
  };
  const snapshot = () => { undo.push(JSON.stringify(page.blocks)); if (undo.length > 60) undo.shift(); redo.length = 0; };
  const change = (rerender = true) => { dirty = true; if (rerender) draw(); };

  const draw = () => {
    applyTheme(doc, theme);
    const blocks = fillProducts(page.blocks, pick.products);
    doc.body.innerHTML = `<div class="fake-head"><b>${esc(settings.store.name)}</b>${(menus.top || []).slice(0, 6).map((m) => `<span>${esc(m.label)}</span>`).join('')}</div>${blocks.length ? renderBlocks(blocks, { menus, listButton: true, editing: true }) : '<div class="canvas-empty">從左邊把元件拖進來，開始設計這個頁面</div>'}`;
    if (page.settings.bg) doc.body.style.background = page.settings.bg;
    $$('.blk', doc).forEach((s) => {
      s.draggable = true;
      s.insertAdjacentHTML('beforeend', `<div class="tools"><button data-t="up" title="上移">↑</button><button data-t="down" title="下移">↓</button><button data-t="dup" title="複製">⧉</button><button data-t="del" title="刪除">✕</button></div>`);
      if (s.dataset.bid === sel) s.classList.add('sel');
    });
    mount(doc.body, { editing: true });
  };

  const select = (bid) => { sel = bid; $$('.blk', doc).forEach((s) => s.classList.toggle('sel', s.dataset.bid === bid)); drawProps(); };

  // 新增區塊：加在選取區塊下面（同一個清單），沒選就加在最後
  const add = (type, target) => {
    snapshot();
    const b = { id: uid(), type, ...DEFAULT_BLOCK[type]() };
    if (target) target.list.splice(target.index, 0, b);
    else { const at = sel && find(sel); if (at) at.list.splice(at.index + 1, 0, b); else page.blocks.push(b); }
    sel = b.id;
    change();
    drawProps();
    setTimeout(() => $(`.blk[data-bid="${b.id}"]`, doc)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50);
  };

  // 預覽裡的點擊
  doc.addEventListener('click', (e) => {
    e.preventDefault();
    const tool = e.target.closest('.tools button');
    const blk = e.target.closest('.blk');
    if (!blk) { select(null); return; }
    const at = find(blk.dataset.bid);
    if (!at) return;
    if (tool) {
      snapshot();
      const { list, index, block } = at;
      if (tool.dataset.t === 'up' && index > 0) [list[index - 1], list[index]] = [list[index], list[index - 1]];
      if (tool.dataset.t === 'down' && index < list.length - 1) [list[index + 1], list[index]] = [list[index], list[index + 1]];
      if (tool.dataset.t === 'dup') { const c = JSON.parse(JSON.stringify(block)); const re = (b) => { b.id = uid(); (b.cols || []).forEach((col) => col.blocks.forEach(re)); }; re(c); list.splice(index + 1, 0, c); sel = c.id; }
      if (tool.dataset.t === 'del') { list.splice(index, 1); sel = null; }
      change();
      drawProps();
      return;
    }
    select(at.block.id);
  });

  // 拖曳：從面板拖進來、或拖動既有區塊
  let line = null;
  const clearLine = () => { line?.remove(); line = null; };
  const dropTarget = (e) => {
    // 在群組欄位裡
    const col = e.target.closest('.b-col');
    const container = col || doc.body;
    const items = [...container.children].filter((c) => c.classList.contains('blk'));
    let before = null;
    for (const it of items) { const r = it.getBoundingClientRect(); if (e.clientY < r.top + r.height / 2) { before = it; break; } }
    let list = page.blocks;
    if (col) {
      const grp = find(col.closest('.blk').dataset.bid).block;
      const ci = [...col.parentElement.children].indexOf(col);
      list = grp.cols[ci].blocks;
    }
    const index = before ? list.findIndex((b) => b.id === before.dataset.bid) : list.length;
    return { container, before, list, index };
  };
  doc.addEventListener('dragstart', (e) => { const blk = e.target.closest?.('.blk'); if (blk) { dragMove = blk.dataset.bid; e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', 'move'); } });
  doc.addEventListener('dragover', (e) => {
    if (!dragType && !dragMove) return;
    e.preventDefault();
    const t = dropTarget(e);
    clearLine();
    line = doc.createElement('div');
    line.className = 'drop-line';
    if (t.before) t.container.insertBefore(line, t.before); else t.container.append(line);
  });
  doc.addEventListener('dragleave', (e) => { if (!e.relatedTarget) clearLine(); });
  doc.addEventListener('drop', (e) => {
    e.preventDefault();
    clearLine();
    const t = dropTarget(e);
    if (dragType) { if (dragType === 'group' && t.list !== page.blocks) toast('群組裡面不能再放群組', true); else add(dragType, { list: t.list, index: t.index }); }
    else if (dragMove) {
      const from = find(dragMove);
      if (from && !(from.block.type === 'group' && t.list !== page.blocks)) {
        snapshot();
        const [b] = from.list.splice(from.index, 1);
        let idx = t.list.findIndex((x) => x.id === (t.before?.dataset.bid));
        if (idx < 0) idx = t.list.length;
        t.list.splice(idx, 0, b);
        change();
      }
    }
    dragType = dragMove = null;
  });
  doc.addEventListener('dragend', () => { dragMove = null; clearLine(); });

  // 左欄
  $$('[data-add]', el).forEach((b) => {
    b.onclick = () => add(b.dataset.add);
    b.ondragstart = (e) => { dragType = b.dataset.add; e.dataTransfer.setData('text/plain', b.dataset.add); e.dataTransfer.effectAllowed = 'copy'; };
    b.ondragend = () => { dragType = null; clearLine(); };
  });
  $$('[data-pt]', el).forEach((b) => (b.onclick = () => {
    $$('[data-pt]', el).forEach((x) => x.classList.toggle('on', x === b));
    $('#ptAdd', el).hidden = b.dataset.pt !== 'add';
    $('#ptPage', el).hidden = b.dataset.pt !== 'page';
    $('#ptSite', el).hidden = b.dataset.pt !== 'site';
  }));
  const ps = page.settings;
  $('#ptPage', el).innerHTML = `<label class="field"><span>頁面名稱</span><input class="input" data-pg="title" value="${esc(page.title)}"></label>
    ${page.home ? '<p class="muted small">這是首頁</p>' : `<label class="field"><span>網址名稱</span><input class="input" data-pg="slug" value="${esc(page.slug)}"><span class="help">/pages/網址名稱</span></label><label class="check"><input type="checkbox" data-pg="hidden" ${page.hidden ? 'checked' : ''}> 隱藏（只有知道網址的人看得到）</label>`}
    <div class="field"><span>頁面背景色</span><div class="color-in"><input type="color" data-ps="bg" value="${esc(ps.bg || '#ffffff')}"><button type="button" class="btn sm" data-psclear>不使用</button></div></div>
    <label class="field"><span>搜尋引擎標題</span><input class="input" data-ps="seoTitle" value="${esc(ps.seoTitle || '')}"></label>
    <label class="field"><span>搜尋引擎描述</span><textarea class="input" data-ps="seoDesc">${esc(ps.seoDesc || '')}</textarea></label>`;
  $$('[data-pg]', el).forEach((i) => (i.oninput = i.onchange = () => { page[i.dataset.pg] = i.type === 'checkbox' ? i.checked : i.value; dirty = true; }));
  $$('[data-ps]', el).forEach((i) => (i.oninput = () => { ps[i.dataset.ps] = i.value; change(i.dataset.ps === 'bg'); }));
  $('[data-psclear]', el).onclick = () => { ps.bg = ''; doc.body.style.background = ''; change(); };
  themeForm($('#ptSite', el), theme, () => { themeDirty = true; draw(); });

  // 右欄：選取區塊的屬性
  const linkList = `<datalist id="links"><option value="/">首頁</option><option value="/products">全部商品</option>${pageList.map((p) => `<option value="/pages/${esc(p.slug)}">${esc(p.title)}</option>`).join('')}${pick.tags.map((t) => `<option value="/products?tag=${encodeURIComponent(t)}">標籤：${esc(t)}</option>`).join('')}</datalist>`;
  const F = {
    text: (k, label, b, ph = '') => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" value="${esc(b[k] ?? '')}" placeholder="${esc(ph)}"></label>`,
    link: (k, label, b) => `<label class="field"><span>${label}</span><input class="input" data-k="${k}" list="links" value="${esc(b[k] ?? '')}" placeholder="選擇或輸入網址"></label>`,
    area: (k, label, b) => `<label class="field"><span>${label}</span><textarea class="input" data-k="${k}">${esc(b[k] ?? '')}</textarea></label>`,
    num: (k, label, b, min = 0, max = 2000) => `<label class="field"><span>${label}</span><input class="input" type="number" min="${min}" max="${max}" data-k="${k}" data-num value="${b[k] ?? ''}"></label>`,
    range: (k, label, b, min, max, unit = '') => `<label class="field"><span>${label}：<b data-out="${k}">${b[k]}${unit}</b></span><input type="range" min="${min}" max="${max}" data-k="${k}" data-num value="${b[k]}"></label>`,
    sel: (k, label, b, opts) => `<label class="field"><span>${label}</span><select class="input" data-k="${k}">${opts.map(([v, n]) => `<option value="${esc(v)}"${String(b[k]) === String(v) ? ' selected' : ''}>${esc(n)}</option>`).join('')}</select></label>`,
    check: (k, label, b) => `<label class="check" style="margin-bottom:12px"><input type="checkbox" data-k="${k}" data-bool ${b[k] ? 'checked' : ''}> ${label}</label>`,
    img: (k, label) => `<div class="field"><span>${label}</span><div data-img="${k}"></div></div>`,
  };
  const ALIGN = [['left', '靠左'], ['center', '置中'], ['right', '靠右']];
  const FORMS = {
    image: (b) => F.img('src', '圖片') + F.link('link', '點擊連結', b) + F.text('alt', '替代文字（給看不到圖的人）', b) + F.range('width', '寬度', b, 20, 100, '%') + F.sel('align', '對齊', b, ALIGN),
    carousel: (b) => `<div class="field"><span>輪播圖片</span><div class="slides">${(b.slides || []).map((s, i) => `<div class="sl" data-si="${i}"><img src="${esc(s.src)}" alt=""><input class="input" data-sk="link" list="links" value="${esc(s.link || '')}" placeholder="點擊連結"><span class="inline"><button type="button" class="btn sm ghost" data-sm="-1" aria-label="上移">↑</button><button type="button" class="btn sm ghost" data-srm aria-label="移除">✕</button></span></div>`).join('')}</div><button type="button" class="btn sm" data-addslide>${icon('plus')}加入圖片</button></div>`
      + F.sel('ratio', '比例', b, [['16/7', '寬版 16:7'], ['16/9', '16:9'], ['3/1', '超寬 3:1'], ['4/3', '4:3'], ['1/1', '正方形']]) + F.sel('autoplay', '自動播放', b, [[0, '不自動'], [3, '每 3 秒'], [5, '每 5 秒'], [8, '每 8 秒']]),
    imageText: (b) => F.img('src', '圖片') + F.text('title', '標題', b) + F.area('text', '說明文字', b) + F.text('button', '按鈕文字', b) + F.link('link', '按鈕連結', b) + F.sel('layout', '排列', b, [['left', '圖左文右'], ['right', '文左圖右'], ['overlay', '文字壓在圖上']]),
    text: (b) => `<div class="field"><span>內容</span><div data-rte></div></div>` + F.sel('align', '對齊', b, ALIGN),
    countdown: (b) => F.text('title', '標題', b) + `<label class="field"><span>結束時間</span><input class="input" type="datetime-local" data-k="until" value="${esc(b.until || '')}"></label>` + F.text('done', '結束後顯示', b),
    products: (b) => F.text('title', '標題', b) + F.sel('source', '商品來源', b, [['all', '全部商品'], ['tag', '依標籤'], ['ids', '指定商品']])
      + (b.source === 'tag' ? F.sel('tag', '標籤', b, [['', '請選擇'], ...pick.tags.map((t) => [t, t])]) : '')
      + (b.source === 'ids' ? `<div class="field"><span>已選 ${(b.ids || []).length} 個商品</span><button type="button" class="btn sm" data-pickp>選擇商品</button></div>` : F.sel('sort', '排序', b, [['new', '最新上架'], ['hot', '熱門'], ['priceAsc', '價格低到高'], ['priceDesc', '價格高到低']]))
      + F.num('limit', '最多顯示幾個', b, 1, 48) + F.sel('cols', '每列幾個（電腦版）', b, [[2, 2], [3, 3], [4, 4], [5, 5]]) + F.check('more', '顯示「看更多」連結', { more: b.more !== false }),
    video: (b) => F.text('url', 'YouTube 或 Vimeo 網址', b, 'https://www.youtube.com/watch?v=…') + F.sel('ratio', '比例', b, [['16/9', '16:9'], ['9/16', '直式 9:16'], ['4/3', '4:3'], ['1/1', '正方形']]),
    fbPage: (b) => F.text('url', '粉絲專頁網址', b, 'https://www.facebook.com/…') + F.num('height', '高度', b, 200, 1000),
    share: (b) => F.text('title', '文字', b),
    menu: (b) => F.sel('menuId', '選單', b, menuList.map((m) => [m.id, m.name])) + F.sel('style', '排列', b, [['horizontal', '橫向'], ['vertical', '直向']]) + F.sel('align', '對齊', b, [['flex-start', '靠左'], ['center', '置中'], ['flex-end', '靠右']]),
    map: (b) => F.text('address', '地址', b) + F.num('height', '高度', b, 150, 900),
    spacer: (b) => F.range('height', '高度', b, 0, 200, 'px') + F.check('line', '顯示分隔線', b),
    group: (b) => `${F.sel('n', '欄數', { n: b.cols.length }, [[2, '2 欄'], [3, '3 欄'], [4, '4 欄']])}<label class="field"><span>欄寬比例（例如 1,2）</span><input class="input" data-widths value="${esc((b.widths || []).join(','))}"></label>${F.num('gap', '欄距', b, 0, 80)}<p class="muted small">把左邊的元件拖到預覽裡的欄位中。手機版會自動變成一欄。</p>`,
  };
  const COMMON = (b) => `<div class="pal-cat" style="margin:16px -16px 12px">區塊外觀</div><div class="row">${F.num('pt', '上方留白', { pt: b.pt ?? 24 }, 0, 200)}${F.num('pb', '下方留白', { pb: b.pb ?? 24 }, 0, 200)}</div>
    <div class="field"><span>區塊背景色</span><div class="color-in"><input type="color" data-k="bg" value="${esc(b.bg || '#ffffff')}"><button type="button" class="btn sm" data-bgclear>不使用</button></div></div>${F.check('full', '滿版（不限內容寬度）', b)}`;

  const drawProps = () => {
    const box = $('#props', el);
    const at = sel && find(sel);
    if (!at) { box.innerHTML = `<div class="props-title">屬性</div><div class="props-body">${emptyBox('點一下預覽裡的區塊來編輯')}</div>${linkList}`; return; }
    const b = at.block;
    box.innerHTML = `<div class="props-title">${esc(NAMES[b.type] || b.type)}<div class="actions"><button class="btn sm ghost" data-x title="取消選取">${icon('x')}</button></div></div><div class="props-body">${FORMS[b.type](b)}${COMMON(b)}</div>${linkList}`;
    let snap = false;
    const touch = () => { if (!snap) { snapshot(); snap = true; } };
    $('[data-x]', box).onclick = () => select(null);
    $$('[data-k]', box).forEach((i) => {
      const ev = i.tagName === 'SELECT' || i.type === 'checkbox' ? 'change' : 'input';
      i.addEventListener(ev, () => {
        touch();
        const k = i.dataset.k;
        b[k] = i.dataset.bool !== undefined ? i.checked : i.dataset.num !== undefined ? +i.value : i.value;
        if (k === 'n') return;
        const out = $(`[data-out="${k}"]`, box); if (out) out.textContent = i.value + (out.textContent.replace(/[\d.]/g, ''));
        change();
        if (['source', 'cols'].includes(k) || (b.type === 'products' && k === 'source')) drawProps();
      });
    });
    $('[data-bgclear]', box).onclick = () => { touch(); delete b.bg; change(); drawProps(); };
    $$('[data-img]', box).forEach((d) => imageField(d, b[d.dataset.img], (u) => { touch(); b[d.dataset.img] = u; change(); }));
    if (b.type === 'text') richText($('[data-rte]', box), b.html, (h) => { touch(); b.html = h; change(); });
    if (b.type === 'carousel') {
      $('[data-addslide]', box).onclick = async () => { const us = await pickMedia({ multiple: true }); if (!us.length) return; touch(); b.slides.push(...us.map((src) => ({ src, link: '' }))); change(); drawProps(); };
      $$('.sl', box).forEach((row) => {
        const i = +row.dataset.si;
        $('[data-sk]', row).oninput = (e) => { touch(); b.slides[i].link = e.target.value; dirty = true; };
        $('[data-srm]', row).onclick = () => { touch(); b.slides.splice(i, 1); change(); drawProps(); };
        $('[data-sm]', row).onclick = () => { if (!i) return; touch(); [b.slides[i - 1], b.slides[i]] = [b.slides[i], b.slides[i - 1]]; change(); drawProps(); };
      });
    }
    if (b.type === 'products') $('[data-pickp]', box)?.addEventListener('click', async () => { const ids = await pickProducts({ selected: b.ids || [] }); if (ids) { touch(); b.ids = ids; change(); drawProps(); } });
    if (b.type === 'group') {
      $('[data-k=n]', box).onchange = (e) => { touch(); const n = +e.target.value; while (b.cols.length < n) b.cols.push({ blocks: [] }); if (b.cols.slice(n).some((c) => c.blocks.length) && !confirm('多出來的欄位有內容，確定刪掉？')) return drawProps(); b.cols = b.cols.slice(0, n); b.widths = Array(n).fill(1); change(); drawProps(); };
      $('[data-widths]', box).oninput = (e) => { touch(); b.widths = e.target.value.split(/[,，]/).map((x) => +x || 1).slice(0, b.cols.length); change(); };
    }
  };

  const doUndo = () => { if (!undo.length) return; redo.push(JSON.stringify(page.blocks)); page.blocks = JSON.parse(undo.pop()); if (sel && !find(sel)) sel = null; change(); drawProps(); };
  const doRedo = () => { if (!redo.length) return; undo.push(JSON.stringify(page.blocks)); page.blocks = JSON.parse(redo.pop()); change(); drawProps(); };
  $('#undo', el).onclick = doUndo;
  $('#redo', el).onclick = doRedo;
  const keys = (e) => {
    if (!document.body.classList.contains('designing')) return document.removeEventListener('keydown', keys);
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName) && !document.activeElement.isContentEditable) { e.preventDefault(); e.shiftKey ? doRedo() : doUndo(); }
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); $('#save', el)?.click(); }
  };
  document.addEventListener('keydown', keys);
  doc.addEventListener('keydown', keys);

  $$('[data-dev]', el).forEach((b) => (b.onclick = () => { mobile = b.dataset.dev === 'm'; $$('[data-dev]', el).forEach((x) => x.classList.toggle('on', x === b)); frame.style.maxWidth = mobile ? '390px' : '1280px'; }));
  $('#save', el).onclick = async (e) => {
    await busy(e.currentTarget, async () => {
      await api.post('pageSave', { id, title: page.title, slug: page.slug, home: page.home, hidden: page.hidden, settings: page.settings, blocks: page.blocks });
      if (themeDirty) await api.post('settingsSave', { name: 'theme', value: theme });
    });
    dirty = themeDirty = false;
    toast('已儲存');
  };

  draw();
  drawProps();
}

/* ---------- 選單目錄 ---------- */
const MENU_TYPES = [['page', '頁面'], ['tag', '商品標籤'], ['all', '全部商品'], ['url', '網址'], ['none', '不連結（只當分類）']];
const DEFAULT_MENUS = [['top', '置頂選單'], ['side', '側邊選單'], ['footer', '頁尾選單']];

export async function menus(el) {
  const data = await api.get('menus');
  const map = Object.fromEntries(data.menus.map((m) => [m.id, m]));
  for (const [id, name] of DEFAULT_MENUS) map[id] ||= { id, name, items: [] };
  let cur = new URLSearchParams(location.search).get('m') || 'top';
  let dirty = false;
  guard(() => dirty);

  const draw = () => {
    const m = map[cur];
    el.innerHTML = `<div class="page-head"><h1>選單目錄</h1><div class="sub">置頂選單在每頁上方，側邊選單在「置頂＋側邊選單」版型才會顯示（手機版會收在左上角選單裡），頁尾選單在每頁最下面。最多三層。</div></div>
      <div class="card">
        <div class="inline" style="margin-bottom:16px"><select class="input" id="mSel" style="width:220px">${Object.values(map).map((x) => `<option value="${x.id}"${x.id === cur ? ' selected' : ''}>${esc(x.name)}</option>`).join('')}</select><button class="btn" id="mAdd" title="新增選單">${icon('plus')}新增選單</button>${DEFAULT_MENUS.some(([id]) => id === cur) ? '' : `<button class="btn danger" id="mDel">${icon('trash')}刪除這個選單</button>`}<span style="flex:1"></span><button class="btn primary" id="mSave">儲存</button></div>
        <div class="field" style="max-width:320px"><span>選單名稱</span><input class="input" id="mName" value="${esc(m.name)}"></div>
        <ul class="menu-tree" id="tree"></ul>
        <button class="btn" id="itemAdd" style="margin-top:12px">${icon('plus')}新增項目</button>
        <datalist id="mtags">${data.tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>
      </div>`;
    const tree = $('#tree', el);
    const valueField = (it) => it.type === 'page' ? `<select class="input" data-f="value">${data.pages.map((p) => `<option value="${esc(p.slug)}"${it.value === p.slug ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select>`
      : it.type === 'tag' ? `<input class="input" data-f="value" list="mtags" value="${esc(it.value)}" placeholder="標籤名稱">`
      : it.type === 'url' ? `<input class="input" data-f="value" value="${esc(it.value)}" placeholder="https://">` : '<span></span>';
    const render = (items, depth) => items.map((it, i) => `<li data-i="${i}"><div class="mi"><span class="inline"><button type="button" class="btn sm ghost" data-mv="-1" aria-label="上移">↑</button><button type="button" class="btn sm ghost" data-mv="1" aria-label="下移">↓</button></span>
      <input class="input" data-f="label" value="${esc(it.label)}" placeholder="顯示文字"><select class="input" data-f="type">${MENU_TYPES.map(([v, n]) => `<option value="${v}"${it.type === v ? ' selected' : ''}>${n}</option>`).join('')}</select>${valueField(it)}
      <span class="inline">${depth < 2 ? '<button type="button" class="btn sm" data-sub title="新增子項目">＋子項目</button>' : ''}<button type="button" class="btn sm danger" data-rm aria-label="刪除">${icon('trash')}</button></span></div>${it.children?.length ? `<ul>${render(it.children, depth + 1)}</ul>` : ''}</li>`).join('');
    const redraw = () => { tree.innerHTML = m.items.length ? render(m.items, 0) : `<li>${emptyBox('還沒有項目')}</li>`; };
    const path = (li) => { const p = []; let x = li; while (x && x.tagName === 'LI') { p.unshift(+x.dataset.i); x = x.parentElement.closest('li'); } return p; };
    const at = (p) => { let list = m.items; for (let k = 0; k < p.length - 1; k++) list = list[p[k]].children; return { list, i: p[p.length - 1] }; };
    tree.addEventListener('input', (e) => { const f = e.target.dataset.f; if (!f) return; const { list, i } = at(path(e.target.closest('li'))); list[i][f] = e.target.value; dirty = true; if (f === 'type') { list[i].value = list[i].type === 'page' ? data.pages[0]?.slug || '' : ''; redraw(); } });
    tree.addEventListener('click', (e) => {
      const li = e.target.closest('li[data-i]');
      if (!li) return;
      const { list, i } = at(path(li));
      if (e.target.closest('[data-rm]')) { list.splice(i, 1); dirty = true; redraw(); }
      if (e.target.closest('[data-sub]')) { (list[i].children ||= []).push({ label: '', type: 'tag', value: '', children: [] }); dirty = true; redraw(); }
      const mv = e.target.closest('[data-mv]');
      if (mv) { const j = i + +mv.dataset.mv; if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; dirty = true; redraw(); } }
    });
    redraw();
    $('#mName', el).oninput = (e) => { m.name = e.target.value; dirty = true; };
    $('#itemAdd', el).onclick = () => { m.items.push({ label: '', type: 'all', value: '', children: [] }); dirty = true; redraw(); $$('[data-f=label]', tree).pop()?.focus(); };
    $('#mSel', el).onchange = async (e) => { if (dirty && !(await confirmBox('有修改還沒儲存，確定切換？'))) { e.target.value = cur; return; } dirty = false; cur = e.target.value; draw(); };
    $('#mAdd', el).onclick = () => { const id = 'm' + uid().slice(0, 6); map[id] = { id, name: '新選單', items: [] }; cur = id; dirty = true; draw(); };
    $('#mDel', el)?.addEventListener('click', async () => { if (!(await confirmBox('刪除這個選單？', { danger: true, ok: '刪除' }))) return; await api.post('menuDelete', { id: cur }); delete map[cur]; cur = 'top'; dirty = false; draw(); });
    $('#mSave', el).onclick = async (e) => { await busy(e.currentTarget, () => api.post('menuSave', { id: cur, name: m.name, items: m.items })); dirty = false; toast('已儲存'); };
  };
  draw();
}
