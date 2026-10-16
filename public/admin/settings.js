// 設定：商店、購物、顧客功能、金流、物流、第三方、通知、後台帳號
import { api, $, $$, esc, icon, toast, busy, ctx, sw, imageField, guard, confirmBox, pill } from './app.js';

const CARDS = [
  ['store', 'store', '商店設定', '商店名稱、簡介、Logo、聯絡資訊'],
  ['shopping', 'bag', '購物設定', '結帳、訂單處理、購物金折抵規則'],
  ['customer', 'user', '顧客功能設定', '會員需要填的資料、收藏、退換貨、黑名單'],
  ['payment', 'dollar', '金流管理', '付款方式、匯款帳號（綠界串接預留）'],
  ['shipping', 'truck', '物流管理', '運送方式、運費、免運門檻'],
  ['third', 'plug', '第三方設定', 'Google Analytics、社群連結'],
  ['notify', 'bell', '通知設定', '庫存不足提醒'],
  ['accounts', 'key', '後台帳號與權限', '員工帳號、角色、每個角色能用的功能'],
];

export async function index(el) {
  el.innerHTML = `<div class="page-head"><h1>設定</h1></div><div class="set-cards">${CARDS.filter(([k]) => k !== 'accounts' || ctx.me.perms.includes('accounts')).map(([k, ic, n, d]) => `<a class="set-card" href="/admin/settings/${k}"><span class="ic">${icon(ic)}</span><span><b>${n}</b><small>${d}</small></span></a>`).join('')}</div>`;
}

const sec = (title, desc, body) => `<div class="set-sec"><div><h3>${title}</h3><p>${desc}</p></div><div class="card">${body}</div></div>`;
const tog = (k, title, desc, v) => `<div class="switch-row"><div class="sr-body"><b>${title}</b>${desc ? `<small>${desc}</small>` : ''}</div>${sw('', v, `data-k="${k}"`)}</div>`;
const inp = (k, label, v, type = 'text', help = '') => `<label class="field"><span>${label}</span><input class="input" type="${type}" data-k="${k}" value="${esc(v ?? '')}">${help ? `<span class="help">${help}</span>` : ''}</label>`;
const area = (k, label, v, help = '') => `<label class="field"><span>${label}</span><textarea class="input" data-k="${k}">${esc(v ?? '')}</textarea>${help ? `<span class="help">${help}</span>` : ''}</label>`;

