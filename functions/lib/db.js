// Firestore 集合
//  products/{id}      商品：name, sku, desc, images[], tags[], on, price, listPrice, cost, specs[{name,values[]}],
//                     variants[{key, opts[], sku, price, listPrice, cost, stock}], stock（所有規格加總）, sold, createdAt, updatedAt
//  orders/{no}        訂單：見 lib/orders.js
//  customers/{uid}    顧客：name, email, phone, birthday, groupId, groupUntil, points, pointsLog[], blacklisted, wishlist[], stats
//  groups/{id}        顧客群組：name, on, months（使用期限，0＝永久）, upgrade[], renew[], order
//  codes/{id}         特約代碼：field（code｜email）, op（eq｜endsWith）, value, groupId, createdAt
//  questions/{id}     商品問答：pid, pname, img, uid, email, name, msgs[], replied, updatedAt
//  discounts/{id}     折扣：type（product｜order｜coupon｜freeShip｜points）, 見 lib/pricing.js
//  addons/{id}        購物車加購區：name, on, start, end, items[{pid, price, limit}]
//  groupbuys/{id}     湊湊團：pid, name, on, start, end, tiers[{qty, price}], sold
//  pages/{id}         頁面設計：title, slug, home, blocks[], updatedAt
//  menus/{id}         選單目錄：name, items[{label, type, value, children[]}]
//  media/{id}         媒體櫃：name, url, path, folder, w, h, size, tags[], createdAt
//  settings/{name}    商店設定：見 lib/settings.js
//  admins/{email}     後台帳號
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

export const db = () => getFirestore();
export const now = () => Date.now();
export { FieldValue };

const memo = new Map();
// 短暫快取（同一個 function instance 幾秒內不重複讀整個集合）
async function cached(key, ms, load) {
  const hit = memo.get(key);
  if (hit && Date.now() - hit.at < ms) return hit.v;
  const v = await load();
  memo.set(key, { v, at: Date.now() });
  return v;
}
export const bust = (...keys) => keys.forEach((k) => memo.delete(k));

export async function all(collection, ms = 0) {
  const load = async () => (await db().collection(collection).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  return ms ? cached(collection, ms, load) : load();
}

export async function one(collection, id) {
  if (!id) return null;
  const d = await db().doc(`${collection}/${id}`).get();
  return d.exists ? { id: d.id, ...d.data() } : null;
}

export const products = () => all('products', 3000);
export const groups = () => all('groups', 5000);
export const discounts = () => all('discounts', 3000);
export const addons = () => all('addons', 3000);
export const groupbuys = () => all('groupbuys', 3000);

// 現在是否在活動期間（start／end 是 YYYY-MM-DD 或空白）
export function active(x, t = Date.now()) {
  if (!x || x.on === false) return false;
  const d = new Date(t + 8 * 3600e3).toISOString().slice(0, 10); // 台灣日期
  if (x.start && d < x.start) return false;
  if (x.end && d > x.end) return false;
  return true;
}

// 隨機編號（訂單編號：W + 8 碼，不用容易看錯的 0、O、1、I）
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export function code(n = 8, prefix = '') {
  let s = prefix;
  for (let i = 0; i < n; i++) s += ALPHA[Math.floor(Math.random() * ALPHA.length)];
  return s;
}

export const twDate = (t = Date.now()) => new Date(t + 8 * 3600e3).toISOString().slice(0, 10);
