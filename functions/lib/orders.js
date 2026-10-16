// 訂單
// orders/{no}：
//   buyer{name,email,phone}, receiver{name,phone,address,store}, uid（會員；訪客是 null）
//   items[], addonItems[]（品名、規格、單價、數量、成本，下單當下的快照）
//   subtotal, discounts[], discountTotal, shipping{id,name,type,fee}, pointsUsed, pointsValue, total, cost, earn
//   payment{id, name, status（unpaid｜paid｜failed｜refunded）, paidAt, transfer}
//   shipStatus（unshipped｜shipped｜arrived｜returned）, trackingNo
//   status（processing 處理中｜preparing 備貨中｜shipped 已出貨｜returning 退換貨｜closed 訂單結案｜cancelled 已取消）
//   msgs[{from:'customer'|'admin', name, text, at}], adminUnread, flagged, returnReq, tags[], note, adminNote, log[]
import * as D from './db.js';
import * as S from './settings.js';
import { quote, context, variantOf } from './pricing.js';
import { UserError, str } from './http.js';

// 舊訂單沒有 kind，用 id 推
export const payKind = (p) => p.kind || ({ card: 'online', atm: 'transfer', cod: 'cod' }[p.id] || 'offline');

export const STATUS = { processing: '處理中', preparing: '備貨中', shipped: '已出貨', returning: '退換貨', closed: '訂單結案', cancelled: '已取消' };
export const PAY = { unpaid: '等待付款', paid: '對帳完成', failed: '付款失敗', refunded: '已退款' };
export const SHIP = { unshipped: '未出貨', shipped: '已出貨', arrived: '已到貨', returned: '已退貨' };

const orderRef = (no) => D.db().doc('orders/' + no);

// 台灣地址：開頭是縣市名稱
const TW = /^(\d{3,6}\s*)?(台|臺)?(北市|北縣|中市|南市|東縣|北|中|南|東)|^(新北|桃園|新竹|苗栗|彰化|南投|雲林|嘉義|屏東|宜蘭|花蓮|基隆|澎湖|金門|連江)/;

function receiverOf(body, shipType, buyer, domesticOnly) {
  const r = body.receiver || {};
  const out = { name: str(r.name, 30) || buyer.name, phone: str(r.phone, 20) || buyer.phone, address: str(r.address, 200), store: str(r.store, 60), zip: str(r.zip, 10) };
  if (shipType === 'home' && !out.address) throw new UserError('請填寫收件地址');
  if (shipType === 'home' && domesticOnly && !TW.test(out.address.replace(/^\s+/, ''))) throw new UserError('目前只寄送台灣地址，請從縣市開始填寫');
  if (shipType === 'cvs' && !out.store) throw new UserError('請填寫取貨門市');
  if (!out.name || !out.phone) throw new UserError('請填寫收件人姓名和電話');
  return out;
}

