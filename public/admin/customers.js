// 顧客管理：顧客名單、顧客詳情、顧客群組（會員等級）、特約代碼、顧客分眾
import { api, $, $$, esc, money, icon, toast, modal, busy, fmt, pill, pager, checkable, emptyBox, confirmBox, go, sw, can } from './app.js';


/* ---------- 顧客名單 ---------- */
export async function list(el) {
  const st = { q: '', group: '', from: '', to: '', minSpent: '', maxSpent: '', black: '', page: 1, size: 20 };
  let rows = [], groups = [], selected = [];
  el.innerHTML = `
    <div class="page-head"><h1>顧客名單</h1><div class="actions"><button class="btn" id="impBtn" ${can('customersExport') ? '' : 'hidden'}>${icon('upload')}上傳顧客資料</button><button class="btn" id="expBtn" ${can('customersExport') ? '' : 'hidden'}>${icon('download')}匯出全部顧客</button></div></div>
    <div class="card">
      <div class="filters">
        <div class="search-in"><input class="input" id="qF" placeholder="姓名、Email、手機"><button aria-label="搜尋">${icon('search')}</button></div>
        <select class="input" id="gF" style="max-width:200px"></select>
        <span class="range"><input class="input" type="date" id="fromF" aria-label="註冊日期起"> → <input class="input" type="date" id="toF" aria-label="註冊日期迄"></span>
        <button class="btn" id="moreF">${icon('filter')}篩選</button>
      </div>
      <div id="bulk"></div><div id="tbl"><div class="loading">載入中…</div></div>
    </div>`;
  const gname = (id) => groups.find((g) => g.id === id)?.name || '一般會員';
  const filtered = () => rows.filter((c) => (!st.q || [c.name, c.email, c.phone].join(' ').toLowerCase().includes(st.q.toLowerCase()))
    && (!st.group || (st.group === 'none' ? !c.groupId : c.groupId === st.group))
    && (!st.from || c.createdAt >= new Date(st.from + 'T00:00:00+08:00').getTime()) && (!st.to || c.createdAt <= new Date(st.to + 'T23:59:59+08:00').getTime())
    && (st.minSpent === '' || c.spent >= +st.minSpent) && (st.maxSpent === '' || c.spent <= +st.maxSpent)
    && (!st.black || (st.black === 'y') === c.blacklisted));
  const draw = () => {
    const list = filtered();
    const box = $('#tbl', el);
    selected = [];
    drawBulk();
    if (!list.length) { box.innerHTML = emptyBox(rows.length ? '沒有符合的顧客' : '還沒有顧客'); return; }
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" aria-label="全選"></th><th>顧客姓名</th><th>信箱</th><th>手機</th><th>顧客群組</th><th>使用期限</th><th class="num">訂單</th><th class="num">累計消費</th><th class="num">購物金</th><th>註冊日期</th></tr></thead><tbody>
      ${list.slice((st.page - 1) * st.size, st.page * st.size).map((c) => `<tr class="click" data-id="${esc(c.id)}"><td class="chk"><input type="checkbox" value="${esc(c.id)}" aria-label="選取"></td>
        <td class="strong">${esc(c.name)}${c.blacklisted ? ' ' + pill('黑名單', 'bad') : ''}${c.pending ? ' ' + pill('匯入未註冊') : ''}</td><td>${esc(c.email)}</td><td>${esc(c.phone || '')}</td>
        <td>${c.groupId ? pill(gname(c.groupId), 'accent') : '<span class="muted">一般會員</span>'}</td><td class="nowrap">${c.groupUntil ? fmt.date(c.groupUntil) : '-'}</td>
        <td class="num">${c.orders}</td><td class="num">${money(c.spent)}</td><td class="num">${c.points}</td><td class="nowrap">${fmt.time(c.createdAt)}</td></tr>`).join('')}</tbody></table></div>`;
    box.append(pager(list.length, st.page, st.size, (p, s) => { st.page = p; st.size = s; draw(); }));
    $$('tbody tr', box).forEach((tr) => (tr.onclick = () => go('/admin/customers/' + tr.dataset.id)));
    checkable($('table', box), (ids) => { selected = ids; drawBulk(); });
  };
  const drawBulk = () => {
    const b = $('#bulk', el);
    if (!selected.length || !can('customersEdit')) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="bulk">已選 ${selected.length} 位<select class="input" id="bg" style="width:auto"><option value="">移到群組…</option><option value="none">一般會員</option>${groups.map((g) => `<option value="${g.id}">${esc(g.name)}</option>`).join('')}</select><button class="btn sm" id="bgGo">套用</button><button class="btn sm" id="bpts">贈送購物金</button><button class="btn sm" id="bexp" ${can('customersExport') ? '' : 'hidden'}>${icon('download')}匯出選取</button></div>`;
    $('#bgGo', b).onclick = async (e) => { const g = $('#bg', b).value; if (!g) return; await busy(e.currentTarget, () => api.post('customersBulk', { ids: selected, op: 'group', groupId: g === 'none' ? null : g })); toast('已更新'); load(); };
    $('#bexp', b).onclick = () => api.download('exportCustomers', { ids: selected.join(',') });
    $('#bpts', b).onclick = () => givePoints(selected, load);
  };
  const load = async () => {
    const r = await api.get('customers');
    rows = r.rows;
    groups = r.groups;
    $('#gF', el).innerHTML = `<option value="">所有顧客群組</option><option value="none">一般會員</option>${groups.map((g) => `<option value="${g.id}"${st.group === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}`;
    draw();
  };
  $('#qF', el).oninput = (e) => { st.q = e.target.value.trim(); st.page = 1; draw(); };
  $('#gF', el).onchange = (e) => { st.group = e.target.value; st.page = 1; draw(); };
  $('#fromF', el).onchange = (e) => { st.from = e.target.value; draw(); };
  $('#toF', el).onchange = (e) => { st.to = e.target.value; draw(); };
  $('#moreF', el).onclick = () => {
    const { box, close } = modal({
      title: '篩選顧客',
      body: `<label class="field"><span>累計消費</span><span class="range"><input class="input" type="number" name="min" value="${esc(st.minSpent)}" placeholder="最少"> → <input class="input" type="number" name="max" value="${esc(st.maxSpent)}" placeholder="最多"></span></label>
        <label class="field"><span>黑名單</span><select class="input" name="black"><option value="">不限</option><option value="y"${st.black === 'y' ? ' selected' : ''}>只看黑名單</option><option value="n"${st.black === 'n' ? ' selected' : ''}>排除黑名單</option></select></label>`,
      foot: '<button class="btn" data-clear>清除</button><button class="btn primary" data-ok>套用</button>',
    });
    $('[data-clear]', box).onclick = () => { st.minSpent = st.maxSpent = st.black = ''; close(); draw(); };
    $('[data-ok]', box).onclick = () => { st.minSpent = $('[name=min]', box).value; st.maxSpent = $('[name=max]', box).value; st.black = $('[name=black]', box).value; close(); draw(); };
  };
  $('#expBtn', el).onclick = (e) => busy(e.currentTarget, () => api.download('exportCustomers'));
  $('#impBtn', el).onclick = () => {
    const { box, close } = modal({
      title: '上傳顧客資料',
      body: `<p class="muted" style="margin-top:0">CSV 第一列是欄位名稱，需要「Email」，可以有「姓名」「手機」「生日」（YYYY-MM-DD）「顧客群組」「購物金」。已經存在的 Email 會略過。匯入的顧客用同一個 Email 註冊後，資料就會接上。</p>
        <p><button class="linkbtn" id="tpl">下載範本</button></p><input type="file" accept=".csv,text/csv" class="input">`,
      foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>上傳</button>',
    });
    $('#tpl', box).onclick = () => { const blob = new Blob(['﻿姓名,Email,手機,生日,顧客群組,購物金\r\n王小明,ming@example.com,0912345678,1990-05-01,,100\r\n'], { type: 'text/csv' }); Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: '顧客範本.csv' }).click(); };
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => {
      const f = $('input[type=file]', box).files[0];
      if (!f) return toast('請選擇檔案', true);
      const r = await busy(e.currentTarget, async () => api.post('customersImport', { text: await f.text() }));
      close();
      toast(`匯入 ${r.added} 位，略過 ${r.skipped} 位`);
      load();
    };
  };
  await load();
}

function givePoints(ids, done) {
  const { box, close } = modal({
    title: '贈送購物金', body: `<p class="muted" style="margin-top:0">對 ${ids.length} 位顧客${ids.length > 1 ? '各' : ''}贈送（輸入負數是扣除）</p><div class="row"><label class="field"><span>點數</span><input class="input" type="number" name="pts"></label><label class="field"><span>說明（顧客看得到）</span><input class="input" name="note" placeholder="例如：週年慶回饋"></label></div>`,
    foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>送出</button>',
  });
  $('[data-no]', box).onclick = close;
  $('[data-ok]', box).onclick = async (e) => {
    const pts = +$('[name=pts]', box).value;
    if (!pts) return toast('請輸入點數', true);
    if (ids.length === 1) await busy(e.currentTarget, () => api.post('customerSave', { id: ids[0], points: pts, pointsNote: $('[name=note]', box).value }));
    else await busy(e.currentTarget, () => api.post('customersBulk', { ids, op: 'points', points: pts, note: $('[name=note]', box).value }));
    close();
    toast('已更新購物金');
    done();
  };
}

/* ---------- 顧客詳情 ---------- */
export async function detail(el, id) {
  const [{ customer: c, orders }, { groups }] = await Promise.all([api.get('customer', { id }), api.get('groups')]);
  const s = c.stats || {};
  el.innerHTML = `
    <a class="back" href="/admin/customers">‹ 回顧客名單</a>
    <div class="page-head"><h1>${esc(c.name)}</h1>${c.blacklisted ? pill('黑名單', 'bad') : ''}${c.pending ? pill('匯入未註冊') : ''}</div>
    <div class="split">
      <div>
        <div class="grid3"><div class="card"><small class="muted">累計消費</small><div style="font-size:1.5rem;font-weight:700">${money(s.spent || 0)}</div></div><div class="card"><small class="muted">訂單數</small><div style="font-size:1.5rem;font-weight:700">${s.orders || 0}</div></div><div class="card"><small class="muted">購物金</small><div style="font-size:1.5rem;font-weight:700">${c.points || 0} 點</div></div></div>
        <div class="card" style="margin-top:16px"><h2>訂單紀錄</h2>${orders.length ? `<div class="table-wrap"><table class="tbl"><thead><tr><th>訂單編號</th><th>時間</th><th class="num">金額</th><th>狀態</th></tr></thead><tbody>${orders.map((o) => `<tr class="click" data-no="${o.no}"><td class="strong">${o.no}</td><td>${fmt.time(o.createdAt)}</td><td class="num">${money(o.total)}</td><td>${pill({ processing: '處理中', preparing: '備貨中', shipped: '已出貨', returning: '退換貨', closed: '訂單結案', cancelled: '已取消' }[o.status])}</td></tr>`).join('')}</tbody></table></div>` : '<p class="muted">還沒有訂單</p>'}</div>
        <div class="card"><div class="card-h">購物金紀錄<div class="actions">${can('customersEdit') ? '<button class="btn sm" id="ptsBtn">調整購物金</button>' : ''}</div></div>${(c.pointsLog || []).length ? `<table class="tbl">${c.pointsLog.map((l) => `<tr><td class="nowrap">${fmt.time(l.at)}</td><td>${esc(l.note)}</td><td class="num ${l.change > 0 ? '' : 'err'}">${l.change > 0 ? '+' : ''}${l.change}</td></tr>`).join('')}</table>` : '<p class="muted">沒有紀錄</p>'}</div>
      </div>
      <div>
        <div class="card"><h2>基本資料</h2><dl class="dl"><dt>Email</dt><dd>${esc(c.email)}</dd><dt>手機</dt><dd>${esc(c.phone || '-')}</dd><dt>生日</dt><dd>${esc(c.birthday || '-')}</dd><dt>性別</dt><dd>${esc(c.gender || '-')}</dd><dt>註冊</dt><dd>${fmt.time(c.createdAt)}</dd>${c.source ? `<dt>來源</dt><dd>${esc(c.source)}</dd>` : ''}<dt>最近消費</dt><dd>${fmt.date(s.lastOrderAt)}</dd>${c.address?.address ? `<dt>常用地址</dt><dd>${esc(c.address.zip || '')} ${esc(c.address.address)}</dd>` : ''}</dl></div>
        <form class="card" id="cf" ${can('customersEdit') ? '' : 'hidden'}><h2>管理</h2>
          <label class="field"><span>顧客群組</span><select class="input" name="groupId"><option value="">一般會員</option>${groups.map((g) => `<option value="${g.id}"${c.groupId === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select><span class="help">手動指定後，不會再被自動升降級</span></label>
          <label class="field"><span>群組使用期限（空白＝永久）</span><input class="input" type="date" name="groupUntil" value="${c.groupUntil ? fmt.ymd(c.groupUntil) : ''}"></label>
          <div class="switch-row"><div class="sr-body"><b>黑名單</b><small>黑名單的顧客不能下單</small></div>${sw('blacklisted', c.blacklisted)}</div>
          <label class="field"><span>備註（顧客看不到）</span><textarea class="input" name="note">${esc(c.note || '')}</textarea></label>
          <button class="btn primary block">儲存</button></form>
      </div>
    </div>`;
  $$('tr[data-no]', el).forEach((tr) => (tr.onclick = () => go('/admin/orders/' + tr.dataset.no)));
  $('#ptsBtn', el)?.addEventListener('click', () => givePoints([id], () => detail(el, id)));
  $('#cf', el).onsubmit = async (e) => {
    e.preventDefault();
    const d = new FormData(e.target);
    const body = { id, note: d.get('note'), blacklisted: !!d.get('blacklisted') };
    if (d.get('groupId') !== (c.groupId || '') || d.get('groupUntil') !== (c.groupUntil ? fmt.ymd(c.groupUntil) : '')) { body.groupId = d.get('groupId'); body.groupUntil = d.get('groupUntil'); }
    await busy(e.submitter, () => api.post('customerSave', body));
    toast('已儲存');
    detail(el, id);
  };
}

/* ---------- 顧客群組 ---------- */
const condRow = (r, kind) => `<div class="cond" data-kind="${kind}">在 <input class="input" type="number" min="1" max="60" data-f="months" value="${r.months || 12}" style="width:70px"> 個月內
  <select class="input" data-f="type"><option value="single"${r.type === 'single' ? ' selected' : ''}>單次購物</option><option value="total"${r.type === 'total' ? ' selected' : ''}>累計購物</option></select>
  滿 <input class="input" type="number" min="0" data-f="amount" value="${r.amount || ''}"> 元 <button type="button" class="btn sm ghost" data-rmc aria-label="移除條件">${icon('x')}</button></div>`;

export async function groups(el) {
  const { groups: list, base } = await api.get('groups');
  el.innerHTML = `<div class="page-head"><h1>顧客群組</h1><div class="actions"><button class="btn primary" id="addG">${icon('plus')}新增群組</button></div>
    <div class="sub">設定會員等級和自動升級條件。顧客付款完成後系統會檢查，符合就升級；期限到了沒有達到續會條件就回到一般會員。數字越大等級越高。</div></div>
    <div class="card" style="margin-bottom:16px"><div class="inline"><span class="rank">0</span><b>一般會員</b><span class="muted">所有註冊會員的預設群組・${base} 人</span></div></div>
    <div id="gl">${list.length ? '' : emptyBox('還沒有其他群組')}</div>`;
  const box = $('#gl', el);
  const card = (g) => {
    const div = document.createElement('form');
    div.className = 'card group-card' + (g.on === false ? ' off' : '');
    div.innerHTML = `<div class="head"><span class="rank" title="等級">${g.order || 1}</span>${sw('on', g.on !== false)}<input class="input" name="name" placeholder="群組名稱" value="${esc(g.name || '')}" required style="width:180px">
      <span class="muted">等級</span><input class="input" type="number" name="order" min="1" max="99" value="${g.order || 1}" style="width:70px">
      <span class="muted">使用期限</span><select class="input" name="months">${[[0, '永久'], [3, '3 個月'], [6, '6 個月'], [12, '1 年'], [24, '2 年']].map(([v, n]) => `<option value="${v}"${(g.months || 0) === v ? ' selected' : ''}>${n}</option>`).join('')}</select>
      ${g.id ? `<span class="pill">${g.count} 人</span>` : ''}<span style="margin-left:auto"></span>${g.id ? `<button type="button" class="btn sm danger" data-del>${icon('trash')}</button>` : ''}</div>
      <div style="margin-top:14px"><b>升級資格</b> <span class="muted small">（符合任一條件就升級）</span><div data-up>${(g.upgrade || []).map((r) => condRow(r, 'up')).join('')}</div><button type="button" class="btn sm" data-addc="up">${icon('plus')}新增條件</button></div>
      <div style="margin-top:14px"><b>續會資格</b> <span class="muted small">（期限到時符合任一條件就延長）</span><div data-renew>${(g.renew || []).map((r) => condRow(r, 'renew')).join('')}</div><button type="button" class="btn sm" data-addc="renew">${icon('plus')}新增條件</button></div>
      <div class="form-actions" style="position:static;padding-bottom:0"><button class="btn primary">儲存</button></div>`;
    $$('[data-addc]', div).forEach((b) => (b.onclick = () => { $(`[data-${b.dataset.addc}]`, div).insertAdjacentHTML('beforeend', condRow({}, b.dataset.addc)); }));
    div.addEventListener('click', (e) => { if (e.target.closest('[data-rmc]')) e.target.closest('.cond').remove(); });
    const conds = (kind) => $$(`.cond[data-kind=${kind}]`, div).map((c) => ({ months: +$('[data-f=months]', c).value, type: $('[data-f=type]', c).value, amount: +$('[data-f=amount]', c).value }));
    div.onsubmit = async (e) => {
      e.preventDefault();
      const d = new FormData(div);
      await busy(e.submitter, () => api.post('groupSave', { id: g.id, name: d.get('name'), on: !!d.get('on'), order: +d.get('order'), months: +d.get('months'), upgrade: conds('up'), renew: conds('renew') }));
      toast('已儲存');
      groups(el);
    };
    $('[data-del]', div)?.addEventListener('click', async () => {
      if (!(await confirmBox(`刪除「${g.name}」？`, { danger: true, ok: '刪除' }))) return;
      try { await api.post('groupDelete', { id: g.id }); toast('已刪除'); groups(el); } catch (err) { toast(err.message, true); }
    });
    return div;
  };
  list.forEach((g) => box.append(card(g)));
  $('#addG', el).onclick = () => { if (!list.length) box.innerHTML = ''; const c = card({ order: (list.at(-1)?.order || 0) + 1, upgrade: [{ months: 12, type: 'total', amount: 10000 }], renew: [] }); box.prepend(c); $('[name=name]', c).focus(); };
}

/* ---------- 特約代碼 ---------- */
export async function codes(el) {
  const { codes: list, groups: gs } = await api.get('codes');
  el.innerHTML = `<div class="page-head"><h1>特約代碼</h1><div class="actions"><button class="btn primary" id="addC">${icon('plus')}新增</button></div>
    <div class="sub">顧客註冊時填的代碼（或 Email）符合條件，就直接加入指定的群組。例如：合作企業員工用公司信箱註冊就是 VIP。</div></div>
    <div class="card">${gs.length ? '' : '<p class="err">請先到「顧客群組」建立群組</p>'}<div class="table-wrap"><table class="tbl"><thead><tr><th>比對</th><th>條件</th><th>代碼</th><th>指派群組</th><th>建立時間</th><th></th></tr></thead><tbody id="cb"></tbody></table></div></div>`;
  const row = (c) => `<tr data-id="${c.id || ''}"><td><select class="input" data-f="field"><option value="code"${c.field !== 'email' ? ' selected' : ''}>註冊代碼</option><option value="email"${c.field === 'email' ? ' selected' : ''}>Email</option></select></td>
    <td><select class="input" data-f="op"><option value="eq"${c.op !== 'endsWith' ? ' selected' : ''}>等於</option><option value="endsWith"${c.op === 'endsWith' ? ' selected' : ''}>結尾是</option></select></td>
    <td><input class="input" data-f="value" value="${esc(c.value || '')}" placeholder="例如 ganbaru 或 @company.com"></td>
    <td><select class="input" data-f="groupId"><option value="">請選擇</option>${gs.map((g) => `<option value="${g.id}"${c.groupId === g.id ? ' selected' : ''}>${esc(g.name)}</option>`).join('')}</select></td>
    <td class="nowrap">${c.createdAt ? fmt.time(c.createdAt) : '新增中'}</td><td class="nowrap"><button class="btn sm primary" data-save>儲存</button> ${c.id ? `<button class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button>` : ''}</td></tr>`;
  const tb = $('#cb', el);
  tb.innerHTML = list.map(row).join('') || `<tr><td colspan="6">${emptyBox('還沒有特約代碼')}</td></tr>`;
  tb.addEventListener('click', async (e) => {
    const tr = e.target.closest('tr');
    if (e.target.closest('[data-save]')) {
      const body = { id: tr.dataset.id || undefined };
      $$('[data-f]', tr).forEach((i) => (body[i.dataset.f] = i.value));
      await busy(e.target.closest('button'), () => api.post('codeSave', body));
      toast('已儲存');
      codes(el);
    }
    if (e.target.closest('[data-del]') && (await confirmBox('刪除這個代碼？', { danger: true, ok: '刪除' }))) { await api.post('codeDelete', { id: tr.dataset.id }); codes(el); }
  });
  $('#addC', el).onclick = () => { if (!list.length) tb.innerHTML = ''; tb.insertAdjacentHTML('afterbegin', row({})); $('[data-f=value]', tb).focus(); };
}

/* ---------- 顧客分眾 ---------- */
export async function segments(el) {
  const { segments: segs } = await api.get('segments');
  const rfm = segs.filter((s) => ['core', 'growth', 'lost'].includes(s.key));
  const beh = segs.filter((s) => !['core', 'growth', 'lost'].includes(s.key));
  const table = (title, list, help) => `<div class="card"><h2>${title}</h2>${help ? `<p class="muted small" style="margin-top:-8px">${help}</p>` : ''}<div class="table-wrap"><table class="tbl"><thead><tr><th>分眾</th><th>條件</th><th class="num">人數</th><th></th></tr></thead><tbody>
    ${list.map((s) => `<tr><td class="strong">${esc(s.name)}</td><td class="muted">${esc(s.desc)}</td><td class="num">${s.count}</td><td class="right"><button class="btn sm" data-seg="${s.key}" ${s.count ? '' : 'disabled'} aria-label="下載名單">${icon('download')}下載</button></td></tr>`).join('')}</tbody></table></div></div>`;
  el.innerHTML = `<div class="page-head"><h1>顧客分眾</h1><div class="sub">依消費紀錄自動分群，可以下載名單做簡訊、Email 或廣告再行銷。</div></div>
    ${table('RFM 分眾', rfm, 'R 最近一次消費、F 消費頻率、M 消費金額')}${table('消費行為分眾', beh)}`;
  $$('[data-seg]', el).forEach((b) => (b.onclick = () => busy(b, () => api.download('exportCustomers', { seg: b.dataset.seg }))));
}
