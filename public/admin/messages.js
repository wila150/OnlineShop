// 訊息中心：左邊選類型（訂單問答／商品問答），中間列表，右邊對話
import { api, $, $$, esc, money, icon, toast, busy, fmt, emptyBox, refreshBadges } from './app.js';

export async function render(el) {
  const q = new URLSearchParams(location.search);
  const st = { type: q.get('type') === 'product' ? 'product' : 'order', filter: 'all', kw: '', cur: null };
  let rows = [];

  el.innerHTML = `<div class="page-head"><h1>訊息管理</h1></div>
    <div class="inbox">
      <div class="kinds"><button data-k="order">${icon('orders')}訂單問答</button><button data-k="product">${icon('bag')}商品問答</button></div>
      <div class="box"><div class="tabs" id="ft" style="margin:0;padding:0 8px"></div><div style="padding:8px 12px;border-bottom:1px solid var(--line)"><input class="input" id="kw" placeholder="搜尋姓名、訂單編號、內容"></div><div class="list" id="list"></div></div>
      <div class="box detail" id="detail">${emptyBox('尚未選取任何訊息')}</div>
    </div>`;

  const isUnread = (r) => (st.type === 'order' ? r.unread : !r.replied);
  const drawList = () => {
    $$('.kinds button', el).forEach((b) => b.classList.toggle('on', b.dataset.k === st.type));
    const filters = st.type === 'order' ? [['all', '全部'], ['unread', `未讀 (${rows.filter((r) => r.unread).length})`], ['flag', `標記 (${rows.filter((r) => r.flagged).length})`]] : [['all', '全部'], ['unread', `未回覆 (${rows.filter((r) => !r.replied).length})`]];
    $('#ft', el).innerHTML = filters.map(([k, n]) => `<button class="${st.filter === k ? 'on' : ''}" data-f="${k}">${n}</button>`).join('');
    $$('#ft button', el).forEach((b) => (b.onclick = () => { st.filter = b.dataset.f; drawList(); }));
    const kw = st.kw.toLowerCase();
    const list = rows.filter((r) => (st.filter === 'all' || (st.filter === 'unread' && isUnread(r)) || (st.filter === 'flag' && r.flagged))
      && (!kw || JSON.stringify(r).toLowerCase().includes(kw)));
    const box = $('#list', el);
    if (!list.length) { box.innerHTML = emptyBox('沒有訊息'); return; }
    box.innerHTML = list.map((r) => st.type === 'order'
      ? `<button class="it${r.unread ? ' unread' : ''}${st.cur === r.no ? ' on' : ''}" data-id="${r.no}"><div class="top"><span>#${esc(r.no)}${r.flagged ? ' ★' : ''}</span><span>${fmt.short(r.at)}</span></div><b>${esc(r.name)}</b><p>${esc(r.last.text)}</p></button>`
      : `<button class="it${!r.replied ? ' unread' : ''}${st.cur === r.id ? ' on' : ''}" data-id="${r.id}"><div class="top"><span>${esc(r.pname)}</span><span>${fmt.short(r.updatedAt)}</span></div><b>${esc(r.name || r.email)}</b><p>${esc(r.msgs[r.msgs.length - 1]?.text)}</p></button>`).join('');
    $$('.it', box).forEach((b) => (b.onclick = () => open(b.dataset.id)));
  };

  const chat = (msgs) => `<div class="chat">${msgs.map((m) => `<div class="m ${m.from}"><small>${m.from === 'admin' ? esc(m.name || '客服') : esc(m.name || '顧客')}・${fmt.time(m.at)}</small>${esc(m.text)}</div>`).join('')}</div>`;

  const open = async (id) => {
    st.cur = id;
    drawList();
    const d = $('#detail', el);
    if (st.type === 'order') {
      const r = rows.find((x) => x.no === id);
      d.innerHTML = `<div class="card-h"><a href="/admin/orders/${esc(r.no)}">訂單 #${esc(r.no)}</a><span class="muted small">${esc(r.name)}・${money(r.total)}・${esc(r.status)}</span><div class="actions"><button class="btn sm" id="flag">${r.flagged ? '★ 取消標記' : '☆ 標記'}</button><button class="btn sm" id="unread">標為未讀</button></div></div>${chat(r.msgs)}
        <form class="reply"><textarea class="input" name="text" placeholder="輸入回覆" required></textarea><button class="btn primary">送出</button></form>`;
      if (r.unread) { r.unread = false; api.post('orderRead', { no: id, unread: false }).then(refreshBadges); drawList(); }
      $('#flag', d).onclick = async () => { await api.post('orderUpdate', { no: id, flagged: !r.flagged }); r.flagged = !r.flagged; open(id); };
      $('#unread', d).onclick = async () => { await api.post('orderRead', { no: id, unread: true }); r.unread = true; st.cur = null; drawList(); d.innerHTML = emptyBox('尚未選取任何訊息'); refreshBadges(); };
      $('form', d).onsubmit = async (e) => {
        e.preventDefault();
        const { order } = await busy(e.submitter, () => api.post('orderMsg', { no: id, text: new FormData(e.target).get('text') }));
        r.msgs = order.msgs;
        r.last = order.msgs[order.msgs.length - 1];
        toast('已回覆');
        open(id);
      };
    } else {
      const r = rows.find((x) => x.id === id);
      d.innerHTML = `<div class="card-h">${r.img ? `<img src="${esc(r.img)}" alt="" style="width:40px;height:40px;border-radius:6px;object-fit:cover">` : ''}<a href="/admin/products/${esc(r.pid)}">${esc(r.pname)}</a><span class="muted small">${esc(r.name || '')} ${esc(r.email)}</span></div>${chat(r.msgs)}
        <form class="reply"><textarea class="input" name="text" placeholder="輸入回覆（顧客會在商品頁看到）" required></textarea><button class="btn primary">送出</button></form>`;
      $('form', d).onsubmit = async (e) => {
        e.preventDefault();
        const { question } = await busy(e.submitter, () => api.post('questionReply', { id, text: new FormData(e.target).get('text') }));
        Object.assign(r, question);
        toast('已回覆');
        refreshBadges();
        open(id);
      };
    }
    $('.chat', d).scrollTop = 1e6;
  };

  const load = async () => {
    st.cur = null;
    $('#detail', el).innerHTML = emptyBox('尚未選取任何訊息');
    $('#list', el).innerHTML = '<div class="loading">載入中…</div>';
    rows = (await api.get('messages', { type: st.type })).rows;
    drawList();
  };
  $$('.kinds button', el).forEach((b) => (b.onclick = () => { st.type = b.dataset.k; st.filter = 'all'; history.replaceState(null, '', '/admin/messages' + (st.type === 'product' ? '?type=product' : '')); load(); }));
  $('#kw', el).oninput = (e) => { st.kw = e.target.value.trim(); drawList(); };
  await load();
}