// 下單：重新試算 → 交易內檢查並扣庫存、扣購物金、記錄優惠碼使用 → 建立訂單
export async function create(body, me) {
  const [shopping, customerSet] = await Promise.all([S.get('shopping'), S.get('customer')]);
  if (!me && !shopping.guestCheckout) throw new UserError('請先登入會員再結帳', 401);
  const cust = me ? await D.one('customers', me.uid) : null;
  if (me && !cust) throw new UserError('請先完成會員資料', 400);
  if (cust?.blacklisted && customerSet.blacklistBlock !== false) throw new UserError('您的帳號暫時無法下單，請聯絡客服', 403);
  if (shopping.terms?.on && !body.agree) throw new UserError('請先勾選同意條款');
  const note = str(body.note, 500);
  if (shopping.noteRequired && !note) throw new UserError('請填寫訂單備註');

  const buyer = me
    ? { name: cust.name, email: cust.email, phone: cust.phone }
    : { name: str(body.buyer?.name, 30), email: str(body.buyer?.email, 80).toLowerCase(), phone: str(body.buyer?.phone, 20) };
  if (!buyer.name || !/^\S+@\S+\.\S+$/.test(buyer.email || '')) throw new UserError('請填寫訂購人姓名和 Email');
  if ((customerSet.fields?.phone || (customerSet.requirePhone ? 'required' : 'optional')) === 'required' && !buyer.phone) throw new UserError('請填寫訂購人手機');

  const ctx = await context();
  const q = await quote({ ...body.cart, strictCoupon: true }, cust, ctx);
  if (!q.lines.length) throw new UserError('購物車是空的');
  if (q.errors.length) throw new UserError(q.errors[0]);
  if (!q.shipping) throw new UserError('請選擇運送方式');
  const pay = q.payments.find((p) => p.id === body.cart?.paymentId);
  if (!pay) throw new UserError('請選擇付款方式');
  const receiver = receiverOf(body, q.shipping.type, buyer, shopping.domesticOnly);
  // 期望到貨日、時段
  const sm = q.shippingMethods.find((m) => m.id === q.shipping.id);
  const want = { date: /^\d{4}-\d{2}-\d{2}$/.test(body.want?.date || '') ? body.want.date : '', time: sm.slots.includes(body.want?.time) ? body.want.time : '' };
  if (sm.wantDate === 'required' && !want.date) throw new UserError('請選擇期望到貨日');
  if (sm.wantTime === 'required' && !want.time) throw new UserError('請選擇期望到貨時段');
  if (want.date) {
    const d0 = new Date(Date.now() + 8 * 3600e3 + sm.prepDays * 86400e3).toISOString().slice(0, 10);
    const d1 = new Date(Date.now() + 8 * 3600e3 + (sm.prepDays + sm.dateRange) * 86400e3).toISOString().slice(0, 10);
    if (want.date < d0 || want.date > d1 || sm.noWeekdays.includes(String(new Date(want.date + 'T00:00:00Z').getUTCDay()))) throw new UserError('這一天不能指定到貨，請重新選擇');
  }
  // 發票
  let invoice = null;
  if (shopping.invoice?.on) {
    const iv = body.invoice || {};
    const type = ['personal', 'company', 'carrier', 'donate'].includes(iv.type) ? iv.type : 'personal';
    invoice = { type, taxId: str(iv.taxId, 8), title: str(iv.title, 60), carrier: str(iv.carrier, 20), donateCode: str(iv.donateCode, 10) };
    if (type === 'company' && (!/^\d{8}$/.test(invoice.taxId) || !invoice.title)) throw new UserError('請填寫正確的統一編號和公司抬頭');
    if (type === 'carrier' && !/^\/[0-9A-Z.+-]{7}$/.test(invoice.carrier.toUpperCase())) throw new UserError('手機條碼載具格式是「/」加 7 碼');
    if (type === 'donate' && !/^\d{3,7}$/.test(invoice.donateCode)) throw new UserError('請填寫捐贈碼');
    if (type === 'carrier') invoice.carrier = invoice.carrier.toUpperCase();
  }

  const all = [...q.lines, ...q.addonLines, ...q.giftLines];
  const t = Date.now();
  const key = D.code(16); // 訪客查訂單用
  const no = await D.db().runTransaction(async (tx) => {
    // 讀：商品、顧客、優惠碼、湊湊團
    const pids = [...new Set(all.map((l) => l.pid))];
    const pdocs = await Promise.all(pids.map((id) => tx.get(D.db().doc('products/' + id))));
    const pmap = new Map(pdocs.map((d) => [d.id, d.data()]));
    const custDoc = me ? await tx.get(D.db().doc('customers/' + me.uid)) : null;
    const couponDisc = q.coupon?.ok ? await tx.get(D.db().doc('discounts/' + q.coupon.id)) : null;
    const gbs = ctx.groupbuys.filter((g) => D.active(g) && pids.includes(g.pid));
    let no;
    for (let i = 0; i < 5; i++) { no = D.code(8, 'W'); if (!(await tx.get(orderRef(no))).exists) break; }

    // 扣庫存
    for (const l of all) {
      const p = pmap.get(l.pid);
      const v = p && variantOf(p, l.vkey);
      if (!v || v.stock < l.qty) throw new UserError(`${l.name} 庫存不足，請重新整理購物車`, 409);
      v.stock -= l.qty;
      p.sold = (p.sold || 0) + l.qty;
    }
    for (const [id, p] of pmap) tx.update(D.db().doc('products/' + id), { variants: p.variants, stock: p.variants.reduce((a, v) => a + (v.stock || 0), 0), sold: p.sold, updatedAt: t });
    for (const g of gbs) tx.update(D.db().doc('groupbuys/' + g.id), { sold: D.FieldValue.increment(all.filter((l) => l.pid === g.pid && !l.addon).reduce((a, l) => a + l.qty, 0)) });

    // 優惠碼、購物金
    if (couponDisc) {
      const d = couponDisc.data();
      if (d.limit && (d.used || 0) >= d.limit) throw new UserError('優惠碼剛剛被用完了', 409);
      tx.update(couponDisc.ref, { used: (d.used || 0) + 1 });
    }
    if (custDoc) {
      const c = custDoc.data();
      if (q.points.used > (c.points || 0)) throw new UserError('購物金餘額不足，請重新整理', 409);
      const patch = {};
      if (q.points.used) {
        patch.points = (c.points || 0) - q.points.used;
        patch.pointsLog = [{ at: t, change: -q.points.used, note: `訂單 ${no} 折抵` }, ...(c.pointsLog || [])].slice(0, 100);
      }
      if (couponDisc && couponDisc.data().once) patch.coupons = [...(c.coupons || []), couponDisc.id];
      if (body.saveAddress) patch.address = { ...receiver };
      if (Object.keys(patch).length) tx.update(custDoc.ref, patch);
    }

    const snap = (l) => ({ pid: l.pid, vkey: l.vkey, name: l.name, spec: l.spec, sku: l.sku, img: l.img, price: l.price, listPrice: l.listPrice || 0, qty: l.qty, amount: l.amount, cost: l.cost || 0, notes: l.notes || [] });
    tx.set(orderRef(no), {
      no, key, uid: me?.uid || null, buyer, receiver,
      items: q.lines.map(snap), addonItems: [...q.addonLines.map(snap), ...q.giftLines.map((l) => ({ ...snap(l), gift: true }))],
      subtotal: q.subtotal, discounts: q.discounts, discountTotal: q.discountTotal,
      shipping: { id: q.shipping.id, name: q.shipping.name, type: q.shipping.type, fee: q.shipping.fee },
      pointsUsed: q.points.used, pointsValue: q.points.value, total: q.total,
      cost: all.reduce((a, l) => a + (l.cost || 0) * l.qty, 0),
      earn: q.earn, earnRules: q.earnRules, earned: false, couponId: q.coupon?.ok ? q.coupon.id : null,
      want, invoice,
      payment: { id: pay.id, name: pay.name, kind: pay.kind, status: q.total === 0 ? 'paid' : 'unpaid', paidAt: q.total === 0 ? t : null, transfer: '' },
      shipStatus: 'unshipped', trackingNo: '', status: 'processing',
      note, adminNote: '', tags: [], msgs: [], adminUnread: false, flagged: false, returnReq: null,
      log: [{ at: t, by: '顧客', text: '建立訂單' }],
      createdAt: t, updatedAt: t,
    });
    return no;
  });
  D.bust('products', 'groupbuys', 'discounts');
  if (me) await refreshCustomer(me.uid);
  return { no, key };
}

