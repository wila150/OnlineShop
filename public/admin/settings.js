// 設定：商店、購物、顧客功能、金流、物流、匯出、第三方、通知、後台帳號
import { api, $, $$, esc, icon, toast, busy, ctx, sw, imageField, guard, confirmBox, pill, modal } from './app.js';

const CARDS = [
  ['store', 'store', '商店設定', '商店名稱、Logo、聯絡資訊、營運狀態、網域'],
  ['shopping', 'bag', '購物設定', '條款、結帳、發票、寄件人、訂單處理、購物金'],
  ['customer', 'user', '顧客功能設定', '會員資料欄位、聯絡按鈕、貨到通知、黑名單'],
  ['payment', 'dollar', '金流管理', '付款方式、金額限制、匯款帳號'],
  ['shipping', 'truck', '物流管理', '運送方式、運費、期望到貨日、金額限制'],
  ['exports', 'download', '匯出設定', '訂單匯出 Excel 要哪些欄位'],
  ['third', 'plug', '第三方設定', 'Google Analytics、GTM、Ads、Facebook 像素、社群連結'],
  ['notify', 'bell', '通知設定', '通知 Email、通知條件、庫存不足提醒'],
  ['accounts', 'key', '後台帳號與權限', '員工帳號、角色、每個角色能用的功能'],
];

export async function index(el) {
  el.innerHTML = `<div class="page-head"><h1>設定</h1></div><div class="set-cards">${CARDS.filter(([k]) => k !== 'accounts' || ctx.me.perms.includes('accounts')).map(([k, ic, n, d]) => `<a class="set-card" href="/admin/settings/${k}"><span class="ic">${icon(ic)}</span><span><b>${n}</b><small>${d}</small></span></a>`).join('')}</div>`;
}

