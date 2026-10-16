// 行銷：折扣（商品折扣、滿額折扣、優惠碼、免運、購物金）、試算、購物車加購區、湊湊團
import { api, $, $$, esc, money, icon, toast, modal, busy, pill, emptyBox, confirmBox, sw, pickProducts } from './app.js';

const TYPES = {
  product: { name: '商品折扣', desc: '指定會員群組、商品標籤打折（例如 VIP 九折）' },
  order: { name: '滿額折扣', desc: '訂單滿多少折多少（例如滿 2000 折 200）' },
  coupon: { name: '優惠碼', desc: '結帳輸入代碼折抵' },
  freeShip: { name: '免運', desc: '滿額或特定會員免運費' },
  points: { name: '購物金', desc: '滿額贈送、會員生日、加入會員送購物金' },
};
const TRIG = { spend: '滿額贈送', birthday: '會員生日', signup: '會員加入' };

function summary(d, groups) {
  const who = d.groups?.length ? d.groups.map((g) => (g === 'guest' ? '訪客' : g === 'member' ? '一般會員' : groups.find((x) => x.id === g)?.name || '?')).join('、') : '所有人';
  const when = d.start || d.end ? `${d.start || '即日起'} ~ ${d.end || '不限'}` : '不限期間';
  const off = d.mode === 'percent' ? `${d.percent}% off` : money(d.amount);
  const s = {
    product: `${d.tags?.length ? '標籤「' + d.tags.join('、') + '」' : '全部商品'} 折 ${d.percent}%`,
    order: `滿 ${money(d.threshold)} 折 ${off}`,
    coupon: `代碼 ${d.code}・滿 ${money(d.threshold)} 折 ${off}・已使用 ${d.used || 0}${d.limit ? '/' + d.limit : ''} 次`,
    freeShip: `滿 ${money(d.threshold)} 免運`,
    points: d.trigger === 'spend' ? `滿 ${money(d.threshold)} 送 ${d.mode === 'percent' ? d.percent + '% 購物金' : d.amount + ' 點'}` : `送 ${d.amount} 點`,
  }[d.type];
  return `${s}・${who}・${when}`;
}

