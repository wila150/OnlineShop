// 總覽：本月營收、待辦事項、近 30 天營收圖、熱銷商品、庫存不足
import { api, ctx, esc, money, icon } from './app.js';

export async function dashboard(el) {
  const d = ctx.dash || (await api.get('dashboard'));
  const max = Math.max(1, ...d.series.map((x) => x.amount));
  const t = d.todo;
  const todo = [
    ['待處理訂單', t.pending, '/admin/orders?tab=processing'],
    ['尚未出貨', t.unshipped, '/admin/orders?ship=unshipped'],
    ['退換貨申請', t.returns, '/admin/orders?tab=returning'],
    ['訂單問答', t.orderQA, '/admin/messages'],
    ['商品問答', t.productQA, '/admin/messages?type=product'],
    ['轉帳待對帳', t.unpaidTransfer, '/admin/orders?pay=unpaid&payId=atm'],
  ];
  el.innerHTML = `
    <div class="page-head"><h1>總覽</h1><div class="actions"><a class="btn" href="/" target="_blank" rel="noopener">${icon('eye')}查看商店</a></div></div>
    <div class="dash">
      <div>
        <div class="hero">
          <small>本月營收（已付款）</small>
          <div class="big">${money(d.revenue)}</div>
          <div class="kpis"><div><small>本月訂單</small><b>${d.monthOrders}</b></div><div><small>今日訂單</small><b>${d.todayOrders}</b></div><div><small>本月毛利（估）</small><b>${money(d.profit)}</b></div></div>
          <div class="chart" role="img" aria-label="近 30 天每日營收">${d.series.map((x) => `<div class="bar" style="height:${Math.round((x.amount / max) * 100)}%" data-tip="${x.d.slice(5)}　${money(x.amount)}・${x.orders} 筆"></div>`).join('')}</div>
          <small>近 30 天每日營收</small>
        </div>
        <div class="grid2" style="margin-top:16px">
          <div class="card"><h2>本月熱銷</h2>${d.top.length ? `<ul class="mini-list">${d.top.map((p) => `<li>${p.img ? `<img src="${esc(p.img)}" alt="">` : '<span class="ph"></span>'}<span class="grow">${esc(p.name)}</span><span class="muted">${p.qty} 件</span><b>${money(p.amount)}</b></li>`).join('')}</ul>` : '<p class="muted">這個月還沒有已付款的訂單</p>'}</div>
          <div class="card"><h2>庫存不足</h2>${d.lowStock.length ? `<ul class="mini-list">${d.lowStock.map((p) => `<li>${p.img ? `<img src="${esc(p.img)}" alt="">` : '<span class="ph"></span>'}<a class="grow" href="/admin/products/${esc(p.id)}">${esc(p.name)}</a><span class="pill ${p.stock <= 0 ? 'bad' : 'warn'}">剩 ${p.stock}</span></li>`).join('')}</ul>` : '<p class="muted">庫存都還充足</p>'}</div>
        </div>
      </div>
      <div>
        <div class="card"><h2>待辦事項</h2><div class="todo">${todo.map(([n, v, h]) => `<a href="${h}" class="${v ? 'hot' : ''}"><b>${v}</b><span>${n}</span></a>`).join('')}</div></div>
        <div class="card"><h2>概覽</h2>
          <div class="kv"><span class="ic">${icon('orders')}</span><div><b>${d.monthOrders}</b><small>本月訂單數</small></div></div>
          <div class="kv"><span class="ic">${icon('users')}</span><div><b>${d.customers}</b><small>會員人數</small></div></div>
        </div>
      </div>
    </div>`;
  ctx.dash = null;
}
