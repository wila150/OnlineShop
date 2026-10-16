// 價格試算：前台購物車、結帳、後台「AI 試算」共用同一套邏輯，結帳時伺服器一定重算一次
//
// 折扣（discounts/{id}）共用欄位：name, on, start, end, priority（數字小的先算）, groups[]（空＝所有人；'guest'＝未登入）
//   product   商品折扣：tags[]（空＝全部商品）, percent（打幾折的折扣％，例如 10＝九折）
//   order     滿額折扣：threshold（滿多少）, mode（amount｜percent）, amount／percent
//   coupon    優惠碼：code, threshold, mode, amount／percent, limit（總次數，0＝不限）, used, once（每人一次）
//   freeShip  免運：threshold, shippingIds[]（空＝全部運送方式）
//   points    購物金：trigger（spend｜birthday｜signup）, threshold, mode（amount｜percent）, amount／percent, expireDays
import * as D from './db.js';
import * as S from './settings.js';

const round = (n) => Math.round(n);
const inGroup = (d, cust) => !d.groups?.length || d.groups.includes(cust ? cust.groupId || 'member' : 'guest');

export function variantOf(p, vkey) {
  return (p.variants || []).find((v) => v.key === (vkey || '')) || null;
}

export function specLabel(p, v) {
  if (!v || !p.specs?.length) return '';
  return p.specs.map((s, i) => `${s.name}：${v.opts?.[i] ?? ''}`).join('／');
}

// 湊湊團目前價：依活動期間的累計銷量，取已達到的最高階
export function groupbuyPrice(gb) {
  const tiers = [...(gb.tiers || [])].sort((a, b) => a.qty - b.qty);
  let price = null;
  for (const t of tiers) if ((gb.sold || 0) >= t.qty) price = t.price;
  return price;
}

// 單一商品給這位顧客的單價（列表頁、商品頁也用這個顯示）
export function unitPrice(p, v, cust, ctx) {
  const base = v?.price ?? p.price;
  let price = base;
  const notes = [];
  const gb = ctx.groupbuys.find((g) => g.pid === p.id && D.active(g));
  if (gb) {
    const gp = groupbuyPrice(gb);
    if (gp != null && gp < price) { price = gp; notes.push(gb.name || '湊湊團'); }
  }
  // 商品折扣取折最多的一個
  let best = null;
  for (const d of ctx.discounts) {
    if (d.type !== 'product' || !D.active(d) || !inGroup(d, cust)) continue;
    if (d.tags?.length && !d.tags.some((t) => (p.tags || []).includes(t))) continue;
    if (!best || d.percent > best.percent) best = d;
  }
  if (best && best.percent > 0) {
    const dp = round(price * (100 - best.percent) / 100);
    if (dp < price) { price = dp; notes.push(best.name); }
  }
  return { price, listPrice: v?.listPrice || p.listPrice || (price < base ? base : 0), notes };
}

export async function context() {
  const [products, discounts, addons, groupbuys, shopping, shipping, payment, customerSet] = await Promise.all([
    D.products(), D.discounts(), D.addons(), D.groupbuys(), S.get('shopping'), S.get('shipping'), S.get('payment'), S.get('customer'),
  ]);
  return { products, byId: new Map(products.map((p) => [p.id, p])), discounts, addons, groupbuys, shopping, shipping, payment, customerSet };
}

