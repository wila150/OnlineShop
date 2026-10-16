// 媒體櫃：圖片縮到最長邊 2000px、轉成 WebP，存到 Storage 的 media/ 底下（公開可讀）
import { getStorage } from 'firebase-admin/storage';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import * as D from './db.js';
import { UserError, str } from './http.js';

function publicUrl(bucket, path, token) {
  const enc = encodeURIComponent(path);
  const emu = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
  if (emu) return `http://${emu.replace(/^https?:\/\//, '')}/v0/b/${bucket}/o/${enc}?alt=media`;
  return `https://firebasestorage.googleapis.com/v0/b/${bucket}/o/${enc}?alt=media&token=${token}`;
}

// data：base64（可以含 data:image/...;base64, 開頭）
export async function upload({ name, data, folder }) {
  const b64 = String(data || '').replace(/^data:[^;]+;base64,/, '');
  const buf = Buffer.from(b64, 'base64');
  if (!buf.length) throw new UserError('沒有收到圖片');
  if (buf.length > 15 * 1024 * 1024) throw new UserError('圖片太大了（上限 15MB）');
  let img;
  try {
    img = sharp(buf, { animated: true }).rotate();
    const meta = await img.metadata();
    if (!meta.width) throw new Error('not image');
  } catch { throw new UserError('看不懂這個檔案，請上傳 JPG、PNG、WebP 或 GIF'); }
  const out = await img.resize({ width: 2000, height: 2000, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  const id = D.code(12);
  const path = `media/${id}.webp`;
  const bucket = getStorage().bucket();
  const token = randomUUID();
  await bucket.file(path).save(out.data, { contentType: 'image/webp', metadata: { cacheControl: 'public, max-age=31536000', metadata: { firebaseStorageDownloadTokens: token } } });
  const doc = {
    name: str(name, 80).replace(/\.[a-z0-9]+$/i, '') || id,
    url: publicUrl(bucket.name, path, token), path,
    folder: str(folder, 30), w: out.info.width, h: out.info.height, size: out.info.size, tags: [], createdAt: Date.now(),
  };
  await D.db().doc('media/' + id).set(doc);
  return { id, ...doc };
}

export async function remove(id) {
  const m = await D.one('media', id);
  if (!m) return;
  await getStorage().bucket().file(m.path).delete().catch(() => {});
  await D.db().doc('media/' + id).delete();
}
