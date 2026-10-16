// 前台 API：/api/shop?a=動作
// 不用登入就能看商品、試算、訪客結帳；會員功能要帶 Firebase ID token
import * as D from '../lib/db.js';
import * as S from '../lib/settings.js';
import * as O from '../lib/orders.js';
import * as C from '../lib/customers.js';
import { quote, context, unitPrice, variantOf } from '../lib/pricing.js';
import { customer } from '../lib/auth.js';
import { json, fail, readJSON, UserError, str, id } from '../lib/http.js';

const PAGE = 24;

// 給前台的商品卡（列表用）
function card(p, cust, ctx, hidePrice) {
  const vs = (p.variants || []);
  const prices = vs.map((v) => unitPrice(p, v, cust, ctx));
  const min = prices.length ? Math.min(...prices.map((x) => x.price)) : p.price;
  const max = prices.length ? Math.max(...prices.map((x) => x.price)) : p.price;
  const list = prices.length ? Math.max(...prices.map((x) => x.listPrice || 0)) : 0;
  const gb = ctx.groupbuys.find((g) => g.pid === p.id && D.active(g));
  return {
    id: p.id, name: p.name, img: p.images?.[0] || '', img2: p.images?.[1] || '', tags: p.tags || [],
    price: hidePrice ? null : min, maxPrice: hidePrice ? null : max, listPrice: hidePrice ? null : list > min ? list : 0,
    soldOut: (p.stock || 0) <= 0, notes: hidePrice ? [] : [...new Set(prices.flatMap((x) => x.notes))], groupbuy: !!gb,
    hasSpecs: !!p.specs?.length, vkey: vs[0]?.key ?? '', createdAt: p.createdAt, sold: p.sold || 0,
  };
}

function sortCards(list, sort) {
  const by = {
    new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    hot: (a, b) => b.sold - a.sold,
    priceAsc: (a, b) => (a.price ?? 0) - (b.price ?? 0),
    priceDesc: (a, b) => (b.price ?? 0) - (a.price ?? 0),
  }[sort];
  return by ? [...list].sort(by) : list;
}

// 頁面裡的商品列表區塊：依設定帶入商品
function fillBlocks(blocks, products, cust, ctx, hide) {
  return (blocks || []).map((b) => {
    if (b.type === 'group') return { ...b, cols: (b.cols || []).map((col) => ({ blocks: fillBlocks(col.blocks, products, cust, ctx, hide) })) };
    if (b.type !== 'products') return b;
    let list = products.filter((p) => p.on);
    if (b.source === 'tag' && b.tag) list = list.filter((p) => (p.tags || []).includes(b.tag));
    if (b.source === 'ids') list = (b.ids || []).map((x) => list.find((p) => p.id === x)).filter(Boolean);
    const cards = sortCards(list.map((p) => card(p, cust, ctx, hide)), b.source === 'ids' ? '' : b.sort || 'new');
    return { ...b, items: cards.slice(0, Math.min(48, b.limit || 8)) };
  });
}

async function me(request) {
  const m = await customer(request);
  if (!m) return { m: null, cust: null };
  return { m, cust: await D.one('customers', m.uid) };
}

const tagsOf = (products) => [...new Set(products.filter((p) => p.on).flatMap((p) => p.tags || []))];

