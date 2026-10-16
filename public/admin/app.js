// 後台核心：登入、選單、路由，以及各頁共用的小元件
import { api as rawApi, auth, authMessage } from '/shared/fb.js';
import { esc, money } from '/shared/blocks.js';

export { esc, money };
export const $ = (s, el = document) => el.querySelector(s);
export const $$ = (s, el = document) => [...el.querySelectorAll(s)];
export const view = $('#view');
export const ctx = { me: null, store: null };
// 目前登入的員工有沒有這個權限（只用來藏按鈕，真正的檢查在後端）
export const can = (k) => !!ctx.me?.perms.includes(k);

export const api = {
  get: (a, params = {}) => rawApi('/api/admin?' + new URLSearchParams({ a, ...params })),
  post: (a, body = {}) => rawApi('/api/admin', { method: 'POST', body: { a, ...body } }),
  // 下載 CSV（要帶登入 token，所以不能直接開連結）
  async download(a, params = {}) {
    const r = await rawApi('/api/admin?' + new URLSearchParams({ a, ...params }), { raw: true });
    const name = decodeURIComponent((r.headers.get('content-disposition') || '').match(/filename\*=UTF-8''([^;]+)/)?.[1] || 'export.csv');
    const url = URL.createObjectURL(await r.blob());
    Object.assign(document.createElement('a'), { href: url, download: name }).click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  },
};

/* ---------- 圖示 ---------- */
const P = {
  home: '<path d="M3 11 12 4l9 7v9h-6v-6H9v6H3z"/>',
  orders: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v3h6V3M9 11h6M9 15h4"/>',
  box: '<path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z"/><path d="m4 7.5 8 4.5 8-4.5M12 12v9"/>',
  chat: '<path d="M4 5h16v11H9l-5 4V5Z"/><path d="M8 10h.01M12 10h.01M16 10h.01"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-3.6 3-5.5 6.5-5.5s6.5 1.9 6.5 5.5"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.6c2 .7 3.5 2.4 3.5 5.4"/>',
  store: '<path d="M4 9 5.5 4h13L20 9M4 9v11h16V9M4 9c0 1.7 1.3 3 3 3s3-1.3 3-3c0 1.7 1.3 3 2 3s3-1.3 3-3c0 1.7 1.3 3 3 3s3-1.3 3-3"/><path d="M10 20v-5h4v5"/>',
  megaphone: '<path d="M3 10v4h3l7 4V6L6 10H3Z"/><path d="M17 8a5 5 0 0 1 0 8M6 14l1 5h3l-1-4.5"/>',
  folder: '<path d="M3 6h6l2 2h10v11H3z"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  x: '<path d="M6 6l12 12M18 6 6 18"/>',
  up: '<path d="m6 15 6-6 6 6"/>',
  down: '<path d="m6 9 6 6 6-6"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M5 7l1 13h12l1-13M9 7V4h6v3"/>',
  download: '<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>',
  upload: '<path d="M12 20V9M7 14l5-5 5 5M5 4h14"/>',
  filter: '<path d="M4 6h16M7 12h10M10 18h4"/>',
  image: '<rect x="3" y="4" width="18" height="16" rx="2"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/>',
  slides: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M9 20h.01M12 20h.01M15 20h.01"/><circle cx="9" cy="9" r="1.5"/><path d="m21 14-5-4-7 6"/>',
  imageText: '<path d="M3 5h7M3 9h7M3 13h4"/><rect x="12" y="9" width="9" height="11" rx="1"/><path d="m21 17-3-3-6 6"/>',
  text: '<path d="M5 6V4h14v2M12 4v16M9 20h6"/>',
  clock: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l3 2M9 2h6"/>',
  grid: '<rect x="3" y="4" width="7" height="7" rx="1"/><rect x="3" y="13" width="7" height="7" rx="1"/><path d="M13 6h8M13 9h5M13 15h8M13 18h5"/>',
  play: '<circle cx="12" cy="12" r="9"/><path d="m10 8 6 4-6 4V8Z"/>',
  fb: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 8h-2a2 2 0 0 0-2 2v11M9 13h6"/>',
  share: '<circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="m8.6 13.5 6.8 4M15.4 6.5l-6.8 4"/>',
  list: '<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  pin: '<path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11Z"/><circle cx="12" cy="10" r="2.5"/>',
  spacer: '<path d="M4 4h16M4 20h16M12 8v8M9 10l3-3 3 3M9 14l3 3 3-3"/>',
  columns: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
  desktop: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  bag: '<path d="M6 7h12l-1 13H7L6 7Z"/><path d="M9 7a3 3 0 0 1 6 0"/>',
  user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 4-6 8-6s8 2 8 6"/>',
  dollar: '<circle cx="12" cy="12" r="9"/><path d="M15 9a3 3 0 0 0-3-1.5c-1.7 0-3 .9-3 2.2 0 3 6 1.6 6 4.6 0 1.3-1.3 2.2-3 2.2A3 3 0 0 1 9 15M12 6v1.5M12 16.5V18"/>',
  truck: '<path d="M2 6h12v10H2zM14 10h4l3 3v3h-7z"/><circle cx="6" cy="18" r="2"/><circle cx="17" cy="18" r="2"/>',
  file: '<path d="M6 3h9l4 4v14H6z"/><path d="M14 3v5h5M9 13l6 6M15 13l-6 6"/>',
  plug: '<path d="m9 15-4 4M15 9l4-4M7 11l6 6M11 7l6 6M8 12l4-4 4 4-4 4z"/>',
  bell: '<path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2ZM10 21h4"/>',
  key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 9-9M17 6l3 3M15 8l2 2"/>',
  tag: '<path d="M3 12V3h9l9 9-9 9-9-9Z"/><circle cx="8" cy="8" r="1.5"/>',
  inbox: '<path d="M3 13h5l2 3h4l2-3h5M5 5h14l2 8v6H3v-6l2-8Z"/>',
  drag: '<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="m14 6 4 4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9L12 3Z"/>',
  sparkle: '<path d="M12 3v4M12 17v4M3 12h4M17 12h4M6 6l2.5 2.5M15.5 15.5 18 18M6 18l2.5-2.5M15.5 8.5 18 6"/>',
};
export const icon = (n, cls = '') => `<svg viewBox="0 0 24 24" class="${cls}" aria-hidden="true">${P[n] || ''}</svg>`;

