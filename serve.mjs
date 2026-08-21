// 패드에서 접속해 놀 수 있도록 이 폴더를 같은 와이파이에 공개한다.
//   node serve.mjs          (기본 8080 포트)
//   node serve.mjs 3000
// 실행하면 패드 브라우저에 입력할 주소가 화면에 나온다.

import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.argv[2]) || 8080;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    const url = decodeURIComponent((req.url || '/').split('?')[0]);
    let rel = url === '/' ? 'index.html' : url.replace(/^\/+/, '');
    // 폴더 밖으로 나가는 경로는 막는다
    const full = path.resolve(ROOT, rel);
    if (!full.startsWith(ROOT)) {
      res.writeHead(403).end('403');
      return;
    }
    const stat = await fsp.stat(full).catch(() => null);
    if (!stat || stat.isDirectory()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('파일 없음');
      return;
    }
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(full).toLowerCase()] || 'application/octet-stream',
      'Content-Length': stat.size,
      'Cache-Control': 'public, max-age=86400',
    });
    fs.createReadStream(full).pipe(res);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }).end(`오류: ${err.message}`);
  }
});

server.listen(PORT, () => {
  const addrs = [];
  for (const list of Object.values(os.networkInterfaces())) {
    for (const net of list || []) {
      if (net.family === 'IPv4' && !net.internal) addrs.push(net.address);
    }
  }
  console.log('\n=== 포켓몬 도감 퀴즈 서버 시작 ===\n');
  console.log('이 PC에서 보기:');
  console.log(`   http://localhost:${PORT}\n`);
  if (addrs.length) {
    console.log('같은 와이파이에 연결된 패드 브라우저에 입력:');
    addrs.forEach((a) => console.log(`   http://${a}:${PORT}`));
  } else {
    console.log('(네트워크 주소를 찾지 못했습니다. 와이파이 연결을 확인해 주세요.)');
  }
  console.log('\n끝낼 때는 이 창에서 Ctrl+C\n');
});
