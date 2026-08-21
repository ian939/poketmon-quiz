// 색인 사진에서 판독한 TSV들을 합쳐 "포켓몬 이름 -> 책 페이지" 표를 만든다.
//   node tools/merge-book-pages.mjs <판독결과.tsv> [...]
//
// 타일이 서로 겹치게 잘렸고 판독도 여러 번 이뤄지므로, 같은 이름에 대해
// 여러 페이지 값이 오면 다수결로 정한다(오독을 걸러내는 효과).

import fs from 'node:fs/promises';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..');
const inputs = process.argv.slice(2);
if (!inputs.length) {
  console.error('사용법: node tools/merge-book-pages.mjs <tsv> [tsv...]');
  process.exit(1);
}

const dex = JSON.parse(await fs.readFile(path.join(ROOT, 'data', 'pokedex.json'), 'utf8'));
const dexNames = new Set(dex.pokemon.map((p) => p.name));

/* ---------- 1. 판독 결과 읽기 ---------- */
const votes = new Map(); // 이름 -> Map(페이지 -> 표수)
let lines = 0;
let skipped = 0;

for (const file of inputs) {
  let text;
  try {
    text = await fs.readFile(file, 'utf8');
  } catch (err) {
    console.error(`  건너뜀(읽기 실패): ${file} — ${err.message}`);
    continue;
  }
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const parts = line.split('\t').map((s) => s.trim()).filter(Boolean);
    if (parts.length < 2) {
      skipped += 1;
      continue;
    }
    const name = parts[0];
    const page = Number(parts[parts.length - 1]);
    if (!Number.isInteger(page) || page < 1 || page > 200) {
      skipped += 1;
      continue;
    }
    lines += 1;
    if (!votes.has(name)) votes.set(name, new Map());
    const tally = votes.get(name);
    tally.set(page, (tally.get(page) || 0) + 1);
  }
}

