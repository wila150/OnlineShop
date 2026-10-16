export class UserError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

export const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  });

export function fail(e) {
  if (e instanceof UserError) return json({ error: e.message }, e.status);
  console.error(e);
  return json({ error: '系統忙碌，請稍後再試' }, 500);
}

export async function readJSON(request) {
  try { return await request.json(); } catch { throw new UserError('資料格式錯誤'); }
}

// 字串欄位：去空白、限制長度
export const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
export const num = (v, min = 0, max = 1e9) => {
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : min;
};
export const int = (v, min = 0, max = 1e9) => Math.round(num(v, min, max));
export const bool = (v) => v === true || v === 'true' || v === 1;
export const id = (v) => String(v ?? '').replace(/[^\w-]/g, '').slice(0, 64);
