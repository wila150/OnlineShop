// 顧客：註冊、特約代碼、分眾、購物金活動
import * as D from './db.js';
import * as S from './settings.js';
import { UserError, str } from './http.js';
import { givePoints } from './orders.js';

const DAY = 86400e3;

// 特約代碼：註冊時填的代碼或 Email 符合條件，就直接指派到群組
async function codeGroup(email, code) {
  const codes = await D.all('codes');
  for (const c of codes) {
    if (!c.groupId) continue;
    const v = String(c.value || '').toLowerCase();
    const target = c.field === 'email' ? email : String(code || '').trim().toLowerCase();
    if (!v || !target) continue;
    if (c.op === 'endsWith' ? target.endsWith(v) : target === v) return c.groupId;
  }
  return null;
}

// 第一次登入後補填會員資料（也用在修改會員資料）
export async function saveProfile(me, body) {
  const set = await S.get('customer');
  const ref = D.db().doc('customers/' + me.uid);
  const cur = (await ref.get()).data();
  const name = str(body.name, 30);
  const phone = str(body.phone, 20);
  const birthday = /^\d{4}-\d{2}-\d{2}$/.test(body.birthday || '') ? body.birthday : '';
  if (!name) throw new UserError('請填寫姓名');
  if (set.requirePhone && !phone) throw new UserError('請填寫手機號碼');
  if (set.requireBirthday && !birthday && !cur?.birthday) throw new UserError('請填寫生日');
  const t = Date.now();
  if (!cur) {
    const groupId = await codeGroup(me.email, body.code);
    const doc = {
      uid: me.uid, email: me.email, name, phone, birthday, gender: str(body.gender, 10),
      groupId, groupUntil: null, groupManual: !!groupId, points: 0, pointsLog: [], wishlist: [], coupons: [],
      blacklisted: false, note: '', tags: [], address: null, newsletter: !!body.newsletter,
      stats: { orders: 0, spent: 0, firstOrderAt: null, lastOrderAt: null },
      createdAt: t, source: groupId ? '特約代碼' : '',
    };
    await ref.set(doc);
    // 會員加入送購物金
    for (const d of (await D.discounts()).filter((x) => x.type === 'points' && x.trigger === 'signup' && D.active(x))) {
      if (d.amount > 0) await givePoints(me.uid, d.amount, d.name || '加入會員禮');
    }
  } else {
    const patch = { name, phone, gender: str(body.gender, 10), newsletter: !!body.newsletter };
    if (birthday && (!cur.birthday || !set.lockBirthday)) patch.birthday = birthday;
    if (body.address) patch.address = { name: str(body.address.name, 30), phone: str(body.address.phone, 20), address: str(body.address.address, 200), zip: str(body.address.zip, 10) };
    await ref.update(patch);
  }
  return (await ref.get()).data();
}

/* ---------- 分眾 ---------- */
export function segmentsOf(customers) {
  const now = Date.now();
  const days = (t) => (t ? (now - t) / DAY : Infinity);
  const seg = {
    core: { name: '核心顧客', desc: '90 天內有消費，且累計 3 筆以上訂單', list: [] },
    growth: { name: '成長顧客', desc: '180 天內有消費，還不是核心顧客', list: [] },
    lost: { name: '流失顧客', desc: '超過 180 天沒有消費', list: [] },
    once: { name: '僅消費一次顧客', desc: '只下過一筆訂單', list: [] },
    none: { name: '註冊未消費顧客', desc: '註冊後還沒下過單', list: [] },
    year: { name: '近一年有消費顧客', desc: '365 天內有訂單', list: [] },
    half: { name: '近半年有消費顧客', desc: '180 天內有訂單', list: [] },
  };
  for (const c of customers) {
    const s = c.stats || {};
    const r = days(s.lastOrderAt);
    if (s.orders) {
      if (r <= 90 && s.orders >= 3) seg.core.list.push(c);
      else if (r <= 180) seg.growth.list.push(c);
      else seg.lost.list.push(c);
    }
    if (s.orders === 1) seg.once.list.push(c);
    if (!s.orders) seg.none.list.push(c);
    if (r <= 365) seg.year.list.push(c);
    if (r <= 180) seg.half.list.push(c);
  }
  return seg;
}