const resolved = new Map(); // 색인에 적힌 이름 -> 페이지 (다수결)
let disputed = 0;
for (const [name, tally] of votes) {
  const entries = [...tally.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  if (entries.length > 1) disputed += 1;
  resolved.set(name, entries[0][0]);
}

/* ---------- 2. 도감 이름과 맞추기 ---------- */
// "나옹(알로라의 모습)", "메가리자몽X", "원시가이오가" 같은 항목은
// 기본 폼 이름으로 되돌려 예비 후보로 쓴다(v1은 기본 폼만 다룬다).
function baseNameOf(name) {
  let s = name.replace(/\(.*?\)/g, '').trim();
  s = s.replace(/^(메가|원시|알로라)/, '');
  s = s.replace(/[XY]$/, '');
  return s.trim();
}

// 글자 하나만 다른 도감 이름 찾기 (사진 판독에서 '줄무마 / 줄뮤마'처럼 한 자가 틀리는 일이 있다)
function nearestByOneChar(name) {
  const hits = [];
  for (const dexName of dexNames) {
    if (dexName.length !== name.length) continue;
    let diff = 0;
    for (let i = 0; i < name.length && diff <= 1; i += 1) {
      if (name[i] !== dexName[i]) diff += 1;
    }
    if (diff === 1) hits.push(dexName);
  }
  return hits.length === 1 ? hits[0] : null; // 후보가 여럿이면 추측하지 않는다
}

const pages = {};       // 최종 결과
const fallback = {};    // 파생 이름에서 온 후보
const fuzzy = [];       // 한 글자 교정으로 연결한 것
const unmatched = [];   // 도감에 없는 색인 이름

for (const [name, page] of resolved) {
  if (dexNames.has(name)) {
    pages[name] = page;
    continue;
  }
  const base = baseNameOf(name);
  if (base && dexNames.has(base)) {
    // 같은 기본 폼에 여러 후보가 오면 가장 앞 페이지를 쓴다
    if (!(base in fallback) || page < fallback[base]) fallback[base] = page;
    continue;
  }
  const near = nearestByOneChar(name);
  if (near) {
    fuzzy.push(`${name} → ${near} (${page}쪽)`);
    if (!(near in pages)) pages[near] = page;
  } else {
    unmatched.push(`${name}\t${page}`);
  }
}
for (const [base, page] of Object.entries(fallback)) {
  if (!(base in pages)) pages[base] = page;
}

/* ---------- 3. 판독 품질 검증 ----------
 * 이 책은 도감 번호 순이 아니라 **타입별**로 묶여 있다
 * (풀 12~22쪽, 불꽃 23~30쪽, 물 31~45쪽, 벌레 46~54쪽, 노말 55쪽~ …).
 * 그래서 같은 페이지에 실린 포켓몬은 타입을 공유한다. 이 성질로 판독 품질을 잰다.
 *
 * 다만 타입이 바뀌는 경계 페이지에는 두 타입이 함께 실리므로,
 * 타입이 다르다는 이유로 항목을 버리지는 않는다(정상적인 경우가 섞여 있다). */
const typeOf = new Map(dex.pokemon.map((p) => [p.name, p.types]));

const inDexOrder = dex.pokemon
  .filter((p) => p.name in pages)
  .map((p) => ({ id: p.id, name: p.name, page: pages[p.name] }));

/** 페이지별 주 타입과, 그 타입이 얼마나 지배적인지 */
function dominantTypes(entries) {
  const byPage = new Map();
  entries.forEach((e) => {
    if (!byPage.has(e.page)) byPage.set(e.page, []);
    byPage.get(e.page).push(e);
  });
  const dom = new Map();
  for (const [page, list] of byPage) {
    const freq = new Map();
    list.forEach((e) =>
      (typeOf.get(e.name) || []).forEach((t) => freq.set(t, (freq.get(t) || 0) + 1)),
    );
    const top = [...freq.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top) dom.set(page, { type: top[0], count: top[1], size: list.length });
  }
  return { byPage, dom };
}

function typeConsistency(entries) {
  const { byPage, dom } = dominantTypes(entries);
  let matched = 0;
  let counted = 0;
  const oddballs = [];
  for (const [page, list] of byPage) {
    if (list.length < 3) continue; // 표본이 적은 페이지는 판정 보류
    const d = dom.get(page);
    if (!d) continue;
    counted += list.length;
    matched += d.count;
    if (d.count / list.length >= 0.7) {
      list
        .filter((e) => !(typeOf.get(e.name) || []).includes(d.type))
        .forEach((e) =>
          oddballs.push({ ...e, types: typeOf.get(e.name) || [], pageType: d.type }),
        );
    }
  }
  return { matched, counted, oddballs };
}

/* 사진이 휘어 판독이 한 행 밀리는 일이 있었다. 타입이 맞지 않는 항목 중,
 * 바로 앞/뒤 페이지의 주 타입이 그 포켓몬의 타입과 맞으면 그쪽으로 옮긴다. */
function fixOffByOneRow(entries) {
  const { dom } = dominantTypes(entries);
  const fixes = [];
  entries.forEach((e) => {
    const here = dom.get(e.page);
    const types = typeOf.get(e.name) || [];
    if (!here || here.size < 3 || here.count / here.size < 0.7) return;
    if (types.includes(here.type)) return; // 이미 맞음
    for (const delta of [-1, 1]) {
      const near = dom.get(e.page + delta);
      if (near && near.size >= 3 && types.includes(near.type)) {
        fixes.push({ name: e.name, from: e.page, to: e.page + delta, types });
        e.page = e.page + delta;
        return;
      }
    }
  });
  return fixes;
}

/* 그 페이지에 혼자만 실렸고 앞뒤 페이지의 타입과도 맞지 않는 항목은
 * 근거가 없는 판독으로 본다. 틀린 쪽으로 안내하는 것보다 힌트를 빼는 게 낫다. */
function dropUnsupported(entries) {
  const { dom } = dominantTypes(entries);
  const sizeOf = (page) => (dom.get(page) ? dom.get(page).size : 0);
  const dropped = [];
  const kept = entries.filter((e) => {
    if (sizeOf(e.page) > 1) return true;
    const types = typeOf.get(e.name) || [];
    const neighborOk = [-1, 1].some((d) => {
      const near = dom.get(e.page + d);
      return near && near.size >= 3 && types.includes(near.type);
    });
    if (neighborOk) return true;
    dropped.push({ ...e, types });
    return false;
  });
  return { kept, dropped };
}

const rowFixes = process.argv.includes('--no-row-fix') ? [] : fixOffByOneRow(inDexOrder);
const { kept: trusted, dropped: unsupported } = dropUnsupported(inDexOrder);
const quality = typeConsistency(trusted);

/* ---------- 4. 저장 ---------- */
const sorted = {};
trusted.forEach((e) => {
  sorted[e.name] = e.page;
});

await fs.writeFile(
  path.join(ROOT, 'data', 'book-pages.js'),
  '// 책(포켓몬스터 썬&문 전국대도감) 색인에서 뽑은 "포켓몬 이름 -> 책 페이지".\n' +
    '// tools/merge-book-pages.mjs 가 생성한다. 비어 있어도 게임은 정상 동작한다.\n' +
    `window.BOOK_PAGES = ${JSON.stringify(sorted, null, 0)};\n`,
  'utf8',
);
await fs.writeFile(path.join(ROOT, 'data', 'book-pages.json'), JSON.stringify(sorted), 'utf8');

const covered = Object.keys(sorted).length;
console.log(`판독 줄 ${lines}개 (형식 불량 ${skipped}개 무시)`);
console.log(`고유 색인 항목 ${resolved.size}개, 페이지가 엇갈린 항목 ${disputed}개(다수결로 결정)`);
console.log(
  `판독 품질(타입 일관성): ${quality.matched} / ${quality.counted} = ` +
    `${quality.counted ? Math.round((quality.matched / quality.counted) * 100) : 0}%` +
    ' — 같은 페이지 포켓몬이 타입을 공유하는 비율',
);
if (rowFixes.length) {
  console.log(`행 밀림 자동 교정 ${rowFixes.length}건:`);
  rowFixes.forEach((f) =>
    console.log(`  ${f.name}(${f.types.join('/')}) ${f.from}쪽 → ${f.to}쪽`),
  );
}
if (fuzzy.length) {
  console.log(`한 글자 판독 교정 ${fuzzy.length}건: ${fuzzy.join(', ')}`);
}
if (unsupported.length) {
  console.log(`근거 없어 제외 ${unsupported.length}건 (그 페이지에 혼자, 앞뒤 타입도 불일치):`);
  unsupported.forEach((e) =>
    console.log(`  ${e.name}(${e.types.join('/')}) ${e.page}쪽 — 책 힌트 생략`),
  );
}
if (quality.oddballs.length) {
  await fs.writeFile(
    path.join(ROOT, 'data', '_page-type-outlier.tsv'),
    '# 페이지의 주 타입과 타입이 겹치지 않는 항목.\n' +
      '# 타입이 바뀌는 경계 페이지에서는 정상이므로 버리지 않고 참고용으로만 남긴다.\n' +
      quality.oddballs
        .map((e) => `${e.id}\t${e.name}\t${e.page}\t${e.types.join('/')}\t페이지주타입:${e.pageType}`)
        .sort()
        .join('\n') +
      '\n',
    'utf8',
  );
  console.log(`  타입이 어긋난 항목 ${quality.oddballs.length}개 → data/_page-type-outlier.tsv (경계 페이지면 정상)`);
}
console.log(`최종 수록: ${covered} / ${dex.pokemon.length}마리 (${Math.round((covered / dex.pokemon.length) * 100)}%)`);
console.log(`도감에 없는 색인 이름: ${unmatched.length}개`);

if (unmatched.length) {
  await fs.writeFile(
    path.join(ROOT, 'data', '_unmatched-index.tsv'),
    `# 도감(PokéAPI 한글명)과 연결되지 않은 색인 항목 — 판독 오류이거나 별도 폼\n${unmatched.sort().join('\n')}\n`,
    'utf8',
  );
  console.log('  목록: data/_unmatched-index.tsv');
}

const missing = dex.pokemon.filter((p) => !(p.name in sorted)).map((p) => `${p.id}\t${p.name}`);
if (missing.length) {
  await fs.writeFile(
    path.join(ROOT, 'data', '_no-book-page.tsv'),
    `# 책 페이지를 못 찾은 포켓몬 (게임에서는 '책' 힌트만 생략됨)\n${missing.join('\n')}\n`,
    'utf8',
  );
  console.log(`페이지 없는 포켓몬: ${missing.length}마리 → data/_no-book-page.tsv`);
}
