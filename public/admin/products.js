// 商品：列表（上下架分頁、搜尋、標籤、庫存區間、批次）與編輯（圖片、規格組合、價格、庫存、介紹）
import { api, $, $$, esc, money, icon, toast, modal, busy, fmt, pill, pager, checkable, emptyBox, confirmBox, promptBox, go, guard, tagInput, pickMedia, richText, sortable, can } from './app.js';

export async function list(el) {
  const q = new URLSearchParams(location.search);
  const st = { tab: q.get('tab') || 'all', q: '', tag: '', smin: '', smax: '', pmin: '', pmax: '', updated: '', page: 1, size: 20 };
  let rows = [];
  let selected = [];

  el.innerHTML = `
    <div class="page-head"><h1>商品管理</h1><div class="actions"><a class="btn" href="/admin/products-bulk">${icon('edit')}大量更新</a><button class="btn" id="expBtn">${icon('download')}匯出</button><a class="btn primary" href="/admin/products/new">${icon('plus')}新增商品</a></div></div>
    <div class="card">
      <div class="tabs" id="tabs"></div>
      <div class="filters">
        <div class="search-in"><input class="input" id="qF" placeholder="搜尋商品名稱、編號"><button aria-label="搜尋">${icon('search')}</button></div>
        <select class="input" id="tagF" style="max-width:180px"><option value="">所有標籤</option></select>
        <span class="range"><input class="input" id="sminF" type="number" placeholder="最低庫存" aria-label="最低庫存"> → <input class="input" id="smaxF" type="number" placeholder="最高庫存" aria-label="最高庫存"></span>
        <button class="btn" id="moreF">${icon('filter')}篩選</button>
      </div>
      <div id="bulk"></div><div id="tbl"><div class="loading">載入中…</div></div>
    </div>`;

  const DAY = 86400e3;
  const since = { today: () => new Date().setHours(0, 0, 0, 0), yesterday: () => new Date().setHours(0, 0, 0, 0) - DAY, week: () => Date.now() - 7 * DAY, month: () => Date.now() - 30 * DAY };
  const filtered = () => rows.filter((p) => (st.tab === 'all' || (st.tab === 'on') === p.on)
    && (!st.q || (p.name + ' ' + (p.sku || '')).toLowerCase().includes(st.q.toLowerCase()))
    && (!st.tag || p.tags.includes(st.tag))
    && (st.smin === '' || p.stock >= +st.smin) && (st.smax === '' || p.stock <= +st.smax)
    && (st.pmin === '' || p.price >= +st.pmin) && (st.pmax === '' || p.price <= +st.pmax)
    && (!st.updated || p.updatedAt >= since[st.updated]()));

  const draw = () => {
    const counts = { all: rows.length, on: rows.filter((p) => p.on).length, off: rows.filter((p) => !p.on).length };
    $('#tabs', el).innerHTML = [['all', '全部'], ['on', '上架'], ['off', '下架']].map(([k, n]) => `<button class="${st.tab === k ? 'on' : ''}" data-t="${k}">${n}<span class="ct">${counts[k]}</span></button>`).join('');
    $$('#tabs button', el).forEach((b) => (b.onclick = () => { st.tab = b.dataset.t; st.page = 1; draw(); }));
    const list = filtered();
    const box = $('#tbl', el);
    selected = [];
    drawBulk();
    if (!list.length) { box.innerHTML = rows.length ? emptyBox('沒有符合的商品') : `<div class="empty">${icon('box')}<div>還沒有商品</div><a class="btn primary" href="/admin/products/new" style="margin-top:12px">新增第一個商品</a></div>`; return; }
    const page = list.slice((st.page - 1) * st.size, st.page * st.size);
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" aria-label="全選"></th><th></th><th>商品編號</th><th>商品名稱</th><th class="num">規格</th><th class="num">售價</th>${can('cost') ? '<th class="num">成本</th>' : ''}<th class="num">庫存</th><th class="num">已售</th><th>狀態</th><th>更新時間</th></tr></thead><tbody>
      ${page.map((p) => `<tr class="click" data-id="${p.id}"><td class="chk"><input type="checkbox" value="${p.id}" aria-label="選取"></td><td>${p.img ? `<img class="thumb" src="${esc(p.img)}" alt="">` : '<span class="thumb"></span>'}</td>
        <td class="muted">${esc(p.sku || '')}</td><td class="ellipsis" title="${esc(p.name)}">${esc(p.name)}${p.tags.length ? `<div class="small muted">${p.tags.map(esc).join('、')}</div>` : ''}</td>
        <td class="num">${p.specs || '-'}</td><td class="num">${money(p.price)}</td>${can('cost') ? `<td class="num">${money(p.cost)}</td>` : ''}<td class="num ${p.stock <= 0 ? 'err' : ''}">${p.stock}</td><td class="num">${p.sold}</td>
        <td>${p.on ? pill('上架', 'ok') : pill('下架')}</td><td class="nowrap">${fmt.time(p.updatedAt)}</td></tr>`).join('')}</tbody></table></div>`;
    box.append(pager(list.length, st.page, st.size, (pg, s) => { st.page = pg; st.size = s; draw(); }));
    $$('tbody tr', box).forEach((tr) => (tr.onclick = () => go('/admin/products/' + tr.dataset.id)));
    checkable($('table', box), (ids) => { selected = ids; drawBulk(); });
  };

  const drawBulk = () => {
    const b = $('#bulk', el);
    if (!selected.length) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="bulk">已選 ${selected.length} 個<button class="btn sm" data-op="on">上架</button><button class="btn sm" data-op="off">下架</button><button class="btn sm" data-op="addTag">加標籤</button><button class="btn sm" data-op="removeTag">移除標籤</button><button class="btn sm danger" data-op="delete">刪除</button></div>`;
    $$('[data-op]', b).forEach((btn) => (btn.onclick = async () => {
      const op = btn.dataset.op;
      const body = { ids: selected, op };
      if (op === 'addTag' || op === 'removeTag') { body.tag = await promptBox(op === 'addTag' ? '加上標籤' : '移除標籤', { label: '標籤名稱' }); if (!body.tag) return; }
      if (op === 'delete' && !(await confirmBox(`確定刪除 ${selected.length} 個商品？刪除後無法復原（已成立的訂單不受影響）。`, { danger: true, ok: '刪除' }))) return;
      await busy(btn, () => api.post('productsBulk', body));
      toast('已更新');
      load();
    }));
  };

  const load = async () => {
    const r = await api.get('products');
    rows = r.rows;
    const tags = [...new Set(rows.flatMap((p) => p.tags))];
    $('#tagF', el).innerHTML = '<option value="">所有標籤</option>' + tags.map((t) => `<option${t === st.tag ? ' selected' : ''}>${esc(t)}</option>`).join('');
    draw();
  };
  $('#qF', el).oninput = (e) => { st.q = e.target.value.trim(); st.page = 1; draw(); };
  $('#tagF', el).onchange = (e) => { st.tag = e.target.value; st.page = 1; draw(); };
  $('#sminF', el).oninput = (e) => { st.smin = e.target.value; draw(); };
  $('#smaxF', el).oninput = (e) => { st.smax = e.target.value; draw(); };
  $('#expBtn', el).onclick = (e) => busy(e.currentTarget, () => api.download('exportProducts'));
  $('#moreF', el).onclick = () => {
    const { box, close } = modal({
      title: '篩選商品',
      body: `<label class="field"><span>商品價格</span><span class="range"><input class="input" type="number" name="pmin" placeholder="最小金額" value="${esc(st.pmin)}"> → <input class="input" type="number" name="pmax" placeholder="最大金額" value="${esc(st.pmax)}"></span></label>
        <label class="field"><span>更新時間</span><select class="input" name="updated">${[['', '不限'], ['today', '今天'], ['yesterday', '昨天以後'], ['week', '最近 7 天'], ['month', '最近 30 天']].map(([v, n]) => `<option value="${v}"${st.updated === v ? ' selected' : ''}>${n}</option>`).join('')}</select></label>`,
      foot: '<button class="btn" data-clear>清除</button><button class="btn primary" data-ok>套用</button>',
    });
    $('[data-clear]', box).onclick = () => { st.pmin = st.pmax = st.updated = ''; close(); draw(); };
    $('[data-ok]', box).onclick = () => { st.pmin = $('[name=pmin]', box).value; st.pmax = $('[name=pmax]', box).value; st.updated = $('[name=updated]', box).value; st.page = 1; close(); draw(); };
  };
  await load();
}

