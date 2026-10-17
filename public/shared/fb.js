// Firebase 登入（前台顧客、後台員工共用）
// 正式站：Firebase Hosting 會提供 /__/firebase/init.json；本機：連到模擬器
const SDK = 'https://www.gstatic.com/firebasejs/12.4.0/';
export const local = ['localhost', '127.0.0.1'].includes(location.hostname);

let ready;
export function auth() {
  ready ||= (async () => {
    const [{ initializeApp }, A] = await Promise.all([import(SDK + 'firebase-app.js'), import(SDK + 'firebase-auth.js')]);
    const config = local ? { apiKey: 'demo-key', authDomain: location.host, projectId: 'demo-onlineshop' } : await (await fetch('/__/firebase/init.json')).json();
    const a = A.getAuth(initializeApp(config));
    if (local) A.connectAuthEmulator(a, `http://${location.hostname}:9399`, { disableWarnings: true });
    await a.authStateReady();
    return { auth: a, ...A };
  })();
  return ready;
}

export async function token() {
  const F = await auth();
  return F.auth.currentUser ? F.auth.currentUser.getIdToken() : null;
}

const MSG = {
  'auth/invalid-credential': 'Email 或密碼不正確',
  'auth/wrong-password': 'Email 或密碼不正確',
  'auth/user-not-found': '這個 Email 還沒註冊',
  'auth/email-already-in-use': '這個 Email 已經註冊過了，請直接登入',
  'auth/weak-password': '密碼至少要 6 個字',
  'auth/invalid-email': 'Email 格式不正確',
  'auth/popup-closed-by-user': '登入視窗被關掉了',
  'auth/too-many-requests': '嘗試太多次，請稍後再試',
};
export const authMessage = (e) => MSG[e?.code] || e?.message || '登入失敗';

// API 呼叫：自動帶登入 token；GET 帶 query，POST 帶 JSON
export async function api(path, { method = 'GET', body, raw } = {}) {
  const t = await token();
  const r = await fetch(path, { method, headers: { 'Content-Type': 'application/json', ...(t ? { Authorization: 'Bearer ' + t } : {}) }, body: body && JSON.stringify(body) });
  if (raw) { if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || '下載失敗'); return r; }
  const data = await r.json().catch(() => ({ error: '伺服器沒有回應，請稍後再試' }));
  if (!r.ok || data.error) { const e = new Error(data.error || '發生錯誤'); e.status = r.status; throw e; }
  return data;
}

// LINE、Facebook、Instagram 等 App 內建的瀏覽器，Google 不允許在裡面登入
export function inAppBrowser() {
  const ua = navigator.userAgent;
  if (/\bLine\//i.test(ua)) return 'LINE';
  if (/FBAN|FBAV|FB_IAB/i.test(ua)) return 'Facebook';
  if (/Instagram/i.test(ua)) return 'Instagram';
  if (/MicroMessenger|WhatsApp|Threads/i.test(ua)) return 'App';
  return '';
}

// Google 登入：在 LINE 裡自動改用手機瀏覽器開啟同一頁；其他 App 請顧客改用瀏覽器
export async function googleSignIn() {
  const app = inAppBrowser();
  if (app === 'LINE') {
    const u = new URL(location.href);
    u.searchParams.set('openExternalBrowser', '1');
    location.href = u.toString();
    return new Promise(() => {}); // 頁面會跳走
  }
  if (app) throw new Error(`${app} 裡面不能用 Google 登入，請點右上角「⋯」選「用瀏覽器開啟」，或改用 Email 登入`);
  const F = await auth();
  const p = new F.GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return F.signInWithPopup(F.auth, p);
}