// cart: { items:[{pid, vkey, qty}], addons:[{zone, pid, vkey, qty}], coupon, points, shippingId, paymentId }
// cust: customers/{uid} 文件（沒登入是 null）
export async function quote(cart, cust, ctx) {
  ctx ||= await context();
  const errors = [];
  const lines = [];
  for (const it of (cart.items || []).slice(0, 100)) {
    const p = ctx.byId.get(it.pid);
    const v = p && variantOf(p, it.vkey);
    const qty = Math.max(1, Math.min(999, Math.round(Number(it.qty) || 1)));
    if (!p || !p.on || !v) { lines.push({ pid: it.pid, vkey: it.vkey || '', qty, name: p?.name || '已下架的商品', error: '商品已下架', amount: 0 }); errors.push(`${p?.name || '有商品'}已下架，請從購物車移除`); continue; }
    const { price, listPrice, notes } = unitPrice(p, v, cust, ctx);
    const line = { pid: p.id, vkey: v.key, qty, name: p.name, spec: specLabel(p, v), sku: v.sku || p.sku || '', img: v.img || p.images?.[0] || '', price, listPrice, notes, stock: v.stock, amount: price * qty, cost: v.cost ?? p.cost ?? 0 };
    if (v.stock < qty) { line.error = v.stock > 0 ? `庫存只剩 ${v.stock} 件` : '已售完'; errors.push(`${p.name}${line.spec ? '（' + line.spec + '）' : ''}${line.error}`); }
    lines.push(line);
  }
  const goods = lines.reduce((a, l) => a + l.amount, 0);

  // 購物車加購區：要有買一般商品才能加購
  const zones = ctx.addons.filter((z) => D.active(z));
  const addonLines = [];
  for (const it of (cart.addons || []).slice(0, 30)) {
    const z = zones.find((x) => x.id === it.zone);
    const offer = z?.items?.find((x) => x.pid === it.pid);
    const p = ctx.byId.get(it.pid);
    const v = p && variantOf(p, it.vkey);
    const qty = Math.max(1, Math.min(offer?.limit || 99, Math.round(Number(it.qty) || 1)));
    if (!z || !offer || !p || !v || !p.on) { errors.push('加購優惠已結束，請從購物車移除'); addonLines.push({ zone: it.zone, pid: it.pid, vkey: it.vkey || '', qty, name: p?.name || '加購商品', error: '加購已結束', amount: 0 }); continue; }
    const line = { zone: z.id, pid: p.id, vkey: v.key, qty, name: p.name, spec: specLabel(p, v), sku: v.sku || p.sku || '', img: v.img || p.images?.[0] || '', price: offer.price, listPrice: v.price ?? p.price, stock: v.stock, amount: offer.price * qty, cost: v.cost ?? p.cost ?? 0, addon: true };
    if (!goods) { line.error = '要先買一般商品才能加購'; errors.push(line.error); }
    if (v.stock < qty) { line.error = v.stock > 0 ? `庫存只剩 ${v.stock} 件` : '已售完'; errors.push(`加購 ${p.name}${line.error}`); }
    addonLines.push(line);
  }
  const subtotal = goods + addonLines.reduce((a, l) => a + l.amount, 0);

  // 滿額折扣、優惠碼
  const discounts = [];
  let running = subtotal;
  const orderRules = ctx.discounts.filter((d) => d.type === 'order' && D.active(d) && inGroup(d, cust)).sort((a, b) => (a.priority || 0) - (b.priority || 0));
  for (const d of orderRules) {
    if (subtotal < (d.threshold || 0)) continue;
    const off = Math.min(running, d.mode === 'percent' ? round(running * (d.percent || 0) / 100) : d.amount || 0);
    if (off > 0) { discounts.push({ id: d.id, name: d.name, amount: off }); running -= off; }
  }
  let coupon = null;
  if (cart.coupon) {
    const c = String(cart.coupon).trim().toUpperCase();
    const d = ctx.discounts.find((x) => x.type === 'coupon' && String(x.code || '').toUpperCase() === c);
    if (!d || !D.active(d)) coupon = { code: c, ok: false, msg: '優惠碼不存在或已過期' };
    else if (!inGroup(d, cust)) coupon = { code: c, ok: false, msg: cust ? '您的會員等級不能使用這個優惠碼' : '請先登入會員再使用這個優惠碼' };
    else if (d.limit && (d.used || 0) >= d.limit) coupon = { code: c, ok: false, msg: '優惠碼已被用完' };
    else if (d.once && cust && (cust.coupons || []).includes(d.id)) coupon = { code: c, ok: false, msg: '這個優惠碼您已經用過了' };
    else if (subtotal < (d.threshold || 0)) coupon = { code: c, ok: false, msg: `滿 $${d.threshold} 才能使用，還差 $${d.threshold - subtotal}` };
    else {
      const off = Math.min(running, d.mode === 'percent' ? round(running * (d.percent || 0) / 100) : d.amount || 0);
      coupon = { code: c, ok: true, id: d.id, name: d.name, amount: off, msg: `已折抵 $${off}` };
      if (off > 0) { discounts.push({ id: d.id, name: `優惠碼 ${c}`, amount: off, coupon: true }); running -= off; }
    }
    if (!coupon.ok && cart.strictCoupon) errors.push(coupon.msg);
  }

  // 運送方式與運費
  const methods = ctx.shipping.methods.filter((m) => m.on);
  const ship = methods.find((m) => m.id === cart.shippingId) || null;
  let shipping = null;
  if (ship) {
    let fee = ship.fee || 0;
    let free = '';
    if (ship.freeOver && running >= ship.freeOver) { fee = 0; free = `滿 $${ship.freeOver} 免運`; }
    for (const d of ctx.discounts) {
      if (fee === 0) break;
      if (d.type !== 'freeShip' || !D.active(d) || !inGroup(d, cust)) continue;
      if (d.shippingIds?.length && !d.shippingIds.includes(ship.id)) continue;
      if (running >= (d.threshold || 0)) { fee = 0; free = d.name; }
    }
    shipping = { id: ship.id, name: ship.name, type: ship.type, fee, free, fullFee: ship.fee || 0 };
    // 還差多少免運（給購物車提示）
    if (fee > 0 && ship.freeOver) shipping.gap = ship.freeOver - running;
  }

  // 購物金折抵
  const rate = ctx.shopping.pointsRate || 1;
  const available = cust ? Math.floor(cust.points || 0) : 0;
  const maxValue = Math.floor(running * (ctx.shopping.pointsMaxPercent ?? 100) / 100);
  const maxPoints = Math.min(available, Math.floor(maxValue / rate));
  const usedPoints = Math.max(0, Math.min(maxPoints, Math.floor(Number(cart.points) || 0)));
  const pointsValue = usedPoints * rate;
  running -= pointsValue;

  const total = Math.max(0, running + (shipping?.fee || 0));

  // 這筆訂單會得到的購物金（滿額贈送）
  let earn = 0;
  const earnRules = [];
  for (const d of ctx.discounts) {
    if (d.type !== 'points' || d.trigger !== 'spend' || !D.active(d) || !cust || !inGroup(d, cust)) continue;
    if (running < (d.threshold || 0)) continue;
    const pts = d.mode === 'percent' ? Math.floor(running * (d.percent || 0) / 100) : d.amount || 0;
    if (pts > 0) { earn += pts; earnRules.push({ id: d.id, name: d.name, points: pts, expireDays: d.expireDays || 0 }); }
  }

  // 可以加購的商品（購物車頁顯示）
  const offers = zones.flatMap((z) => (z.items || []).map((o) => {
    const p = ctx.byId.get(o.pid);
    if (!p || !p.on) return null;
    return { zone: z.id, zoneName: z.name, pid: p.id, name: p.name, img: p.images?.[0] || '', price: o.price, listPrice: p.price, limit: o.limit || 0, specs: p.specs || [], variants: (p.variants || []).map((v) => ({ key: v.key, opts: v.opts, stock: v.stock })) };
  }).filter(Boolean));

  // 付款方式：貨到付款要看運送方式支不支援
  const payments = ctx.payment.methods.filter((m) => m.on && (m.id !== 'cod' || !ship || ship.cod));

  return {
    lines, addonLines, offers, subtotal, discounts, coupon,
    discountTotal: discounts.reduce((a, d) => a + d.amount, 0),
    shipping, shippingMethods: methods.map(({ id, name, type, fee, freeOver, cod }) => ({ id, name, type, fee, freeOver, cod })),
    payments: payments.map(({ id, name, note }) => ({ id, name, note })),
    points: { available, max: maxPoints, used: usedPoints, value: pointsValue, rate },
    earn, earnRules, total, errors,
  };
}