const get = (o, path) => path.split('.').reduce((a, k) => a?.[k], o);
const sec = (title, desc, body) => `<div class="set-sec"><div><h3>${title}</h3><p>${desc}</p></div><div class="card">${body}</div></div>`;
const tog = (k, title, desc, v) => `<div class="switch-row"><div class="sr-body"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${sw('', v, `data-k="${k}"`)}</div>`;
const inp = (k, label, v, type = 'text', help = '') => `<label class="field"><span>${label}</span><input class="input" type="${type}" data-k="${k}" value="${esc(v ?? '')}">${help ? `<span class="help">${help}</span>` : ''}</label>`;
const area = (k, label, v, help = '') => `<label class="field"><span>${label}</span><textarea class="input" data-k="${k}">${esc(v ?? '')}</textarea>${help ? `<span class="help">${help}</span>` : ''}</label>`;
const radios = (k, label, v, opts) => `<div class="field"><span>${label}</span><div class="inline">${opts.map(([val, n]) => `<label class="check"><input type="radio" name="${k}" data-k="${k}" value="${val}" ${String(v) === String(val) ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>`;
const FIELD_NAMES = [['gender', '性別'], ['birthday', '生日'], ['phone', '手機'], ['tel', '市話'], ['address', '地址']];
const WEEK = ['日', '一', '二', '三', '四', '五', '六'];
const PAY_KIND = { online: '線上付款（信用卡、LINE Pay、Apple Pay 等，目前模擬）', transfer: 'ATM／銀行轉帳', cod: '貨到付款', offline: '其他（店家手動確認收款）' };
const SHIP_TYPE = { home: '宅配（填地址）', cvs: '超商取貨（填門市）', pickup: '自取／面交' };

const FORMS = {
  store: (v) => sec('商店資訊', '商店名稱、簡介和 Logo 會顯示在前台和搜尋結果。', inp('name', '商店名稱', v.name) + area('desc', '商店敘述', v.desc, '會用在搜尋引擎的描述') + `<div class="grid3"><div class="field"><span>電腦版 Logo</span><div data-img="logo"></div></div><div class="field"><span>手機版 Logo</span><div data-img="logoMobile"></div></div><div class="field"><span>網站小圖示</span><div data-img="favicon"></div></div></div>`)
    + sec('聯絡資訊', '顯示在頁尾。', `<div class="row">${inp('phone', '電話', v.phone)}${inp('email', 'Email', v.email, 'email')}</div>${inp('address', '地址', v.address)}`)
    + sec('營運設定', '暫停營運時，顧客打開網站只會看到下面的公告，不能瀏覽和購買商品。後台照常使用。', radios('open', '商店狀態', v.open !== false, [[true, '營運中'], [false, '暫停營運']]) + area('closedMsg', '暫停營運時顯示的文字', v.closedMsg))
    + sec('網域設定', '想用自己的網址（例如 www.ganbaru29.com），要在 Firebase 設定。', inp('domain', '自訂網域（記錄用）', v.domain, 'text', '') + `<div class="muted small" style="line-height:1.8">設定方式：Firebase Console → Hosting → 新增自訂網域 → 輸入網址 → 依畫面指示到網域商（例如 GoDaddy、Gandi、PChome）新增 TXT 和 A 紀錄。通常幾小時內生效，HTTPS 憑證會自動申請。<br>目前網址：<a href="https://onlineshop-48c0d.web.app" target="_blank" rel="noopener">onlineshop-48c0d.web.app</a></div>`),

  shopping: (v) => sec('註冊與登入', '顧客註冊、登入或結帳時要同意的條款，以及登入頁上方的訊息。', tog('terms.on', '政策與條款', '結帳和註冊時顯示條款連結，顧客要勾選同意才能送出', v.terms.on) + `<div id="terms"></div>` + tog('authMsg.on', '註冊與登入頁訊息', '在登入頁上方顯示自訂文字', v.authMsg.on) + area('authMsg.text', '訊息內容', v.authMsg.text))
    + sec('購物模式', '商品頁的按鈕和誰可以結帳。', tog('buyNow', '立即購買', '商品頁顯示「直接購買」，加入購物車後直接到結帳', v.buyNow) + radios('guestCheckout', '結帳身份', v.guestCheckout, [[true, '訪客也能結帳'], [false, '要註冊會員才能結帳']]))
    + sec('結帳頁欄位', '訂單備註要不要填、提示文字。', tog('orderNote', '顯示訂單備註', '', v.orderNote) + radios('noteRequired', '填寫限制', v.noteRequired, [[false, '選填'], [true, '必填']]) + area('noteHint', '填寫提示', v.noteHint, '例如：想指定的出貨日、包裝需求'))
    + sec('發票設定', '結帳時讓顧客選發票類型並填資料（記錄在訂單上，之後可以串電子發票自動開立）。', tog('invoice.on', '結帳時填發票資料', '', v.invoice.on) + `<div class="inline">${[['personal', '個人（二聯）'], ['company', '公司（三聯、統編）'], ['carrier', '手機條碼載具'], ['donate', '捐贈']].map(([k, n]) => `<label class="check"><input type="checkbox" data-k="invoice.${k}" ${v.invoice[k] ? 'checked' : ''}> ${n}</label>`).join('')}</div>`)
    + sec('寄件人資訊', '列印出貨單時自動帶入。', `<div class="row">${inp('sender.name', '寄件人名稱', v.sender.name)}${inp('sender.phone', '寄件人電話', v.sender.phone)}</div>${inp('sender.address', '寄件人地址', v.sender.address)}`)
    + sec('運送與結帳', '寄送地址的限制。', tog('domesticOnly', '限定台灣國內寄送', '宅配地址要從台灣的縣市開始填寫', v.domesticOnly))
    + sec('訂單處理', '付款失敗、取消時系統自動做的事。', tog('autoCancelFailed', '付款失敗自動取消訂單', '適用於線上付款', v.autoCancelFailed) + tog('restockOnCancel', '取消訂單自動加回庫存', '訂單被取消時，自動補回訂單內所有商品的庫存', v.restockOnCancel)
      + `<div class="row">${inp('repayDays', '訂單重新付款期限（天）', v.repayDays, 'number')}${inp('unpaidCancelDays', '轉帳幾天沒付款自動取消（0 = 不取消）', v.unpaidCancelDays, 'number')}</div>` + area('transferTemplate', '匯款通知預設值', v.transferTemplate, '顧客選轉帳付款後，回填匯款資料的欄位範本'))
    + sec('購物金', '顧客結帳時用購物金折抵的規則。贈送規則在「行銷 → 折扣 → 購物金」。', `<div class="row">${inp('pointsRate', '1 點折抵幾元', v.pointsRate, 'number')}${inp('pointsMaxPercent', '最多折抵訂單金額的 %', v.pointsMaxPercent, 'number')}</div>`)
    + sec('頁面輔助功能', '讓顧客逛起來更順手。', tog('backToTop', '回到頁面頂端按鈕', '往下捲動時右下角出現「回到頂端」', v.backToTop)),

  customer: (v) => sec('顧客資料', '顧客註冊時要填的欄位。姓名和 Email 一定要填。', `<div class="table-wrap"><table class="tbl"><thead><tr><th>欄位</th><th class="right">必填</th><th class="right">選填</th><th class="right">隱藏</th></tr></thead><tbody>${FIELD_NAMES.map(([k, n]) => `<tr><td>${n}</td>${['required', 'optional', 'hidden'].map((x) => `<td class="right"><input type="radio" name="f_${k}" data-k="fields.${k}" value="${x}" ${v.fields[k] === x ? 'checked' : ''} aria-label="${n}${x}"></td>`).join('')}</tr>`).join('')}</tbody></table></div>` + tog('lockBirthday', '鎖定會員生日欄位', '填過之後不能自己修改，避免一直改生日領生日禮', v.lockBirthday))
    + sec('會員即時對話', '前台右下角顯示聯絡按鈕，顧客點了直接開 LINE 跟你聊。', tog('chatLine.on', 'LINE 聯絡按鈕', '', v.chatLine.on) + inp('chatLine.url', 'LINE 官方帳號連結', v.chatLine.url, 'url', '例如 https://lin.ee/xxxx 或 https://line.me/R/ti/p/@xxx'))
    + sec('會員自動通知', '寄 Email 的功能還沒串接，先在後台累積名單。', tog('restockNotify', '商品貨到通知', '缺貨的規格顯示「貨到通知我」，顧客留 Email；名單在「商品 → 貨到通知」', v.restockNotify))
    + sec('會員進階設定', '提供給會員的專屬功能。', tog('wishlist', '商品收藏', '登入會員可以收藏商品', v.wishlist) + tog('returnRequest', '退貨申請', '會員可以對「已出貨且未結案」的訂單申請退貨', v.returnRequest) + tog('exchangeRequest', '換貨申請', '會員可以對「已出貨且未結案」的訂單申請換貨', v.exchangeRequest) + tog('membersOnlyPrice', '會員可見價格', '要登入會員才看得到商品售價', v.membersOnlyPrice))
    + sec('黑名單設定', '可以到顧客詳情手動加入或移除黑名單。', tog('blacklistBlock', '黑名單禁止下單', '黑名單的顧客在結帳時無法送出訂單', v.blacklistBlock) + tog('blacklistAuto', '自動加入黑名單', '每天檢查：計算期間內退貨（運送狀態「已退貨」）次數達到門檻就加入', v.blacklistAuto) + `<div class="row">${inp('blacklistMonths', '計算期間（月）', v.blacklistMonths, 'number')}${inp('blacklistReturns', '退貨／未取件次數', v.blacklistReturns, 'number')}</div>`),

  payment: (v) => sec('付款方式', '前台結帳可以選的付款方式。可以新增多個（例如信用卡分期、LINE Pay、Apple Pay），各自設定金額限制和不能搭配的運送方式。線上付款目前是模擬，之後串綠界或藍新。', `<div id="pm"></div><button type="button" class="btn sm" id="pmAdd" style="margin-top:12px">${icon('plus')}新增付款方式</button>`)
    + sec('匯款帳號', 'ATM／銀行轉帳時顯示給顧客的帳號。', `<div class="row">${inp('bank.name', '銀行名稱', v.bank.name)}${inp('bank.code', '銀行代碼', v.bank.code)}</div><div class="row">${inp('bank.account', '帳號', v.bank.account)}${inp('bank.holder', '戶名', v.bank.holder)}</div>`)
    + sec('綠界科技 ECPay', '之後串接綠界用。先填好測試帳號，串接完成就能切換。', `${pill('尚未串接', 'warn')}<div class="row" style="margin-top:12px">${inp('ecpay.merchantId', '特店編號 MerchantID', v.ecpay.merchantId)}${inp('ecpay.hashKey', 'HashKey', v.ecpay.hashKey)}${inp('ecpay.hashIV', 'HashIV', v.ecpay.hashIV)}</div>${tog('ecpay.stage', '測試環境', '用綠界的測試站', v.ecpay.stage)}`),

  shipping: () => sec('運送方式', '前台結帳可以選的運送方式。點「編輯」設定運費、免運門檻、金額限制、期望到貨日和時段。超商取貨目前讓顧客自己填門市，串接物流後改成地圖選店。', `<div id="sm"></div><button type="button" class="btn sm" id="smAdd" style="margin-top:12px">${icon('plus')}新增運送方式</button>`),

  exports: () => sec('訂單匯出欄位', '訂單匯出 CSV（可以用 Excel 開）時要包含哪些欄位。都不勾就是全部欄位。有勾商品欄位時，每個商品一列。', `<div id="cols"><div class="loading">載入中…</div></div>`),

  third: (v) => sec('Google', '追蹤網站流量和廣告成效。', inp('gaId', 'Google Analytics 評估 ID', v.gaId, 'text', '例如 G-XXXXXXX') + inp('gtmId', 'Google Tag Manager 容器 ID', v.gtmId, 'text', '例如 GTM-XXXXXXX') + inp('adsId', 'Google Ads 轉換 ID', v.adsId, 'text', '例如 AW-XXXXXXXXX') + inp('gscVerify', 'Google 網站管理員驗證碼', v.gscVerify, 'text', 'Search Console 選「HTML 標記」驗證時，content="…" 裡面那串'))
    + sec('Facebook', '廣告成效追蹤。', inp('fbPixel', 'Facebook 像素編號', v.fbPixel))
    + sec('社群連結', '顯示在頁尾。', inp('lineUrl', 'LINE 官方帳號網址', v.lineUrl) + inp('fbUrl', 'Facebook 粉絲專頁', v.fbUrl) + inp('igUrl', 'Instagram', v.igUrl)),

  notify: (v) => sec('收件 Email', '有通知時寄到這個信箱（寄信功能之後串接，目前先在後台總覽顯示數字）。', inp('email', '收件 Email', v.email, 'email'))
    + sec('通知條件', '哪些事情要通知你。', tog('newOrder', '訂單成立', '', v.newOrder) + tog('newMessage', '訂單問答', '顧客在訂單裡留言', v.newMessage) + tog('returnReq', '訂單退換貨申請', '', v.returnReq) + tog('transfer', '訂單匯款通知', '顧客回填匯款資料', v.transfer) + tog('productQA', '商品問答', '', v.productQA) + inp('lowStock', '庫存低於幾件時提醒', v.lowStock, 'number')),
};

// 付款方式、運送方式：列表＋編輯彈窗
function methodList(box, list, { kind, draw, onChange, shipping }) {
  const render = () => {
    box.innerHTML = list.length ? list.map((m, i) => `<div class="disc" data-i="${i}">${sw('', m.on, 'data-on')}<div class="grow"><b>${esc(m.name)}</b><small>${esc(draw(m))}</small></div>
      <button type="button" class="btn sm ghost" data-mv="-1" aria-label="上移">↑</button><button type="button" class="btn sm ghost" data-mv="1" aria-label="下移">↓</button>
      <button type="button" class="btn sm" data-edit>編輯</button>${['card', 'atm', 'cod', 'home', 'seven', 'family'].includes(m.id) ? '' : `<button type="button" class="btn sm danger" data-del aria-label="刪除">${icon('trash')}</button>`}</div>`).join('') : '<p class="muted">還沒有設定</p>';
  };
  box.addEventListener('change', (e) => { if (e.target.matches('[data-on]')) { list[+e.target.closest('[data-i]').dataset.i].on = e.target.checked; onChange(); } });
  box.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-i]');
    if (!row) return;
    const i = +row.dataset.i;
    const mv = e.target.closest('[data-mv]');
    if (mv) { const j = i + +mv.dataset.mv; if (j >= 0 && j < list.length) { [list[i], list[j]] = [list[j], list[i]]; onChange(); render(); } }
    if (e.target.closest('[data-del]') && (await confirmBox(`刪除「${list[i].name}」？`, { danger: true, ok: '刪除' }))) { list.splice(i, 1); onChange(); render(); }
    if (e.target.closest('[data-edit]')) edit(list[i]);
  });
  const edit = (m, isNew) => {
    const d = JSON.parse(JSON.stringify(m));
    const body = kind === 'pay'
      ? `<label class="field"><span>付款名稱（顧客看到的）</span><input class="input" name="name" value="${esc(d.name)}"></label>
        <label class="field"><span>付款類型</span><select class="input" name="kind">${Object.entries(PAY_KIND).map(([k, n]) => `<option value="${k}"${d.kind === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>付款說明（結帳時顯示，選填）</span><input class="input" name="note" value="${esc(d.note || '')}"></label>
        <div class="field"><span>金額限制：訂單金額在這個範圍才能用（0 = 不限）</span><div class="range"><input class="input" type="number" min="0" name="min" value="${d.min || 0}"> ～ <input class="input" type="number" min="0" name="max" value="${d.max || 0}"> 元</div></div>
        <div class="field"><span>不能搭配的運送方式</span><div class="inline">${shipping.map((s) => `<label class="check"><input type="checkbox" name="excludeShip" value="${esc(s.id)}" ${(d.excludeShip || []).includes(s.id) ? 'checked' : ''}> ${esc(s.name)}</label>`).join('') || '<span class="muted">沒有運送方式</span>'}</div></div>`
      : `<label class="field"><span>物流名稱（顧客看到的）</span><input class="input" name="name" value="${esc(d.name)}"></label>
        <label class="field"><span>類型</span><select class="input" name="type">${Object.entries(SHIP_TYPE).map(([k, n]) => `<option value="${k}"${d.type === k ? ' selected' : ''}>${n}</option>`).join('')}</select></label>
        <label class="field"><span>物流說明（結帳時顯示，例如：匯款後寄出）</span><input class="input" name="desc" value="${esc(d.desc || '')}"></label>
        <div class="row"><label class="field"><span>運費</span><input class="input" type="number" min="0" name="fee" value="${d.fee || 0}"></label><label class="field"><span>滿多少免運（0 = 不免運）</span><input class="input" type="number" min="0" name="freeOver" value="${d.freeOver || 0}"></label></div>
        <div class="field"><span>金額限制：訂單金額在這個範圍才能用（0 = 不限）</span><div class="range"><input class="input" type="number" min="0" name="min" value="${d.min || 0}"> ～ <input class="input" type="number" min="0" name="max" value="${d.max || 0}"> 元</div></div>
        <label class="check" style="margin-bottom:12px"><input type="checkbox" name="cod" ${d.cod ? 'checked' : ''}> 可以搭配貨到付款</label>
        <label class="field"><span>貨運查詢網址（顧客的訂單頁會出現「查詢貨態」連結）</span><input class="input" name="trackUrl" value="${esc(d.trackUrl || '')}" placeholder="例如 https://www.t-cat.com.tw/inquire/trace.aspx"></label>
        <div class="field"><span>期望到貨日欄位</span><div class="inline">${[['off', '不顯示'], ['optional', '選填'], ['required', '必填']].map(([k, n]) => `<label class="check"><input type="radio" name="wantDate" value="${k}" ${(d.wantDate || 'off') === k ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
        <div class="row"><label class="field"><span>備貨天數（最早可選幾天後）</span><input class="input" type="number" min="0" name="prepDays" value="${d.prepDays ?? 1}"></label><label class="field"><span>可指定的天數範圍</span><input class="input" type="number" min="1" name="dateRange" value="${d.dateRange || 14}"></label></div>
        <div class="field"><span>排除星期（這幾天不能指定到貨）</span><div class="inline">${WEEK.map((w, k) => `<label class="check"><input type="checkbox" name="noWeekdays" value="${k}" ${(d.noWeekdays || []).includes(String(k)) ? 'checked' : ''}> 週${w}</label>`).join('')}</div></div>
        <div class="field"><span>期望到貨時段欄位</span><div class="inline">${[['off', '不顯示'], ['optional', '選填'], ['required', '必填']].map(([k, n]) => `<label class="check"><input type="radio" name="wantTime" value="${k}" ${(d.wantTime || 'off') === k ? 'checked' : ''}> ${n}</label>`).join('')}</div></div>
        <label class="field"><span>提供的時段（用逗號分開）</span><input class="input" name="slots" value="${esc((d.slots?.length ? d.slots : ['不指定', '上午', '下午', '晚上']).join(', '))}"></label>`;
    const { box: mb, close } = modal({ title: (isNew ? '新增' : '編輯') + (kind === 'pay' ? '付款方式' : '運送方式'), size: 'wide', body: `<form>${body}</form>`, foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>確定</button>' });
    $('[data-no]', mb).onclick = close;
    $('[data-ok]', mb).onclick = () => {
      const f = new FormData($('form', mb));
      d.name = String(f.get('name') || '').trim();
      if (!d.name) return toast('請填名稱', true);
      for (const k of ['note', 'desc', 'trackUrl', 'kind', 'type', 'wantDate', 'wantTime']) if (f.has(k)) d[k] = String(f.get(k));
      for (const k of ['min', 'max', 'fee', 'freeOver', 'prepDays', 'dateRange']) if (f.has(k)) d[k] = Math.max(0, +f.get(k) || 0);
      if (kind === 'pay') d.excludeShip = f.getAll('excludeShip');
      else { d.cod = !!f.get('cod'); d.noWeekdays = f.getAll('noWeekdays'); d.slots = String(f.get('slots') || '').split(/[,，]/).map((x) => x.trim()).filter(Boolean); }
      if (isNew) list.push(d); else Object.assign(m, d);
      close();
      onChange();
      render();
    };
  };
  render();
  return { add: () => edit(kind === 'pay' ? { id: 'p' + Date.now().toString(36), name: '', kind: 'online', on: true, note: '', min: 0, max: 0, excludeShip: [] } : { id: 's' + Date.now().toString(36), name: '', type: 'home', fee: 0, freeOver: 0, on: true, cod: false, desc: '', min: 0, max: 0, trackUrl: '', wantDate: 'off', prepDays: 1, dateRange: 14, noWeekdays: [], wantTime: 'off', slots: [] }, true) };
}

export async function section(el, name) {
  if (name === 'accounts') return accounts(el);
  const { settings } = await api.get('settings');
  const v = settings[name];
  if (!FORMS[name]) throw new Error('找不到這個設定');
  let dirty = false;
  guard(() => dirty);
  const mark = () => { dirty = true; };
  const title = CARDS.find(([k]) => k === name)[2];
  el.innerHTML = `<a class="back" href="/admin/settings">‹ 回設定</a><div class="page-head"><h1>${title}</h1></div><form id="sf">${FORMS[name](v)}<div class="form-actions"><a class="btn" href="/admin/settings">取消</a><button class="btn primary">儲存</button></div></form>`;
  const f = $('#sf', el);
  const setPath = (path, val) => { const ks = path.split('.'); let o = v; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = val; };
  const onField = (e) => {
    const t = e.target;
    const k = t.dataset.k;
    if (!k) return;
    mark();
    if (t.type === 'radio') { if (!t.checked) return; setPath(k, t.value === 'true' ? true : t.value === 'false' ? false : t.value); }
    else setPath(k, t.type === 'checkbox' ? t.checked : t.type === 'number' ? +t.value : t.value);
  };
  f.addEventListener('input', onField);
  f.addEventListener('change', onField);
  $$('[data-img]', el).forEach((d) => imageField(d, get(v, d.dataset.img), (u) => { setPath(d.dataset.img, u); mark(); }));

  if (name === 'shopping') {
    let pages = [];
    try { pages = (await api.get('pages')).pages.filter((p) => !p.home); } catch {}
    const box = $('#terms', el);
    const draw = () => {
      box.innerHTML = `<div style="padding:4px 0 12px 56px">${v.terms.items.map((t, i) => `<div class="inline" style="margin-bottom:8px" data-i="${i}"><input class="input" data-t="name" value="${esc(t.name)}" placeholder="條款名稱" style="max-width:200px">${pages.length ? `<select class="input" data-t="page" style="max-width:220px"><option value="">選擇條款頁面</option>${pages.map((p) => `<option value="${esc(p.slug)}"${t.page === p.slug ? ' selected' : ''}>${esc(p.title)}</option>`).join('')}</select>` : `<input class="input" data-t="page" value="${esc(t.page)}" placeholder="頁面網址名稱" style="max-width:220px">`}<button type="button" class="btn sm ghost" data-rm aria-label="移除">${icon('x')}</button></div>`).join('')}
        <button type="button" class="btn sm" data-add>${icon('plus')}新增條款</button><div class="muted small" style="margin-top:6px">條款內容請先到「商店設計 → 頁面設計」新增一個頁面（例如隱私權條款），再在這裡選擇。</div></div>`;
    };
    box.addEventListener('input', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.t) { v.terms.items[+r.dataset.i][e.target.dataset.t] = e.target.value; mark(); } });
    box.addEventListener('change', (e) => { const r = e.target.closest('[data-i]'); if (r && e.target.dataset.t) { v.terms.items[+r.dataset.i][e.target.dataset.t] = e.target.value; mark(); } });
    box.addEventListener('click', (e) => {
      if (e.target.closest('[data-add]')) { v.terms.items.push({ name: '', page: '' }); mark(); draw(); }
      if (e.target.closest('[data-rm]')) { v.terms.items.splice(+e.target.closest('[data-i]').dataset.i, 1); mark(); draw(); }
    });
    draw();
  }
  if (name === 'payment') {
    const { settings: all } = await api.get('settings');
    const shipping = all.shipping.methods;
    const ml = methodList($('#pm', el), v.methods, { kind: 'pay', shipping, onChange: mark, draw: (m) => [PAY_KIND[m.kind || ({ card: 'online', atm: 'transfer', cod: 'cod' }[m.id] || 'offline')].split('（')[0], m.min || m.max ? `金額 ${m.min || 0}～${m.max || '不限'}` : '', m.excludeShip?.length ? `不能搭配 ${m.excludeShip.map((x) => shipping.find((s) => s.id === x)?.name || x).join('、')}` : '', m.note].filter(Boolean).join('・') });
    $('#pmAdd', el).onclick = ml.add;
  }
  if (name === 'shipping') {
    const ml = methodList($('#sm', el), v.methods, { kind: 'ship', onChange: mark, draw: (m) => [SHIP_TYPE[m.type]?.split('（')[0], `運費 ${m.fee}`, m.freeOver ? `滿 ${m.freeOver} 免運` : '', m.min || m.max ? `金額 ${m.min || 0}～${m.max || '不限'}` : '', m.cod ? '可貨到付款' : '', m.wantDate && m.wantDate !== 'off' ? '可指定到貨日' : '', m.desc].filter(Boolean).join('・') });
    $('#smAdd', el).onclick = ml.add;
  }
  if (name === 'exports') {
    const { orderCols } = await api.get('exportCols');
    const box = $('#cols', el);
    box.innerHTML = `<div class="inline" style="margin-bottom:12px"><button type="button" class="btn sm" data-all>全選</button><button type="button" class="btn sm" data-none>全不選</button></div><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:4px 12px">${orderCols.map((c) => `<label class="check"><input type="checkbox" value="${c.key}" ${!v.orderCols.length || v.orderCols.includes(c.key) ? 'checked' : ''}> ${esc(c.name)}${c.line ? ' <span class="muted small">（商品）</span>' : ''}</label>`).join('')}</div>`;
    const sync = () => { const on = $$('input[type=checkbox]', box).filter((x) => x.checked).map((x) => x.value); v.orderCols = on.length === orderCols.length ? [] : on; mark(); };
    box.addEventListener('change', sync);
    $('[data-all]', box).onclick = () => { $$('input', box).forEach((x) => (x.checked = true)); sync(); };
    $('[data-none]', box).onclick = () => { $$('input', box).forEach((x) => (x.checked = false)); sync(); };
  }

  f.onsubmit = async (e) => {
    e.preventDefault();
    if (name === 'exports' && !v.orderCols.length && $$('#cols input:checked', el).length === 0) return toast('至少要勾一個欄位', true);
    await busy(e.submitter, () => api.post('settingsSave', { name, value: v }));
    dirty = false;
    toast('已儲存');
  };
}

async function accounts(el) {
  const r = await api.get('admins');
  let { admins, roles } = r;
  const { perms } = r;
  let draft = JSON.parse(JSON.stringify(roles)); // 權限表的修改，按「儲存權限」才送出
  let dirty = false;
  guard(() => dirty);
  const roleOpts = (cur) => roles.map((x) => `<option value="${esc(x.id)}"${cur === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('') + `<option value="custom"${cur === 'custom' ? ' selected' : ''}>自訂（個別勾選功能）</option>`;
  // 個別勾選這位員工能用的功能，回傳勾選結果（取消回 null）
  const pickPerms = (title, cur = []) => new Promise((resolve) => {
    let done = false;
    const { box, close } = modal({
      title, size: 'wide',
      body: `<p class="muted" style="margin-top:0">勾選這位員工可以使用的功能。「處理訂單」「匯出訂單」會自動包含「查看訂單」。</p>
        ${groups.map((g) => `<div style="margin-bottom:12px"><b>${esc(g)}</b>${perms.filter((p) => p.group === g).map((p) => `<label class="check" style="padding:6px 0;align-items:flex-start"><input type="checkbox" value="${p.key}" ${cur.includes(p.key) ? 'checked' : ''}><span>${esc(p.name)}<br><small class="muted">${esc(p.desc)}</small></span></label>`).join('')}</div>`).join('')}`,
      foot: '<button class="btn" data-no>取消</button><button class="btn primary" data-ok>確定</button>',
      onClose: () => { if (!done) resolve(null); },
    });
    $('[data-no]', box).onclick = close;
    $('[data-ok]', box).onclick = () => { done = true; const v = $$('input:checked', box).map((i) => i.value); close(); resolve(v); };
  });
  const groups = [...new Set(perms.map((p) => p.group))];

  const draw = () => {
    el.innerHTML = `<a class="back" href="/admin/settings">‹ 回設定</a><div class="page-head"><h1>後台帳號與權限</h1><div class="sub">員工用自己的 Google 帳號登入，不用設密碼。每位員工可以套用一個角色，或選「自訂」直接勾選他能用的功能。角色能用哪些功能在下面的權限表勾選，也可以新增自己的角色。老闆帳號在部署時的 OWNER_EMAILS 設定，永遠擁有全部權限。</div></div>
    <div class="card"><h2>員工</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Email</th><th>名稱</th><th>角色</th><th>啟用</th><th></th></tr></thead><tbody id="ab">
      ${admins.map((a) => `<tr data-e="${esc(a.email)}"><td>${esc(a.email)}</td><td>${a.fixed ? '' : `<input class="input" data-name value="${esc(a.name || '')}" style="max-width:160px">`}</td><td>${a.fixed ? pill('老闆', 'accent') : `<select class="input" data-role style="width:auto">${roleOpts(a.role)}</select>${a.role === 'custom' ? ` <button type="button" class="btn sm" data-perm>設定權限（${(a.perms || []).length} 項）</button>` : ''}`}</td><td>${a.fixed ? '' : sw('', !a.disabled, 'data-on')}</td><td class="right">${a.fixed ? '' : `<button class="btn sm danger" data-rm aria-label="移除">${icon('trash')}</button>`}</td></tr>`).join('')}
    </tbody></table></div>
    <form id="af" style="margin-top:16px"><div class="row"><label class="field"><span>新增員工的 Gmail</span><input class="input" type="email" name="email" required></label><label class="field"><span>名稱</span><input class="input" name="name"></label><label class="field"><span>角色</span><select class="input" name="role">${roleOpts(roles[0]?.id)}</select></label></div><button class="btn primary">${icon('plus')}新增員工</button></form></div>

    <div class="card"><div class="card-h">角色與權限<div class="actions"><button class="btn sm" id="addRole">${icon('plus')}新增角色</button><button class="btn sm primary" id="saveRoles" ${dirty ? '' : 'disabled'}>儲存權限</button></div></div>
      <p class="muted small" style="margin-top:-6px">勾選每個角色可以使用的功能。「處理訂單」「匯出訂單」會自動包含「查看訂單」；沒有「成本與毛利」的角色看不到商品成本。</p>
      <div class="table-wrap"><table class="tbl" id="pt"><thead><tr><th style="min-width:220px;vertical-align:top">功能</th><th class="right" style="min-width:70px;vertical-align:top">老闆</th>
        ${draft.map((x, i) => `<th class="right" style="min-width:120px;vertical-align:top"><input class="input" data-rn="${i}" value="${esc(x.name)}" aria-label="角色名稱" style="text-align:right;font-weight:700;min-height:30px;padding:2px 6px">${draft.length > 1 ? `<div><button type="button" class="linkbtn danger small" data-rd="${i}" style="font-weight:400;margin-top:4px">刪除角色</button></div>` : ''}</th>`).join('')}</tr></thead><tbody>
        ${groups.map((g) => `<tr><td colspan="${draft.length + 2}" style="background:var(--sunk);font-weight:700;font-size:.85rem">${esc(g)}</td></tr>` + perms.filter((p) => p.group === g).map((p) => `<tr><td><b style="font-weight:500">${esc(p.name)}</b><div class="muted small">${esc(p.desc)}</div></td><td class="right"><input type="checkbox" checked disabled aria-label="老闆：${esc(p.name)}"></td>
          ${draft.map((x, i) => `<td class="right"><input type="checkbox" data-pi="${i}" data-pk="${p.key}" ${x.perms.includes(p.key) ? 'checked' : ''} aria-label="${esc(x.name)}：${esc(p.name)}"></td>`).join('')}</tr>`).join('')).join('')}
      </tbody></table></div></div>`;

    const row = (e) => admins.find((a) => a.email === e.target.closest('tr').dataset.e);
    $('#ab', el).addEventListener('change', async (e) => {
      const a = row(e);
      if (e.target.matches('[data-role]')) {
        if (e.target.value === 'custom') {
          const p = await pickPerms(`${a.email} 可以使用的功能`, a.perms || roles.find((r) => r.id === a.role)?.perms || []);
          if (!p) { e.target.value = a.role; return; }
          a.perms = p;
        }
        a.role = e.target.value;
      }
      if (e.target.matches('[data-on]')) a.disabled = !e.target.checked;
      if (e.target.matches('[data-name]')) a.name = e.target.value;
      try { admins = (await api.post('adminSave', a)).admins; toast('已更新'); if (e.target.matches('[data-role]')) draw(); } catch (err) { toast(err.message, true); }
    });
    $('#ab', el).addEventListener('click', async (e) => {
      if (e.target.closest('[data-perm]')) {
        const a = row(e);
        const p = await pickPerms(`${a.email} 可以使用的功能`, a.perms || []);
        if (!p) return;
        admins = (await api.post('adminSave', { ...a, perms: p })).admins;
        toast('已更新，對方重新整理後台就會生效');
        return draw();
      }
      if (!e.target.closest('[data-rm]')) return;
      const a = row(e);
      if (!(await confirmBox(`移除 ${a.email} 的後台權限？`, { danger: true, ok: '移除' }))) return;
      admins = (await api.post('adminRemove', { email: a.email })).admins;
      draw();
    });
    $('#af', el).onsubmit = async (e) => {
      e.preventDefault();
      const body = Object.fromEntries(new FormData(e.target));
      if (body.role === 'custom') { body.perms = await pickPerms(`${body.email} 可以使用的功能`, ['dashboard']); if (!body.perms) return; }
      admins = (await busy(e.submitter, () => api.post('adminSave', body))).admins;
      toast('已新增，請對方用這個 Gmail 登入後台');
      draw();
    };

    const pt = $('#pt', el);
    const mark = () => { dirty = true; $('#saveRoles', el).disabled = false; };
    pt.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.pk) {
        const x = draft[+t.dataset.pi];
        x.perms = t.checked ? [...new Set([...x.perms, t.dataset.pk])] : x.perms.filter((k) => k !== t.dataset.pk);
        // 處理／匯出一定要能查看；取消查看就一起取消
        const fix = (base) => { if (x.perms.some((k) => k.startsWith(base) && k !== base) && !x.perms.includes(base)) { if (t.dataset.pk === base) x.perms = x.perms.filter((k) => !k.startsWith(base)); else x.perms.push(base); } };
        fix('orders'); fix('customers');
        mark();
        draw();
      }
    });
    pt.addEventListener('input', (e) => { if (e.target.dataset.rn) { draft[+e.target.dataset.rn].name = e.target.value; mark(); } });
    pt.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-rd]');
      if (!b) return;
      const x = draft[+b.dataset.rd];
      if (admins.some((a) => a.role === x.id)) return toast(`還有員工是「${x.name}」，請先把他們改成別的角色`, true);
      if (!(await confirmBox(`刪除角色「${x.name}」？`, { danger: true, ok: '刪除' }))) return;
      if (roles.some((r) => r.id === x.id)) roles = (await api.post('roleDelete', { id: x.id })).roles;
      draft.splice(+b.dataset.rd, 1);
      draw();
    });
    $('#addRole', el).onclick = () => { draft.push({ id: '', name: '新角色', perms: ['dashboard'] }); mark(); draw(); $$('[data-rn]', el).pop()?.select(); };
    $('#saveRoles', el).onclick = async (e) => {
      if (draft.some((x) => !x.name.trim())) return toast('每個角色都要有名稱', true);
      await busy(e.currentTarget, async () => { for (const x of draft) roles = (await api.post('roleSave', { id: x.id || undefined, name: x.name, perms: x.perms })).roles; });
      draft = JSON.parse(JSON.stringify(roles));
      dirty = false;
      toast('權限已儲存，員工重新整理後台就會生效');
      draw();
    };
  };
  draw();
}
