// 商店設定：每一類存一份 settings/{name}，沒設定過就用這裡的預設值
import { getFirestore } from 'firebase-admin/firestore';

export const DEFAULTS = {
  // 商店設定
  store: {
    name: '我的網路商店',
    desc: '',
    logo: '',
    logoMobile: '',
    favicon: '',
    email: '',
    phone: '',
    address: '',
    currency: 'TWD',
  },
  // 購物設定
  shopping: {
    guestCheckout: true, // 不用註冊也能結帳
    autoCancelFailed: true, // 付款失敗自動取消訂單
    restockOnCancel: true, // 取消訂單自動加回庫存
    repayDays: 3, // 訂單重新付款期限
    unpaidCancelDays: 7, // 轉帳／ATM 幾天沒付款自動取消（0＝不取消）
    transferTemplate: '帳戶末五碼：\n\n匯款日期：',
    orderNote: true, // 結帳時可以留言
    pointsRate: 1, // 1 點購物金折抵幾元
    pointsMaxPercent: 50, // 購物金最多折抵訂單金額的幾 %
    pointsExpireDays: 365,
  },
  // 顧客功能設定
  customer: {
    requirePhone: true,
    requireBirthday: false,
    wishlist: true,
    returnRequest: true,
    exchangeRequest: true,
    lockBirthday: true,
    membersOnlyPrice: false,
    blacklistAuto: false,
    blacklistMonths: 6,
    blacklistUnpicked: 2, // 超商未取貨幾次加入黑名單
    blacklistReturns: 3,
  },
  // 金流（目前都是模擬，之後換成綠界）
  payment: {
    methods: [
      { id: 'card', name: '信用卡（模擬）', on: true, note: '測試用：結帳後可選擇付款成功或失敗' },
      { id: 'atm', name: 'ATM 轉帳', on: true, note: '' },
      { id: 'cod', name: '貨到付款', on: true, note: '' },
    ],
    bank: { name: '', code: '', account: '', holder: '' },
    ecpay: { merchantId: '', hashKey: '', hashIV: '', stage: true },
  },
  // 物流
  shipping: {
    methods: [
      { id: 'home', name: '宅配', type: 'home', fee: 120, freeOver: 1500, on: true, cod: true },
      { id: 'seven', name: '7-11 店到店', type: 'cvs', fee: 60, freeOver: 999, on: true, cod: true },
      { id: 'family', name: '全家店到店', type: 'cvs', fee: 60, freeOver: 999, on: true, cod: true },
      { id: 'pickup', name: '門市自取', type: 'pickup', fee: 0, freeOver: 0, on: false, cod: true },
      { id: 'overseas', name: '海外寄送', type: 'home', fee: 450, freeOver: 0, on: false, cod: false },
    ],
  },
  // 第三方
  third: {
    gaId: '',
    fbPixel: '',
    lineUrl: '',
    fbUrl: '',
    igUrl: '',
  },
  // 通知（目前只在後台顯示，之後接 Email／LINE）
  notify: {
    newOrder: true,
    newMessage: true,
    lowStock: 3,
  },
  // 全站外觀：色彩配置、按鈕、動畫、背景、彈窗廣告、全站公告
  theme: {
    colors: {
      bg: '#FFFFFF',
      menuBg: '#FFFFFF',
      menuText: '#5F5F5F',
      text: '#323232',
      primary: '#2F4A6D',
      line: '#E4DED8',
      primaryText: '#FFFFFF',
    },
    radius: 'soft', // round | soft | square
    listButton: 'outline', // fill | outline
    fadeImages: true,
    fadeText: false,
    bgImage: '',
    bgRepeat: true,
    layout: 'top', // top：置頂選單｜top-side：置頂＋側邊選單
    width: 1200,
    announce: { on: false, text: '', link: '', color: '#2F4A6D' },
    popup: { on: false, image: '', link: '', start: '', end: '' },
  },
};

const cache = new Map();

export async function get(name) {
  if (!DEFAULTS[name]) throw new Error('unknown settings ' + name);
  if (cache.has(name) && Date.now() - cache.get(name).at < 5000) return cache.get(name).v;
  const d = (await getFirestore().doc('settings/' + name).get()).data() || {};
  const v = merge(DEFAULTS[name], d);
  cache.set(name, { v, at: Date.now() });
  return v;
}

export async function getAll(names = Object.keys(DEFAULTS)) {
  return Object.fromEntries(await Promise.all(names.map(async (n) => [n, await get(n)])));
}

export async function save(name, value) {
  if (!DEFAULTS[name]) throw new Error('unknown settings ' + name);
  // 只收預設值裡有的欄位，型別跟預設值一樣
  const clean = pick(DEFAULTS[name], value);
  await getFirestore().doc('settings/' + name).set(clean);
  cache.delete(name);
  return get(name);
}

function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = over && k in over ? merge(base[k], over[k]) : base[k];
    return out;
  }
  return over ?? base;
}

function pick(base, v) {
  if (Array.isArray(base)) return Array.isArray(v) ? v.slice(0, 50).map((x) => (base[0] && typeof base[0] === 'object' ? pick(base[0], x) : x)) : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = v && k in v ? pick(base[k], v[k]) : base[k];
    // 陣列裡的物件可能有預設值沒有的欄位（例如 id），保留字串和數字、布林欄位
    if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (!(k in out) && ['string', 'number', 'boolean'].includes(typeof x)) out[k] = typeof x === 'string' ? x.slice(0, 2000) : x;
    return out;
  }
  if (typeof base === 'number') { const n = Number(v); return Number.isFinite(n) ? n : base; }
  if (typeof base === 'boolean') return !!v;
  if (typeof base === 'string') return String(v ?? '').slice(0, 5000);
  return v;
}
