// 填入示範資料（只對本機模擬器）：npm run seed
// 先開模擬器（npm run dev），再開另一個終端機跑這支
import { createRequire } from 'node:module';

process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8180';
process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9399';
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||= '127.0.0.1:9599';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');
const sharp = require('sharp');

const PROJECT = 'demo-onlineshop';
const BUCKET = `${PROJECT}.appspot.com`;
initializeApp({ projectId: PROJECT, storageBucket: BUCKET });
const db = getFirestore();
const now = Date.now();
const DAY = 86400e3;
const ALPHA = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const code = (n, p = '') => p + Array.from({ length: n }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join('');
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// 產生一張示範商品圖（色塊＋文字），存到 Storage 模擬器
async function image(label, bg, fg = '#ffffff', w = 1200, h = 1200) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${bg}"/><stop offset="1" stop-color="${bg}" stop-opacity=".72"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/><circle cx="${w * 0.78}" cy="${h * 0.22}" r="${Math.min(w, h) * 0.18}" fill="${fg}" fill-opacity=".12"/><text x="50%" y="52%" font-family="PingFang TC, Noto Sans TC, sans-serif" font-size="${Math.round(Math.min(w, h) / 11)}" font-weight="700" fill="${fg}" text-anchor="middle">${label}</text></svg>`;
  const buf = await sharp(Buffer.from(svg)).webp({ quality: 85 }).toBuffer();
  const id = code(12);
  const path = `media/${id}.webp`;
  await getStorage().bucket(BUCKET).file(path).save(buf, { contentType: 'image/webp' });
  const url = `http://127.0.0.1:9599/v0/b/${BUCKET}/o/${encodeURIComponent(path)}?alt=media`;
  await db.doc('media/' + id).set({ name: label, url, path, folder: '示範', w, h, size: buf.length, tags: [], createdAt: now });
  return url;
}

async function clear() {
  for (const c of ['products', 'orders', 'customers', 'groups', 'codes', 'questions', 'discounts', 'addons', 'groupbuys', 'pages', 'menus', 'media', 'settings']) {
    const snap = await db.collection(c).get();
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    if (snap.size) await batch.commit();
  }
}

const PRODUCTS = [
  ['重磅水洗寬T', ['上衣', '新品'], 1280, 520, '#5B6B7A', { 顏色: ['杏灰', '深灰', '咖啡'], 尺寸: ['M', 'L', 'XL'] }],
  ['工裝口袋長褲', ['褲子', '新品'], 1980, 780, '#6E6250', { 顏色: ['卡其', '黑'], 尺寸: ['S', 'M', 'L'] }],
  ['抽繩工裝外套', ['外套', '熱銷推薦'], 2680, 1100, '#3F4E3E', { 顏色: ['軍綠', '咖啡'], 尺寸: ['M', 'L'] }],
  ['手繪聯名短T', ['上衣', '熱銷推薦'], 1700, 833, '#A0522D', { 顏色: ['紫色', '灰色', '白色'] }],
  ['韓國針織背心', ['上衣', '韓國選貨'], 1380, 600, '#8C7A6B', { 顏色: ['奶油', '灰'] }],
  ['寬版牛仔褲', ['褲子', '韓國選貨'], 2280, 950, '#3B5C86', { 尺寸: ['S', 'M', 'L', 'XL'] }],
  ['帆布托特包', ['配件'], 890, 300, '#B08D57', {}],
  ['羊毛混紡毛帽', ['配件', 'ON SALE'], 680, 220, '#7A3E48', { 顏色: ['酒紅', '黑', '燕麥'] }],
  ['素色長襪三入組', ['配件'], 390, 120, '#4F5D75', {}],
  ['刷毛連帽上衣', ['上衣', 'ON SALE'], 1880, 760, '#2F4A6D', { 顏色: ['海軍藍', '灰'], 尺寸: ['M', 'L', 'XL'] }],
  ['亞麻襯衫', ['上衣', '新品'], 1580, 640, '#9C8F7C', { 尺寸: ['M', 'L'] }],
  ['尼龍斜背包', ['配件', '熱銷推薦'], 1280, 480, '#1E1E1E', { 顏色: ['黑', '橄欖'] }],
];