/* ---------- CSV ---------- */
const esc = (v) => {
  const s = String(v ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export const csv = (rows) => '﻿' + rows.map((r) => r.map(esc).join(',')).join('\r\n');

export function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  text = text.replace(/^﻿/, '');
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((c) => c.trim()));
}

export function customerRows(list, groups) {
  const gname = (id) => groups.find((g) => g.id === id)?.name || '一般會員';
  const d = (t) => (t ? D.twDate(t) : '');
  return [
    ['姓名', 'Email', '手機', '生日', '顧客群組', '使用期限', '購物金', '訂單數', '累計消費', '最近消費', '註冊日期', '黑名單', '備註'],
    ...list.map((c) => [c.name, c.email, c.phone, c.birthday, gname(c.groupId), d(c.groupUntil), c.points || 0, c.stats?.orders || 0, c.stats?.spent || 0, d(c.stats?.lastOrderAt), d(c.createdAt), c.blacklisted ? '是' : '', c.note]),
  ];
}

// 匯入顧客：沒有帳號的人先建「待認領」資料，之後用同一個 Email 註冊就會接上
export async function importRows(rows, groups) {
  const [head, ...body] = rows;
  const col = (name) => head.findIndex((h) => h.trim() === name);
  const iName = col('姓名'), iEmail = col('Email'), iPhone = col('手機'), iBirth = col('生日'), iGroup = col('顧客群組'), iPoints = col('購物金');
  if (iEmail < 0) throw new UserError('第一列要有「Email」欄位');
  const existing = new Set((await D.all('customers')).map((c) => c.email));
  let added = 0, skipped = 0;
  const batch = D.db().batch();
  for (const r of body.slice(0, 2000)) {
    const email = str(r[iEmail], 80).toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email) || existing.has(email)) { skipped++; continue; }
    existing.add(email);
    const g = groups.find((x) => x.name === str(r[iGroup]));
    batch.set(D.db().doc('customers/pending_' + D.code(12)), {
      uid: null, pending: true, email, name: str(r[iName], 30), phone: str(r[iPhone], 20), birthday: /^\d{4}-\d{2}-\d{2}$/.test(r[iBirth] || '') ? r[iBirth] : '',
      groupId: g?.id || null, groupUntil: null, groupManual: !!g, points: Math.max(0, Math.round(Number(r[iPoints]) || 0)), pointsLog: [], wishlist: [], coupons: [],
      blacklisted: false, note: '匯入', tags: [], stats: { orders: 0, spent: 0 }, createdAt: Date.now(), source: '匯入',
    });
    added++;
  }
  if (added) await batch.commit();
  return { added, skipped };
}

// 匯入的顧客用同一個 Email 註冊時，把資料搬到真正的帳號底下
export async function claimPending(me) {
  const snap = await D.db().collection('customers').where('email', '==', me.email).where('pending', '==', true).limit(1).get();
  if (snap.empty) return null;
  const d = snap.docs[0];
  const data = { ...d.data(), uid: me.uid, pending: false };
  await D.db().doc('customers/' + me.uid).set(data);
  await d.ref.delete();
  return data;
}

// 定時（每天）：生日當月送購物金
export async function birthdayPoints() {
  const rules = (await D.discounts()).filter((x) => x.type === 'points' && x.trigger === 'birthday' && D.active(x) && x.amount > 0);
  if (!rules.length) return 0;
  const today = D.twDate();
  const month = today.slice(5, 7);
  const year = today.slice(0, 4);
  const list = (await D.all('customers')).filter((c) => !c.pending && c.birthday?.slice(5, 7) === month && c.birthdayGiven !== year);
  for (const c of list) {
    for (const r of rules) if (!r.groups?.length || r.groups.includes(c.groupId || 'member')) await givePoints(c.uid, r.amount, r.name || '生日禮');
    await D.db().doc('customers/' + c.uid).update({ birthdayGiven: year });
  }
  return list.length;
}