/* ---------- 編輯商品 ---------- */
export async function edit(el, id) {
  const isNew = id === 'new';
  const p = isNew
    ? { name: '', sku: '', desc: '', images: [], tags: [], on: true, price: 0, listPrice: 0, cost: 0, specs: [], variants: [{ key: '', opts: [], sku: '', price: 0, cost: 0, stock: 0 }], seoTitle: '', seoDesc: '' }
    : (await api.get('product', { id })).product;
  const { tags: allTags, shipping, groups } = await api.get('pick');
  p.shipIds ||= [];
  p.viewGroups ||= [];
  let dirty = false;
  guard(() => dirty);
  const mark = () => { dirty = true; };

  el.innerHTML = `
    <a class="back" href="/admin/products">‹ 回商品列表</a>
    <div class="page-head"><h1>${isNew ? '新增商品' : '編輯商品'}</h1><div class="actions">
      ${isNew ? '' : `<a class="btn" href="/products/${esc(id)}" target="_blank" rel="noopener">${icon('eye')}前台查看</a><button class="btn" id="copyBtn">${icon('copy')}複製</button><button class="btn danger" id="delBtn">${icon('trash')}刪除</button>`}
    </div></div>
    <form id="pf">
      <div class="split">
        <div>
          <div class="card"><h2>基本資料</h2>
            <label class="field"><span>商品名稱 <em>*</em></span><input class="input" name="name" required maxlength="100" value="${esc(p.name)}"></label>
            <div class="row"><label class="field"><span>商品編號</span><input class="input" name="sku" value="${esc(p.sku)}"></label>
            <label class="field"><span>原價（劃線價，選填）</span><input class="input" type="number" min="0" name="listPrice" value="${p.listPrice || ''}"></label></div>
            <div class="field"><span>標籤（分類用，前台可以依標籤篩選）</span><div id="tagsIn"></div></div>
          </div>
          <div class="card"><h2>商品圖片 <span class="muted small" style="font-weight:400">第一張是封面，可以拖曳調整順序</span></h2><div class="imgs" id="imgs"></div></div>
          <div class="card"><div class="card-h">規格與庫存<div class="actions"><button type="button" class="btn sm" id="addSpec">${icon('plus')}新增規格</button></div></div>
            <p class="muted small" style="margin-top:-8px">例如「顏色」：黑、白；「尺寸」：S、M、L。會自動組合出每一種規格，各自設定價格和庫存。</p>
            <div class="spec-edit" id="specs"></div>
            <div id="vt" style="margin-top:12px"></div>
          </div>
          <div class="card"><h2>商品介紹</h2><div id="desc"></div></div>
          <div class="card"><h2>搜尋引擎</h2>
            <label class="field"><span>頁面標題（留空就用商品名稱）</span><input class="input" name="seoTitle" value="${esc(p.seoTitle || '')}"></label>
            <label class="field"><span>頁面描述</span><textarea class="input" name="seoDesc">${esc(p.seoDesc || '')}</textarea></label></div>
        </div>
        <div>
          <div class="card"><h2>狀態</h2><div class="switch-row"><div class="sr-body"><b>上架</b><small>關閉後前台看不到這個商品</small></div><label class="sw"><input type="checkbox" name="on" ${p.on ? 'checked' : ''}><span></span></label></div></div>
          <div class="card"><h2>適用物流</h2><p class="muted small" style="margin-top:-8px">都不勾＝全部運送方式都能用。購物車裡有多個商品時，只會出現大家都適用的運送方式。</p>
            ${shipping.map((m) => `<label class="check" style="padding:4px 0"><input type="checkbox" name="shipIds" value="${esc(m.id)}" ${p.shipIds.includes(m.id) ? 'checked' : ''}> ${esc(m.name)}${m.on ? '' : ' <span class="pill">未啟用</span>'}</label>`).join('')}</div>
          <div class="card"><h2>瀏覽權限</h2><p class="muted small" style="margin-top:-8px">都不勾＝所有人都看得到。勾了之後只有這些對象看得到、買得到（例如福袋只給 VIP）。</p>
            ${[['guest', '訪客（未登入）'], ['member', '一般會員'], ...groups.map((g) => [g.id, g.name])].map(([k, n]) => `<label class="check" style="padding:4px 0"><input type="checkbox" name="viewGroups" value="${esc(k)}" ${p.viewGroups.includes(k) ? 'checked' : ''}> ${esc(n)}</label>`).join('')}</div>
          ${isNew ? '' : `<div class="card"><h2>銷售</h2><dl class="dl"><dt>已售出</dt><dd>${p.sold || 0} 件</dd><dt>建立</dt><dd>${fmt.time(p.createdAt)}</dd><dt>更新</dt><dd>${fmt.time(p.updatedAt)}</dd></dl></div>`}
        </div>
      </div>
      <div class="form-actions"><a class="btn" href="/admin/products">取消</a><button class="btn primary" id="saveBtn">儲存</button></div>
    </form>`;

  const form = $('#pf', el);
  form.addEventListener('input', mark);
  const tags = tagInput($('#tagsIn', el), p.tags, allTags);

  // 圖片
  const drawImgs = () => {
    const box = $('#imgs', el);
    box.innerHTML = p.images.map((u, i) => `<div class="im" draggable="true" data-u="${esc(u)}"><img src="${esc(u)}" alt=""><button type="button" data-rm="${i}" aria-label="移除">×</button>${i ? '' : '<span class="first">封面</span>'}</div>`).join('') + '<button type="button" class="add" id="addImg">＋ 加入圖片</button>';
    $$('[data-rm]', box).forEach((b) => (b.onclick = () => { p.images.splice(+b.dataset.rm, 1); mark(); drawImgs(); drawVariants(); }));
    $('#addImg', box).onclick = async () => { const us = await pickMedia({ multiple: true }); if (us.length) { p.images.push(...us.filter((u) => !p.images.includes(u))); mark(); drawImgs(); drawVariants(); } };
  };
  sortable($('#imgs', el), '.im', (items) => { p.images = items.map((x) => x.dataset.u); mark(); drawImgs(); });
  drawImgs();

  // 規格
  const combos = () => p.specs.reduce((acc, s) => acc.flatMap((a) => s.values.map((v) => [...a, v])), [[]]);
  const syncVariants = () => {
    const old = new Map(p.variants.map((v) => [v.key, v]));
    const first = p.variants[0] || { price: 0, cost: 0, stock: 0 };
    if (!p.specs.length || p.specs.some((s) => !s.values.length)) {
      if (!p.specs.length) p.variants = [{ ...first, key: '', opts: [] }];
      return;
    }
    p.variants = combos().map((opts) => { const key = opts.join('/'); return old.get(key) || { key, opts, sku: '', price: first.price, cost: first.cost, stock: 0, img: '' }; });
  };
  const drawSpecs = () => {
    const box = $('#specs', el);
    box.innerHTML = p.specs.map((s, i) => `<div class="spec-row" data-i="${i}"><input class="input" placeholder="規格名稱，例如顏色" value="${esc(s.name)}" data-name><div data-vals></div><button type="button" class="btn sm danger" data-rm aria-label="刪除規格">${icon('trash')}</button></div>`).join('');
    $$('.spec-row', box).forEach((row) => {
      const s = p.specs[+row.dataset.i];
      $('[data-name]', row).oninput = (e) => { s.name = e.target.value; mark(); };
      tagInput($('[data-vals]', row), s.values, [], (v) => { s.values = [...v]; mark(); syncVariants(); drawVariants(); });
      $('[data-rm]', row).onclick = () => { p.specs.splice(+row.dataset.i, 1); mark(); syncVariants(); drawSpecs(); drawVariants(); };
    });
  };
  const drawVariants = () => {
    const box = $('#vt', el);
    const multi = p.specs.length && p.variants.length && p.variants[0].opts?.length;
    if (!multi) {
      const v = p.variants[0];
      box.innerHTML = `<div class="row"><label class="field"><span>售價 <em>*</em></span><input class="input" type="number" min="0" data-f="price" value="${v.price}"></label>${can('cost') ? `<label class="field"><span>成本</span><input class="input" type="number" min="0" data-f="cost" value="${v.cost || 0}"></label>` : ''}<label class="field"><span>庫存</span><input class="input" type="number" min="0" data-f="stock" value="${v.stock}"></label></div>`;
      $$('[data-f]', box).forEach((inp) => (inp.oninput = () => { v[inp.dataset.f] = +inp.value || 0; mark(); }));
      return;
    }
    box.innerHTML = `<div class="inline" style="margin-bottom:8px"><span class="muted small">全部套用：</span><input class="input" type="number" placeholder="售價" id="allP" style="width:100px">${can('cost') ? '<input class="input" type="number" placeholder="成本" id="allC" style="width:100px">' : ''}<input class="input" type="number" placeholder="庫存" id="allS" style="width:100px"><button type="button" class="btn sm" id="allGo">套用</button></div>
      <div class="table-wrap"><table class="tbl vt"><thead><tr>${p.specs.map((s) => `<th>${esc(s.name || '規格')}</th>`).join('')}<th>圖片</th><th>規格編號</th><th>售價</th>${can('cost') ? '<th>成本</th>' : ''}<th>庫存</th></tr></thead><tbody>
      ${p.variants.map((v, i) => `<tr data-i="${i}">${v.opts.map((o) => `<td>${esc(o)}</td>`).join('')}<td><select class="input" data-f="img" style="min-width:90px"><option value="">封面</option>${p.images.map((u, j) => `<option value="${esc(u)}"${v.img === u ? ' selected' : ''}>第 ${j + 1} 張</option>`).join('')}</select></td>
        <td><input class="input" data-f="sku" value="${esc(v.sku || '')}"></td><td><input class="input" type="number" min="0" data-f="price" value="${v.price}"></td>${can('cost') ? `<td><input class="input" type="number" min="0" data-f="cost" value="${v.cost || 0}"></td>` : ''}<td><input class="input" type="number" min="0" data-f="stock" value="${v.stock}"></td></tr>`).join('')}
      </tbody></table></div><p class="muted small">共 ${p.variants.length} 種組合，總庫存 ${p.variants.reduce((a, v) => a + (+v.stock || 0), 0)}</p>`;
    $$('tbody tr', box).forEach((tr) => {
      const v = p.variants[+tr.dataset.i];
      $$('[data-f]', tr).forEach((inp) => (inp.oninput = inp.onchange = () => { v[inp.dataset.f] = ['sku', 'img'].includes(inp.dataset.f) ? inp.value : +inp.value || 0; mark(); }));
    });
    $('#allGo', box).onclick = () => {
      const P = $('#allP', box).value, C = $('#allC', box)?.value ?? '', S = $('#allS', box).value;
      p.variants.forEach((v) => { if (P !== '') v.price = +P; if (C !== '') v.cost = +C; if (S !== '') v.stock = +S; });
      mark();
      drawVariants();
    };
  };
  $('#addSpec', el).onclick = () => { if (p.specs.length >= 3) return toast('最多 3 種規格', true); p.specs.push({ name: '', values: [] }); mark(); drawSpecs(); $$('#specs [data-name]', el).pop()?.focus(); };
  drawSpecs();
  drawVariants();

  let desc = p.desc || '';
  richText($('#desc', el), /<\w+/.test(desc) ? desc : desc.split(/\n{2,}/).map((x) => `<p>${esc(x).replace(/\n/g, '<br>')}</p>`).join(''), (h) => { desc = h; mark(); });

  form.onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(form);
    if (p.specs.some((s) => !s.name || !s.values.length)) return toast('每個規格都要有名稱和至少一個選項', true);
    const body = { id: isNew ? undefined : id, name: d.get('name'), sku: d.get('sku'), listPrice: +d.get('listPrice') || 0, tags: tags.get(), images: p.images, on: !!d.get('on'), specs: p.specs, variants: p.variants, price: p.variants[0]?.price, cost: p.variants[0]?.cost, desc, seoTitle: d.get('seoTitle'), seoDesc: d.get('seoDesc'), shipIds: d.getAll('shipIds'), viewGroups: d.getAll('viewGroups') };
    const r = await busy($('#saveBtn', el), () => api.post('productSave', body));
    dirty = false;
    guard(null);
    toast('已儲存');
    if (isNew) go('/admin/products/' + r.product.id, true); else edit(el, id);
  };
  $('#delBtn', el)?.addEventListener('click', async () => {
    if (!(await confirmBox(`確定刪除「${p.name}」？`, { danger: true, ok: '刪除' }))) return;
    await api.post('productsBulk', { ids: [id], op: 'delete' });
    guard(null);
    toast('已刪除');
    go('/admin/products');
  });
  $('#copyBtn', el)?.addEventListener('click', async (e) => {
    const r = await busy(e.currentTarget, () => api.post('productCopy', { id }));
    guard(null);
    toast('已複製（預設下架）');
    go('/admin/products/' + r.product.id);
  });
}