export async function discounts(el) {
  const data = await api.get('marketing');
  const { groups } = data;
  el.innerHTML = `<div class="page-head"><h1>折扣</h1><div class="actions"><button class="btn" id="sim">${icon('sparkle')}試算</button><button class="btn" id="order">調整計算順序</button><button class="btn primary" id="add">${icon('plus')}新增折扣</button></div></div>
    <div class="card" id="list"></div>`;
  const draw = () => {
    $('#list', el).innerHTML = Object.entries(TYPES).map(([t, info]) => {
      const list = data.discounts.filter((d) => d.type === t);
      return `<div class="disc-sec ${t}"><h3>${info.name} <span class="muted small" style="font-weight:400">${info.desc}</span>${t === 'points' ? '<span class="actions"><a class="btn sm" href="/admin/customers">大量贈送</a> <a class="btn sm" href="/admin/settings/shopping">折抵設定</a></span>' : ''}</h3>
        ${list.length ? list.map((d) => `<div class="disc" data-id="${d.id}">${sw('', d.on, 'data-toggle')}<div class="grow"><b>${t === 'points' ? `<span class="muted" style="font-weight:400">${TRIG[d.trigger]}</span> ` : ''}${esc(d.name)}</b><small>${esc(summary(d, groups))}</small></div><button class="btn sm" data-edit>編輯</button><button class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button></div>`).join('') : '<p class="muted small">還沒有設定</p>'}
        <button class="btn sm ghost" data-new="${t}">${icon('plus')}新增${info.name}</button></div>`;
    }).join('');
  };
  draw();
  const reload = async () => { Object.assign(data, await api.get('marketing')); draw(); };
  $('#list', el).addEventListener('change', async (e) => {
    if (!e.target.matches('[data-toggle]')) return;
    const id = e.target.closest('[data-id]').dataset.id;
    await api.post('discountToggle', { id, on: e.target.checked });
    data.discounts.find((d) => d.id === id).on = e.target.checked;
    toast(e.target.checked ? '已啟用' : '已停用');
  });
  $('#list', el).addEventListener('click', async (e) => {
    const row = e.target.closest('[data-id]');
    if (e.target.closest('[data-new]')) form(e.target.closest('[data-new]').dataset.new);
    if (row && e.target.closest('[data-edit]')) form(null, data.discounts.find((d) => d.id === row.dataset.id));
    if (row && e.target.closest('[data-del]')) { if (await confirmBox('刪除這個折扣？', { danger: true, ok: '刪除' })) { await api.post('discountDelete', { id: row.dataset.id }); reload(); } }
  });
  $('#add', el).onclick = () => {
    const { box, close } = modal({ title: '新增折扣', body: `<div style="display:grid;gap:8px">${Object.entries(TYPES).map(([t, i]) => `<button class="btn" style="justify-content:flex-start;padding:12px 16px;text-align:left" data-t="${t}"><span><b>${i.name}</b><br><small class="muted">${i.desc}</small></span></button>`).join('')}</div>` });
    $$('[data-t]', box).forEach((b) => (b.onclick = () => { close(); form(b.dataset.t); }));
  };

  const form = (type, d = {}) => {
    type ||= d.type;
    d = { on: true, groups: [], tags: [], mode: 'amount', trigger: 'spend', shippingIds: [], ...d };
    const groupBoxes = [['guest', '訪客（未登入）'], ['member', '一般會員'], ...groups.map((g) => [g.id, g.name])].map(([v, n]) => `<label class="check"><input type="checkbox" name="groups" value="${v}" ${d.groups.includes(v) ? 'checked' : ''}> ${esc(n)}</label>`).join('');
    const offFields = `<div class="row"><label class="field"><span>折扣方式</span><select class="input" name="mode"><option value="amount"${d.mode === 'amount' ? ' selected' : ''}>折抵金額</option><option value="percent"${d.mode === 'percent' ? ' selected' : ''}>打折（%）</option></select></label>
      <label class="field" data-m="amount"><span>折抵金額</span><input class="input" type="number" min="0" name="amount" value="${d.amount || ''}"></label><label class="field" data-m="percent"><span>折扣 %（10 = 九折）</span><input class="input" type="number" min="0" max="100" name="percent" value="${d.percent || ''}"></label></div>`;
    const body = `<label class="field"><span>活動名稱 <em>*</em></span><input class="input" name="name" required value="${esc(d.name || '')}" placeholder="顧客會看到這個名稱"></label>
      ${type === 'points' ? `<label class="field"><span>贈送時機</span><select class="input" name="trigger">${Object.entries(TRIG).map(([v, n]) => `<option value="${v}"${d.trigger === v ? ' selected' : ''}>${n}</option>`).join('')}</select><span class="help">滿額贈送：訂單結案後發放。會員生日：生日當月的第一天凌晨發放。會員加入：註冊完成時發放。</span></label>` : ''}
      ${type === 'coupon' ? `<div class="row"><label class="field"><span>優惠碼 <em>*</em></span><input class="input" name="code" value="${esc(d.code || '')}" style="text-transform:uppercase"></label><label class="field"><span>總使用次數（0 = 不限）</span><input class="input" type="number" min="0" name="limit" value="${d.limit || 0}"></label></div><label class="check" style="margin-bottom:12px"><input type="checkbox" name="once" ${d.once ? 'checked' : ''}> 每位會員限用一次</label>` : ''}
      ${type === 'product' ? `<label class="field"><span>折扣 %（10 = 九折）<em>*</em></span><input class="input" type="number" min="1" max="99" name="percent" value="${d.percent || ''}" required></label><label class="field"><span>適用商品標籤（空白 = 全部商品，多個用逗號分開）</span><input class="input" name="tags" value="${esc(d.tags.join(', '))}" list="mkTags"></label><datalist id="mkTags">${data.tags.map((t) => `<option value="${esc(t)}">`).join('')}</datalist>` : ''}
      ${['order', 'coupon', 'freeShip'].includes(type) || (type === 'points' && d.trigger === 'spend') ? `<label class="field" data-th><span>訂單滿多少（0 = 不限）</span><input class="input" type="number" min="0" name="threshold" value="${d.threshold || 0}"></label>` : ''}
      ${['order', 'coupon'].includes(type) ? offFields : ''}
      ${type === 'points' ? `<div class="row"><label class="field" data-pm><span>贈送方式</span><select class="input" name="mode"><option value="amount"${d.mode === 'amount' ? ' selected' : ''}>固定點數</option><option value="percent"${d.mode === 'percent' ? ' selected' : ''}>訂單金額的 %</option></select></label><label class="field" data-m="amount"><span>點數</span><input class="input" type="number" min="0" name="amount" value="${d.amount || ''}"></label><label class="field" data-m="percent"><span>%</span><input class="input" type="number" min="0" max="100" name="percent" value="${d.percent || ''}"></label></div>` : ''}
      ${type === 'freeShip' ? `<div class="field"><span>適用運送方式（都不勾 = 全部）</span><div class="inline">${data.shipping.filter((s) => s.on).map((s) => `<label class="check"><input type="checkbox" name="shippingIds" value="${s.id}" ${d.shippingIds.includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('')}</div></div>` : ''}
      <div class="field"><span>適用對象（都不勾 = 所有人）</span><div class="inline">${groupBoxes}</div></div>
      <div class="row"><label class="field"><span>開始日期</span><input class="input" type="date" name="start" value="${esc(d.start || '')}"></label><label class="field"><span>結束日期</span><input class="input" type="date" name="end" value="${esc(d.end || '')}"></label></div>
      <label class="check"><input type="checkbox" name="on" ${d.on ? 'checked' : ''}> 啟用</label>`;
    const { box, close } = modal({ title: (d.id ? '編輯' : '新增') + TYPES[type].name, body: `<form id="df">${body}</form>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>儲存</button>' });
    const f = $('#df', box);
    const sync = () => { const m = f.mode?.value; $$('[data-m]', f).forEach((x) => (x.hidden = x.dataset.m !== m)); };
    f.mode?.addEventListener('change', sync);
    f.trigger?.addEventListener('change', () => { close(); form(type, { ...d, ...Object.fromEntries(new FormData(f)), groups: d.groups, tags: d.tags, trigger: f.trigger.value }); });
    sync();
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => {
      if (!f.reportValidity()) return;
      const fd = new FormData(f);
      const v = Object.fromEntries(fd);
      const body = { ...v, id: d.id, type, on: !!fd.get('on'), once: !!fd.get('once'), groups: fd.getAll('groups'), shippingIds: fd.getAll('shippingIds'), tags: (v.tags || '').split(/[,，]/).map((s) => s.trim()).filter(Boolean), threshold: +v.threshold || 0, amount: +v.amount || 0, percent: +v.percent || 0, limit: +v.limit || 0, priority: d.priority ?? data.discounts.length };
      await busy(e.currentTarget, () => api.post('discountSave', body));
      close();
      toast('已儲存');
      reload();
    };
  };

  $('#order', el).onclick = () => {
    const list = data.discounts.filter((d) => ['order', 'coupon'].includes(d.type));
    const { box, close } = modal({ title: '調整計算順序', body: `<p class="muted" style="margin-top:0">滿額折扣和優惠碼會依這個順序一個接一個計算，上面的先算。</p><div id="ol">${list.map((d) => `<div class="disc" data-id="${d.id}"><div class="grow"><b>${esc(d.name)}</b><small>${TYPES[d.type].name}</small></div><button class="btn sm" data-u>↑</button><button class="btn sm" data-d>↓</button></div>`).join('') || emptyBox('沒有滿額折扣或優惠碼')}</div>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>儲存</button>' });
    const ol = $('#ol', box);
    ol.addEventListener('click', (e) => { const r = e.target.closest('.disc'); if (!r) return; if (e.target.closest('[data-u]') && r.previousElementSibling) ol.insertBefore(r, r.previousElementSibling); if (e.target.closest('[data-d]') && r.nextElementSibling) ol.insertBefore(r.nextElementSibling, r); });
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => { const ids = $$('.disc', ol).map((x) => x.dataset.id); const others = data.discounts.filter((d) => !ids.includes(d.id)).map((d) => d.id); await busy(e.currentTarget, () => api.post('discountOrder', { ids: [...ids, ...others] })); close(); toast('已儲存'); reload(); };
  };

  $('#sim', el).onclick = () => {
    const cart = [];
    const { box } = modal({
      title: '試算', size: 'wide',
      body: `<p class="muted" style="margin-top:0">模擬某個會員群組買這些商品時，所有折扣、運費、購物金回饋會怎麼算。</p>
        <div class="row"><label class="field"><span>會員群組</span><select class="input" id="sg"><option value="guest">訪客</option><option value="member" selected>一般會員</option>${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select></label>
        <label class="field"><span>運送方式</span><select class="input" id="ss">${data.shipping.filter((s) => s.on).map((s) => `<option value="${s.id}">${esc(s.name)}</option>`).join('')}</select></label>
        <label class="field"><span>優惠碼</span><input class="input" id="sc"></label><label class="field"><span>使用購物金（假設有 9999 點）</span><input class="input" type="number" id="sp" value="0" min="0"></label></div>
        <div class="field"><span>商品</span><div id="sl"></div><button class="btn sm" id="sadd">${icon('plus')}加入商品</button></div>
        <div class="sim-out" id="so">加入商品後會自動試算</div>`,
    });
    const run = async () => {
      $('#sl', box).innerHTML = cart.map((c, i) => `<div class="inline" style="margin-bottom:6px" data-i="${i}"><span style="flex:1">${esc(c.name)}</span>${c.variants.length > 1 ? `<select class="input" data-v>${c.variants.map((v) => `<option${v.key === c.vkey ? ' selected' : ''}>${esc(v.key)}</option>`).join('')}</select>` : ''}<input class="input" type="number" min="1" value="${c.qty}" data-q style="width:80px"><button class="btn sm ghost" data-r>${icon('x')}</button></div>`).join('');
      if (!cart.length) { $('#so', box).textContent = '加入商品後會自動試算'; return; }
      try {
        const { quote: q } = await api.post('simulate', { groupId: $('#sg', box).value, points: 9999, cart: { items: cart.map((c) => ({ pid: c.pid, vkey: c.vkey, qty: c.qty })), coupon: $('#sc', box).value, shippingId: $('#ss', box).value, points: +$('#sp', box).value } });
        $('#so', box).innerHTML = `${q.lines.map((l) => `<div><span>${esc(l.name)} ${esc(l.spec || '')} × ${l.qty}${l.notes?.length ? ` <span class="pill accent">${esc(l.notes.join('、'))}</span>` : ''}</span><span>${money(l.amount)}</span></div>`).join('')}
          <div><b>商品小計</b><b>${money(q.subtotal)}</b></div>${q.discounts.map((d) => `<div><span>${esc(d.name)}</span><span class="err">−${money(d.amount)}</span></div>`).join('')}
          ${q.coupon && !q.coupon.ok ? `<div class="err">${esc(q.coupon.msg)}</div>` : ''}${q.points.used ? `<div><span>購物金折抵</span><span class="err">−${money(q.points.value)}</span></div>` : ''}
          <div><span>運費</span><span>${q.shipping ? (q.shipping.fee ? money(q.shipping.fee) : '免運' + (q.shipping.free ? `（${esc(q.shipping.free)}）` : '')) : '-'}</span></div>
          <div style="border-top:1px solid var(--line);padding-top:6px;margin-top:4px"><b>合計</b><b>${money(q.total)}</b></div>${q.earn ? `<div><span>回饋購物金</span><span>${q.earn} 點</span></div>` : ''}${q.errors.map((x) => `<div class="err">${esc(x)}</div>`).join('')}`;
      } catch (e) { $('#so', box).innerHTML = `<span class="err">${esc(e.message)}</span>`; }
    };
    $('#sadd', box).onclick = async () => {
      const ids = await pickProducts({ multiple: true });
      if (!ids) return;
      const { products } = await api.get('pick');
      for (const id of ids) { const p = products.find((x) => x.id === id); if (p && !cart.some((c) => c.pid === id)) cart.push({ pid: id, name: p.name, variants: p.variants, vkey: p.variants[0]?.key ?? '', qty: 1 }); }
      run();
    };
    $('#sl', box).addEventListener('change', (e) => { const r = e.target.closest('[data-i]'); const c = cart[+r.dataset.i]; if (e.target.matches('[data-q]')) c.qty = +e.target.value || 1; if (e.target.matches('[data-v]')) c.vkey = e.target.value; run(); });
    $('#sl', box).addEventListener('click', (e) => { if (e.target.closest('[data-r]')) { cart.splice(+e.target.closest('[data-i]').dataset.i, 1); run(); } });
    ['#sg', '#ss', '#sc', '#sp'].forEach((s) => $(s, box).addEventListener('change', run));
  };
}

/* ---------- 購物車加購區 ---------- */
export async function addons(el) {
  const data = await api.get('marketing');
  const pname = (id) => data.products.find((p) => p.id === id);
  el.innerHTML = `<div class="page-head"><h1>購物車加購區</h1><div class="actions"><button class="btn primary" id="add">${icon('plus')}新增加購區</button></div><div class="sub">顧客的購物車裡有商品時，可以用優惠價加購這些商品（例如：滿任一件，襪子加購價 $99）。</div></div>
    <div class="card">${data.addons.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>狀態</th><th>加購區名稱</th><th>商品</th><th>開放時間</th><th></th></tr></thead><tbody>${data.addons.map((z) => `<tr data-id="${z.id}"><td>${sw('', z.on, 'data-toggle')}</td><td class="strong">${esc(z.name)}</td><td>${z.items.length} 項商品<div class="small muted">${z.items.slice(0, 3).map((i) => esc(pname(i.pid)?.name || '已刪除')).join('、')}</div></td><td>${z.start || z.end ? `${esc(z.start || '即日起')} ~ ${esc(z.end || '不限')}` : '永久開放'}</td><td class="right"><button class="btn sm" data-edit>編輯</button> <button class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div>` : emptyBox('還沒有加購區')}</div>`;
  el.querySelector('tbody')?.addEventListener('change', async (e) => { const z = data.addons.find((x) => x.id === e.target.closest('tr').dataset.id); await api.post('addonSave', { ...z, on: e.target.checked }); toast('已更新'); });
  el.querySelector('tbody')?.addEventListener('click', async (e) => {
    const id = e.target.closest('tr')?.dataset.id;
    if (e.target.closest('[data-edit]')) form(data.addons.find((x) => x.id === id));
    if (e.target.closest('[data-del]') && (await confirmBox('刪除這個加購區？', { danger: true, ok: '刪除' }))) { await api.post('addonDelete', { id }); addons(el); }
  });
  $('#add', el).onclick = () => form({ name: '', on: true, items: [] });
  const form = (z) => {
    z = JSON.parse(JSON.stringify(z));
    const { box, close } = modal({ title: z.id ? '編輯加購區' : '新增加購區', size: 'wide', body: `<div class="row"><label class="field"><span>名稱</span><input class="input" name="name" value="${esc(z.name)}" placeholder="例如：結帳前加購"></label><label class="field"><span>開始日期</span><input class="input" type="date" name="start" value="${esc(z.start || '')}"></label><label class="field"><span>結束日期</span><input class="input" type="date" name="end" value="${esc(z.end || '')}"></label></div>
      <label class="check" style="margin-bottom:12px"><input type="checkbox" name="on" ${z.on ? 'checked' : ''}> 啟用</label><div id="items"></div><button class="btn sm" id="pick">${icon('plus')}選擇商品</button>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>儲存</button>' });
    const draw = () => {
      $('#items', box).innerHTML = z.items.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>商品</th><th class="num">原價</th><th>加購價</th><th>每單限購（0 = 不限）</th><th></th></tr></thead><tbody>${z.items.map((i, k) => { const p = pname(i.pid); return `<tr data-k="${k}"><td>${esc(p?.name || '已刪除的商品')}</td><td class="num">${money(p?.price)}</td><td><input class="input" type="number" min="0" data-f="price" value="${i.price}" style="width:110px"></td><td><input class="input" type="number" min="0" data-f="limit" value="${i.limit || 0}" style="width:90px"></td><td><button class="btn sm ghost" data-rm>${icon('x')}</button></td></tr>`; }).join('')}</tbody></table></div>` : '<p class="muted">還沒有商品</p>';
    };
    draw();
    $('#items', box).addEventListener('input', (e) => { const k = +e.target.closest('tr').dataset.k; z.items[k][e.target.dataset.f] = +e.target.value || 0; });
    $('#items', box).addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { z.items.splice(+e.target.closest('tr').dataset.k, 1); draw(); } });
    $('#pick', box).onclick = async () => { const ids = await pickProducts({ selected: z.items.map((i) => i.pid) }); if (!ids) return; z.items = ids.map((id) => z.items.find((i) => i.pid === id) || { pid: id, price: Math.round((pname(id)?.price || 0) * 0.8), limit: 1 }); draw(); };
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => { await busy(e.currentTarget, () => api.post('addonSave', { ...z, name: $('[name=name]', box).value, start: $('[name=start]', box).value, end: $('[name=end]', box).value, on: $('[name=on]', box).checked })); close(); toast('已儲存'); addons(el); };
  };
}

/* ---------- 湊湊團 ---------- */
export async function groupbuys(el) {
  const data = await api.get('marketing');
  const prod = (id) => data.products.find((p) => p.id === id);
  el.innerHTML = `<div class="page-head"><h1>湊湊團 ${pill('實驗功能', 'info')}</h1><div class="actions"><button class="btn primary" id="add">${icon('plus')}新增活動</button></div><div class="sub">針對單一商品，活動期間賣越多越便宜，吸引顧客分享揪團。售價會依活動期間累計銷量自動調降。</div></div>
    <div class="card">${data.groupbuys.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>狀態</th><th>商品</th><th>活動名稱</th><th>活動期間</th><th>價格階梯</th><th class="num">目前售價</th><th class="num">累計銷量</th><th></th></tr></thead><tbody>
      ${data.groupbuys.map((g) => { const tiers = [...g.tiers].sort((a, b) => a.qty - b.qty); const cur = tiers.filter((t) => (g.sold || 0) >= t.qty).pop(); return `<tr data-id="${g.id}"><td>${g.on ? pill('進行中', 'ok') : pill('停用')}</td><td>${esc(prod(g.pid)?.name || '已刪除')}</td><td class="strong">${esc(g.name)}</td><td>${esc(g.start || '即日起')} ~ ${esc(g.end || '不限')}</td><td class="small">${tiers.map((t) => `滿 ${t.qty} 件 ${money(t.price)}`).join('<br>')}</td><td class="num">${cur ? money(cur.price) : money(prod(g.pid)?.price)}</td><td class="num">${g.sold || 0}</td><td class="right nowrap"><button class="btn sm" data-edit>編輯</button> <button class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button></td></tr>`; }).join('')}</tbody></table></div>` : emptyBox('尚未建立活動')}</div>`;
  el.querySelector('tbody')?.addEventListener('click', async (e) => {
    const id = e.target.closest('tr')?.dataset.id;
    if (e.target.closest('[data-edit]')) form(data.groupbuys.find((x) => x.id === id));
    if (e.target.closest('[data-del]') && (await confirmBox('刪除這個活動？', { danger: true, ok: '刪除' }))) { await api.post('groupbuyDelete', { id }); groupbuys(el); }
  });
  $('#add', el).onclick = () => form({ name: '湊湊團', on: true, tiers: [{ qty: 0, price: 0 }, { qty: 10, price: 0 }, { qty: 30, price: 0 }], sold: 0 });
  const form = (g) => {
    g = JSON.parse(JSON.stringify(g));
    const { box, close } = modal({ title: g.id ? '編輯湊湊團' : '新增湊湊團', body: `<div class="field"><span>商品</span><div class="inline"><b id="pn">${esc(prod(g.pid)?.name || '尚未選擇')}</b><button class="btn sm" id="pp">選擇</button></div></div>
      <div class="row"><label class="field"><span>活動名稱</span><input class="input" name="name" value="${esc(g.name)}"></label><label class="field"><span>開始</span><input class="input" type="date" name="start" value="${esc(g.start || '')}"></label><label class="field"><span>結束</span><input class="input" type="date" name="end" value="${esc(g.end || '')}"></label></div>
      <div class="field"><span>價格階梯（累計賣到幾件 → 售價）</span><div id="tiers"></div><button class="btn sm" id="ta">${icon('plus')}加一階</button></div>
      <label class="field"><span>目前累計銷量（可手動調整，例如先灌入預購數）</span><input class="input" type="number" min="0" name="sold" value="${g.sold || 0}"></label>
      <label class="check"><input type="checkbox" name="on" ${g.on ? 'checked' : ''}> 啟用</label>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>儲存</button>' });
    const draw = () => { $('#tiers', box).innerHTML = g.tiers.map((t, i) => `<div class="cond" data-i="${i}">滿 <input class="input" type="number" min="0" data-f="qty" value="${t.qty}"> 件，售價 <input class="input" type="number" min="0" data-f="price" value="${t.price || ''}"> 元 <button class="btn sm ghost" data-rm>${icon('x')}</button></div>`).join(''); };
    draw();
    $('#tiers', box).addEventListener('input', (e) => { g.tiers[+e.target.closest('[data-i]').dataset.i][e.target.dataset.f] = +e.target.value || 0; });
    $('#tiers', box).addEventListener('click', (e) => { if (e.target.closest('[data-rm]')) { g.tiers.splice(+e.target.closest('[data-i]').dataset.i, 1); draw(); } });
    $('#ta', box).onclick = () => { g.tiers.push({ qty: (g.tiers.at(-1)?.qty || 0) + 10, price: 0 }); draw(); };
    $('#pp', box).onclick = async () => { const ids = await pickProducts({ multiple: false, selected: g.pid ? [g.pid] : [] }); if (ids?.[0]) { g.pid = ids[0]; $('#pn', box).textContent = prod(g.pid)?.name; if (!g.tiers[0].price) g.tiers[0].price = prod(g.pid)?.price || 0; draw(); } };
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => { await busy(e.currentTarget, () => api.post('groupbuySave', { ...g, name: $('[name=name]', box).value, start: $('[name=start]', box).value, end: $('[name=end]', box).value, sold: +$('[name=sold]', box).value, on: $('[name=on]', box).checked })); close(); toast('已儲存'); groupbuys(el); };
  };
}
