// PokéAPI에서 1~7세대(802마리) 한글 데이터와 공식 일러스트를 수집해
// data/pokedex.json + images/ 로 저장한다. 제작 시 1회만 실행.
//
//   node tools/build-data.mjs           전체 수집
//   node tools/build-data.mjs --no-img  JSON만 (이미지 건너뜀)
//
// 응답은 CACHE_DIR에 캐시하므로 재실행은 네트워크를 거의 쓰지 않는다.

import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

const ROOT = path.resolve(import.meta.dirname, '..');
const API = 'https://pokeapi.co/api/v2';
const MAX_ID = 802;
const CONCURRENCY = 12;
const CACHE_DIR =
  process.env.POKEDEX_CACHE ||
  path.join(os.tmpdir(), 'claude', 'pokeapi-cache');
const SKIP_IMAGES = process.argv.includes('--no-img');

const REGIONS = [
  { region: '관동', gen: 1, from: 1, to: 151 },
  { region: '성도', gen: 2, from: 152, to: 251 },
  { region: '호연', gen: 3, from: 252, to: 386 },
  { region: '신오', gen: 4, from: 387, to: 493 },
  { region: '하나', gen: 5, from: 494, to: 649 },
  { region: '칼로스', gen: 6, from: 650, to: 721 },
  { region: '알로라', gen: 7, from: 722, to: 802 },
];

// 도감 설명은 아이가 읽는 본문이므로 썬/문 계열을 우선한다(책과 같은 세대).
const FLAVOR_PRIORITY = [
  'sun', 'moon', 'ultra-sun', 'ultra-moon',
  'omega-ruby', 'alpha-sapphire', 'x', 'y',
  'black-2', 'white-2', 'black', 'white',
  'heartgold', 'soulsilver', 'platinum', 'diamond', 'pearl',
  'emerald', 'ruby', 'sapphire', 'firered', 'leafgreen',
  'sword', 'shield', 'lets-go-pikachu', 'lets-go-eevee',
];

let cacheHits = 0;
let fetched = 0;

function log(msg) {
  process.stdout.write(`${msg}\n`);
}

function cachePath(url) {
  const key = url.replace(`${API}/`, '').replace(/\/$/, '').replace(/[/?=&]/g, '_');
  return path.join(CACHE_DIR, `${key}.json`);
}

async function getJson(url, { retries = 4 } = {}) {
  const cached = cachePath(url);
  try {
    const raw = await fs.readFile(cached, 'utf8');
    cacheHits += 1;
    return JSON.parse(raw);
  } catch {
    // 캐시 미스 → 네트워크
  }
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'pokemon-quiz-builder' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      await fs.writeFile(cached, JSON.stringify(data), 'utf8');
      fetched += 1;
      if (fetched % 200 === 0) log(`  ...${fetched}건 수신`);
      return data;
    } catch (err) {
      if (attempt === retries) throw new Error(`${url} 실패: ${err.message}`);
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
    }
  }
  return null;
}

// 동시 실행 수를 제한한 map
async function mapLimit(items, limit, worker) {
  const out = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const i = cursor;
      cursor += 1;
      out[i] = await worker(items[i], i);
    }
  });
  await Promise.all(runners);
  return out;
}

const ko = (entries, field = 'name') =>
  entries?.find((e) => e.language?.name === 'ko')?.[field] ?? null;

