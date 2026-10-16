// 訂單：列表（分頁籤、搜尋、篩選、批次處理、匯出、上傳物流編號）與訂單詳情
import { api, $, $$, esc, money, icon, toast, modal, busy, fmt, pill, pager, checkable, emptyBox, confirmBox, promptBox, go } from './app.js';

const STATUS = { processing: '處理中', preparing: '備貨中', shipped: '已出貨', returning: '退換貨', closed: '訂單結案', cancelled: '已取消' };
const PAY = { unpaid: '等待付款', paid: '對帳完成', failed: '付款失敗', refunded: '已退款' };
const SHIP = { unshipped: '未出貨', shipped: '已出貨', arrived: '已到貨', returned: '已退貨' };
const TABS = [['all', '全部'], ['processing', '處理中'], ['preparing', '備貨中'], ['shipped', '已出貨'], ['returning', '退換貨'], ['done', '結案或取消']];
const cls = { paid: 'ok', unpaid: 'warn', failed: 'bad', refunded: '', unshipped: 'warn', shipped: 'info', arrived: 'ok', returned: 'bad', processing: 'warn', preparing: 'info', closed: 'ok', cancelled: '', returning: 'bad' };

export async function list(el) {
  const q = new URLSearchParams(location.search);
  const state = { tab: q.get('tab') || 'all', q: q.get('q') || '', tag: q.get('tag') || '', from: q.get('from') || '', to: q.get('to') || '', pay: q.get('pay') || '', ship: q.get('ship') || '', payId: q.get('payId') || '', shipId: q.get('shipId') || '', page: +q.get('page') || 1, size: +q.get('size') || 20 };
  let selected = [];

  el.innerHTML = `
    <div class="page-head"><h1>訂單</h1><div class="actions">
      <button class="btn" id="trkBtn">${icon('upload')}上傳物流編號</button>
      <button class="btn" id="expBtn">${icon('download')}匯出</button>
    </div></div>
    <div class="card">
      <div class="tabs" id="tabs"></div>
      <div class="filters">
        <form class="search-in" id="sf"><input class="input" name="q" placeholder="訂單編號、姓名、電話、商品" value="${esc(state.q)}"><button aria-label="搜尋">${icon('search')}</button></form>
        <select class="input" id="tagF" style="max-width:180px"><option value="">所有標籤</option></select>
        <span class="range"><input class="input" type="date" id="fromF" value="${esc(state.from)}" aria-label="開始日期"> → <input class="input" type="date" id="toF" value="${esc(state.to)}" aria-label="結束日期"></span>
        <button class="btn" id="moreF">${icon('filter')}篩選${state.pay || state.ship ? '（已套用）' : ''}</button>
      </div>
      <div id="bulk"></div>
      <div id="tbl"><div class="loading">載入中…</div></div>
    </div>`;

  const sync = () => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(state)) if (v && !(k === 'tab' && v === 'all') && !(k === 'page' && v === 1) && !(k === 'size' && v === 20)) p.set(k, v);
    history.replaceState(null, '', '/admin/orders' + (p.toString() ? '?' + p : ''));
  };

  const load = async () => {
    sync();
    selected = [];
    drawBulk();
    const r = await api.get('orders', { tab: state.tab, q: state.q, tag: state.tag, from: state.from, to: state.to, pay: state.pay, ship: state.ship, payId: state.payId, shipId: state.shipId, page: state.page, size: state.size });
    $('#tabs', el).innerHTML = TABS.map(([k, n]) => `<button class="${state.tab === k ? 'on' : ''}" data-t="${k}">${n}<span class="ct">${r.counts[k]}</span></button>`).join('');
    $$('#tabs button', el).forEach((b) => (b.onclick = () => { state.tab = b.dataset.t; state.page = 1; load(); }));
    const tagSel = $('#tagF', el);
    tagSel.innerHTML = '<option value="">所有標籤</option>' + r.tags.map((t) => `<option${t === state.tag ? ' selected' : ''}>${esc(t)}</option>`).join('');
    const box = $('#tbl', el);
    if (!r.rows.length) { box.innerHTML = emptyBox('沒有符合的訂單'); return; }
    box.innerHTML = `<div class="table-wrap"><table class="tbl"><thead><tr><th class="chk"><input type="checkbox" aria-label="全選"></th><th>訂單編號</th><th>下單時間</th><th>訂購人</th><th class="num">金額</th><th>帳款狀態</th><th>運送狀態</th><th>訂單狀態</th><th>付款方式</th><th>運送方式</th><th>物流編號</th></tr></thead><tbody>
      ${r.rows.map((o) => `<tr class="click" data-no="${o.no}"><td class="chk"><input type="checkbox" value="${o.no}" aria-label="選取 ${o.no}"></td>
        <td class="strong nowrap">${o.no} ${o.unread ? '<span class="dot" title="有新訊息"></span>' : ''}${o.returnReq ? ' ' + pill('退換申請', 'bad') : ''}${o.tags.map((t) => ' ' + pill(t, 'accent')).join('')}</td>
        <td class="nowrap">${fmt.time(o.createdAt)}</td><td>${esc(o.buyer)}</td><td class="num">${money(o.total)}</td>
        <td>${pill(PAY[o.payStatus], cls[o.payStatus])}</td><td>${pill(SHIP[o.shipStatus], cls[o.shipStatus])}</td><td>${pill(STATUS[o.status], cls[o.status])}</td>
        <td class="nowrap">${esc(o.payName)}</td><td class="ellipsis" style="max-width:180px">${esc(o.shipName)}</td><td>${esc(o.trackingNo || '')}</td></tr>`).join('')}
      </tbody></table></div>`;
    box.append(pager(r.total, r.page, r.size, (p, s) => { state.page = p; state.size = s; load(); }));
    $$('tbody tr', box).forEach((tr) => (tr.onclick = () => go('/admin/orders/' + tr.dataset.no)));
    checkable($('table', box), (ids) => { selected = ids; drawBulk(); });
  };

  const drawBulk = () => {
    const b = $('#bulk', el);
    if (!selected.length) { b.innerHTML = ''; return; }
    b.innerHTML = `<div class="bulk">已選 ${selected.length} 筆
      <select class="input" id="bk" style="width:auto"><option value="">批次操作…</option>
        <optgroup label="訂單狀態">${Object.entries(STATUS).map(([k, v]) => `<option value="status:${k}">改為「${v}」</option>`).join('')}</optgroup>
        <optgroup label="帳款狀態">${Object.entries(PAY).map(([k, v]) => `<option value="payStatus:${k}">帳款改為「${v}」</option>`).join('')}</optgroup>
        <optgroup label="運送狀態">${Object.entries(SHIP).map(([k, v]) => `<option value="shipStatus:${k}">運送改為「${v}」</option>`).join('')}</optgroup>
        <option value="tag">加上標籤…</option>
      </select><button class="btn sm primary" id="bkGo">套用</button><button class="btn sm" id="bkExp">${icon('download')}匯出選取</button></div>`;
    $('#bkExp', b).onclick = () => api.download('exportOrders', { nos: selected.join(',') });
    $('#bkGo', b).onclick = async (e) => {
      const v = $('#bk', b).value;
      if (!v) return;
      const body = { nos: selected };
      if (v === 'tag') { const t = await promptBox('加上標籤', { label: '標籤名稱' }); if (!t) return; body.addTag = t; }
      else { const [k, val] = v.split(':'); body[k] = val; if (val === 'cancelled' && !(await confirmBox(`確定取消這 ${selected.length} 筆訂單？會加回庫存、退回購物金。`, { danger: true, ok: '取消訂單' }))) return; }
      const r = await busy(e.currentTarget, () => api.post('ordersBulk', body));
      toast(`已更新 ${r.ok} 筆` + (r.errors.length ? `，${r.errors.length} 筆失敗` : ''), !!r.errors.length);
      if (r.errors.length) console.warn(r.errors);
      load();
    };
  };

  $('#sf', el).onsubmit = (e) => { e.preventDefault(); state.q = new FormData(e.target).get('q').trim(); state.page = 1; load(); };
  $('#tagF', el).onchange = (e) => { state.tag = e.target.value; state.page = 1; load(); };
  $('#fromF', el).onchange = (e) => { state.from = e.target.value; state.page = 1; load(); };
  $('#toF', el).onchange = (e) => { state.to = e.target.value; state.page = 1; load(); };
  $('#moreF', el).onclick = () => {
    const { box, close } = modal({
      title: '篩選訂單',
      body: `<div class="row"><label class="field"><span>帳款狀態</span><select class="input" name="pay"><option value="">全部</option>${Object.entries(PAY).map(([k, v]) => `<option value="${k}"${state.pay === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label>
        <label class="field"><span>運送狀態</span><select class="input" name="ship"><option value="">全部</option>${Object.entries(SHIP).map(([k, v]) => `<option value="${k}"${state.ship === k ? ' selected' : ''}>${v}</option>`).join('')}</select></label></div>`,
      foot: '<button class="btn" data-clear>清除</button><button class="btn primary" data-ok>套用</button>',
    });
    $('[data-clear]', box).onclick = () => { state.pay = state.ship = state.payId = state.shipId = ''; close(); list(el); };
    $('[data-ok]', box).onclick = () => { state.pay = $('[name=pay]', box).value; state.ship = $('[name=ship]', box).value; state.page = 1; close(); sync(); list(el); };
  };
  $('#expBtn', el).onclick = (e) => busy(e.currentTarget, () => api.download('exportOrders', { tab: state.tab, q: state.q, tag: state.tag, from: state.from, to: state.to, pay: state.pay, ship: state.ship }));
  $('#trkBtn', el).onclick = () => {
    const { box, close } = modal({
      title: '上傳物流編號',
      body: `<p class="muted" style="margin-top:0">每一行一筆：<b>訂單編號,物流編號</b>。可以直接從 Excel 複製兩欄貼上，或選 CSV 檔。運送狀態會改成「已出貨」。</p>
        <label class="field"><textarea class="input" rows="8" placeholder="W7WN5AKYR,123456789012&#10;WW9Z97WYX,987654321098"></textarea></label>
        <label class="check"><input type="checkbox" checked name="mk"> 訂單狀態也一起改成「已出貨」</label>
        <p><label class="linkbtn">選擇 CSV 檔<input type="file" accept=".csv,text/csv" hidden></label></p>`,
      foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>上傳</button>',
    });
    $('input[type=file]', box).onchange = async (e) => { $('textarea', box).value = await e.target.files[0].text(); };
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => {
      const text = $('textarea', box).value.replace(/\t/g, ',');
      const r = await busy(e.currentTarget, () => api.post('tracking', { text, markShipped: $('[name=mk]', box).checked }));
      close();
      toast(`已更新 ${r.ok} 筆` + (r.errors.length ? `，${r.errors.length} 筆失敗：${r.errors[0]}` : ''), !!r.errors.length);
      load();
    };
  };
  await load();
}

export async function detail(el, no) {
  const r = await api.get('order', { no });
  const o = r.order;
  const c = r.customer;
  const recv = o.receiver;
  const lines = [...o.items, ...(o.addonItems || []).map((l) => ({ ...l, addon: true }))];
  const sel = (name, map, cur) => `<select class="input" name="${name}">${Object.entries(map).map(([k, v]) => `<option value="${k}"${k === cur ? ' selected' : ''}>${v}</option>`).join('')}</select>`;
  el.innerHTML = `
    <a class="back" href="/admin/orders">‹ 回訂單列表</a>
    <div class="page-head"><h1>訂單 ${esc(o.no)}</h1>
      <span>${pill(STATUS[o.status], cls[o.status])} ${pill(PAY[o.payment.status], cls[o.payment.status])} ${pill(SHIP[o.shipStatus], cls[o.shipStatus])}</span>
      <div class="actions"><button class="btn" id="printBtn">列印出貨單</button>${o.status !== 'cancelled' ? '<button class="btn danger" id="cancelBtn">取消訂單</button>' : ''}</div>
      <div class="sub">下單時間 ${fmt.time(o.createdAt)}</div></div>
    ${o.returnReq ? `<div class="card" style="border-color:var(--bad);margin-bottom:16px"><h2>${icon('bell')}顧客申請${o.returnReq.type === 'return' ? '退貨' : '換貨'} ${pill(o.returnReq.status === 'pending' ? '待處理' : '已受理', o.returnReq.status === 'pending' ? 'bad' : 'ok')}</h2><p style="margin:0;white-space:pre-wrap">${esc(o.returnReq.reason)}</p><p class="muted small">${fmt.time(o.returnReq.at)}</p>${o.returnReq.status === 'pending' ? '<button class="btn primary" id="acceptRet">受理（訂單改為退換貨）</button>' : ''}</div>` : ''}
    <div class="split">
      <div>
        <div class="card"><h2>商品明細</h2>
          <div class="od-lines">${lines.map((l) => `<div class="ln">${l.img ? `<img src="${esc(l.img)}" alt="">` : '<span class="ph"></span>'}<div>${l.addon ? pill('加購', 'accent') + ' ' : ''}<a href="/admin/products/${esc(l.pid)}">${esc(l.name)}</a>${l.spec ? `<div class="muted small">${esc(l.spec)}</div>` : ''}${l.sku ? `<div class="muted small">編號 ${esc(l.sku)}</div>` : ''}${l.notes?.length ? `<div class="muted small">${esc(l.notes.join('、'))}</div>` : ''}</div><span class="muted nowrap">${money(l.price)} × ${l.qty}</span><b class="nowrap">${money(l.amount)}</b></div>`).join('')}</div>
          <div class="sum"><div><span>商品小計</span><span>${money(o.subtotal)}</span></div>
            ${o.discounts.map((d) => `<div><span>${esc(d.name)}</span><span class="err">−${money(d.amount)}</span></div>`).join('')}
            ${o.pointsUsed ? `<div><span>購物金折抵（${o.pointsUsed} 點）</span><span class="err">−${money(o.pointsValue)}</span></div>` : ''}
            <div><span>運費（${esc(o.shipping.name)}）</span><span>${money(o.shipping.fee)}</span></div>
            <div class="total"><span>訂單金額</span><span>${money(o.total)}</span></div>
            <div class="muted small"><span>商品成本 ${money(o.cost)}・估計毛利 ${money(o.total - o.cost - o.shipping.fee)}</span>${o.earn ? `<span>結案後回饋購物金 ${o.earn} 點${o.earned ? '（已發放）' : ''}</span>` : ''}</div>
          </div>
        </div>
        <div class="card"><h2>訂單問答</h2>
          <div class="chat" id="chat">${o.msgs.length ? o.msgs.map((m) => `<div class="m ${m.from}"><small>${m.from === 'admin' ? esc(m.name || '客服') : esc(m.name)}・${fmt.time(m.at)}</small>${esc(m.text)}</div>`).join('') : '<p class="muted">還沒有訊息</p>'}</div>
          <form class="reply" id="msgF"><textarea class="input" name="text" placeholder="回覆顧客（顧客會在訂單頁看到）" required></textarea><button class="btn primary">送出</button></form>
        </div>
        <div class="card"><h2>處理紀錄</h2><ul class="timeline">${(o.log || []).map((l) => `<li>${esc(l.text)}<small>${fmt.time(l.at)}・${esc(l.by)}</small></li>`).join('')}</ul></div>
      </div>
      <div>
        <form class="card" id="stF"><h2>狀態</h2>
          <label class="field"><span>訂單狀態</span>${o.status === 'cancelled' ? '<input class="input" value="已取消" disabled>' : sel('status', Object.fromEntries(Object.entries(STATUS).filter(([k]) => k !== 'cancelled')), o.status)}</label>
          <label class="field"><span>帳款狀態</span>${sel('payStatus', PAY, o.payment.status)}</label>
          <label class="field"><span>運送狀態</span>${sel('shipStatus', SHIP, o.shipStatus)}</label>
          <label class="field"><span>物流編號</span><input class="input" name="trackingNo" value="${esc(o.trackingNo)}"></label>
          <label class="field"><span>標籤（用逗號分開）</span><input class="input" name="tags" value="${esc((o.tags || []).join(', '))}"></label>
          <label class="field"><span>後台備註（顧客看不到）</span><textarea class="input" name="adminNote">${esc(o.adminNote)}</textarea></label>
          <button class="btn primary block">儲存</button>
        </form>
        <div class="card"><h2>訂購人</h2><dl class="dl">
          <dt>姓名</dt><dd>${c ? `<a href="/admin/customers/${esc(c.uid)}">${esc(o.buyer.name)}</a>` : esc(o.buyer.name) + ' <span class="pill">訪客</span>'}</dd>
          <dt>Email</dt><dd>${esc(o.buyer.email)}</dd><dt>手機</dt><dd>${esc(o.buyer.phone || '-')}</dd>
          ${c ? `<dt>累計</dt><dd>${c.orders} 筆・${money(c.spent)}</dd><dt>購物金</dt><dd>${c.points} 點</dd>${c.blacklisted ? '<dt></dt><dd>' + pill('黑名單', 'bad') + '</dd>' : ''}` : ''}
          ${o.note ? `<dt>顧客留言</dt><dd style="white-space:pre-wrap">${esc(o.note)}</dd>` : ''}</dl></div>
        <div class="card"><h2>付款與運送</h2><dl class="dl">
          <dt>付款方式</dt><dd>${esc(o.payment.name)}${o.payment.paidAt ? `<div class="muted small">付款時間 ${fmt.time(o.payment.paidAt)}</div>` : ''}</dd>
          ${o.payment.transfer ? `<dt>匯款通知</dt><dd style="white-space:pre-wrap">${esc(o.payment.transfer)}</dd>` : ''}
          <dt>運送方式</dt><dd>${esc(o.shipping.name)}</dd>
          <dt>收件人</dt><dd>${esc(recv.name)}　${esc(recv.phone)}</dd>
          ${recv.store ? `<dt>取貨門市</dt><dd>${esc(recv.store)}</dd>` : ''}${recv.address ? `<dt>地址</dt><dd>${esc(recv.zip || '')} ${esc(recv.address)}</dd>` : ''}
        </dl></div>
      </div>
    </div>`;

  const reload = () => detail(el, no);
  $('#chat', el).scrollTop = 1e6;
  $('#stF', el).onsubmit = async (e) => {
    e.preventDefault();
    const d = Object.fromEntries(new FormData(e.target));
    d.tags = d.tags.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    await busy(e.submitter, () => api.post('orderUpdate', { no, ...d }));
    toast('已儲存');
    reload();
  };
  $('#msgF', el).onsubmit = async (e) => {
    e.preventDefault();
    await busy(e.submitter, () => api.post('orderMsg', { no, text: new FormData(e.target).get('text') }));
    reload();
  };
  $('#acceptRet', el)?.addEventListener('click', async (e) => { await busy(e.currentTarget, () => api.post('orderUpdate', { no, status: 'returning' })); toast('已受理'); reload(); });
  $('#cancelBtn', el)?.addEventListener('click', async () => {
    const { box, close } = modal({ title: '取消訂單', body: `<p style="margin-top:0">取消後會${o.payment.status === 'paid' ? '把帳款改成「已退款」（實際退款請到金流後台處理）、' : ''}加回庫存、退回顧客使用的購物金。</p><label class="field"><span>取消原因</span><input class="input" name="reason"></label>`, foot: '<button class="btn" data-no>不取消</button><button class="btn danger" data-ok>確定取消</button>' });
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = async (e) => { await busy(e.currentTarget, () => api.post('orderUpdate', { no, status: 'cancelled', reason: $('[name=reason]', box).value })); close(); toast('訂單已取消'); reload(); };
  });
  $('#printBtn', el).onclick = () => {
    const w = window.open('', '_blank');
    w.document.write(`<!doctype html><meta charset="utf-8"><title>出貨單 ${o.no}</title><style>body{font-family:sans-serif;padding:24px;font-size:14px}table{width:100%;border-collapse:collapse;margin:16px 0}td,th{border:1px solid #ccc;padding:6px 8px;text-align:left}.r{text-align:right}</style>
      <h2>出貨單 ${o.no}</h2><p>下單：${fmt.time(o.createdAt)}<br>收件人：${esc(recv.name)}　${esc(recv.phone)}<br>${esc(recv.store || ((recv.zip || '') + ' ' + recv.address))}<br>運送：${esc(o.shipping.name)}　付款：${esc(o.payment.name)}（${PAY[o.payment.status]}）</p>
      <table><tr><th>商品</th><th>規格</th><th class="r">數量</th><th class="r">小計</th></tr>${lines.map((l) => `<tr><td>${l.addon ? '【加購】' : ''}${esc(l.name)}</td><td>${esc(l.spec || '')}</td><td class="r">${l.qty}</td><td class="r">${money(l.amount)}</td></tr>`).join('')}</table>
      <p class="r">訂單金額：<b>${money(o.total)}</b></p>${o.note ? `<p>顧客留言：${esc(o.note)}</p>` : ''}<script>print()<\/script>`);
    w.document.close();
  };
}