/* ---------- 適用物流：一次看所有商品能用哪些運送方式，可以批次設定 ---------- */
export async function shipping(el) {
  const [{ rows }, pick] = await Promise.all([api.get('products'), api.get('pick')]);
  const full = await Promise.all(rows.map((r) => api.get('product', { id: r.id }).then((x) => x.product)));
  let selected = [];
  const st = { q: '', page: 1, size: 20 };
  const name = (id) => pick.shipping.find((m) => m.id === id)?.name || id;
  el.innerHTML = `<div class="page-head"><h1>適用物流</h1><div class="sub">每個商品可以指定能用哪些運送方式（例如大型商品不能超商取貨）。沒有指定的商品，全部運送方式都能用。</div></div>
    <div class="card"><div class="filters"><div class="search-in"><input class="input" id="q" placeholder="搜尋商品名稱"><button aria-label="搜尋">${icon('search')}</button></div></div><div id="bulk"></div><div id="tbl"></div></div>`;
  const draw = () => {
    const list = full.filter((p) => !st.q || p.name.toLowerCase().includes(st.q));
    selected = [];
    drawBulk();
    $('#tbl', el).innerHTML = list.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" aria-label="全選"></th><th></th><th>商品名稱</th><th>適用物流</th></tr></thead><tbody>${list.slice((st.page - 1) * st.size, st.page * st.size).map((p) => `<tr class="click" data-id="${p.id}"><td class="chk"><input type="checkbox" value="${p.id}" aria-label="選取"></td><td>${p.images?.[0] ? `<img class="thumb" src="${esc(p.images[0])}" alt="">` : '<span class="thumb"></span>'}</td><td>${esc(p.name)}</td><td>${p.shipIds?.length ? p.shipIds.map((x) => pill(name(x), 'accent')).join(' ') : '<span class="muted">全店物流</span>'}</td></tr>`).join('')}</tbody></table></div>` : emptyBox('沒有商品');
    if (list.length) $('#tbl', el).append(pager(list.length, st.page, st.size, (pg, sz) => { st.page = pg; st.size = sz; draw(); }));
    $$('tbody tr', el).forEach((tr) => (tr.onclick = () => go('/admin/products/' + tr.dataset.id)));
    const t = $('table', el); if (t) checkable(t, (ids) => { selected = ids; drawBulk(); });
  };
  const drawBulk = () => {
    const b = $('#bulk', el);
    if (!selected.length) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="bulk">已選 ${selected.length} 個商品，設定適用物流：${pick.shipping.map((m) => `<label class="check"><input type="checkbox" value="${esc(m.id)}"> ${esc(m.name)}</label>`).join('')}<button class="btn sm primary" id="apply">套用</button><span class="muted small">都不勾＝全店物流</span></div>`;
    $('#apply', b).onclick = async (e) => {
      const ids = $$('input:checked', b).map((x) => x.value);
      await busy(e.currentTarget, async () => { for (const pid of selected) { const p = full.find((x) => x.id === pid); p.shipIds = ids; await api.post('productSave', { ...p, id: pid }); } });
      toast('已更新');
      draw();
    };
  };
  $('#q', el).oninput = (e) => { st.q = e.target.value.trim().toLowerCase(); st.page = 1; draw(); };
  draw();
}

/* ---------- 貨到通知名單 ---------- */
export async function restock(el) {
  const { rows } = await api.get('restock');
  let selected = [];
  el.innerHTML = `<div class="page-head"><h1>貨到通知</h1><div class="sub">顧客在缺貨的商品頁按「貨到通知我」留下的名單。補貨後可以匯出名單寄信，或標記為已通知。（自動寄信之後串接）</div><div class="actions"><button class="btn" id="exp">${icon('download')}匯出名單</button></div></div>
    <div class="card"><div id="bulk"></div>${rows.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" aria-label="全選"></th><th></th><th>商品</th><th>規格</th><th class="num">目前庫存</th><th>Email</th><th>登記時間</th><th>狀態</th></tr></thead><tbody>
      ${rows.map((r) => `<tr data-id="${esc(r.id)}"><td class="chk"><input type="checkbox" value="${esc(r.id)}" aria-label="選取"></td><td>${r.img ? `<img class="thumb" src="${esc(r.img)}" alt="">` : ''}</td><td><a href="/admin/products/${esc(r.pid)}">${esc(r.pname)}</a></td><td>${esc(r.spec || '-')}</td><td class="num ${r.stock > 0 ? '' : 'err'}">${r.stock ?? '已刪除'}</td><td>${esc(r.email)}</td><td>${fmt.time(r.createdAt)}</td><td>${r.notified ? pill('已通知', 'ok') : r.stock > 0 ? pill('已補貨，待通知', 'warn') : pill('等待補貨')}</td></tr>`).join('')}</tbody></table></div>` : emptyBox('還沒有人登記')}</div>`;
  const drawBulk = () => {
    const b = $('#bulk', el);
    b.innerHTML = selected.length ? `<div class="bulk">已選 ${selected.length} 筆<button class="btn sm" data-op="done">標記為已通知</button><button class="btn sm danger" data-op="rm">刪除</button></div>` : '';
    $$('[data-op]', b).forEach((x) => (x.onclick = async () => { await busy(x, () => api.post('restockDone', { ids: selected, remove: x.dataset.op === 'rm' })); toast('已更新'); restock(el); }));
  };
  const t = $('table', el); if (t) checkable(t, (ids) => { selected = ids; drawBulk(); });
  $('#exp', el).onclick = () => {
    const csv = '﻿' + [['商品', '規格', 'Email', '登記時間', '已通知'], ...rows.map((r) => [r.pname, r.spec, r.email, fmt.time(r.createdAt), r.notified ? '是' : ''])].map((x) => x.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(',')).join('\r\n');
    Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv' })), download: '貨到通知.csv' }).click();
  };
}

/* ---------- 商品大量更新：像試算表一樣一次改所有規格的編號、價格、成本、庫存 ---------- */
export async function bulk(el) {
  const { rows } = await api.get('products');
  const full = await Promise.all(rows.map((r) => api.get('product', { id: r.id }).then((x) => x.product)));
  const showCost = can('cost');
  const lines = full.flatMap((p) => p.variants.map((v) => ({ id: p.id, name: p.name, img: p.images?.[0] || '', key: v.key, sku: v.sku || '', price: v.price, listPrice: v.listPrice || 0, cost: v.cost ?? 0, stock: v.stock })));
  const changed = new Map();
  guard(() => changed.size > 0);
  const st = { q: '' };
  el.innerHTML = `<a class="back" href="/admin/products">‹ 回商品列表</a><div class="page-head"><h1>商品大量更新</h1><div class="sub">直接在表格裡修改，改過的格子會變色，按「儲存」一次更新。可以用 Tab 鍵跳下一格。</div><div class="actions"><button class="btn primary" id="save" disabled>儲存</button></div></div>
    <div class="card"><div class="filters"><div class="search-in"><input class="input" id="q" placeholder="搜尋商品名稱或編號"><button aria-label="搜尋">${icon('search')}</button></div>
      <span class="inline muted small">全部套用：<input class="input" type="number" id="setStock" placeholder="庫存" style="width:90px"><input class="input" type="number" id="addStock" placeholder="庫存加減" style="width:100px"><input class="input" type="number" id="pctPrice" placeholder="售價 ±%" style="width:100px"><button class="btn sm" id="applyAll">套用到篩選結果</button></span></div>
      <div id="tbl"></div></div>`;
  const F = ['sku', 'price', 'listPrice', ...(showCost ? ['cost'] : []), 'stock'];
  const draw = () => {
    const list = lines.filter((l) => !st.q || `${l.name} ${l.sku}`.toLowerCase().includes(st.q));
    $('#tbl', el).innerHTML = `<div class="table-wrap" style="max-height:70vh"><table class="tbl vt"><thead><tr><th></th><th>商品名稱</th><th>規格</th><th>規格編號</th><th>售價</th><th>原價</th>${showCost ? '<th>成本</th>' : ''}<th>庫存</th></tr></thead><tbody>
      ${list.map((l) => `<tr data-k="${esc(l.id + '|' + l.key)}"><td>${l.img ? `<img class="thumb" src="${esc(l.img)}" alt="" style="width:36px;height:36px">` : ''}</td><td class="ellipsis" style="max-width:240px">${esc(l.name)}</td><td>${esc(l.key || '-')}</td>${F.map((f) => `<td><input class="input" data-f="${f}" ${f === 'sku' ? '' : 'type="number" min="0"'} value="${esc(l[f])}" style="${changed.get(l.id + '|' + l.key)?.[f] !== undefined ? 'background:var(--warn-soft)' : ''}"></td>`).join('')}</tr>`).join('')}</tbody></table></div><p class="muted small">共 ${list.length} 個規格</p>`;
  };
  const set = (l, f, v) => {
    const k = l.id + '|' + l.key;
    l[f] = v;
    changed.set(k, { ...(changed.get(k) || { id: l.id, key: l.key }), [f]: v });
    $('#save', el).disabled = false;
    $('#save', el).textContent = `儲存（${changed.size} 個規格）`;
  };
  $('#tbl', el).addEventListener('input', (e) => {
    const tr = e.target.closest('tr');
    const l = lines.find((x) => x.id + '|' + x.key === tr.dataset.k);
    const f = e.target.dataset.f;
    set(l, f, f === 'sku' ? e.target.value : Math.max(0, Math.round(+e.target.value || 0)));
    e.target.style.background = 'var(--warn-soft)';
  });
  $('#q', el).oninput = (e) => { st.q = e.target.value.trim().toLowerCase(); draw(); };
  $('#applyAll', el).onclick = () => {
    const list = lines.filter((l) => !st.q || `${l.name} ${l.sku}`.toLowerCase().includes(st.q));
    const ss = $('#setStock', el).value, as = $('#addStock', el).value, pp = $('#pctPrice', el).value;
    if (ss === '' && as === '' && pp === '') return toast('先填要套用的數字', true);
    for (const l of list) {
      if (ss !== '') set(l, 'stock', Math.max(0, +ss));
      if (as !== '') set(l, 'stock', Math.max(0, l.stock + +as));
      if (pp !== '') set(l, 'price', Math.max(0, Math.round(l.price * (100 + +pp) / 100)));
    }
    draw();
    toast(`已套用到 ${list.length} 個規格，記得按儲存`);
  };
  $('#save', el).onclick = async (e) => {
    const r = await busy(e.currentTarget, () => api.post('variantsBulk', { rows: [...changed.values()] }));
    changed.clear();
    guard(null);
    toast(`已更新 ${r.ok} 個規格`);
    bulk(el);
  };
  draw();
}
