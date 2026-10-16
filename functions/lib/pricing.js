// 價格試算：前台購物車、結帳、後台「AI 試算」共用同一套邏輯，結帳時伺服器一定重算一次
//
// 折扣（discounts/{id}）共用欄位：name, on, start, end, priority（數字小的先算）, groups[]（空＝所有人；'guest'＝未登入）
//   product   商品折扣：tags[]（空＝全部商品）, percent（打幾折的折扣％，例如 10＝九折）
//   order     滿額折扣：threshold（滿多少）, mode（amount｜percent）, amount／percent
//   coupon    優惠碼：code, threshold, mode, amount／percent, limit（總次數，0＝不限）, used, once（每人一次）
//   freeShip  免運：threshold, shippingIds[]（空＝全部運送方式）
//   points    購物金：trigger（spend｜birthday｜signup）, threshold, mode（amount｜percent）, amount／percent, expireDays
//   tagOrder  商品滿額折扣：tags[] 的商品，unit（qty 件數｜amount 金額）達 threshold，折 mode amount／percent
//   bundle    商品選選樂：tags[] 的商品任選 count 件 price 元（可以重複湊組）
//   gift      滿額贈：訂單滿 threshold 送 giftPid／giftVkey × giftQty（送完為止）
import * as D from './db.js';
import * as S from './settings.js';

const round = (n) => Math.round(n);
const inGroup = (d, cust) => !d.groups?.length || d.groups.includes(cust ? cust.groupId || 'member' : 'guest');
// 商品瀏覽權限：viewGroups 空＝所有人都看得到
export const canSee = (p, cust) => !p.viewGroups?.length || p.viewGroups.includes(cust ? cust.groupId || 'member' : 'guest');
const inRange = (m, amount) => (!m.min || amount >= m.min) && (!m.max || amount <= m.max);

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
    if (!p || !p.on || !v || !canSee(p, cust)) { lines.push({ pid: it.pid, vkey: it.vkey || '', qty, name: p?.name || '已下架的商品', error: '商品已下架', amount: 0 }); errors.push(`${p?.name || '有商品'}已下架，請從購物車移除`); continue; }
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
  const tagged = (d) => lines.filter((l) => !l.error && (!d.tags?.length || d.tags.some((t) => (ctx.byId.get(l.pid)?.tags || []).includes(t))));
  // 商品選選樂：符合的商品一件一件攤開，貴的先湊，每 count 件算 price 元
  for (const d of ctx.discounts.filter((x) => x.type === 'bundle' && D.active(x) && inGroup(x, cust) && x.count > 1)) {
    const units = tagged(d).flatMap((l) => Array(l.qty).fill(l.price)).sort((a, b) => b - a);
    const sets = Math.floor(units.length / d.count);
    if (!sets) continue;
    const off = Math.min(running, units.slice(0, sets * d.count).reduce((a, x) => a + x, 0) - sets * (d.price || 0));
    if (off > 0) { discounts.push({ id: d.id, name: `${d.name}（${sets} 組）`, amount: off }); running -= off; }
  }
  // 商品滿額折扣：指定標籤的商品達到件數或金額
  for (const d of ctx.discounts.filter((x) => x.type === 'tagOrder' && D.active(x) && inGroup(x, cust)).sort((a, b) => (a.priority || 0) - (b.priority || 0))) {
    const ls = tagged(d);
    const base = ls.reduce((a, l) => a + l.amount, 0);
    const reach = d.unit === 'qty' ? ls.reduce((a, l) => a + l.qty, 0) : base;
    if (!ls.length || reach < (d.threshold || 0)) continue;
    const off = Math.min(running, base, d.mode === 'percent' ? round(base * (d.percent || 0) / 100) : d.amount || 0);
    if (off > 0) { discounts.push({ id: d.id, name: d.name, amount: off }); running -= off; }
  }
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
  // 運送方式：每個商品的「適用物流」取交集，再看訂單金額限制
  const allowed = [...lines, ...addonLines].map((l) => ctx.byId.get(l.pid)?.shipIds).filter((x) => x?.length);
  const methods = ctx.shipping.methods.filter((m) => m.on && allowed.every((ids) => ids.includes(m.id)) && inRange(m, subtotal));
  const ship = methods.find((m) => m.id === cart.shippingId) || null;
  if (cart.shippingId && !ship && cart.strictCoupon) errors.push('這個運送方式不適用購物車裡的商品或金額，請重新選擇');
  if (!methods.length && lines.length) errors.push('購物車裡的商品沒有共同的運送方式，請分開下單');
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

  // 滿額贈：贈品庫存不夠就不送；顯示還差多少可以拿贈品
  const giftLines = [];
  const giftHints = [];
  for (const d of ctx.discounts.filter((x) => x.type === 'gift' && D.active(x) && inGroup(x, cust))) {
    const p = ctx.byId.get(d.giftPid);
    const v = p && variantOf(p, d.giftVkey || p.variants?.[0]?.key);
    const qty = Math.max(1, d.giftQty || 1);
    if (!p || !v || v.stock < qty) continue;
    if (subtotal >= (d.threshold || 0)) giftLines.push({ pid: p.id, vkey: v.key, qty, name: p.name, spec: specLabel(p, v), sku: v.sku || p.sku || '', img: v.img || p.images?.[0] || '', price: 0, listPrice: v.price ?? p.price, amount: 0, cost: v.cost ?? p.cost ?? 0, gift: true, notes: [d.name] });
    else giftHints.push({ name: d.name, gap: d.threshold - subtotal, gift: p.name });
  }

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
  const kindOf = (m) => m.kind || ({ card: 'online', atm: 'transfer', cod: 'cod' }[m.id] || 'offline');
  const payments = ctx.payment.methods.filter((m) => m.on && (kindOf(m) !== 'cod' || !ship || ship.cod) && inRange(m, total) && !(ship && m.excludeShip?.includes(ship.id))).map((m) => ({ ...m, kind: kindOf(m) }));

  return {
    lines, addonLines, giftLines, giftHints, offers, subtotal, discounts, coupon,
    discountTotal: discounts.reduce((a, d) => a + d.amount, 0),
    shipping, shippingMethods: methods.map(({ id, name, type, fee, freeOver, cod, desc, wantDate, prepDays, dateRange, noWeekdays, wantTime, slots }) => ({ id, name, type, fee, freeOver, cod, desc: desc || '', wantDate: wantDate || 'off', prepDays: prepDays ?? 1, dateRange: dateRange || 14, noWeekdays: noWeekdays || [], wantTime: wantTime || 'off', slots: slots || [] })),
    payments: payments.map(({ id, name, note, kind }) => ({ id, name, note, kind })),
    points: { available, max: maxPoints, used: usedPoints, value: pointsValue, rate },
    earn, earnRules, total, errors,
  };
}
