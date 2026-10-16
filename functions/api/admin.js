// 後台 API：/api/admin?a=動作（GET 讀、POST 寫），都要 Google 登入，依角色檢查權限（lib/auth.js）
import * as D from '../lib/db.js';
import * as S from '../lib/settings.js';
import * as O from '../lib/orders.js';
import * as C from '../lib/customers.js';
import * as M from '../lib/media.js';
import { quote, context } from '../lib/pricing.js';
import { admin, need, can, PERMS, listRoles, listAdmins, saveAdmin, removeAdmin, saveRole, removeRole } from '../lib/auth.js';
import { json, fail, readJSON, UserError, str, num, int, id } from '../lib/http.js';

const csvResponse = (rows, name) => new Response(C.csv(rows), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(name)}`, 'Cache-Control': 'no-store' } });
const monthStart = () => { const d = D.twDate(); return new Date(d.slice(0, 8) + '01T00:00:00+08:00').getTime(); };
const counted = (o) => o.status !== 'cancelled' && o.payment.status === 'paid';

/* ---------- 訂單列表篩選 ---------- */
const TABS = {
  all: () => true,
  processing: (o) => o.status === 'processing',
  preparing: (o) => o.status === 'preparing',
  shipped: (o) => o.status === 'shipped',
  returning: (o) => o.status === 'returning',
  done: (o) => ['closed', 'cancelled'].includes(o.status),
};

function filterOrders(list, q) {
  const tab = TABS[q.get('tab')] || TABS.all;
  const kw = str(q.get('q'), 50).toLowerCase();
  const tag = q.get('tag');
  const from = q.get('from') ? new Date(q.get('from') + 'T00:00:00+08:00').getTime() : 0;
  const to = q.get('to') ? new Date(q.get('to') + 'T23:59:59+08:00').getTime() : Infinity;
  const pay = q.get('pay'), ship = q.get('ship'), payId = q.get('payId'), shipId = q.get('shipId');
  return list.filter((o) => tab(o)
    && (!kw || [o.no, o.buyer.name, o.buyer.email, o.buyer.phone, o.receiver?.name, o.receiver?.phone, o.trackingNo, ...o.items.map((i) => i.name)].join(' ').toLowerCase().includes(kw))
    && (!tag || (o.tags || []).includes(tag))
    && o.createdAt >= from && o.createdAt <= to
    && (!pay || o.payment.status === pay) && (!ship || o.shipStatus === ship)
    && (!payId || o.payment.id === payId) && (!shipId || o.shipping.id === shipId));
}

const orderRow = (o) => ({
  no: o.no, createdAt: o.createdAt, buyer: o.buyer.name, email: o.buyer.email, total: o.total,
  status: o.status, payStatus: o.payment.status, payName: o.payment.name, shipStatus: o.shipStatus, shipName: o.shipping.name,
  trackingNo: o.trackingNo, tags: o.tags || [], unread: !!o.adminUnread, flagged: !!o.flagged, returnReq: o.returnReq?.status === 'pending',
});

function orderCsv(list) {
  const rows = [['訂單編號', '下單時間', '訂單狀態', '帳款狀態', '運送狀態', '付款方式', '運送方式', '物流編號', '訂購人', 'Email', '手機', '收件人', '收件電話', '地址／門市', '商品', '規格', '數量', '單價', '小計', '折扣', '購物金折抵', '運費', '訂單金額', '顧客留言', '後台備註']];
  for (const o of list) {
    const lines = [...o.items, ...(o.addonItems || []).map((l) => ({ ...l, name: '【加購】' + l.name }))];
    lines.forEach((l, i) => rows.push([
      o.no, new Date(o.createdAt + 8 * 3600e3).toISOString().slice(0, 16).replace('T', ' '), O.STATUS[o.status], O.PAY[o.payment.status], O.SHIP[o.shipStatus], o.payment.name, o.shipping.name, o.trackingNo,
      o.buyer.name, o.buyer.email, o.buyer.phone, o.receiver.name, o.receiver.phone, o.receiver.store || o.receiver.address,
      l.name, l.spec, l.qty, l.price, l.amount,
      i ? '' : o.discountTotal, i ? '' : o.pointsValue, i ? '' : o.shipping.fee, i ? '' : o.total, i ? '' : o.note, i ? '' : o.adminNote,
    ]));
  }
  return rows;
}

/* ---------- 商品 ---------- */
function cleanProduct(b) {
  const specs = (b.specs || []).slice(0, 3).map((s) => ({ name: str(s.name, 20), values: [...new Set((s.values || []).map((v) => str(v, 30)).filter(Boolean))].slice(0, 30) })).filter((s) => s.name && s.values.length);
  let variants = (b.variants || []).slice(0, 300).map((v) => ({
    key: specs.length ? (v.opts || []).map((x) => str(x, 30)).join('/') : '',
    opts: specs.length ? (v.opts || []).map((x) => str(x, 30)) : [],
    sku: str(v.sku, 40), price: int(v.price ?? b.price), listPrice: int(v.listPrice), cost: int(v.cost ?? b.cost), stock: int(v.stock, 0, 999999), img: str(v.img, 500),
  }));
  if (!specs.length) variants = [{ ...(variants[0] || {}), key: '', opts: [], price: int(b.price), listPrice: int(b.listPrice), cost: int(b.cost), stock: int(variants[0]?.stock ?? b.stock, 0, 999999), sku: str(b.sku, 40), img: '' }];
  // 只留規格組合裡真的存在的
  if (specs.length) {
    const valid = (v) => v.opts.length === specs.length && v.opts.every((x, i) => specs[i].values.includes(x));
    variants = variants.filter(valid).filter((v, i, a) => a.findIndex((x) => x.key === v.key) === i);
    if (!variants.length) throw new UserError('規格組合至少要有一個');
  }
  const name = str(b.name, 100);
  if (!name) throw new UserError('請填商品名稱');
  return {
    name, sku: str(b.sku, 40), desc: str(b.desc, 20000), images: (b.images || []).map((x) => str(x, 500)).filter(Boolean).slice(0, 20),
    tags: [...new Set((b.tags || []).map((x) => str(x, 20)).filter(Boolean))].slice(0, 20), on: !!b.on,
    price: Math.min(...variants.map((v) => v.price)), listPrice: int(b.listPrice), cost: int(b.cost),
    specs, variants, stock: variants.reduce((a, v) => a + v.stock, 0),
    seoTitle: str(b.seoTitle, 100), seoDesc: str(b.seoDesc, 300),
  };
}

/* ---------- 行銷、設計資料的清理 ---------- */
const days = (v) => (/^\d{4}-\d{2}-\d{2}$/.test(v || '') ? v : '');
const strs = (a, n = 50, len = 40) => (Array.isArray(a) ? a.map((x) => str(x, len)).filter(Boolean).slice(0, n) : []);

function cleanDiscount(b) {
  const type = ['product', 'order', 'coupon', 'freeShip', 'points'].includes(b.type) ? b.type : null;
  if (!type) throw new UserError('折扣類型不正確');
  const d = {
    type, name: str(b.name, 40), on: !!b.on, start: days(b.start), end: days(b.end), priority: int(b.priority, 0, 999), groups: strs(b.groups),
    tags: strs(b.tags), percent: num(b.percent, 0, 100), amount: int(b.amount), mode: b.mode === 'percent' ? 'percent' : 'amount', threshold: int(b.threshold),
    code: str(b.code, 30).toUpperCase().replace(/\s/g, ''), limit: int(b.limit), once: !!b.once, shippingIds: strs(b.shippingIds),
    trigger: ['spend', 'birthday', 'signup'].includes(b.trigger) ? b.trigger : 'spend', expireDays: int(b.expireDays),
  };
  if (!d.name) throw new UserError('請填活動名稱');
  if (type === 'coupon' && !d.code) throw new UserError('請填優惠碼');
  if (type === 'product' && !(d.percent > 0)) throw new UserError('請填折扣 %');
  return d;
}

const BLOCK_TYPES = ['image', 'carousel', 'imageText', 'text', 'products', 'video', 'share', 'fbPage', 'menu', 'map', 'spacer', 'group', 'html', 'countdown'];
function cleanBlocks(blocks, depth = 0) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 80).filter((b) => BLOCK_TYPES.includes(b?.type)).map((b) => {
    const out = JSON.parse(JSON.stringify(b));
    out.id = str(b.id, 20) || D.code(8);
    if (b.type === 'group') out.cols = depth ? [] : (b.cols || []).slice(0, 4).map((c) => ({ blocks: cleanBlocks(c?.blocks, depth + 1) }));
    delete out.items; // 商品列表的商品是讀取時才帶入
    return out;
  });
}

function cleanMenuItems(items, depth = 0) {
  return (Array.isArray(items) ? items : []).slice(0, 40).map((x) => ({
    label: str(x.label, 30), type: ['page', 'tag', 'all', 'url', 'none', 'search', 'cart', 'account'].includes(x.type) ? x.type : 'none', value: str(x.value, 300),
    children: depth < 2 ? cleanMenuItems(x.children, depth + 1) : [],
  })).filter((x) => x.label);
}

const conds = (a) => (Array.isArray(a) ? a : []).slice(0, 5).map((r) => ({ months: int(r.months, 1, 60) || 12, type: r.type === 'single' ? 'single' : 'total', amount: int(r.amount) })).filter((r) => r.amount > 0);

async function saveDoc(col, body, clean) {
  const data = clean(body);
  const t = Date.now();
  if (body.id) {
    const ref = D.db().doc(`${col}/${id(body.id)}`);
    if (!(await ref.get()).exists) throw new UserError('找不到資料，可能已被刪除', 404);
    await ref.update({ ...data, updatedAt: t });
    D.bust(col);
    return { id: ref.id, ...data };
  }
  const newId = D.code(10);
  await D.db().doc(`${col}/${newId}`).set({ ...data, createdAt: t, updatedAt: t });
  D.bust(col);
  return { id: newId, ...data };
}

async function deleteDoc(col, docId) {
  await D.db().doc(`${col}/${id(docId)}`).delete();
  D.bust(col);
  return { ok: true };
}

/* ---------- 讀 ---------- */
const GETS = {
  async me(me) {
    const store = await S.get('store');
    return { me, store: { name: store.name, logo: store.logo } };
  },

  async dashboard(me) {
    need(me, 'dashboard');
    const [orders, customers, questions, products, notify] = await Promise.all([D.all('orders'), D.db().collection('customers').count().get(), D.all('questions'), D.products(), S.get('notify')]);
    const ms = monthStart();
    const month = orders.filter((o) => o.createdAt >= ms);
    const today = D.twDate();
    // 近 30 天每日營收
    const series = [];
    for (let i = 29; i >= 0; i--) {
      const d = D.twDate(Date.now() - i * 86400e3);
      const list = orders.filter((o) => counted(o) && D.twDate(o.createdAt) === d);
      series.push({ d, amount: list.reduce((a, o) => a + o.total, 0), orders: list.length });
    }
    const sales = new Map();
    for (const o of month.filter(counted)) for (const l of o.items) sales.set(l.pid, { name: l.name, img: l.img, qty: (sales.get(l.pid)?.qty || 0) + l.qty, amount: (sales.get(l.pid)?.amount || 0) + l.amount });
    return {
      revenue: month.filter(counted).reduce((a, o) => a + o.total, 0),
      profit: can(me, 'cost') ? month.filter(counted).reduce((a, o) => a + o.total - (o.cost || 0) - (o.shipping?.fee || 0), 0) : null,
      todo: {
        pending: orders.filter((o) => o.status === 'processing').length,
        unshipped: orders.filter((o) => !['cancelled', 'closed'].includes(o.status) && o.shipStatus === 'unshipped' && (o.payment.status === 'paid' || o.payment.id === 'cod')).length,
        orderQA: orders.filter((o) => o.adminUnread).length,
        productQA: questions.filter((q) => !q.replied).length,
        returns: orders.filter((o) => o.returnReq?.status === 'pending').length,
        unpaidTransfer: orders.filter((o) => o.status !== 'cancelled' && o.payment.id === 'atm' && o.payment.status === 'unpaid' && o.payment.transfer).length,
      },
      monthOrders: month.filter((o) => o.status !== 'cancelled').length,
      todayOrders: orders.filter((o) => D.twDate(o.createdAt) === today && o.status !== 'cancelled').length,
      customers: customers.data().count,
      series,
      top: [...sales.values()].sort((a, b) => b.amount - a.amount).slice(0, 5),
      lowStock: products.filter((p) => p.on && (p.variants || []).some((v) => v.stock <= notify.lowStock)).slice(0, 10).map((p) => ({ id: p.id, name: p.name, img: p.images?.[0] || '', stock: Math.min(...p.variants.map((v) => v.stock)) })),
    };
  },

  async orders(me, q) {
    need(me, 'orders');
    const all = (await D.all('orders')).sort((a, b) => b.createdAt - a.createdAt);
    const list = filterOrders(all, q);
    const size = Math.min(100, int(q.get('size')) || 20);
    const page = Math.max(1, int(q.get('page')) || 1);
    const counts = Object.fromEntries(Object.entries(TABS).map(([k, f]) => [k, all.filter(f).length]));
    return { total: list.length, page, size, rows: list.slice((page - 1) * size, page * size).map(orderRow), counts, tags: [...new Set(all.flatMap((o) => o.tags || []))] };
  },

  async order(me, q) {
    need(me, 'orders');
    const o = await O.get(id(q.get('no')));
    if (!o) throw new UserError('找不到訂單', 404);
    if (o.adminUnread) await D.db().doc('orders/' + o.no).update({ adminUnread: false });
    const cust = o.uid ? await D.one('customers', o.uid) : null;
    if (!can(me, 'cost')) { delete o.cost; o.items = o.items.map(({ cost, ...l }) => l); o.addonItems = (o.addonItems || []).map(({ cost, ...l }) => l); }
    return { order: o, customer: cust && { uid: cust.uid, name: cust.name, email: cust.email, orders: cust.stats?.orders || 0, spent: cust.stats?.spent || 0, blacklisted: cust.blacklisted, points: cust.points || 0 }, STATUS: O.STATUS, PAY: O.PAY, SHIP: O.SHIP };
  },

  async exportOrders(me, q) {
    need(me, 'ordersExport');
    const all = (await D.all('orders')).sort((a, b) => b.createdAt - a.createdAt);
    const nos = q.get('nos') ? q.get('nos').split(',') : null;
    const list = nos ? all.filter((o) => nos.includes(o.no)) : filterOrders(all, q);
    return csvResponse(orderCsv(list), `訂單_${D.twDate()}.csv`);
  },

  async products(me) {
    need(me, 'products');
    const list = (await D.all('products')).sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return { rows: list.map((p) => ({ id: p.id, name: p.name, sku: p.sku, img: p.images?.[0] || '', on: p.on, tags: p.tags || [], specs: p.specs?.length ? p.variants.length : 0, price: p.price, cost: can(me, 'cost') ? p.cost || p.variants?.[0]?.cost || 0 : null, stock: p.stock, sold: p.sold || 0, updatedAt: p.updatedAt })) };
  },

  async product(me, q) {
    need(me, 'products');
    const p = await D.one('products', id(q.get('id')));
    if (!p) throw new UserError('找不到商品', 404);
    if (!can(me, 'cost')) { delete p.cost; p.variants = p.variants.map(({ cost, ...v }) => v); }
    return { product: p, canCost: can(me, 'cost') };
  },

  async exportProducts(me) {
    need(me, 'products');
    const list = await D.all('products');
    const c = can(me, 'cost');
    const rows = [['商品ID', '商品名稱', '商品編號', '規格', '規格編號', '售價', '原價', ...(c ? ['成本'] : []), '庫存', '狀態', '標籤']];
    for (const p of list) for (const v of p.variants || []) rows.push([p.id, p.name, p.sku, v.key, v.sku, v.price, v.listPrice || p.listPrice, ...(c ? [v.cost] : []), v.stock, p.on ? '上架' : '下架', (p.tags || []).join('、')]);
    return csvResponse(rows, `商品_${D.twDate()}.csv`);
  },

  async messages(me, q) {
    need(me, 'messages');
    if (q.get('type') === 'product') {
      const list = (await D.all('questions')).sort((a, b) => b.updatedAt - a.updatedAt);
      return { rows: list };
    }
    const list = (await D.all('orders')).filter((o) => o.msgs?.length).sort((a, b) => (b.lastMsgAt || b.updatedAt) - (a.lastMsgAt || a.updatedAt));
    return { rows: list.map((o) => ({ no: o.no, name: o.buyer.name, last: o.msgs[o.msgs.length - 1], msgs: o.msgs, unread: !!o.adminUnread, flagged: !!o.flagged, total: o.total, status: O.STATUS[o.status], at: o.lastMsgAt || o.updatedAt })) };
  },

  async customers(me) {
    need(me, 'customers');
    const [list, groups] = await Promise.all([D.all('customers'), D.groups()]);
    return {
      rows: list.sort((a, b) => b.createdAt - a.createdAt).map((c) => ({ uid: c.uid || c.id, id: c.id, name: c.name, email: c.email, phone: c.phone, groupId: c.groupId, groupUntil: c.groupUntil, points: c.points || 0, orders: c.stats?.orders || 0, spent: c.stats?.spent || 0, lastOrderAt: c.stats?.lastOrderAt || null, createdAt: c.createdAt, blacklisted: !!c.blacklisted, pending: !!c.pending })),
      groups: groups.sort((a, b) => (a.order || 0) - (b.order || 0)),
    };
  },

  async customer(me, q) {
    need(me, 'customers');
    const c = await D.one('customers', id(q.get('id')));
    if (!c) throw new UserError('找不到顧客', 404);
    const orders = c.uid ? (await D.db().collection('orders').where('uid', '==', c.uid).get()).docs.map((d) => orderRow(d.data())).sort((a, b) => b.createdAt - a.createdAt) : [];
    return { customer: c, orders };
  },

  async exportCustomers(me, q) {
    need(me, 'customersExport');
    const [list, groups] = await Promise.all([D.all('customers'), D.groups()]);
    let rows = list;
    if (q.get('seg')) rows = C.segmentsOf(list)[q.get('seg')]?.list || [];
    if (q.get('ids')) { const ids = q.get('ids').split(','); rows = rows.filter((c) => ids.includes(c.id)); }
    return csvResponse(C.customerRows(rows, groups), `顧客_${D.twDate()}.csv`);
  },

  async groups(me) {
    need(me, 'customers');
    const [groups, customers] = await Promise.all([D.groups(), D.all('customers')]);
    return { groups: groups.sort((a, b) => (a.order || 0) - (b.order || 0)).map((g) => ({ ...g, count: customers.filter((c) => c.groupId === g.id).length })), base: customers.filter((c) => !c.groupId).length };
  },

  async codes(me) {
    need(me, 'customers');
    const [codes, groups] = await Promise.all([D.all('codes'), D.groups()]);
    return { codes: codes.sort((a, b) => a.createdAt - b.createdAt), groups };
  },

  async segments(me) {
    need(me, 'customers');
    const seg = C.segmentsOf(await D.all('customers'));
    return { segments: Object.entries(seg).map(([key, s]) => ({ key, name: s.name, desc: s.desc, count: s.list.length })) };
  },

  async pages(me) {
    need(me, 'design');
    const [pages, menus] = await Promise.all([D.all('pages'), D.all('menus')]);
    return { pages: pages.map(({ blocks, ...p }) => ({ ...p, blocks: blocks?.length || 0 })).sort((a, b) => (b.home ? 1 : 0) - (a.home ? 1 : 0) || a.title.localeCompare(b.title)), menus };
  },

  async page(me, q) {
    need(me, 'design');
    const p = await D.one('pages', id(q.get('id')));
    if (!p) throw new UserError('找不到頁面', 404);
    return { page: p };
  },

  async menus(me) {
    need(me, 'design');
    const [menus, pages, products] = await Promise.all([D.all('menus'), D.all('pages'), D.products()]);
    return { menus, pages: pages.map((p) => ({ slug: p.slug, title: p.title })), tags: [...new Set(products.flatMap((p) => p.tags || []))] };
  },

  async marketing(me) {
    need(me, 'marketing');
    const [discounts, addons, groupbuys, groups, products, shipping] = await Promise.all([D.all('discounts'), D.all('addons'), D.all('groupbuys'), D.groups(), D.products(), S.get('shipping')]);
    return {
      discounts: discounts.sort((a, b) => (a.priority || 0) - (b.priority || 0)), addons, groupbuys, groups,
      products: products.map((p) => ({ id: p.id, name: p.name, img: p.images?.[0] || '', price: p.price, tags: p.tags || [] })),
      tags: [...new Set(products.flatMap((p) => p.tags || []))], shipping: shipping.methods,
    };
  },

  async media(me) {
    need(me, 'media');
    const [list, folders] = await Promise.all([D.all('media'), D.one('settings', 'mediaFolders')]);
    return { rows: list.sort((a, b) => b.createdAt - a.createdAt), folders: folders?.list || [] };
  },

  async settings(me) {
    need(me, 'settings');
    return { settings: await S.getAll(), defaults: S.DEFAULTS };
  },

  async admins(me) {
    need(me, 'accounts');
    return { admins: await listAdmins(), roles: await listRoles(), perms: PERMS };
  },

  // 商品選擇器（頁面設計、行銷都會用）
  async pick(me) {
    const products = await D.products();
    return { products: products.map((p) => ({ id: p.id, name: p.name, img: p.images?.[0] || '', price: p.price, on: p.on, tags: p.tags || [], specs: p.specs || [], variants: (p.variants || []).map((v) => ({ key: v.key, stock: v.stock })) })), tags: [...new Set(products.flatMap((p) => p.tags || []))] };
  },
};

/* ---------- 寫 ---------- */
const POSTS = {
  async orderUpdate(me, b) {
    // 訊息中心只能加星號標記
    if (Object.keys(b).every((k) => ['a', 'no', 'flagged'].includes(k)) && can(me, 'messages')) return { order: await O.update(id(b.no), { flagged: b.flagged }, me.name) };
    need(me, 'ordersEdit');
    if (b.status === 'cancelled') return { order: await O.cancel(id(b.no), me.name, str(b.reason, 100)) };
    return { order: await O.update(id(b.no), b, me.name) };
  },

  async ordersBulk(me, b) {
    need(me, 'ordersEdit');
    const nos = (b.nos || []).map(id).slice(0, 200);
    const errors = [];
    for (const no of nos) {
      try {
        if (b.status === 'cancelled') await O.cancel(no, me.name);
        else await O.update(no, { status: b.status, payStatus: b.payStatus, shipStatus: b.shipStatus, tags: b.addTag ? [...new Set([...((await O.get(no))?.tags || []), str(b.addTag, 20)])] : undefined }, me.name);
      } catch (e) { errors.push(`${no}：${e.message}`); }
    }
    return { ok: nos.length - errors.length, errors };
  },

  // 上傳物流編號：每行「訂單編號,物流編號」，順便改成已出貨
  async tracking(me, b) {
    need(me, 'ordersEdit');
    const rows = C.parseCSV(String(b.text || '')).filter((r) => /^W[0-9A-Z]{8}$/i.test(r[0]?.trim()));
    const errors = [];
    let ok = 0;
    for (const r of rows.slice(0, 500)) {
      try { await O.update(r[0].trim().toUpperCase(), { trackingNo: r[1], shipStatus: 'shipped', status: b.markShipped ? 'shipped' : undefined }, me.name); ok++; } catch (e) { errors.push(`${r[0]}：${e.message}`); }
    }
    if (!rows.length) throw new UserError('沒有讀到資料，格式是每行「訂單編號,物流編號」');
    return { ok, errors };
  },

  async orderMsg(me, b) {
    if (!can(me, 'messages')) need(me, 'ordersEdit');
    return { order: await O.addMessage(id(b.no), 'admin', b.name || '客服', b.text) };
  },

  async orderRead(me, b) {
    need(me, 'messages');
    await D.db().doc('orders/' + id(b.no)).update({ adminUnread: !!b.unread });
    return { ok: true };
  },

  async productSave(me, b) {
    need(me, 'products');
    // 看不到成本的人存檔時，保留原本的成本
    if (!can(me, 'cost')) {
      const old = b.id ? await D.one('products', id(b.id)) : null;
      b.cost = old?.cost || 0;
      b.variants = (b.variants || []).map((v) => ({ ...v, cost: old?.variants?.find((x) => x.key === (v.opts || []).join('/'))?.cost ?? old?.cost ?? 0 }));
    }
    const r = await saveDoc('products', b, cleanProduct);
    if (!b.id) await D.db().doc('products/' + r.id).update({ sold: 0 });
    return { product: r };
  },

  async productsBulk(me, b) {
    need(me, 'products');
    const ids = (b.ids || []).map(id).slice(0, 500);
    const batch = D.db().batch();
    const t = Date.now();
    for (const x of ids) {
      const ref = D.db().doc('products/' + x);
      if (b.op === 'delete') batch.delete(ref);
      else if (b.op === 'on' || b.op === 'off') batch.update(ref, { on: b.op === 'on', updatedAt: t });
      else if (b.op === 'addTag' && b.tag) batch.update(ref, { tags: D.FieldValue.arrayUnion(str(b.tag, 20)), updatedAt: t });
      else if (b.op === 'removeTag' && b.tag) batch.update(ref, { tags: D.FieldValue.arrayRemove(str(b.tag, 20)), updatedAt: t });
    }
    await batch.commit();
    D.bust('products');
    return { ok: ids.length };
  },

  async productCopy(me, b) {
    need(me, 'products');
    const p = await D.one('products', id(b.id));
    if (!p) throw new UserError('找不到商品', 404);
    const { id: _i, ...rest } = p;
    return { product: await saveDoc('products', { ...rest, name: p.name + '（複製）', on: false }, cleanProduct) };
  },

  async questionReply(me, b) {
    need(me, 'messages');
    const ref = D.db().doc('questions/' + id(b.id));
    const text = str(b.text, 1000);
    if (!text) throw new UserError('請輸入回覆');
    const t = Date.now();
    await ref.update({ msgs: D.FieldValue.arrayUnion({ from: 'admin', name: '客服', text, at: t }), replied: true, customerUnread: true, updatedAt: t });
    return { question: (await ref.get()).data() };
  },

  async customerSave(me, b) {
    need(me, 'customersEdit');
    const ref = D.db().doc('customers/' + id(b.id));
    const c = (await ref.get()).data();
    if (!c) throw new UserError('找不到顧客', 404);
    const patch = {};
    if (b.groupId !== undefined) { patch.groupId = b.groupId || null; patch.groupManual = !!b.groupId; patch.groupUntil = b.groupUntil ? new Date(b.groupUntil + 'T23:59:59+08:00').getTime() : null; }
    if (b.blacklisted !== undefined) patch.blacklisted = !!b.blacklisted;
    if (b.note !== undefined) patch.note = str(b.note, 1000);
    if (b.tags !== undefined) patch.tags = strs(b.tags, 20, 20);
    if (Object.keys(patch).length) await ref.update(patch);
    if (b.points) {
      if (c.pending) await ref.update({ points: Math.max(0, (c.points || 0) + int(b.points, -1e7, 1e7)) });
      else await O.givePoints(c.uid, int(b.points, -1e7, 1e7), str(b.pointsNote, 60) || `後台調整（${me.name}）`);
    }
    return { customer: (await ref.get()).data() };
  },

  async customersBulk(me, b) {
    need(me, 'customersEdit');
    const ids = (b.ids || []).map(id).slice(0, 1000);
    for (const x of ids) {
      const ref = D.db().doc('customers/' + x);
      if (b.op === 'group') await ref.update({ groupId: b.groupId || null, groupManual: !!b.groupId, groupUntil: null });
      if (b.op === 'points' && int(b.points, -1e7, 1e7)) { const c = (await ref.get()).data(); if (c?.uid) await O.givePoints(c.uid, int(b.points, -1e7, 1e7), str(b.note, 60) || '大量贈送'); }
      if (b.op === 'blacklist') await ref.update({ blacklisted: !!b.on });
    }
    return { ok: ids.length };
  },

  async customersImport(me, b) {
    need(me, 'customersExport');
    return C.importRows(C.parseCSV(String(b.text || '')), await D.groups());
  },

  async groupSave(me, b) {
    need(me, 'customersEdit');
    return { group: await saveDoc('groups', b, (x) => {
      const name = str(x.name, 30);
      if (!name) throw new UserError('請填群組名稱');
      return { name, on: x.on !== false, months: int(x.months, 0, 120), upgrade: conds(x.upgrade), renew: conds(x.renew), order: int(x.order, 0, 999), color: str(x.color, 10) };
    }) };
  },
  async groupDelete(me, b) {
    need(me, 'customersEdit');
    const n = (await D.db().collection('customers').where('groupId', '==', id(b.id)).count().get()).data().count;
    if (n) throw new UserError(`還有 ${n} 位顧客在這個群組，請先移到別的群組或停用群組`);
    return deleteDoc('groups', b.id);
  },

  async codeSave(me, b) {
    need(me, 'customersEdit');
    return { code: await saveDoc('codes', b, (x) => {
      const value = str(x.value, 60).toLowerCase();
      if (!value) throw new UserError('請填代碼');
      if (!x.groupId) throw new UserError('請選要指派的群組');
      return { field: x.field === 'email' ? 'email' : 'code', op: x.op === 'endsWith' ? 'endsWith' : 'eq', value, groupId: id(x.groupId) };
    }) };
  },
  async codeDelete(me, b) { need(me, 'customersEdit'); return deleteDoc('codes', b.id); },

  async pageSave(me, b) {
    need(me, 'design');
    const slug = str(b.slug, 60).toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
    if (!b.home && !slug) throw new UserError('請填網址名稱（英數字）');
    const pages = await D.all('pages');
    if (slug && pages.some((p) => p.slug === slug && p.id !== b.id)) throw new UserError('網址名稱重複了');
    const r = await saveDoc('pages', b, (x) => ({ title: str(x.title, 60) || '未命名頁面', slug: x.home ? slug || 'home' : slug, home: !!x.home, hidden: !!x.hidden, settings: { width: int(x.settings?.width, 0, 2000), bg: str(x.settings?.bg, 20), seoTitle: str(x.settings?.seoTitle, 100), seoDesc: str(x.settings?.seoDesc, 300) }, blocks: cleanBlocks(x.blocks) }));
    if (b.home) for (const p of pages.filter((p) => p.home && p.id !== r.id)) await D.db().doc('pages/' + p.id).update({ home: false });
    D.bust('pages');
    return { page: r };
  },
  async pageDelete(me, b) {
    need(me, 'design');
    const p = await D.one('pages', id(b.id));
    if (p?.home) throw new UserError('首頁不能刪除');
    return deleteDoc('pages', b.id);
  },

  async menuSave(me, b) {
    need(me, 'design');
    const mid = id(b.id) || D.code(8);
    await D.db().doc('menus/' + mid).set({ name: str(b.name, 30) || '選單', items: cleanMenuItems(b.items), updatedAt: Date.now() });
    D.bust('menus');
    return { id: mid };
  },
  async menuDelete(me, b) {
    need(me, 'design');
    if (['top', 'side', 'footer'].includes(b.id)) throw new UserError('預設選單不能刪除，可以把項目清空');
    return deleteDoc('menus', b.id);
  },

  async discountSave(me, b) {
    need(me, 'marketing');
    if (b.type === 'coupon') {
      const code = str(b.code, 30).toUpperCase();
      if ((await D.all('discounts')).some((d) => d.type === 'coupon' && d.code === code && d.id !== b.id)) throw new UserError('這個優惠碼已經有了');
    }
    return { discount: await saveDoc('discounts', b, cleanDiscount) };
  },
  async discountToggle(me, b) { need(me, 'marketing'); await D.db().doc('discounts/' + id(b.id)).update({ on: !!b.on }); D.bust('discounts'); return { ok: true }; },
  async discountOrder(me, b) {
    need(me, 'marketing');
    const batch = D.db().batch();
    (b.ids || []).forEach((x, i) => batch.update(D.db().doc('discounts/' + id(x)), { priority: i }));
    await batch.commit();
    D.bust('discounts');
    return { ok: true };
  },
  async discountDelete(me, b) { need(me, 'marketing'); return deleteDoc('discounts', b.id); },

  async addonSave(me, b) {
    need(me, 'marketing');
    return { addon: await saveDoc('addons', b, (x) => ({
      name: str(x.name, 40) || '加購區', on: !!x.on, start: days(x.start), end: days(x.end),
      items: (x.items || []).slice(0, 30).map((i) => ({ pid: id(i.pid), price: int(i.price), limit: int(i.limit, 0, 99) })).filter((i) => i.pid),
    })) };
  },
  async addonDelete(me, b) { need(me, 'marketing'); return deleteDoc('addons', b.id); },

  async groupbuySave(me, b) {
    need(me, 'marketing');
    return { groupbuy: await saveDoc('groupbuys', b, (x) => {
      const tiers = (x.tiers || []).slice(0, 6).map((t) => ({ qty: int(t.qty), price: int(t.price) })).filter((t) => t.price > 0).sort((a, c) => a.qty - c.qty);
      if (!x.pid) throw new UserError('請選商品');
      if (!tiers.length) throw new UserError('至少要有一個價格階梯');
      return { pid: id(x.pid), name: str(x.name, 40) || '湊湊團', on: !!x.on, start: days(x.start), end: days(x.end), tiers, sold: int(x.sold) };
    }) };
  },
  async groupbuyDelete(me, b) { need(me, 'marketing'); return deleteDoc('groupbuys', b.id); },

  // 試算：用指定的會員群組和購物車跑一次價格計算
  async simulate(me, b) {
    need(me, 'marketing');
    const fake = b.groupId === 'guest' ? null : { groupId: b.groupId === 'member' ? null : b.groupId, points: int(b.points), coupons: [] };
    return { quote: await quote(b.cart || {}, fake, await context()) };
  },

  async mediaUpload(me, b) { need(me, 'media'); return { media: await M.upload(b) }; },
  async mediaUpdate(me, b) {
    need(me, 'media');
    const ids = (b.ids || [b.id]).map(id).filter(Boolean);
    for (const x of ids) {
      const patch = {};
      if (b.name !== undefined) patch.name = str(b.name, 80);
      if (b.folder !== undefined) patch.folder = str(b.folder, 30);
      if (b.tags !== undefined) patch.tags = strs(b.tags, 10, 20);
      await D.db().doc('media/' + x).update(patch);
    }
    return { ok: true };
  },
  async mediaDelete(me, b) { need(me, 'media'); for (const x of (b.ids || [b.id]).map(id)) await M.remove(x); return { ok: true }; },
  async mediaFolders(me, b) {
    need(me, 'media');
    await D.db().doc('settings/mediaFolders').set({ list: strs(b.list, 50, 30) });
    return { ok: true };
  },

  async settingsSave(me, b) {
    need(me, 'settings');
    if (b.name === 'theme') need(me, 'design');
    if (!S.DEFAULTS[b.name]) throw new UserError('設定項目不正確');
    return { value: await S.save(b.name, b.value) };
  },

  async adminSave(me, b) { need(me, 'accounts'); return { admins: await saveAdmin(b) }; },
  async adminRemove(me, b) { need(me, 'accounts'); return { admins: await removeAdmin(b) }; },
  async roleSave(me, b) { need(me, 'accounts'); return { roles: await saveRole(b) }; },
  async roleDelete(me, b) { need(me, 'accounts'); return { roles: await removeRole(b) }; },
};

export async function GET(request) {
  try {
    const me = await admin(request);
    const q = new URL(request.url).searchParams;
    const fn = GETS[q.get('a')];
    if (!fn) throw new UserError('不支援的動作', 404);
    const r = await fn(me, q);
    return r instanceof Response ? r : json(r);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  try {
    const me = await admin(request);
    const b = await readJSON(request);
    const fn = POSTS[b.a];
    if (!fn) throw new UserError('不支援的動作', 404);
    return json(await fn(me, b));
  } catch (e) {
    return fail(e);
  }
}
