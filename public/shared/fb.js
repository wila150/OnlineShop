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