export async function GET(request) {
  try {
    const q = new URL(request.url).searchParams;
    const a = q.get('a');
    const { m, cust } = await me(request);
    const ctx = await context();
    const hide = ctx.customerSet.membersOnlyPrice && !cust;

    if (a === 'init') {
      const [store, theme, third, shopping, menus, pages] = await Promise.all([S.get('store'), S.get('theme'), S.get('third'), S.get('shopping'), D.all('menus', 5000), D.all('pages', 3000)]);
      return json({
        store, theme, third,
        flags: { guestCheckout: shopping.guestCheckout, orderNote: shopping.orderNote, pointsRate: shopping.pointsRate, wishlist: ctx.customerSet.wishlist, returnRequest: ctx.customerSet.returnRequest, exchangeRequest: ctx.customerSet.exchangeRequest, requirePhone: ctx.customerSet.requirePhone, requireBirthday: ctx.customerSet.requireBirthday, lockBirthday: ctx.customerSet.lockBirthday, membersOnlyPrice: ctx.customerSet.membersOnlyPrice },
        menus: Object.fromEntries(menus.map((x) => [x.id, x.items || []])),
        pages: pages.filter((p) => !p.hidden).map((p) => ({ slug: p.slug, title: p.title, home: !!p.home })),
        tags: tagsOf(ctx.products),
      });
    }

    if (a === 'page') {
      const pages = await D.all('pages', 3000);
      const slug = q.get('slug');
      const p = slug ? pages.find((x) => x.slug === slug) : pages.find((x) => x.home);
      if (!p) throw new UserError('找不到這個頁面', 404);
      return json({ page: { title: p.title, slug: p.slug, home: !!p.home, settings: p.settings || {}, blocks: fillBlocks(p.blocks, ctx.products, cust, ctx, hide) } });
    }

    if (a === 'products') {
      const tag = q.get('tag');
      const kw = str(q.get('q'), 50).toLowerCase();
      const min = Number(q.get('min')) || 0, max = Number(q.get('max')) || Infinity;
      let list = ctx.products.filter((p) => p.on);
      if (tag) list = list.filter((p) => (p.tags || []).includes(tag));
      if (kw) list = list.filter((p) => [p.name, p.sku, ...(p.tags || [])].join(' ').toLowerCase().includes(kw));
      let cards = list.map((p) => card(p, cust, ctx, hide)).filter((c) => hide || (c.price >= min && c.price <= max));
      cards = sortCards(cards, q.get('sort') || 'new');
      const page = Math.max(1, Number(q.get('page')) || 1);
      return json({ total: cards.length, page, pages: Math.ceil(cards.length / PAGE), items: cards.slice((page - 1) * PAGE, page * PAGE), tags: tagsOf(ctx.products) });
    }

    if (a === 'product') {
      const p = ctx.byId.get(id(q.get('id')));
      if (!p || !p.on) throw new UserError('這個商品已下架或不存在', 404);
      const gb = ctx.groupbuys.find((g) => g.pid === p.id && D.active(g));
      const qs = m ? (await D.db().collection('questions').where('pid', '==', p.id).where('uid', '==', m.uid).get()).docs.map((d) => ({ id: d.id, ...d.data() })) : [];
      const related = ctx.products.filter((x) => x.on && x.id !== p.id && (x.tags || []).some((t) => (p.tags || []).includes(t))).slice(0, 8).map((x) => card(x, cust, ctx, hide));
      return json({
        product: {
          id: p.id, name: p.name, sku: p.sku, desc: p.desc, images: p.images || [], tags: p.tags || [], specs: p.specs || [],
          variants: (p.variants || []).map((v) => { const up = unitPrice(p, v, cust, ctx); return { key: v.key, opts: v.opts, img: v.img || '', stock: v.stock, price: hide ? null : up.price, listPrice: hide ? null : up.listPrice > up.price ? up.listPrice : 0, notes: hide ? [] : up.notes }; }),
          groupbuy: gb ? { name: gb.name, sold: gb.sold || 0, tiers: gb.tiers, end: gb.end } : null,
          wished: !!cust?.wishlist?.includes(p.id),
        },
        questions: qs.sort((x, y) => y.updatedAt - x.updatedAt),
        related, hidePrice: hide,
      });
    }

    if (a === 'me') {
      if (!m) return json({ customer: null });
      let c = cust || (await C.claimPending(m));
      if (!c) return json({ customer: null, needProfile: true, email: m.email, name: m.name });
      const groups = await D.groups();
      const { pointsLog, coupons, ...rest } = c;
      return json({ customer: { ...rest, pointsLog: (pointsLog || []).slice(0, 30), groupName: groups.find((g) => g.id === c.groupId)?.name || '一般會員' } });
    }

    if (a === 'orders') {
      if (!m) throw new UserError('請先登入', 401);
      const snap = await D.db().collection('orders').where('uid', '==', m.uid).get();
      const list = snap.docs.map((d) => d.data()).sort((x, y) => y.createdAt - x.createdAt);
      return json({ orders: list.map((o) => ({ no: o.no, createdAt: o.createdAt, total: o.total, status: o.status, statusText: O.STATUS[o.status], payText: O.PAY[o.payment.status], shipText: O.SHIP[o.shipStatus], items: o.items.length + (o.addonItems?.length || 0), img: o.items[0]?.img || '', unread: !!o.customerUnread })) });
    }

    if (a === 'order') {
      const o = await O.get(id(q.get('no')));
      if (!o || !(m && o.uid === m.uid) && q.get('k') !== o.key) throw new UserError('找不到這筆訂單', 404);
      if (m && o.uid === m.uid && o.customerUnread) await D.db().doc('orders/' + o.no).update({ customerUnread: false });
      const [payment, shopping] = await Promise.all([S.get('payment'), S.get('shopping')]);
      const { cost, log, adminNote, tags, flagged, adminUnread, key, items, addonItems, ...pub } = o;
      const strip = (l) => { const { cost: _c, ...r } = l; return r; };
      return json({
        order: { ...pub, items: items.map(strip), addonItems: (addonItems || []).map(strip), statusText: O.STATUS[o.status], payText: O.PAY[o.payment.status], shipText: O.SHIP[o.shipStatus] },
        bank: o.payment.id === 'atm' ? payment.bank : null,
        transferTemplate: shopping.transferTemplate,
        canCancel: ['processing'].includes(o.status) && o.shipStatus === 'unshipped',
        canReturn: ctx.customerSet.returnRequest && o.uid && o.shipStatus !== 'unshipped' && !['closed', 'cancelled', 'returning'].includes(o.status) && !o.returnReq,
        canExchange: ctx.customerSet.exchangeRequest && o.uid && o.shipStatus !== 'unshipped' && !['closed', 'cancelled', 'returning'].includes(o.status) && !o.returnReq,
      });
    }

    if (a === 'wishlist') {
      if (!cust) throw new UserError('請先登入', 401);
      return json({ items: (cust.wishlist || []).map((x) => ctx.byId.get(x)).filter((p) => p?.on).map((p) => card(p, cust, ctx, false)) });
    }

    if (a === 'questions') {
      if (!m) throw new UserError('請先登入', 401);
      const snap = await D.db().collection('questions').where('uid', '==', m.uid).get();
      return json({ questions: snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((x, y) => y.updatedAt - x.updatedAt) });
    }

    return json({ error: '不支援的動作' }, 404);
  } catch (e) {
    return fail(e);
  }
}

