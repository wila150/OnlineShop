// 媒體櫃：上傳圖片、分類資料夾、搜尋、改名、刪除
import { api, $, $$, esc, icon, toast, fmt, emptyBox, confirmBox, promptBox, uploadFiles } from './app.js';

export async function render(el) {
  let rows = [], folders = [];
  const st = { folder: '*', q: '', sort: 'new', sel: [] };
  el.innerHTML = `<div class="page-head"><h1>媒體櫃</h1></div>
    <div class="media">
      <div class="folders" id="folders"></div>
      <div class="card">
        <div class="drop-zone" id="drop">把圖片拖到這裡上傳，或 <label class="linkbtn">選擇檔案<input type="file" accept="image/*" multiple hidden></label></div>
        <div class="filters"><div class="search-in"><input class="input" id="q" placeholder="搜尋圖片名稱"><button aria-label="搜尋">${icon('search')}</button></div><button class="btn" id="sort" title="排序">⇅ <span>最新</span></button></div>
        <div id="bulk"></div><div class="mgrid" id="grid"></div>
      </div>
      <div class="card mdetail" id="detail">${emptyBox('尚未選取圖片')}</div>
    </div>`;

  const drawFolders = () => {
    const count = (f) => rows.filter((m) => (f === '*' ? true : (m.folder || '') === f)).length;
    $('#folders', el).innerHTML = `<button data-f="*" class="${st.folder === '*' ? 'on' : ''}">${icon('inbox')} 全部<span class="muted">${count('*')}</span></button><button data-f="" class="${st.folder === '' ? 'on' : ''}">未分類<span class="muted">${count('')}</span></button>
      <div class="inline" style="justify-content:space-between;padding:12px 12px 4px"><span class="muted small">資料夾（${folders.length}）</span><button class="btn sm ghost" id="addF" aria-label="新增資料夾">${icon('plus')}</button></div>
      ${folders.map((f) => `<button data-f="${esc(f)}" class="${st.folder === f ? 'on' : ''}">${icon('folder')} ${esc(f)}<span class="muted">${count(f)}</span></button>`).join('')}`;
    $$('[data-f]', el).forEach((b) => (b.onclick = () => { st.folder = b.dataset.f; st.sel = []; draw(); }));
    $('#addF', el).onclick = async () => { const n = (await promptBox('新增資料夾', { label: '資料夾名稱' }))?.trim(); if (!n || folders.includes(n)) return; folders.push(n); await api.post('mediaFolders', { list: folders }); drawFolders(); };
  };

  const draw = () => {
    drawFolders();
    let list = rows.filter((m) => (st.folder === '*' || (m.folder || '') === st.folder) && (!st.q || m.name.toLowerCase().includes(st.q)));
    list = list.sort((a, b) => (st.sort === 'new' ? b.createdAt - a.createdAt : st.sort === 'old' ? a.createdAt - b.createdAt : a.name.localeCompare(b.name)));
    $('#grid', el).innerHTML = list.length ? list.map((m) => `<button type="button" class="mi${st.sel.includes(m.id) ? ' on' : ''}" data-id="${m.id}"><i class="ck">✓</i><img src="${esc(m.url)}" alt="" loading="lazy"><span>${esc(m.name)}</span></button>`).join('') : emptyBox('沒有圖片');
    drawBulk();
    drawDetail();
  };
  const drawBulk = () => {
    const b = $('#bulk', el);
    if (st.sel.length < 2) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="bulk">已選 ${st.sel.length} 張<select class="input" id="mv" style="width:auto"><option value="">移到資料夾…</option><option value="">未分類</option>${folders.map((f) => `<option>${esc(f)}</option>`).join('')}</select><button class="btn sm danger" id="bdel">${icon('trash')}刪除</button><button class="btn sm ghost" id="bclr">取消選取</button></div>`;
    $('#mv', b).onchange = async (e) => { if (e.target.selectedIndex === 0) return; await api.post('mediaUpdate', { ids: st.sel, folder: e.target.value }); rows.filter((m) => st.sel.includes(m.id)).forEach((m) => (m.folder = e.target.value)); toast('已移動'); draw(); };
    $('#bdel', b).onclick = async () => { if (!(await confirmBox(`刪除 ${st.sel.length} 張圖片？已經用在商品或頁面上的圖片也會消失。`, { danger: true, ok: '刪除' }))) return; await api.post('mediaDelete', { ids: st.sel }); rows = rows.filter((m) => !st.sel.includes(m.id)); st.sel = []; draw(); };
    $('#bclr', b).onclick = () => { st.sel = []; draw(); };
  };
  const drawDetail = () => {
    const d = $('#detail', el);
    const m = st.sel.length === 1 && rows.find((x) => x.id === st.sel[0]);
    if (!m) { d.innerHTML = emptyBox(st.sel.length ? `已選 ${st.sel.length} 張` : '尚未選取圖片'); return; }
    d.innerHTML = `<img src="${esc(m.url)}" alt=""><label class="field" style="margin-top:12px"><span>名稱</span><input class="input" id="mn" value="${esc(m.name)}"></label>
      <label class="field"><span>資料夾</span><select class="input" id="mf"><option value="">未分類</option>${folders.map((f) => `<option${m.folder === f ? ' selected' : ''}>${esc(f)}</option>`).join('')}</select></label>
      <dl class="dl small"><dt>尺寸</dt><dd>${m.w} × ${m.h}</dd><dt>大小</dt><dd>${Math.round(m.size / 1024)} KB</dd><dt>上傳</dt><dd>${fmt.time(m.createdAt)}</dd></dl>
      <div class="inline" style="margin-top:12px"><button class="btn sm" id="cp">${icon('copy')}複製網址</button><button class="btn sm danger" id="del">${icon('trash')}刪除</button></div>`;
    $('#mn', d).onchange = async (e) => { await api.post('mediaUpdate', { id: m.id, name: e.target.value }); m.name = e.target.value; toast('已改名'); draw(); };
    $('#mf', d).onchange = async (e) => { await api.post('mediaUpdate', { id: m.id, folder: e.target.value }); m.folder = e.target.value; toast('已移動'); draw(); };
    $('#cp', d).onclick = () => navigator.clipboard.writeText(m.url).then(() => toast('已複製'));
    $('#del', d).onclick = async () => { if (!(await confirmBox('刪除這張圖片？已經用在商品或頁面上的也會消失。', { danger: true, ok: '刪除' }))) return; await api.post('mediaDelete', { id: m.id }); rows = rows.filter((x) => x.id !== m.id); st.sel = []; draw(); };
  };

  $('#grid', el).addEventListener('click', (e) => {
    const b = e.target.closest('.mi');
    if (!b) return;
    const id = b.dataset.id;
    if (e.metaKey || e.ctrlKey || e.shiftKey || st.sel.length > 1) st.sel = st.sel.includes(id) ? st.sel.filter((x) => x !== id) : [...st.sel, id];
    else st.sel = st.sel[0] === id ? [] : [id];
    draw();
  });
  $('#q', el).oninput = (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); };
  const SORTS = [['new', '最新'], ['old', '最舊'], ['name', '名稱']];
  $('#sort', el).onclick = (e) => { const i = (SORTS.findIndex(([k]) => k === st.sort) + 1) % SORTS.length; st.sort = SORTS[i][0]; $('span', e.currentTarget).textContent = SORTS[i][1]; draw(); };

  const zone = $('#drop', el);
  const up = async (files) => {
    files = [...files].filter((f) => f.type.startsWith('image/'));
    if (!files.length) return;
    const label = zone.firstChild;
    try {
      const added = await uploadFiles(files, ['*', ''].includes(st.folder) ? '' : st.folder, (i, n) => (label.textContent = `上傳中 ${i}/${n}… `));
      rows.unshift(...added);
      toast(`已上傳 ${added.length} 張`);
    } catch (e) { toast(e.message, true); }
    label.textContent = '把圖片拖到這裡上傳，或 ';
    draw();
  };
  $('input[type=file]', zone).onchange = (e) => up(e.target.files);
  zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('over'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('over'));
  zone.addEventListener('drop', (e) => { e.preventDefault(); zone.classList.remove('over'); up(e.dataTransfer.files); });

  const r = await api.get('media');
  rows = r.rows;
  folders = r.folders;
  draw();
}
