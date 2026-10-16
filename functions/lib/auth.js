// 登入驗證與權限
//  後台：Google 帳號（Firebase Authentication）。老闆在 OWNER_EMAILS 指定，擁有全部權限；
//        其他員工存在 admins/{email}，各自屬於一個角色。角色和每個角色能做的事由老闆在「設定 → 後台帳號」自訂，存在 meta/roles
//  前台：顧客用 Email/密碼或 Google 註冊，資料存在 customers/{uid}
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { UserError } from './http.js';

// 所有可以勾選的權限（順序就是後台顯示的順序）
export const PERMS = [
  { key: 'dashboard', group: '總覽', name: '總覽', desc: '營收、待辦事項、熱銷' },
  { key: 'cost', group: '總覽', name: '成本與毛利', desc: '看得到商品成本、訂單毛利' },
  { key: 'orders', group: '訂單', name: '查看訂單', desc: '訂單列表、訂單內容' },
  { key: 'ordersEdit', group: '訂單', name: '處理訂單', desc: '改狀態、物流編號、取消訂單、回覆訂單問答' },
  { key: 'ordersExport', group: '訂單', name: '匯出訂單', desc: '下載含顧客個資的訂單 CSV' },
  { key: 'products', group: '商品', name: '商品管理', desc: '新增、編輯、上下架、刪除商品' },
  { key: 'messages', group: '訊息', name: '訊息中心', desc: '訂單問答、商品問答' },
  { key: 'customers', group: '顧客', name: '查看顧客', desc: '顧客名單、顧客資料、分眾人數' },
  { key: 'customersEdit', group: '顧客', name: '管理顧客', desc: '群組、購物金、黑名單、群組規則、特約代碼' },
  { key: 'customersExport', group: '顧客', name: '匯出／匯入顧客', desc: '下載或上傳含個資的顧客名單' },
  { key: 'design', group: '商店設計', name: '商店設計', desc: '頁面設計、選單、全站外觀' },
  { key: 'marketing', group: '行銷', name: '行銷', desc: '折扣、優惠碼、購物金規則、加購區、湊湊團' },
  { key: 'media', group: '媒體櫃', name: '媒體櫃', desc: '上傳、刪除圖片' },
  { key: 'settings', group: '設定', name: '商店設定', desc: '商店資料、購物規則、金流、物流、第三方' },
  { key: 'accounts', group: '設定', name: '後台帳號與權限', desc: '新增員工、修改角色權限（等同老闆）' },
];
const ALL = PERMS.map((p) => p.key);

// 還沒自訂過角色時的預設值
const DEFAULT_ROLES = [
  { id: 'manager', name: '店長', perms: ALL.filter((k) => k !== 'accounts') },
  { id: 'service', name: '客服', perms: ['dashboard', 'orders', 'ordersEdit', 'messages', 'customers', 'customersEdit'] },
  { id: 'editor', name: '商品與設計', perms: ['dashboard', 'products', 'design', 'media', 'marketing'] },
];

const ownerEmails = () => (process.env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const normEmail = (e) => String(e || '').trim().toLowerCase();
const rolesRef = () => getFirestore().doc('meta/roles');

let rolesCache = null;
export async function listRoles() {
  if (rolesCache && Date.now() - rolesCache.at < 5000) return rolesCache.list;
  const d = (await rolesRef().get()).data();
  const list = d?.list || DEFAULT_ROLES;
  rolesCache = { list, at: Date.now() };
  return list;
}

async function verify(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  try { return await getAuth().verifyIdToken(token); } catch { throw new UserError('登入已過期，請重新登入', 401); }
}

// 後台：回傳 { email, name, role, roleName, perms }
export async function admin(request) {
  const user = await verify(request);
  if (!user) throw new UserError('請先登入', 401);
  const email = normEmail(user.email);
  if (!email || !user.email_verified) throw new UserError('請用 Google 帳號登入後台', 403);
  if (ownerEmails().includes(email)) return { email, name: user.name || email, role: 'owner', roleName: '老闆', perms: ALL };
  const doc = (await getFirestore().doc('admins/' + email).get()).data();
  if (!doc || doc.disabled) throw new UserError(`${email} 沒有後台權限，請老闆到「設定 → 後台帳號」加入這個 Email`, 403);
  const role = (await listRoles()).find((r) => r.id === doc.role);
  if (!role) throw new UserError('您的角色已被刪除，請老闆重新指定角色', 403);
  return { email, name: doc.name || user.name || email, role: role.id, roleName: role.name, perms: role.perms };
}

export const can = (me, what) => me.perms.includes(what);

export function need(me, what) {
  if (!can(me, what)) throw new UserError(`您的角色「${me.roleName}」沒有「${PERMS.find((p) => p.key === what)?.name || what}」的權限`, 403);
}

// 前台：沒登入回 null，有登入回 { uid, email }
export async function customer(request) {
  const user = await verify(request);
  return user ? { uid: user.uid, email: normEmail(user.email), name: user.name || '' } : null;
}

/* ---------- 後台帳號與角色（需要 accounts 權限） ---------- */
export async function listAdmins() {
  const snap = await getFirestore().collection('admins').get();
  const owners = ownerEmails();
  const list = snap.docs.map((d) => ({ email: d.id, ...d.data() })).filter((u) => !owners.includes(u.email));
  return [...owners.map((e) => ({ email: e, name: '', role: 'owner', fixed: true })), ...list];
}

export async function saveAdmin({ email, name, role, disabled }) {
  email = normEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new UserError('Email 格式不對');
  if (ownerEmails().includes(email)) throw new UserError('老闆帳號的權限是固定的（在 OWNER_EMAILS 設定）');
  if (!(await listRoles()).some((r) => r.id === role)) throw new UserError('請選角色');
  await getFirestore().doc('admins/' + email).set({ name: String(name || '').trim().slice(0, 20), role, disabled: !!disabled });
  return listAdmins();
}

export async function removeAdmin({ email }) {
  email = normEmail(email);
  if (ownerEmails().includes(email)) throw new UserError('老闆帳號不能移除');
  await getFirestore().doc('admins/' + email).delete();
  return listAdmins();
}

export async function saveRole({ id, name, perms }) {
  name = String(name || '').trim().slice(0, 20);
  if (!name) throw new UserError('請填角色名稱');
  perms = [...new Set((perms || []).filter((k) => ALL.includes(k)))];
  // 有處理／匯出權限一定要能查看
  if (perms.some((k) => k.startsWith('orders')) && !perms.includes('orders')) perms.push('orders');
  if (perms.some((k) => k.startsWith('customers')) && !perms.includes('customers')) perms.push('customers');
  const list = [...(await listRoles())];
  if (list.some((r) => r.name === name && r.id !== id)) throw new UserError('已經有同名的角色');
  const i = list.findIndex((r) => r.id === id);
  if (i >= 0) list[i] = { id, name, perms };
  else list.push({ id: 'r' + Date.now().toString(36), name, perms });
  await rolesRef().set({ list });
  rolesCache = null;
  return list;
}

export async function removeRole({ id }) {
  const n = (await getFirestore().collection('admins').where('role', '==', id).count().get()).data().count;
  if (n) throw new UserError(`還有 ${n} 位員工是這個角色，請先改成別的角色`);
  const list = (await listRoles()).filter((r) => r.id !== id);
  await rolesRef().set({ list });
  rolesCache = null;
  return list;
}