// 後台改狀態：status／payment／shipStatus／trackingNo／adminNote／tags／flagged
export async function update(no, patch, by) {
  const ref = orderRef(no);
  const t = Date.now();
  const res = await D.db().runTransaction(async (tx) => {
    const d = await tx.get(ref);
    if (!d.exists) throw new UserError('找不到訂單', 404);
    const o = d.data();
    const set = { updatedAt: t };
    const log = [];
    if (patch.status && patch.status !== o.status) {
      if (!STATUS[patch.status]) throw new UserError('狀態不正確');
      if (o.status === 'cancelled') throw new UserError('已取消的訂單不能再改狀態');
      set.status = patch.status;
      log.push(`訂單狀態：${STATUS[o.status]} → ${STATUS[patch.status]}`);
      if (patch.status === 'shipped' && o.shipStatus === 'unshipped') { set.shipStatus = 'shipped'; set.shippedAt = t; }
      if (patch.status === 'returning' && o.returnReq?.status === 'pending') set['returnReq.status'] = 'accepted';
    }
    if (patch.payStatus && patch.payStatus !== o.payment.status) {
      if (!PAY[patch.payStatus]) throw new UserError('帳款狀態不正確');
      set['payment.status'] = patch.payStatus;
      if (patch.payStatus === 'paid') set['payment.paidAt'] = t;
      log.push(`帳款狀態：${PAY[o.payment.status]} → ${PAY[patch.payStatus]}`);
    }
    if (patch.shipStatus && patch.shipStatus !== o.shipStatus) {
      if (!SHIP[patch.shipStatus]) throw new UserError('運送狀態不正確');
      set.shipStatus = patch.shipStatus;
      if (patch.shipStatus === 'shipped') set.shippedAt = t;
      log.push(`運送狀態：${SHIP[o.shipStatus]} → ${SHIP[patch.shipStatus]}`);
    }
    if (patch.trackingNo !== undefined && patch.trackingNo !== o.trackingNo) { set.trackingNo = str(patch.trackingNo, 40); log.push(`物流編號：${set.trackingNo || '（清除）'}`); }
    if (patch.adminNote !== undefined) set.adminNote = str(patch.adminNote, 1000);
    if (patch.tags !== undefined) set.tags = (patch.tags || []).map((x) => str(x, 20)).filter(Boolean).slice(0, 10);
    if (patch.flagged !== undefined) set.flagged = !!patch.flagged;
    if (log.length) set.log = [...log.map((text) => ({ at: t, by, text })), ...(o.log || [])].slice(0, 100);
    tx.update(ref, set);
    return { o, set };
  });
  const after = { ...res.o, ...res.set, payment: { ...res.o.payment, status: res.set['payment.status'] || res.o.payment.status } };
  // 結案：發購物金
  if (after.status === 'closed' && !res.o.earned && after.earn > 0 && after.uid && after.payment.status === 'paid') await givePoints(after.uid, after.earn, `訂單 ${no} 回饋`, no);
  if (res.o.uid) await refreshCustomer(res.o.uid);
  return get(no);
}