export async function POST(request) {
  try {
    const body = await readJSON(request);
    const { m, cust } = await me(request);
    const a = body.a;

    if (a === 'quote') {
      const ctx = await context();
      if (ctx.customerSet.membersOnlyPrice && !cust) throw new UserError('請先登入會員才能看到價格', 401);
      return json({ quote: await quote(body.cart || {}, cust, ctx) });
    }

    if (a === 'checkout') {
      const r = await O.create(body, m);
      return json(r);
    }

    if (a === 'profile') {
      if (!m) throw new UserError('請先登入', 401);
      return json({ customer: await C.saveProfile(m, body) });
    }

    if (a === 'wish') {
      if (!cust) throw new UserError('請先登入會員', 401);
      const pid = id(body.pid);
      await D.db().doc('customers/' + m.uid).update({ wishlist: body.on ? D.FieldValue.arrayUnion(pid) : D.FieldValue.arrayRemove(pid) });
      return json({ ok: true });
    }

    if (a === 'ask') {
      if (!cust) throw new UserError('請先登入會員再提問', 401);
      const p = await D.one('products', id(body.pid));
      const text = str(body.text, 1000);
      if (!p || !text) throw new UserError('請輸入問題');
      const t = Date.now();
      const msg = { from: 'customer', name: cust.name, text, at: t };
      if (body.qid) {
        const ref = D.db().doc('questions/' + id(body.qid));
        const q = (await ref.get()).data();
        if (!q || q.uid !== m.uid) throw new UserError('找不到這則問答', 404);
        await ref.update({ msgs: D.FieldValue.arrayUnion(msg), replied: false, updatedAt: t });
      } else {
        await D.db().collection('questions').add({ pid: p.id, pname: p.name, img: p.images?.[0] || '', uid: m.uid, email: cust.email, name: cust.name, msgs: [msg], replied: false, customerUnread: false, createdAt: t, updatedAt: t });
      }
      return json({ ok: true });
    }

    // 以下是針對某一筆訂單的動作：會員本人或帶訂單金鑰的訪客
    const o = body.no ? await O.get(id(body.no)) : null;
    if (!o || !((m && o.uid === m.uid) || (body.k && body.k === o.key))) throw new UserError('找不到這筆訂單', 404);
    const who = o.buyer.name;

    if (a === 'orderMsg') return json({ ok: !!(await O.addMessage(o.no, 'customer', who, body.text)) });

    if (a === 'cancel') {
      if (o.status !== 'processing' || o.shipStatus !== 'unshipped') throw new UserError('訂單已在處理中，請用訂單問答聯絡我們');
      await O.cancel(o.no, '顧客', str(body.reason, 100));
      return json({ ok: true });
    }

    // 模擬付款（之後換成綠界回傳）
    if (a === 'pay') {
      if (o.payment.id !== 'card') throw new UserError('這筆訂單不是線上付款');
      if (o.status === 'cancelled') throw new UserError('訂單已取消');
      if (o.payment.status === 'paid') return json({ ok: true });
      const ok = body.result === 'success';
      const t = Date.now();
      await D.db().doc('orders/' + o.no).update({ 'payment.status': ok ? 'paid' : 'failed', 'payment.paidAt': ok ? t : null, updatedAt: t, log: [{ at: t, by: '金流', text: ok ? '信用卡付款成功（模擬）' : '信用卡付款失敗（模擬）' }, ...(o.log || [])] });
      if (o.uid) await O.refreshCustomer(o.uid);
      return json({ ok });
    }

    // 轉帳通知：顧客回填帳號末五碼
    if (a === 'transfer') {
      const text = str(body.text, 300);
      if (!text) throw new UserError('請填寫匯款資料');
      const t = Date.now();
      await D.db().doc('orders/' + o.no).update({ 'payment.transfer': text, adminUnread: true, updatedAt: t, msgs: D.FieldValue.arrayUnion({ from: 'customer', name: who, text: '【匯款通知】\n' + text, at: t }) });
      return json({ ok: true });
    }

    if (a === 'returnReq') {
      const set = await S.get('customer');
      const type = body.type === 'exchange' ? 'exchange' : 'return';
      if (!o.uid || (type === 'return' ? !set.returnRequest : !set.exchangeRequest)) throw new UserError('目前不開放線上申請，請用訂單問答聯絡我們');
      if (o.returnReq) throw new UserError('已經申請過了');
      if (o.shipStatus === 'unshipped' || ['closed', 'cancelled'].includes(o.status)) throw new UserError('這筆訂單目前不能申請退換貨');
      const reason = str(body.reason, 500);
      if (!reason) throw new UserError('請填寫原因');
      const t = Date.now();
      await D.db().doc('orders/' + o.no).update({ returnReq: { type, reason, at: t, status: 'pending' }, adminUnread: true, updatedAt: t, msgs: D.FieldValue.arrayUnion({ from: 'customer', name: who, text: `【申請${type === 'return' ? '退貨' : '換貨'}】\n${reason}`, at: t }) });
      return json({ ok: true });
    }

    return json({ error: '不支援的動作' }, 404);
  } catch (e) {
    return fail(e);
  }
}