const FORMS = {
  store: (v) => sec('商店資訊', '商店名稱、簡介和 Logo 會顯示在前台和搜尋結果。', inp('name', '商店名稱', v.name) + area('desc', '商店敘述', v.desc, '會用在搜尋引擎的描述') + `<div class="grid3"><div class="field"><span>電腦版 Logo</span><div data-img="logo"></div></div><div class="field"><span>手機版 Logo</span><div data-img="logoMobile"></div></div><div class="field"><span>網站小圖示</span><div data-img="favicon"></div></div></div>`)
    + sec('聯絡資訊', '顯示在頁尾。', `<div class="row">${inp('phone', '電話', v.phone)}${inp('email', 'Email', v.email, 'email')}</div>${inp('address', '地址', v.address)}`),
  shopping: (v) => sec('結帳', '顧客結帳時的規則。', tog('guestCheckout', '訪客結帳', '不用註冊會員也能下單', v.guestCheckout) + tog('orderNote', '結帳留言', '顧客可以在結帳時留言給店家', v.orderNote))
    + sec('訂單處理', '付款失敗、取消時系統自動做的事。', tog('autoCancelFailed', '付款失敗自動取消訂單', '適用於信用卡等線上付款', v.autoCancelFailed) + tog('restockOnCancel', '取消訂單自動加回庫存', '訂單被取消時，自動補回訂單內所有商品的庫存', v.restockOnCancel)
      + `<div class="row">${inp('repayDays', '訂單重新付款期限（天）', v.repayDays, 'number')}${inp('unpaidCancelDays', '轉帳幾天沒付款自動取消（0 = 不取消）', v.unpaidCancelDays, 'number')}</div>` + area('transferTemplate', '匯款通知預設值', v.transferTemplate, '顧客選轉帳付款後，回填匯款資料的欄位範本'))
    + sec('購物金', '顧客結帳時用購物金折抵的規則。贈送規則在「行銷 → 折扣 → 購物金」。', `<div class="row">${inp('pointsRate', '1 點折抵幾元', v.pointsRate, 'number')}${inp('pointsMaxPercent', '最多折抵訂單金額的 %', v.pointsMaxPercent, 'number')}</div>`),
  customer: (v) => sec('會員資料', '顧客註冊時要填的欄位。', tog('requirePhone', '手機必填', '', v.requirePhone) + tog('requireBirthday', '生日必填', '生日禮購物金需要生日', v.requireBirthday) + tog('lockBirthday', '鎖定會員生日欄位', '填過之後不能自己修改，避免一直改生日領生日禮', v.lockBirthday))
    + sec('會員進階設定', '提供給會員的專屬功能。', tog('wishlist', '商品收藏', '登入會員可以收藏商品', v.wishlist) + tog('returnRequest', '退貨申請', '會員可以對「已出貨且未結案」的訂單申請退貨', v.returnRequest) + tog('exchangeRequest', '換貨申請', '會員可以對「已出貨且未結案」的訂單申請換貨', v.exchangeRequest) + tog('membersOnlyPrice', '會員可見價格', '要登入會員才看得到商品售價', v.membersOnlyPrice))
    + sec('黑名單設定', '黑名單的顧客不能下單。可以到顧客詳情手動加入或移除。', `<p class="muted small" style="margin-top:0">自動加入黑名單需要串接物流的未取貨紀錄，目前先預留設定。</p>` + tog('blacklistAuto', '自動加入黑名單', '依條件自動把顧客加入黑名單', v.blacklistAuto) + `<div class="row">${inp('blacklistMonths', '計算期間（月）', v.blacklistMonths, 'number')}${inp('blacklistUnpicked', '超商未取貨次數', v.blacklistUnpicked, 'number')}${inp('blacklistReturns', '退貨次數', v.blacklistReturns, 'number')}</div>`),
  payment: (v) => sec('付款方式', '前台結帳可以選的付款方式。目前信用卡是模擬付款，串接綠界後會變成真的刷卡頁。', `<div id="pm">${v.methods.map((m, i) => `<div class="switch-row" data-i="${i}">${sw('', m.on, 'data-mk="on"')}<div class="sr-body"><input class="input" data-mk="name" value="${esc(m.name)}" style="max-width:280px;margin-bottom:6px"><input class="input" data-mk="note" value="${esc(m.note || '')}" placeholder="結帳時顯示的說明（選填）"></div><span class="pill">${esc(m.id)}</span></div>`).join('')}</div>`)
    + sec('匯款帳號', 'ATM 轉帳時顯示給顧客的帳號。', `<div class="row">${inp('bank.name', '銀行名稱', v.bank.name)}${inp('bank.code', '銀行代碼', v.bank.code)}</div><div class="row">${inp('bank.account', '帳號', v.bank.account)}${inp('bank.holder', '戶名', v.bank.holder)}</div>`)
    + sec('綠界科技 ECPay', '之後串接綠界用。先填好測試帳號，串接完成就能切換。', `${pill('尚未串接', 'warn')}<div class="row" style="margin-top:12px">${inp('ecpay.merchantId', '特店編號 MerchantID', v.ecpay.merchantId)}${inp('ecpay.hashKey', 'HashKey', v.ecpay.hashKey)}${inp('ecpay.hashIV', 'HashIV', v.ecpay.hashIV)}</div>${tog('ecpay.stage', '測試環境', '用綠界的測試站', v.ecpay.stage)}`),
  shipping: (v) => sec('運送方式', '前台結帳可以選的運送方式、運費和免運門檻。超商取貨目前讓顧客自己填門市，串接綠界物流後會改成地圖選店。', `<div class="table-wrap"><table class="tbl" id="sm"><thead><tr><th>啟用</th><th>名稱</th><th>類型</th><th>運費</th><th>滿多少免運（0 = 不免運）</th><th>可貨到付款</th></tr></thead><tbody>${v.methods.map((m, i) => `<tr data-i="${i}"><td>${sw('', m.on, 'data-mk="on"')}</td><td><input class="input" data-mk="name" value="${esc(m.name)}"></td><td><select class="input" data-mk="type">${[['home', '宅配'], ['cvs', '超商取貨'], ['pickup', '自取']].map(([t, n]) => `<option value="${t}"${m.type === t ? ' selected' : ''}>${n}</option>`).join('')}</select></td><td><input class="input" type="number" min="0" data-mk="fee" value="${m.fee}" style="width:90px"></td><td><input class="input" type="number" min="0" data-mk="freeOver" value="${m.freeOver}" style="width:110px"></td><td>${sw('', m.cod, 'data-mk="cod"')}</td></tr>`).join('')}</tbody></table></div>`),
  third: (v) => sec('數據分析', '追蹤網站流量和廣告成效。', inp('gaId', 'Google Analytics 評估 ID', v.gaId, 'text', '例如 G-XXXXXXX') + inp('fbPixel', 'Facebook 像素編號', v.fbPixel))
    + sec('社群連結', '顯示在頁尾。', inp('lineUrl', 'LINE 官方帳號網址', v.lineUrl) + inp('fbUrl', 'Facebook 粉絲專頁', v.fbUrl) + inp('igUrl', 'Instagram', v.igUrl)),
  notify: (v) => sec('提醒', '在後台總覽顯示的提醒。Email／LINE 通知之後再串接。', tog('newOrder', '新訂單提醒', '', v.newOrder) + tog('newMessage', '新訊息提醒', '', v.newMessage) + inp('lowStock', '庫存低於幾件時提醒', v.lowStock, 'number')),
};

