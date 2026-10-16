// Cloud Functions 進入點：所有 /api/* 都進到這裡
//   /api/shop   前台（商品、購物車、結帳、會員）
//   /api/admin  後台
import { onRequest } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { setGlobalOptions } from 'firebase-functions/v2';
import { initializeApp } from 'firebase-admin/app';
import * as shop from './api/shop.js';
import * as admin from './api/admin.js';
import { cancelStale, refreshCustomer } from './lib/orders.js';
import { birthdayPoints, autoBlacklist } from './lib/customers.js';
import { all } from './lib/db.js';

initializeApp();
setGlobalOptions({ region: 'asia-east1', maxInstances: 10 });

const routes = { shop, admin };

export const api = onRequest({ cors: false, memory: '512MiB' }, async (req, res) => {
  const name = req.path.replace(/^\/api\//, '').replace(/^\//, '').split('/')[0];
  const fn = routes[name]?.[req.method];
  if (!fn) return res.status(404).send('Not found');

  // 轉成標準的 Request，api/*.js 就不用管是跑在哪個平台
  const host = req.get('x-forwarded-host') || req.get('host');
  const proto = req.get('x-forwarded-proto')?.split(',')[0] || req.protocol;
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) if (v != null) headers.set(k, Array.isArray(v) ? v.join(', ') : String(v));
  const request = new Request(`${proto}://${host}${req.originalUrl}`, {
    method: req.method,
    headers,
    body: ['GET', 'HEAD'].includes(req.method) ? undefined : req.rawBody,
  });

  const r = await fn(request);
  r.headers.forEach((v, k) => res.set(k, v));
  res.status(r.status).send(Buffer.from(await r.arrayBuffer()));
});

// 每天凌晨 3 點：轉帳逾期自動取消、生日購物金、自動黑名單、會員群組到期檢查
export const daily = onSchedule({ schedule: 'every day 03:00', timeZone: 'Asia/Taipei', timeoutSeconds: 540 }, async () => {
  console.log('逾期取消', await cancelStale());
  console.log('生日購物金', await birthdayPoints());
  console.log('自動黑名單', await autoBlacklist());
  const now = Date.now();
  for (const c of (await all('customers')).filter((c) => c.uid && c.groupUntil && c.groupUntil < now)) await refreshCustomer(c.uid);
});
