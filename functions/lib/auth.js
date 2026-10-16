// 登入驗證
//  後台：Google 帳號（Firebase Authentication）。老闆在 OWNER_EMAILS 指定，其他人由老闆在「設定 → 後台帳號」用 Email 授權，存在 admins/{email}
//  前台：顧客用 Email/密碼或 Google 註冊，資料存在 customers/{uid}
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { UserError } from './http.js';

export const ROLES = {
  owner: '老闆',
  manager: '店長',
  service: '客服',
  editor: '商品與設計',
};

// 每個角色能進的功能
const CAN = {
  owner: ['*'],
  manager: ['dashboard', 'orders', 'products', 'messages', 'customers', 'design', 'marketing', 'media', 'settings'],
  service: ['dashboard', 'orders', 'messages', 'customers'],
  editor: ['dashboard', 'products', 'design', 'media', 'marketing'],
};
export const can = (role, what) => !!CAN[role] && (CAN[role].includes('*') || CAN[role].includes(what));
export const permsOf = (role) => (CAN[role]?.includes('*') ? [...CAN.manager, 'accounts'] : CAN[role] || []);

const ownerEmails = () => (process.env.OWNER_EMAILS || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
const normEmail = (e) => String(e || '').trim().toLowerCase();

async function verify(request) {
  const token = (request.headers.get('authorization') || '').replace(/^Bearer /, '');
  if (!token) return null;
  try { return await getAuth().verifyIdToken(token); } catch { throw new UserError('登入已過期，請重新登入', 401); }
}

// 後台：回傳 { email, name, role }
export async function admin(request) {
  const user = await verify(request);
  if (!user) throw new UserError('請先登入', 401);
  const email = normEmail(user.email);
  if (!email || !user.email_verified) throw new UserError('請用 Google 帳號登入後台', 403);
  const doc = (await getFirestore().doc('admins/' + email).get()).data();
  const role = ownerEmails().includes(email) ? 'owner' : doc?.disabled ? null : doc?.role;
  if (!role) throw new UserError(`${email} 沒有後台權限，請老闆到「設定 → 後台帳號」加入這個 Email`, 403);
  return { email, name: doc?.name || user.name || email, role, perms: permsOf(role) };
}

export function need(me, what) {
  if (!can(me.role, what)) throw new UserError(`「${ROLES[me.role]}」沒有這個權限`, 403);
}

// 前台：沒登入回 null，有登入回 { uid, email }
export async function customer(request) {
  const user = await verify(request);
  return user ? { uid: user.uid, email: normEmail(user.email), name: user.name || '' } : null;
}

/* ---------- 後台帳號管理（老闆） ---------- */
export async function listAdmins() {
  const snap = await getFirestore().collection('admins').get();
  const owners = ownerEmails();
  const list = snap.docs.map((d) => ({ email: d.id, ...d.data() }));
  for (const e of owners) if (!list.some((u) => u.email === e)) list.push({ email: e, name: '', role: 'owner' });
  return list
    .map((u) => ({ ...u, fixed: owners.includes(u.email), role: owners.includes(u.email) ? 'owner' : u.role }))
    .sort((a, b) => Object.keys(ROLES).indexOf(a.role) - Object.keys(ROLES).indexOf(b.role));
}

export async function saveAdmin({ email, name, role, disabled }) {
  email = normEmail(email);
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new UserError('Email 格式不對');
  if (ownerEmails().includes(email)) throw new UserError('老闆帳號的權限是固定的（在 OWNER_EMAILS 設定）');
  if (!ROLES[role] || role === 'owner') throw new UserError('請選角色');
  await getFirestore().doc('admins/' + email).set({ name: String(name || '').trim().slice(0, 20), role, disabled: !!disabled });
  return listAdmins();
}

export async function removeAdmin({ email }) {
  email = normEmail(email);
  if (ownerEmails().includes(email)) throw new UserError('老闆帳號不能移除');
  await getFirestore().doc('admins/' + email).delete();
  return listAdmins();
}