export async function section(el, name) {
  if (name === 'accounts') return accounts(el);
  const { settings } = await api.get('settings');
  const v = settings[name];
  if (!FORMS[name]) throw new Error('找不到這個設定');
  let dirty = false;
  guard(() => dirty);
  const title = CARDS.find(([k]) => k === name)[2];
  el.innerHTML = `<a class="back" href="/admin/settings">‹ 回設定</a><div class="page-head"><h1>${title}</h1></div><form id="sf">${FORMS[name](v)}<div class="form-actions"><a class="btn" href="/admin/settings">取消</a><button class="btn primary">儲存</button></div></form>`;
  const f = $('#sf', el);
  const setPath = (path, val) => { const ks = path.split('.'); let o = v; while (ks.length > 1) o = o[ks.shift()]; o[ks[0]] = val; };
  f.addEventListener('input', (e) => {
    dirty = true;
    const k = e.target.dataset.k;
    if (k) setPath(k, e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value);
    const mk = e.target.dataset.mk;
    if (mk) { const i = +e.target.closest('[data-i]').dataset.i; v.methods[i][mk] = e.target.type === 'checkbox' ? e.target.checked : e.target.type === 'number' ? +e.target.value : e.target.value; }
  });
  $$('[data-img]', el).forEach((d) => imageField(d, v[d.dataset.img], (u) => { v[d.dataset.img] = u; dirty = true; }));
  f.onsubmit = async (e) => {
    e.preventDefault();
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
  const roleOpts = (cur) => roles.map((x) => `<option value="${esc(x.id)}"${cur === x.id ? ' selected' : ''}>${esc(x.name)}</option>`).join('');
  const groups = [...new Set(perms.map((p) => p.group))];

  const draw = () => {
    el.innerHTML = `<a class="back" href="/admin/settings">‹ 回設定</a><div class="page-head"><h1>後台帳號與權限</h1><div class="sub">員工用自己的 Google 帳號登入，不用設密碼。每位員工屬於一個角色，角色能用哪些功能在下面的權限表勾選。老闆帳號在部署時的 OWNER_EMAILS 設定，永遠擁有全部權限。</div></div>
    <div class="card"><h2>員工</h2><div class="table-wrap"><table class="tbl"><thead><tr><th>Email</th><th>名稱</th><th>角色</th><th>啟用</th><th></th></tr></thead><tbody id="ab">
      ${admins.map((a) => `<tr data-e="${esc(a.email)}"><td>${esc(a.email)}</td><td>${a.fixed ? '' : `<input class="input" data-name value="${esc(a.name || '')}" style="max-width:160px">`}</td><td>${a.fixed ? pill('老闆', 'accent') : `<select class="input" data-role style="width:auto">${roleOpts(a.role)}</select>`}</td><td>${a.fixed ? '' : sw('', !a.disabled, 'data-on')}</td><td class="right">${a.fixed ? '' : `<button class="btn sm danger" data-rm aria-label="移除">${icon('trash')}</button>`}</td></tr>`).join('')}
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
      if (e.target.matches('[data-role]')) a.role = e.target.value;
      if (e.target.matches('[data-on]')) a.disabled = !e.target.checked;
      if (e.target.matches('[data-name]')) a.name = e.target.value;
      try { admins = (await api.post('adminSave', a)).admins; toast('已更新'); } catch (err) { toast(err.message, true); }
    });
    $('#ab', el).addEventListener('click', async (e) => {
      if (!e.target.closest('[data-rm]')) return;
      const a = row(e);
      if (!(await confirmBox(`移除 ${a.email} 的後台權限？`, { danger: true, ok: '移除' }))) return;
      admins = (await api.post('adminRemove', { email: a.email })).admins;
      draw();
    });
    $('#af', el).onsubmit = async (e) => {
      e.preventDefault();
      admins = (await busy(e.submitter, () => api.post('adminSave', Object.fromEntries(new FormData(e.target))))).admins;
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