// 取消：加回庫存（看設定）、退回購物金、優惠碼次數
export async function cancel(no, by, reason = '') {
  const shopping = await S.get('shopping');
  const t = Date.now();
  const o = await D.db().runTransaction(async (tx) => {
    const ref = orderRef(no);
    const d = await tx.get(ref);
    if (!d.exists) throw new UserError('找不到訂單', 404);
    const o = d.data();
    if (o.status === 'cancelled') throw new UserError('訂單已經取消了');
    if (['shipped', 'closed'].includes(o.status) && by === '顧客') throw new UserError('訂單已出貨，不能取消');
    const lines = [...o.items, ...(o.addonItems || [])];
    const pdocs = shopping.restockOnCancel ? await Promise.all([...new Set(lines.map((l) => l.pid))].map((id) => tx.get(D.db().doc('products/' + id)))) : [];
    const custDoc = o.uid && o.pointsUsed ? await tx.get(D.db().doc('customers/' + o.uid)) : null;
    for (const pd of pdocs) {
      if (!pd.exists) continue;
      const p = pd.data();
      for (const l of lines.filter((x) => x.pid === pd.id)) {
        const v = variantOf(p, l.vkey);
        if (v) v.stock += l.qty;
        p.sold = Math.max(0, (p.sold || 0) - l.qty);
      }
      tx.update(pd.ref, { variants: p.variants, stock: p.variants.reduce((a, v) => a + (v.stock || 0), 0), sold: p.sold, updatedAt: t });
    }
    if (custDoc?.exists) {
      const c = custDoc.data();
      tx.update(custDoc.ref, { points: (c.points || 0) + o.pointsUsed, pointsLog: [{ at: t, change: o.pointsUsed, note: `訂單 ${no} 取消，退回購物金` }, ...(c.pointsLog || [])].slice(0, 100) });
    }
    if (o.couponId) tx.update(D.db().doc('discounts/' + o.couponId), { used: D.FieldValue.increment(-1) });
    const set = { status: 'cancelled', updatedAt: t, cancelledAt: t, log: [{ at: t, by, text: '取消訂單' + (reason ? `：${reason}` : '') }, ...(o.log || [])].slice(0, 100) };
    if (o.payment.status === 'paid') set['payment.status'] = 'refunded';
    tx.update(ref, set);
    return o;
  });
  D.bust('products', 'discounts');
  if (o.uid) await refreshCustomer(o.uid);
  return get(no);
}

export async function get(no) {
  const d = await orderRef(no).get();
  return d.exists ? d.data() : null;
}