function cleanText(text) {
  if (!text) return null;
  return text.replace(/[\n\f\r­]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
}

function pickFlavor(species) {
  const koEntries = (species.flavor_text_entries || []).filter(
    (e) => e.language?.name === 'ko',
  );
  if (!koEntries.length) return null;
  for (const version of FLAVOR_PRIORITY) {
    const hit = koEntries.find((e) => e.version?.name === version);
    if (hit) return cleanText(hit.flavor_text);
  }
  return cleanText(koEntries[koEntries.length - 1].flavor_text);
}

// 진화 체인 트리를 평탄화: { 영문종명 -> {from, to[]} }
function walkChain(node, parent, acc) {
  const name = node.species.name;
  const children = (node.evolves_to || []).map((c) => c.species.name);
  acc.set(name, {
    from: parent,
    to: children,
    detail: (node.evolution_details || [])[0] || null,
  });
  for (const child of node.evolves_to || []) walkChain(child, name, acc);
  return acc;
}

function evoConditionText(detail) {
  if (!detail) return null;
  const trigger = detail.trigger?.name;
  if (trigger === 'level-up' && detail.min_level) return `레벨 ${detail.min_level}이 되면`;
  if (trigger === 'level-up' && detail.min_happiness) return '아주 친해지면';
  if (trigger === 'use-item' && detail.item) return '특별한 돌을 쓰면';
  if (trigger === 'trade') return '친구와 교환하면';
  if (trigger === 'level-up') return '더 강해지면';
  return null;
}

async function buildLexicon() {
  log('[1/5] 타입·특성·기술 한글 이름 수집');
  const lex = { type: new Map(), ability: new Map(), move: new Map() };

  const typeList = await getJson(`${API}/type?limit=30`);
  await mapLimit(typeList.results, CONCURRENCY, async (t) => {
    const d = await getJson(t.url);
    lex.type.set(t.name, ko(d.names) || t.name);
  });

  const abilityList = await getJson(`${API}/ability?limit=400`);
  await mapLimit(abilityList.results, CONCURRENCY, async (a) => {
    const d = await getJson(a.url);
    lex.ability.set(a.name, ko(d.names) || a.name);
  });

  const moveList = await getJson(`${API}/move?limit=1000`);
  await mapLimit(moveList.results, CONCURRENCY, async (m) => {
    const d = await getJson(m.url);
    lex.move.set(m.name, {
      name: ko(d.names) || m.name,
      type: lex.type.get(d.type?.name) || d.type?.name || null,
      power: d.power ?? null,
      damageClass: d.damage_class?.name ?? null,
      desc: cleanText(ko(d.flavor_text_entries, 'flavor_text')),
    });
  });

  log(`      타입 ${lex.type.size} / 특성 ${lex.ability.size} / 기술 ${lex.move.size}`);
  return lex;
}

// 아이가 알아볼 만한 대표 기술 3개.
// 레벨업으로 스스로 배우는 기술(= 그 포켓몬의 상징기)을 최우선으로 하고,
// 위력 가중치는 낮춘다. 위력만 보면 아무 포켓몬이나 배우는 고위력 기술머신
// 기술이 뽑혀 힌트가 밋밋해진다(예: 피카츄에 10만볼트 대신 번개).
function pickMoves(pokemon, lex, ownTypes) {
  const scored = [];
  for (const entry of pokemon.moves || []) {
    const info = lex.move.get(entry.move.name);
    if (!info || !info.name) continue;

    const levels = (entry.version_group_details || [])
      .filter((v) => v.move_learn_method?.name === 'level-up')
      .map((v) => v.level_learned_at)
      .filter((n) => typeof n === 'number' && n > 0);
    const level = levels.length ? Math.min(...levels) : null;

    let score = 0;
    if (level !== null) score += 50;
    if (ownTypes.includes(info.type)) score += 35;
    if (info.damageClass !== 'status') score += 20;
    score += Math.min(info.power ?? 0, 120) / 12;
    // 레벨 1 기술은 너무 일반적(몸통박치기 등), 중반 습득기가 그 종의 특색을 담는다
    if (level !== null && level >= 8) score += 10;

    scored.push({ score, level, info });
  }
  scored.sort((a, b) => b.score - a.score);

  const seen = new Set();
  const out = [];
  for (const { info, level } of scored) {
    if (seen.has(info.name)) continue;
    seen.add(info.name);
    out.push({
      name: info.name,
      type: info.type,
      power: info.power,
      level,
      desc: info.desc,
    });
    if (out.length === 3) break;
  }
  return out;
}

async function main() {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  await fs.mkdir(path.join(ROOT, 'data'), { recursive: true });

  const lex = await buildLexicon();

  const ids = Array.from({ length: MAX_ID }, (_, i) => i + 1);

  log('[2/5] 포켓몬 종(species) 정보 수집');
  const speciesList = await mapLimit(ids, CONCURRENCY, (id) =>
    getJson(`${API}/pokemon-species/${id}`),
  );

  log('[3/5] 포켓몬 상세(타입·기술·크기) 수집');
  const pokemonList = await mapLimit(ids, CONCURRENCY, (id) =>
    getJson(`${API}/pokemon/${id}`),
  );

  log('[4/5] 진화 체인 수집');
  const chainUrls = [...new Set(speciesList.map((s) => s.evolution_chain?.url).filter(Boolean))];
  const chainMaps = new Map(); // 영문종명 -> {from,to,detail}
  const chainGroups = new Map(); // 영문종명 -> 같은 체인의 전체 종 목록(순서대로)
  await mapLimit(chainUrls, CONCURRENCY, async (url) => {
    const chain = await getJson(url);
    const flat = walkChain(chain.chain, null, new Map());
    const order = [...flat.keys()];
    for (const [name, rel] of flat) {
      chainMaps.set(name, rel);
      chainGroups.set(name, order);
    }
  });

  // 영문 종명 -> 한글 이름 (진화 상대 이름 표기용)
  const koBySpecies = new Map();
  speciesList.forEach((s) => koBySpecies.set(s.name, ko(s.names) || s.name));

  const regionOf = (id) => REGIONS.find((r) => id >= r.from && id <= r.to);

  const pokedex = [];
  const missingFlavor = [];

  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i];
    const sp = speciesList[i];
    const pm = pokemonList[i];
    const name = ko(sp.names) || sp.name;
    const types = (pm.types || [])
      .sort((a, b) => a.slot - b.slot)
      .map((t) => lex.type.get(t.type.name) || t.type.name);
    const abilities = (pm.abilities || [])
      .sort((a, b) => a.slot - b.slot)
      .map((a) => ({
        name: lex.ability.get(a.ability.name) || a.ability.name,
        hidden: a.is_hidden,
      }));
    const flavor = pickFlavor(sp);
    if (!flavor) missingFlavor.push(`${id} ${name}`);

    const rel = chainMaps.get(sp.name) || { from: null, to: [], detail: null };
    const group = chainGroups.get(sp.name) || [sp.name];
    const { region, gen } = regionOf(id);

    pokedex.push({
      id,
      name,
      genus: ko(sp.genera, 'genus'),
      types,
      abilities,
      height: (pm.height ?? 0) / 10, // m
      weight: (pm.weight ?? 0) / 10, // kg
      flavor,
      moves: pickMoves(pm, lex, types),
      evo: {
        from: rel.from ? koBySpecies.get(rel.from) || null : null,
        to: (rel.to || []).map((n) => koBySpecies.get(n)).filter(Boolean),
        condition: evoConditionText(rel.detail),
        line: group.map((n) => koBySpecies.get(n)).filter(Boolean),
        lineIds: group
          .map((n) => speciesList.find((s) => s.name === n)?.id)
          .filter((v) => typeof v === 'number'),
      },
      legendary: !!sp.is_legendary,
      mythical: !!sp.is_mythical,
      baby: !!sp.is_baby,
      gen,
      region,
      // 이미지는 optimize-images.mjs가 320px WebP로 변환한 결과를 쓴다
      img: `images/${String(id).padStart(3, '0')}.webp`,
      artUrl: pm.sprites?.other?.['official-artwork']?.front_default || null,
    });
  }

  const payload = {
    generatedFrom: 'PokéAPI (pokeapi.co)',
    count: pokedex.length,
    regions: REGIONS,
    pokemon: pokedex.map(({ artUrl, ...rest }) => rest),
  };
  const json = JSON.stringify(payload);

  const outFile = path.join(ROOT, 'data', 'pokedex.json');
  await fs.writeFile(outFile, json, 'utf8');
  // file:// 로 열면 fetch()가 CORS로 막히므로 <script>로 읽을 수 있는 형태도 함께 낸다.
  // 게임(index.html)이 실제로 쓰는 건 이 .js 쪽이다.
  await fs.writeFile(
    path.join(ROOT, 'data', 'pokedex.js'),
    `window.POKEDEX = ${json};\n`,
    'utf8',
  );
  const size = (await fs.stat(outFile)).size;
  log(`      data/pokedex.json + pokedex.js 저장 (${(size / 1024 / 1024).toFixed(2)} MB, ${pokedex.length}마리)`);
  if (missingFlavor.length) {
    log(`      한글 도감설명 없음 ${missingFlavor.length}마리: ${missingFlavor.slice(0, 10).join(', ')}...`);
    await fs.writeFile(
      path.join(ROOT, 'data', '_missing-flavor.txt'),
      missingFlavor.join('\n'),
      'utf8',
    );
  }

  if (SKIP_IMAGES) {
    log('[5/5] 이미지 건너뜀 (--no-img)');
  } else {
    log('[5/5] 공식 일러스트 다운로드');
    const imgDir = path.join(ROOT, 'images');
    await fs.mkdir(imgDir, { recursive: true });
    let saved = 0;
    let skipped = 0;
    const failed = [];
    await mapLimit(pokedex, 8, async (p) => {
      const dest = path.join(imgDir, path.basename(p.img));
      try {
        const st = await fs.stat(dest);
        if (st.size > 1000) {
          skipped += 1;
          return;
        }
      } catch {
        // 없으면 내려받는다
      }
      if (!p.artUrl) {
        failed.push(`${p.id} ${p.name} (URL 없음)`);
        return;
      }
      for (let attempt = 0; attempt < 4; attempt += 1) {
        try {
          const res = await fetch(p.artUrl);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          await fs.writeFile(dest, Buffer.from(await res.arrayBuffer()));
          saved += 1;
          if (saved % 100 === 0) log(`      ...이미지 ${saved}장`);
          return;
        } catch (err) {
          if (attempt === 3) failed.push(`${p.id} ${p.name}: ${err.message}`);
          else await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        }
      }
    });
    log(`      신규 ${saved}장 / 기존 ${skipped}장 / 실패 ${failed.length}장`);
    if (failed.length) log(`      실패: ${failed.slice(0, 10).join(', ')}`);
  }

  log(`\n완료. 캐시 적중 ${cacheHits}건, 신규 요청 ${fetched}건`);
  log(`캐시 위치: ${CACHE_DIR}`);
}

main().catch((err) => {
  console.error('\n실패:', err);
  process.exit(1);
});