async function main() {
  console.log('清空舊資料…');
  await clear();

  console.log('建立商品圖片與商品…');
  const pids = [];
  for (const [i, [name, tags, price, cost, color, specMap]] of PRODUCTS.entries()) {
    const images = [await image(name, color), await image(name + ' 細節', color, '#ffffff')];
    const specs = Object.entries(specMap).map(([n, values]) => ({ name: n, values }));
    const combos = specs.reduce((acc, s) => acc.flatMap((a) => s.values.map((v) => [...a, v])), [[]]);
    const variants = combos.map((opts, k) => ({ key: opts.join('/'), opts, sku: `P${String(i + 1).padStart(3, '0')}-${k + 1}`, price, listPrice: 0, cost, stock: k === 1 ? 2 : 5 + Math.floor(Math.random() * 20), img: '' }));
    const id = code(10);
    pids.push({ id, name, price, cost, img: images[0], variants });
    await db.doc('products/' + id).set({
      name, sku: `P${String(i + 1).padStart(3, '0')}`, desc: `<h3>${name}</h3><p>這是示範商品的介紹。可以在後台「商品管理」編輯文字、插入圖片。</p><ul><li>材質：100% 棉</li><li>產地：台灣</li><li>洗滌：建議手洗、陰乾</li></ul>`,
      images, tags, on: true, price, listPrice: tags.includes('ON SALE') ? Math.round(price * 1.3) : 0, cost, specs, variants,
      stock: variants.reduce((a, v) => a + v.stock, 0), sold: Math.floor(Math.random() * 40), seoTitle: '', seoDesc: '',
      createdAt: now - (PRODUCTS.length - i) * DAY, updatedAt: now - (PRODUCTS.length - i) * DAY,
    });
  }

  console.log('建立首頁、選單…');
  const banner1 = await image('2026 秋冬新品', '#2F4A6D', '#ffffff', 1920, 840);
  const banner2 = await image('全館滿 2000 折 200', '#A0522D', '#ffffff', 1920, 840);
  const story = await image('品牌故事', '#6E6250', '#ffffff', 1200, 900);
  await db.doc('pages/home').set({
    title: '首頁', slug: 'home', home: true, hidden: false, settings: {}, createdAt: now, updatedAt: now,
    blocks: [
      { id: 'b1', type: 'carousel', slides: [{ src: banner1, link: '/products?tag=新品' }, { src: banner2, link: '/products' }], autoplay: 5, ratio: '16/7', full: true, pt: 0, pb: 0 },
      { id: 'b2', type: 'text', html: '<h2>簡約穿搭，不分尺寸</h2><p>台灣設計為主、韓國選貨為輔。注重材質與細節，讓每個人穿出自己的風格。</p>', align: 'center', pt: 48, pb: 24 },
      { id: 'b3', type: 'products', title: '新品上架', source: 'tag', tag: '新品', sort: 'new', limit: 8, cols: 4 },
      { id: 'b4', type: 'imageText', src: story, title: '關於我們', text: '從一間小小的選物店開始，我們相信好的衣服可以穿很多年。\n每一件商品都經過我們親自試穿、挑選。', button: '看品牌故事', link: '/pages/about', layout: 'left', pt: 40, pb: 40, bg: '#F6F3EE' },
      { id: 'b5', type: 'products', title: '熱銷推薦', source: 'tag', tag: '熱銷推薦', sort: 'hot', limit: 4, cols: 4 },
      { id: 'b6', type: 'spacer', height: 24, line: true },
      { id: 'b7', type: 'share', title: '喜歡的話分享給朋友' },
    ],
  });
  await db.doc('pages/about').set({
    title: '品牌故事', slug: 'about', home: false, hidden: false, settings: {}, createdAt: now, updatedAt: now,
    blocks: [
      { id: 'a1', type: 'image', src: story, width: 100, align: 'center', full: true, pt: 0, pb: 0 },
      { id: 'a2', type: 'text', html: '<h2>品牌故事</h2><p>這是自訂分頁的示範，可以在後台「商店設計 → 頁面設計」用拖拉的方式編輯。</p>', align: 'center' },
      { id: 'a3', type: 'group', widths: [1, 1], gap: 24, cols: [{ blocks: [{ id: 'a4', type: 'text', html: '<h3>門市資訊</h3><p>週二至週日 13:00–21:00<br>週一公休</p>', align: 'left' }] }, { blocks: [{ id: 'a5', type: 'map', address: '台中市西區公益路', height: 260 }] }] },
    ],
  });
  const tag = (label, value) => ({ label, type: 'tag', value, children: [] });
  await db.doc('menus/top').set({ name: '置頂選單', items: [{ label: '全部商品', type: 'all', value: '', children: [] }, tag('新品', '新品'), tag('熱銷推薦', '熱銷推薦'), { label: '分類', type: 'none', value: '', children: [tag('上衣', '上衣'), tag('褲子', '褲子'), tag('外套', '外套'), tag('配件', '配件')] }, tag('ON SALE', 'ON SALE'), { label: '品牌故事', type: 'page', value: 'about', children: [] }] });
  await db.doc('menus/side').set({ name: '側邊選單', items: [tag('NEW ARRIVALS', '新品'), tag('熱銷推薦', '熱銷推薦'), tag('韓國選貨', '韓國選貨'), tag('ON SALE', 'ON SALE')] });
  await db.doc('menus/footer').set({ name: '頁尾選單', items: [{ label: '品牌故事', type: 'page', value: 'about', children: [] }, { label: '會員中心', type: 'account', value: '', children: [] }, { label: '購物車', type: 'cart', value: '', children: [] }] });

  console.log('建立設定、會員群組、折扣…');
  await db.doc('settings/store').set({ name: '29 STUDIO', desc: '台灣設計為主，韓國選貨為輔', logo: '', logoMobile: '', favicon: '', email: 'hello@example.com', phone: '04-2345-6789', address: '台中市西區公益路 100 號', currency: 'TWD' });
  await db.doc('settings/payment').set({ methods: [{ id: 'card', name: '信用卡（模擬）', on: true, note: '測試用：結帳後可選擇付款成功或失敗' }, { id: 'atm', name: 'ATM 轉帳', on: true, note: '' }, { id: 'cod', name: '貨到付款', on: true, note: '' }], bank: { name: '台中商業銀行', code: '053', account: '0362-2120-6123', holder: '二十九工作室' }, ecpay: { merchantId: '', hashKey: '', hashIV: '', stage: true } });
  await db.doc('settings/theme').set({ colors: { bg: '#FFFFFF', menuBg: '#FFFFFF', menuText: '#5F5F5F', text: '#323232', primary: '#2F4A6D', line: '#E4DED8', primaryText: '#FFFFFF' }, radius: 'soft', listButton: 'outline', fadeImages: true, fadeText: false, bgImage: '', bgRepeat: true, layout: 'top', width: 1200, announce: { on: true, text: '全館滿 999 超商免運｜加入會員送 50 點購物金', link: '', color: '#2F4A6D' }, popup: { on: false, image: banner2, link: '/products', start: '', end: '' } });
  await db.doc('groups/vip').set({ name: '甘爹 VIP', on: true, months: 12, order: 1, color: '', upgrade: [{ months: 12, type: 'single', amount: 5000 }, { months: 12, type: 'total', amount: 10000 }], renew: [{ months: 12, type: 'total', amount: 5000 }], createdAt: now, updatedAt: now });
  await db.doc('codes/c1').set({ field: 'code', op: 'eq', value: 'ganbaru', groupId: 'vip', createdAt: now, updatedAt: now });
  const disc = (id, d) => db.doc('discounts/' + id).set({ on: true, start: '', end: '', priority: 0, groups: [], tags: [], percent: 0, amount: 0, mode: 'amount', threshold: 0, code: '', limit: 0, used: 0, once: false, shippingIds: [], trigger: 'spend', expireDays: 0, createdAt: now, updatedAt: now, ...d });
  await disc('vip', { type: 'product', name: 'VIP 九折', groups: ['vip'], percent: 10 });
  await disc('o2000', { type: 'order', name: '滿 2000 折 200', threshold: 2000, amount: 200 });
  await disc('welcome', { type: 'coupon', name: '新朋友優惠', code: 'WELCOME100', threshold: 1000, amount: 100, once: true, priority: 1 });
  await disc('p1000', { type: 'points', name: '回饋購物金', trigger: 'spend', threshold: 1000, mode: 'percent', percent: 5 });
  await disc('bday', { type: 'points', name: '生日快樂', trigger: 'birthday', amount: 100 });
  await disc('join', { type: 'points', name: '入會禮', trigger: 'signup', amount: 50 });
  await db.doc('addons/a1').set({ name: '結帳前加購', on: true, start: '', end: '', items: [{ pid: pids[8].id, price: 199, limit: 2 }, { pid: pids[6].id, price: 590, limit: 1 }], createdAt: now, updatedAt: now });
  await db.doc('groupbuys/g1').set({ pid: pids[3].id, name: '手繪 T 湊湊團', on: true, start: '', end: '', tiers: [{ qty: 0, price: 1700 }, { qty: 10, price: 1590 }, { qty: 30, price: 1490 }], sold: 12, createdAt: now, updatedAt: now });

  console.log('建立示範會員與訂單…');
  let demo;
  try { demo = await getAuth().getUserByEmail('customer@example.com'); } catch { demo = await getAuth().createUser({ email: 'customer@example.com', password: '123456', displayName: '王小明', emailVerified: true }); }
  const names = ['陳怡君', '林家豪', '黃雅婷', '張志明', '李佳穎', '王俊傑', '吳淑芬', '劉建宏'];
  await db.doc('customers/' + demo.uid).set({ uid: demo.uid, email: 'customer@example.com', name: '王小明', phone: '0912345678', birthday: '1992-' + new Date().toISOString().slice(5, 7) + '-15', gender: '男', groupId: null, groupUntil: null, groupManual: false, points: 120, pointsLog: [{ at: now - 20 * DAY, change: 50, note: '入會禮' }, { at: now - 10 * DAY, change: 70, note: '訂單回饋' }], wishlist: [pids[2].id], coupons: [], blacklisted: false, note: '', tags: [], address: { name: '王小明', phone: '0912345678', address: '台中市西區公益路 200 號', zip: '403' }, newsletter: true, stats: { orders: 0, spent: 0, firstOrderAt: null, lastOrderAt: null }, createdAt: now - 40 * DAY, source: '' });
  const guests = [];
  for (const [i, n] of names.entries()) {
    const uid = 'demo' + i;
    guests.push({ uid, name: n, email: `user${i}@example.com` });
    await db.doc('customers/' + uid).set({ uid, email: `user${i}@example.com`, name: n, phone: '09' + String(10000000 + i * 1234567).slice(0, 8), birthday: '', gender: '', groupId: i === 0 ? 'vip' : null, groupUntil: i === 0 ? now + 300 * DAY : null, groupManual: false, points: i * 10, pointsLog: [], wishlist: [], coupons: [], blacklisted: i === 7, note: '', tags: [], address: null, newsletter: false, stats: { orders: 0, spent: 0 }, createdAt: now - (60 - i * 5) * DAY, source: '' });
  }
  const STATUSES = [['processing', 'unpaid', 'unshipped'], ['processing', 'paid', 'unshipped'], ['preparing', 'paid', 'unshipped'], ['shipped', 'paid', 'shipped'], ['closed', 'paid', 'arrived'], ['closed', 'paid', 'arrived'], ['cancelled', 'unpaid', 'unshipped']];
  const ships = [['seven', '7-11 店到店', 'cvs', 60], ['home', '宅配', 'home', 120], ['family', '全家店到店', 'cvs', 60]];
  const pays = [['card', '信用卡（模擬）'], ['atm', 'ATM 轉帳'], ['cod', '貨到付款']];
  const stats = {};
  for (let k = 0; k < 24; k++) {
    const who = k % 4 === 0 ? { uid: demo.uid, name: '王小明', email: 'customer@example.com' } : pick(guests);
    const items = Array.from({ length: 1 + Math.floor(Math.random() * 2) }, () => { const p = pick(pids); const v = pick(p.variants); const qty = 1 + Math.floor(Math.random() * 2); return { pid: p.id, vkey: v.key, name: p.name, spec: v.opts.length ? v.key : '', sku: v.sku, img: p.img, price: p.price, listPrice: 0, qty, amount: p.price * qty, cost: p.cost, notes: [] }; });
    const subtotal = items.reduce((a, l) => a + l.amount, 0);
    const discounts = subtotal >= 2000 ? [{ id: 'o2000', name: '滿 2000 折 200', amount: 200 }] : [];
    const [sid, sname, stype, sfee] = pick(ships);
    const fee = subtotal >= 999 && stype === 'cvs' ? 0 : sfee;
    const total = subtotal - discounts.reduce((a, d) => a + d.amount, 0) + fee;
    const [status, payStatus, shipStatus] = k < 3 ? STATUSES[k] : pick(STATUSES);
    const [pid_, pname] = pick(pays);
    const at = now - Math.floor(Math.random() * 28) * DAY - Math.floor(Math.random() * 10) * 3600e3;
    const no = code(8, 'W');
    const msgs = k === 1 ? [{ from: 'customer', name: who.name, text: '請問什麼時候會出貨呢？', at: at + 3600e3 }] : k === 4 ? [{ from: 'customer', name: who.name, text: '轉帳帳號末五碼：12345', at: at + 7200e3 }, { from: 'admin', name: '客服', text: '收到，已對帳完成，明天就幫你寄出喔！', at: at + 9000e3 }] : [];
    await db.doc('orders/' + no).set({
      no, key: code(16), uid: who.uid, buyer: { name: who.name, email: who.email, phone: '0912000000' },
      receiver: { name: who.name, phone: '0912000000', address: stype === 'home' ? '台中市西區公益路 200 號' : '', store: stype === 'cvs' ? '公益門市 123456' : '', zip: '' },
      items, addonItems: [], subtotal, discounts, discountTotal: discounts.reduce((a, d) => a + d.amount, 0), shipping: { id: sid, name: sname, type: stype, fee },
      pointsUsed: 0, pointsValue: 0, total, cost: items.reduce((a, l) => a + l.cost * l.qty, 0), earn: total >= 1000 ? Math.floor(total * 0.05) : 0, earnRules: [], earned: status === 'closed', couponId: null,
      payment: { id: pid_, name: pname, status: payStatus, paidAt: payStatus === 'paid' ? at + 600e3 : null, transfer: '' },
      shipStatus, trackingNo: shipStatus !== 'unshipped' ? String(Math.floor(1e11 + Math.random() * 9e11)) : '', status,
      note: '', adminNote: '', tags: [], msgs, adminUnread: k === 1, customerUnread: false, flagged: false, lastMsgAt: msgs.length ? msgs[msgs.length - 1].at : null,
      returnReq: k === 3 ? { type: 'exchange', reason: '尺寸太小，想換大一號', at: at + DAY, status: 'pending' } : null,
      log: [{ at, by: '顧客', text: '建立訂單' }], createdAt: at, updatedAt: at,
    });
    if (status !== 'cancelled') {
      const s = (stats[who.uid] ||= { orders: 0, spent: 0, firstOrderAt: at, lastOrderAt: at });
      s.orders++;
      if (payStatus === 'paid') s.spent += total;
      s.firstOrderAt = Math.min(s.firstOrderAt, at);
      s.lastOrderAt = Math.max(s.lastOrderAt, at);
    }
  }
  for (const [uid, s] of Object.entries(stats)) await db.doc('customers/' + uid).update({ stats: s });
  await db.collection('questions').add({ pid: pids[2].id, pname: pids[2].name, img: pids[2].img, uid: guests[1].uid, email: guests[1].email, name: guests[1].name, msgs: [{ from: 'customer', name: guests[1].name, text: '請問 175cm 70kg 穿 L 會太大嗎？', at: now - 2 * DAY }], replied: false, customerUnread: false, createdAt: now - 2 * DAY, updatedAt: now - 2 * DAY });

  console.log('\n完成！');
  console.log('前台：http://127.0.0.1:5160');
  console.log('後台：http://127.0.0.1:5160/admin （用 Google 登入，在彈出視窗新增帳號，Email 填 admin@example.com）');
  console.log('示範會員：customer@example.com / 123456');
  console.log('優惠碼：WELCOME100　特約代碼：ganbaru');
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
