// 공식 일러스트(475px PNG, 장당 130KB)를 320px WebP로 줄인다.
// 패드로 폴더를 옮기기 쉽게 하려는 목적. 투명 배경은 그대로 유지한다.
//   node tools/optimize-images.mjs [원본폴더]
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import sharp from 'sharp';

const ROOT = path.resolve(import.meta.dirname, '..');
const SRC = process.argv[2] || path.join(os.tmpdir(), 'claude', 'pokeapi-art-original');
const OUT = path.join(ROOT, 'images');
const SIZE = 320;

const files = (await fs.readdir(SRC)).filter((f) => f.endsWith('.png')).sort();
await fs.mkdir(OUT, { recursive: true });

let done = 0;
let bytesIn = 0;
let bytesOut = 0;
const failed = [];

async function mapLimit(items, limit, worker) {
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (cursor < items.length) {
        const item = items[cursor];
        cursor += 1;
        await worker(item);
      }
    }),
  );
}

await mapLimit(files, 8, async (file) => {
  const src = path.join(SRC, file);
  const dest = path.join(OUT, file.replace(/\.png$/, '.webp'));
  try {
    bytesIn += (await fs.stat(src)).size;
    await sharp(src)
      .trim({ threshold: 1 }) // 투명 여백 제거 → 실루엣이 화면을 꽉 채운다
      .resize(SIZE, SIZE, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 88, effort: 5 })
      .toFile(dest);
    bytesOut += (await fs.stat(dest)).size;
    done += 1;
    if (done % 100 === 0) process.stdout.write(`  ...${done}장\n`);
  } catch (err) {
    failed.push(`${file}: ${err.message}`);
  }
});

// PNG 원본은 images/에서 치운다(WebP만 사용)
for (const file of await fs.readdir(OUT)) {
  if (file.endsWith('.png')) await fs.unlink(path.join(OUT, file));
}

process.stdout.write(
  `완료 ${done}장 / 실패 ${failed.length}장\n` +
    `${(bytesIn / 1024 / 1024).toFixed(1)} MB → ${(bytesOut / 1024 / 1024).toFixed(1)} MB ` +
    `(장당 평균 ${Math.round(bytesOut / done / 1024)} KB)\n`,
);
if (failed.length) process.stdout.write(`실패: ${failed.slice(0, 10).join('\n')}\n`);