/* ---------- 提示、彈窗 ---------- */
let tt;
export function toast(msg, bad) {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'toast on' + (bad ? ' bad' : '');
  clearTimeout(tt);
  tt = setTimeout(() => t.classList.remove('on'), bad ? 4000 : 2400);
}

// 開彈窗：回傳 { box, close }；onClose 在關閉時呼叫
export function modal({ title, body, foot = '', size = '', onClose } = {}) {
  const m = $('#modal'), box = $('#modalBox');
  box.className = 'modal-box ' + size;
  box.innerHTML = `<div class="modal-h"><h2>${esc(title || '')}</h2><button class="icon-btn" data-x aria-label="關閉">${icon('x')}</button></div><div class="modal-b">${body}</div>${foot ? `<div class="modal-f">${foot}</div>` : ''}`;
  m.hidden = false;
  const close = () => { m.hidden = true; box.innerHTML = ''; onClose?.(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  $('[data-x]', box).addEventListener('click', close);
  $('.modal-bg', m).onclick = close;
  setTimeout(() => $('input:not([type=checkbox]):not([type=hidden]),textarea,select', box)?.focus(), 30);
  return { box, close };
}

export function confirmBox(msg, { ok = '確定', danger } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { box, close } = modal({ title: '請確認', body: `<p style="margin:0;white-space:pre-wrap">${esc(msg)}</p>`, foot: `<button class="btn" data-no>取消</button><button class="btn ${danger ? 'danger' : 'primary'}" data-ok>${esc(ok)}</button>`, onClose: () => { if (!done) resolve(false); } });
    $('[data-no]', box).onclick = () => close();
    $('[data-ok]', box).onclick = () => { done = true; close(); resolve(true); };
  });
}