// 訂單問答
export async function addMessage(no, from, name, text) {
  text = str(text, 1000);
  if (!text) throw new UserError('請輸入訊息');
  const ref = orderRef(no);
  const t = Date.now();
  await ref.update({
    msgs: D.FieldValue.arrayUnion({ from, name, text, at: t }),
    adminUnread: from === 'customer',
    customerUnread: from === 'admin',
    lastMsgAt: t,
    updatedAt: t,
  });
  return get(no);
}

/* ---------- 顧客：購物金、消費統計、群組升級 ---------- */
export async function givePoints(uid, points, note, orderNo) {
  const ref = D.db().doc('customers/' + uid);
  const t = Date.now();
  await D.db().runTransaction(async (tx) => {
    const c = await tx.get(ref);
    if (!c.exists) return;
    const d = c.data();
    tx.update(ref, { points: Math.max(0, (d.points || 0) + points), pointsLog: [{ at: t, change: points, note }, ...(d.pointsLog || [])].slice(0, 100) });
    if (orderNo) tx.update(orderRef(orderNo), { earned: true });
  });
}

// 重新計算顧客的消費統計，並檢查會員群組升級／續會／到期
export async function refreshCustomer(uid) {
  const [snap, groups] = await Promise.all([D.db().collection('orders').where('uid', '==', uid).get(), D.groups()]);
  const orders = snap.docs.map((d) => d.data()).filter((o) => o.status !== 'cancelled');
  const paid = orders.filter((o) => o.payment.status === 'paid');
  const stats = {
    orders: orders.length,
    spent: paid.reduce((a, o) => a + o.total, 0),
    firstOrderAt: orders.length ? Math.min(...orders.map((o) => o.createdAt)) : null,
    lastOrderAt: orders.length ? Math.max(...orders.map((o) => o.createdAt)) : null,
  };
  const ref = D.db().doc('customers/' + uid);
  const c = (await ref.get()).data();
  if (!c) return;
  const patch = { stats };

  const now = Date.now();
  const meets = (conds) => (conds || []).some((r) => {
    const since = now - (r.months || 12) * 30.4 * 86400e3;
    const inRange = paid.filter((o) => o.createdAt >= since);
    return r.type === 'single' ? inRange.some((o) => o.total >= r.amount) : inRange.reduce((a, o) => a + o.total, 0) >= r.amount;
  });
  const ranked = groups.filter((g) => g.on).sort((a, b) => (a.order || 0) - (b.order || 0));
  const rank = (id) => ranked.findIndex((g) => g.id === id);
  let groupId = c.groupId || null;
  let until = c.groupUntil || null;
  // 到期：符合續會資格就延長，不然回到一般會員
  if (groupId && !c.groupManual && until && until < now) {
    const g = ranked.find((x) => x.id === groupId);
    if (g && meets(g.renew)) until = now + g.months * 30.4 * 86400e3;
    else { groupId = null; until = null; }
  }
  // 升級：符合條件的最高等級
  if (!c.groupManual) {
    for (const g of [...ranked].reverse()) {
      if (!g.upgrade?.length) continue;
      if (rank(g.id) <= rank(groupId)) break;
      if (meets(g.upgrade)) { groupId = g.id; until = g.months ? now + g.months * 30.4 * 86400e3 : null; break; }
    }
  }
  if (groupId !== (c.groupId || null)) { patch.groupId = groupId; patch.groupUntil = until; }
  else if (until !== (c.groupUntil || null)) patch.groupUntil = until;
  await ref.update(patch);
}

// 定時：轉帳太久沒付款自動取消
export async function cancelStale() {
  const shopping = await S.get('shopping');
  if (!shopping.unpaidCancelDays) return 0;
  const before = Date.now() - shopping.unpaidCancelDays * 86400e3;
  const snap = await D.db().collection('orders').where('status', '==', 'processing').get();
  let n = 0;
  for (const d of snap.docs) {
    const o = d.data();
    if (o.payment.status === 'unpaid' && ['transfer', 'online'].includes(payKind(o.payment)) && o.createdAt < before) {
      await cancel(o.no, '系統', `超過 ${shopping.unpaidCancelDays} 天未付款`).catch(console.error);
      n++;
    }
  }
  return n;
}