export function promptBox(title, { label = '', value = '', placeholder = '', textarea } = {}) {
  return new Promise((resolve) => {
    let done = false;
    const { box, close } = modal({ title, body: `<label class="field"><span>${esc(label)}</span>${textarea ? `<textarea class="input" placeholder="${esc(placeholder)}">${esc(value)}</textarea>` : `<input class="input" value="${esc(value)}" placeholder="${esc(placeholder)}">`}</label>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>確定</button>', onClose: () => { if (!done) resolve(null); } });
    const inp = $('.input', box);
    $('[data-no]', box).onclick = () => close();
    const ok = () => { done = true; const v = inp.value; close(); resolve(v); };
    $('[data-ok]', box).onclick = ok;
    if (!textarea) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') ok(); });
  });
}

// 按鈕執行中：停用、顯示處理中，出錯跳提示
export async function busy(btn, fn) {
  const t = btn?.innerHTML;
  if (btn) { btn.disabled = true; btn.innerHTML = '處理中…'; }
  try { return await fn(); } catch (e) { toast(e.message, true); throw e; } finally { if (btn) { btn.disabled = false; btn.innerHTML = t; } }
}

/* ---------- 格式 ---------- */
export const fmt = {
  date: (t) => (t ? new Date(t).toLocaleDateString('zh-TW', { year: 'numeric', month: '2-digit', day: '2-digit' }) : '-'),
  time: (t) => (t ? new Date(t).toLocaleString('zh-TW', { hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '-'),
  short: (t) => { if (!t) return ''; const d = new Date(t); const now = new Date(); return d.toDateString() === now.toDateString() ? d.toLocaleTimeString('zh-TW', { hour12: false, hour: '2-digit', minute: '2-digit' }) : d.getFullYear() === now.getFullYear() ? `${d.getMonth() + 1}月${d.getDate()}日` : fmt.date(t); },
  ymd: (t) => (t ? new Date(t + 8 * 3600e3).toISOString().slice(0, 10) : ''),
};

export const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;
export const sw = (name, on, attrs = '') => `<label class="sw"><input type="checkbox" ${name ? `name="${esc(name)}"` : ''} ${on ? 'checked' : ''} ${attrs}><span></span></label>`;
export const emptyBox = (msg) => `<div class="empty">${icon('inbox')}<div>${esc(msg)}</div></div>`;

// 分頁
export function pager(total, page, size, onGo) {
  const pages = Math.max(1, Math.ceil(total / size));
  const el = document.createElement('div');
  el.className = 'pager';
  el.innerHTML = `<span>總共 ${total} 筆</span><span class="pages"><button class="btn sm" data-p="${page - 1}" ${page <= 1 ? 'disabled' : ''}>‹</button> ${page} / ${pages} <button class="btn sm" data-p="${page + 1}" ${page >= pages ? 'disabled' : ''}>›</button></span><select class="input" style="width:auto">${[20, 50, 100].map((n) => `<option value="${n}"${n === size ? ' selected' : ''}>${n} / 頁</option>`).join('')}</select>`;
  $$('[data-p]', el).forEach((b) => (b.onclick = () => onGo(+b.dataset.p, size)));
  $('select', el).onchange = (e) => onGo(1, +e.target.value);
  return el;
}

// 表格勾選
export function checkable(table, onChange) {
  const all = $('thead input[type=checkbox]', table);
  const boxes = () => $$('tbody input[type=checkbox]', table);
  const fire = () => onChange(boxes().filter((b) => b.checked).map((b) => b.value));
  all?.addEventListener('change', () => { boxes().forEach((b) => (b.checked = all.checked)); fire(); });
  table.addEventListener('change', (e) => { if (e.target.closest('tbody') && e.target.type === 'checkbox') fire(); });
  table.addEventListener('click', (e) => { if (e.target.closest('.chk')) e.stopPropagation(); });
}

// 標籤輸入框
export function tagInput(el, values = [], suggestions = [], onChange) {
  let list = [...values];
  const id = 'dl' + Math.random().toString(36).slice(2, 8);
  const draw = () => {
    el.className = 'tag-in';
    el.innerHTML = list.map((t, i) => `<span>${esc(t)}<button type="button" data-i="${i}" aria-label="移除">×</button></span>`).join('') + `<input list="${id}" placeholder="${list.length ? '' : '輸入後按 Enter'}" aria-label="新增標籤"><datalist id="${id}">${suggestions.filter((s) => !list.includes(s)).map((s) => `<option value="${esc(s)}">`).join('')}</datalist>`;
    const inp = $('input', el);
    inp.addEventListener('keydown', (e) => {
      if ((e.key === 'Enter' || e.key === ',') && inp.value.trim()) { e.preventDefault(); add(inp.value); }
      if (e.key === 'Backspace' && !inp.value && list.length) { list.pop(); draw(); $('input', el).focus(); }
    });
    inp.addEventListener('change', () => { if (suggestions.includes(inp.value)) add(inp.value); });
    inp.addEventListener('blur', () => { if (inp.value.trim()) add(inp.value, true); });
    $$('button', el).forEach((b) => (b.onclick = () => { list.splice(+b.dataset.i, 1); draw(); onChange?.(list); }));
  };
  const add = (v, noFocus) => { v = v.trim().replace(/,$/, ''); if (v && !list.includes(v)) { list.push(v); onChange?.(list); } draw(); if (!noFocus) $('input', el).focus(); };
  draw();
  return { get: () => { const v = $('input', el).value.trim(); if (v && !list.includes(v)) list.push(v); return list; } };
}

/* ---------- 上傳圖片（瀏覽器先縮小，再傳到後台） ---------- */
async function shrink(file) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 1.5e6) return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, 2400 / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement('canvas'), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  return c.toDataURL('image/jpeg', 0.9);
}
export async function uploadFiles(files, folder = '', onProgress) {
  const out = [];
  let i = 0;
  for (const f of files) {
    onProgress?.(++i, files.length);
    const { media } = await api.post('mediaUpload', { name: f.name, data: await shrink(f), folder });
    out.push(media);
  }
  return out;
}

// 媒體櫃選圖：回傳選到的網址陣列
export function pickMedia({ multiple = false } = {}) {
  return new Promise(async (resolve) => {
    let chosen = [];
    let done = false;
    const { box, close } = modal({
      title: '選擇圖片', size: 'xwide',
      body: `<div class="drop-zone" id="pmDrop">把圖片拖到這裡，或 <label class="linkbtn">選擇檔案上傳<input type="file" accept="image/*" multiple hidden></label></div>
        <div class="filters"><input class="input" placeholder="搜尋圖片名稱" id="pmQ" style="max-width:280px"><select class="input" id="pmF" style="max-width:200px"><option value="">全部資料夾</option></select></div><div class="mgrid" id="pmGrid"><div class="loading">載入中…</div></div>`,
      foot: `<span class="muted small" id="pmN" style="margin-right:auto"></span><button class="btn" data-no>取消</button><button class="btn primary" data-ok>使用選取的圖片</button>`,
      onClose: () => { if (!done) resolve([]); },
    });
    let rows = [];
    const draw = () => {
      const q = $('#pmQ', box).value.trim().toLowerCase(), f = $('#pmF', box).value;
      const list = rows.filter((m) => (!q || m.name.toLowerCase().includes(q)) && (!f || m.folder === f));
      $('#pmGrid', box).innerHTML = list.length ? list.map((m) => `<button type="button" class="mi${chosen.includes(m.url) ? ' on' : ''}" data-url="${esc(m.url)}"><i class="ck">${chosen.indexOf(m.url) + 1 || ''}</i><img src="${esc(m.url)}" alt="" loading="lazy"><span>${esc(m.name)}</span></button>`).join('') : emptyBox('還沒有圖片，先上傳一些吧');
      $('#pmN', box).textContent = chosen.length ? `已選 ${chosen.length} 張` : '';
    };
    const load = async () => {
      const r = await api.get('media');
      rows = r.rows;
      $('#pmF', box).innerHTML = '<option value="">全部資料夾</option>' + r.folders.map((f) => `<option>${esc(f)}</option>`).join('');
      draw();
    };
    $('#pmGrid', box).addEventListener('click', (e) => {
      const b = e.target.closest('.mi');
      if (!b) return;
      const u = b.dataset.url;
      if (multiple) chosen = chosen.includes(u) ? chosen.filter((x) => x !== u) : [...chosen, u];
      else chosen = [u];
      draw();
      if (!multiple && e.detail === 2) { done = true; close(); resolve(chosen); }
    });
    $('#pmQ', box).oninput = draw;
    $('#pmF', box).onchange = draw;
    const up = async (files) => {
      const zone = $('#pmDrop', box);
      try {
        const added = await uploadFiles([...files].filter((f) => f.type.startsWith('image/')), '', (i, n) => (zone.firstChild.textContent = `上傳中 ${i}/${n}… `));
        chosen = multiple ? [...chosen, ...added.map((m) => m.url)] : [added[0]?.url].filter(Boolean);
        zone.firstChild.textContent = '把圖片拖到這裡，或 ';
        await load();
      } catch (e) { toast(e.message, true); }
    };
    $('input[type=file]', box).onchange = (e) => up(e.target.files);
    const zone = $('#pmDrop', box);
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('over'));
    zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); up(e.dataTransfer.files); });
    $('[data-no]', box).onclick = () => close();
    $('[data-ok]', box).onclick = () => { done = true; close(); resolve(chosen); };
    load();
  });
}

// 圖片欄位：顯示縮圖＋選擇／清除
export function imageField(el, value, onChange) {
  const draw = () => {
    el.innerHTML = `<div class="imgs">${value ? `<div class="im"><img src="${esc(value)}" alt=""><button type="button" data-rm aria-label="移除">×</button></div>` : ''}<button type="button" class="add" data-pick>${value ? '換一張' : '＋ 選擇圖片'}</button></div>`;
    $('[data-pick]', el).onclick = async () => { const [u] = await pickMedia(); if (u) { value = u; onChange(u); draw(); } };
    $('[data-rm]', el)?.addEventListener('click', () => { value = ''; onChange(''); draw(); });
  };
  draw();
}

let pickCache = null;
export async function pickData(force) {
  if (!pickCache || force) pickCache = await api.get('pick');
  return pickCache;
}

// 選商品：回傳選到的商品 id 陣列
export function pickProducts({ multiple = true, selected = [] } = {}) {
  return new Promise(async (resolve) => {
    const { products } = await pickData(true);
    let chosen = [...selected];
    let done = false;
    const { box, close } = modal({
      title: '選擇商品', size: 'wide',
      body: `<input class="input" placeholder="搜尋商品名稱或標籤" id="ppQ" style="margin-bottom:12px"><div class="picker-list" id="ppL"></div>`,
      foot: `<span class="muted small" id="ppN" style="margin-right:auto"></span><button class="btn" data-no>取消</button><button class="btn primary" data-ok>確定</button>`,
      onClose: () => { if (!done) resolve(null); },
    });
    const draw = () => {
      const q = $('#ppQ', box).value.trim().toLowerCase();
      const list = products.filter((p) => !q || (p.name + ' ' + p.tags.join(' ')).toLowerCase().includes(q));
      $('#ppL', box).innerHTML = list.map((p) => `<label><input type="${multiple ? 'checkbox' : 'radio'}" name="pp" value="${esc(p.id)}" ${chosen.includes(p.id) ? 'checked' : ''}>${p.img ? `<img src="${esc(p.img)}" alt="">` : '<span class="ph"></span>'}<span style="flex:1">${esc(p.name)}${p.on ? '' : ' <span class="pill">下架</span>'}</span><span class="muted">${money(p.price)}</span></label>`).join('') || emptyBox('沒有商品');
      $('#ppN', box).textContent = multiple ? `已選 ${chosen.length} 個` : '';
    };
    $('#ppL', box).addEventListener('change', (e) => {
      const v = e.target.value;
      if (multiple) chosen = e.target.checked ? [...chosen, v] : chosen.filter((x) => x !== v);
      else chosen = [v];
      $('#ppN', box).textContent = multiple ? `已選 ${chosen.length} 個` : '';
    });
    $('#ppQ', box).oninput = draw;
    $('[data-no]', box).onclick = () => close();
    $('[data-ok]', box).onclick = () => { done = true; close(); resolve(chosen); };
    draw();
  });
}

// 簡易文字編輯器（商品介紹、文字區塊）
export function richText(el, html, onInput) {
  el.innerHTML = `<div class="rte-bar">
    <button type="button" data-c="formatBlock" data-v="H2" title="大標題"><b>H2</b></button><button type="button" data-c="formatBlock" data-v="H3" title="小標題"><b>H3</b></button><button type="button" data-c="formatBlock" data-v="P" title="內文">內文</button>
    <button type="button" data-c="bold" title="粗體"><b>B</b></button><button type="button" data-c="italic" title="斜體"><i>I</i></button><button type="button" data-c="underline" title="底線"><u>U</u></button>
    <button type="button" data-c="insertUnorderedList" title="項目符號">•</button><button type="button" data-c="insertOrderedList" title="編號">1.</button>
    <button type="button" data-c="justifyLeft" title="靠左">⇤</button><button type="button" data-c="justifyCenter" title="置中">≡</button>
    <button type="button" data-c="link" title="連結">🔗</button><button type="button" data-c="image" title="插入圖片">🖼</button><button type="button" data-c="removeFormat" title="清除格式">⌫</button>
    <input type="color" title="文字顏色" style="width:30px;height:28px;border:0;background:none;padding:0">
  </div><div class="rte" contenteditable="true"></div>`;
  const ed = $('.rte', el);
  ed.innerHTML = html || '';
  const fire = () => onInput(ed.innerHTML);
  ed.addEventListener('input', fire);
  $$('.rte-bar button', el).forEach((b) => b.addEventListener('mousedown', (e) => e.preventDefault()));
  $$('.rte-bar button', el).forEach((b) => (b.onclick = async () => {
    ed.focus();
    if (b.dataset.c === 'link') { const u = await promptBox('插入連結', { label: '網址', placeholder: 'https://' }); ed.focus(); if (u) document.execCommand('createLink', false, u); }
    else if (b.dataset.c === 'image') { const urls = await pickMedia({ multiple: true }); ed.focus(); for (const u of urls) document.execCommand('insertHTML', false, `<img src="${esc(u)}" alt=""><br>`); }
    else document.execCommand(b.dataset.c, false, b.dataset.v || null);
    fire();
  }));
  $('.rte-bar input[type=color]', el).oninput = (e) => { ed.focus(); document.execCommand('foreColor', false, e.target.value); fire(); };
  return ed;
}

// 拖曳排序（用在圖片、選單）
export function sortable(container, itemSel, onEnd) {
  let drag = null;
  container.addEventListener('dragstart', (e) => { drag = e.target.closest(itemSel); if (drag) { drag.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; } });
  container.addEventListener('dragend', () => { if (drag) { drag.classList.remove('dragging'); drag = null; onEnd($$(itemSel, container)); } });
  container.addEventListener('dragover', (e) => {
    if (!drag) return;
    e.preventDefault();
    const over = e.target.closest(itemSel);
    if (!over || over === drag || over.parentElement !== drag.parentElement) return;
    const r = over.getBoundingClientRect();
    const after = r.width > r.height * 1.5 ? e.clientY > r.top + r.height / 2 : e.clientX > r.left + r.width / 2;
    over.parentElement.insertBefore(drag, after ? over.nextSibling : over);
  });
}

/* ---------- 選單與路由 ---------- */
const NAV = [
  { key: 'dashboard', name: '總覽', icon: 'home', href: '/admin' },
  { key: 'orders', name: '訂單', icon: 'orders', href: '/admin/orders' },
  { key: 'products', name: '商品', icon: 'box', items: [['商品管理', '/admin/products'], ['適用物流', '/admin/product-shipping'], ['貨到通知', '/admin/restock']] },
  { key: 'messages', name: '訊息中心', icon: 'chat', items: [['訊息管理', '/admin/messages']] },
  { key: 'customers', name: '顧客管理', icon: 'users', items: [['顧客名單', '/admin/customers'], ['顧客群組', '/admin/groups'], ['特約代碼', '/admin/codes'], ['顧客分眾', '/admin/segments']] },
  { key: 'design', name: '商店設計', icon: 'store', items: [['頁面設計', '/admin/pages'], ['選單目錄', '/admin/menus'], ['全站設定', '/admin/theme']] },
  { key: 'marketing', name: '行銷', icon: 'megaphone', items: [['折扣', '/admin/discounts'], ['購物車加購區', '/admin/addons'], ['湊湊團', '/admin/groupbuys']] },
  { key: 'media', name: '媒體櫃', icon: 'folder', href: '/admin/media' },
  { key: 'settings', name: '設定', icon: 'gear', href: '/admin/settings' },
];

const ROUTES = [
  [/^\/admin\/?$/, 'dashboard', 'dashboard'],
  [/^\/admin\/orders\/?$/, 'orders', 'list'],
  [/^\/admin\/orders\/(\w+)$/, 'orders', 'detail'],
  [/^\/admin\/products\/?$/, 'products', 'list'],
  [/^\/admin\/products-bulk\/?$/, 'products', 'bulk'],
  [/^\/admin\/products\/([\w-]+)$/, 'products', 'edit'],
  [/^\/admin\/product-shipping\/?$/, 'products', 'shipping'],
  [/^\/admin\/restock\/?$/, 'products', 'restock'],
  [/^\/admin\/messages\/?$/, 'messages', 'render'],
  [/^\/admin\/customers\/?$/, 'customers', 'list'],
  [/^\/admin\/customers\/([\w-]+)$/, 'customers', 'detail'],
  [/^\/admin\/groups\/?$/, 'customers', 'groups'],
  [/^\/admin\/codes\/?$/, 'customers', 'codes'],
  [/^\/admin\/segments\/?$/, 'customers', 'segments'],
  [/^\/admin\/pages\/?$/, 'design', 'pages'],
  [/^\/admin\/pages\/([\w-]+)$/, 'design', 'editor'],
  [/^\/admin\/menus\/?$/, 'design', 'menus'],
  [/^\/admin\/theme\/?$/, 'design', 'theme'],
  [/^\/admin\/discounts\/?$/, 'marketing', 'discounts'],
  [/^\/admin\/addons\/?$/, 'marketing', 'addons'],
  [/^\/admin\/groupbuys\/?$/, 'marketing', 'groupbuys'],
  [/^\/admin\/media\/?$/, 'media', 'render'],
  [/^\/admin\/settings\/?$/, 'settings', 'index'],
  [/^\/admin\/settings\/(\w+)$/, 'settings', 'section'],
];

const PERM = { dashboard: 'dashboard', orders: 'orders', products: 'products', messages: 'messages', customers: 'customers', design: 'design', marketing: 'marketing', media: 'media', settings: 'settings' };

function drawNav(badges = {}) {
  const path = location.pathname.replace(/\/$/, '') || '/admin';
  const perms = ctx.me.perms;
  $('#sidebar').innerHTML = NAV.filter((n) => perms.includes(PERM[n.key])).map((n) => {
    const on = n.href ? (n.href === '/admin' ? path === '/admin' : path.startsWith(n.href)) : n.items.some(([, h]) => path.startsWith(h));
    const dot = badges[n.key] ? `<span class="nav-dot">${badges[n.key]}</span>` : '';
    if (n.href) return `<a class="nav-item${on ? ' on' : ''}" href="${n.href}">${icon(n.icon)}${n.name}${dot}</a>`;
    return `<div class="nav-group${on ? ' open' : ''}"><button class="nav-item" type="button">${icon(n.icon)}${n.name}${dot || icon('chev', 'chev')}</button><div class="nav-sub">${n.items.map(([name, h]) => `<a href="${h}" class="${path.startsWith(h) ? 'on' : ''}">${name}</a>`).join('')}</div></div>`;
  }).join('');
  $$('.nav-group>button').forEach((b) => (b.onclick = () => b.parentElement.classList.toggle('open')));
}

export async function refreshBadges() {
  try {
    if (!ctx.me.perms.includes('dashboard')) return;
    const d = await api.get('dashboard');
    ctx.dash = d;
    drawNav({ orders: d.todo.pending || '', messages: d.todo.orderQA + d.todo.productQA || '' });
  } catch {}
}

export function go(url, replace) {
  if (replace) history.replaceState(null, '', url); else history.pushState(null, '', url);
  route();
}

let leaveGuard = null;
// 頁面有未儲存的修改時，離開前先確認
export function guard(fn) { leaveGuard = fn; }

document.addEventListener('click', async (e) => {
  const a = e.target.closest('a[href]');
  if (!a || a.target || e.metaKey || e.ctrlKey || e.shiftKey || a.hasAttribute('download')) return;
  const u = new URL(a.href, location.href);
  if (u.origin !== location.origin || !u.pathname.startsWith('/admin')) return;
  e.preventDefault();
  if (leaveGuard && leaveGuard() && !(await confirmBox('有修改還沒儲存，確定要離開嗎？', { ok: '離開', danger: true }))) return;
  leaveGuard = null;
  $('#app').classList.remove('nav-open');
  go(u.pathname + u.search);
});
window.addEventListener('popstate', () => { leaveGuard = null; route(); });
window.addEventListener('beforeunload', (e) => { if (leaveGuard && leaveGuard()) { e.preventDefault(); e.returnValue = ''; } });

const modules = {};
async function route() {
  const path = location.pathname.replace(/\/$/, '') || '/admin';
  drawNav();
  refreshBadges();
  document.body.classList.remove('designing');
  let hit = null;
  for (const [re, mod, fn] of ROUTES) { const m = path.match(re); if (m) { hit = { mod, fn, args: m.slice(1) }; break; } }
  if (!hit) { view.innerHTML = emptyBox('找不到這個頁面'); return; }
  if (!ctx.me.perms.includes(PERM[hit.mod])) {
    // 沒有總覽權限的員工，登入後直接到第一個能用的功能
    const first = hit.mod === 'dashboard' && NAV.find((n) => ctx.me.perms.includes(PERM[n.key]));
    if (first) return go(first.href || first.items[0][1], true);
    view.innerHTML = emptyBox('您的帳號沒有這個功能的權限');
    return;
  }
  view.innerHTML = '<div class="loading">載入中…</div>';
  window.scrollTo(0, 0);
  try {
    modules[hit.mod] ||= await import(`/admin/${hit.mod}.js`);
    await modules[hit.mod][hit.fn](view, ...hit.args);
  } catch (e) {
    console.error(e);
    view.innerHTML = `<div class="card"><p class="err">${esc(e.message)}</p><button class="btn" onclick="location.reload()">重新載入</button></div>`;
  }
  view.focus({ preventScroll: true });
}

/* ---------- 啟動 ---------- */
$('#navToggle').onclick = () => $('#app').classList.toggle('nav-open');
$('#scrim').onclick = () => $('#app').classList.remove('nav-open');
$('#themeBtn').onclick = () => {
  const cur = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.dataset.theme = cur;
  try { localStorage.setItem('adminTheme', cur); } catch {}
};

async function start() {
  const F = await auth();
  const showLogin = (msg) => {
    $('#app').hidden = true;
    $('#login').hidden = false;
    const err = $('#loginErr');
    err.hidden = !msg;
    err.textContent = msg || '';
  };
  $('#googleLogin').onclick = async () => {
    try { const p = new F.GoogleAuthProvider(); p.setCustomParameters({ prompt: 'select_account' }); await F.signInWithPopup(F.auth, p); start(); } catch (e) { showLogin(authMessage(e)); }
  };
  if (!F.auth.currentUser) return showLogin();
  try {
    const r = await api.get('me');
    ctx.me = r.me;
    ctx.store = r.store;
  } catch (e) {
    await F.signOut(F.auth);
    return showLogin(e.message);
  }
  $('#login').hidden = true;
  $('#app').hidden = false;
  $('#brand').innerHTML = `${ctx.store.logo ? `<img src="${esc(ctx.store.logo)}" alt="">` : ''}${esc(ctx.store.name)}<span class="muted small" style="font-weight:400">後台</span>`;
  $('#who').innerHTML = `<span class="name">${esc(ctx.me.name)}</span><span class="role">${esc(ctx.me.roleName)}</span><button class="btn sm ghost" id="logout">登出</button>`;
  $('#logout').onclick = async () => { await F.signOut(F.auth); location.href = '/admin'; };
  route();
}
start();
