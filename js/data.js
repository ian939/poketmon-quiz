/* 도감 데이터 조회 + 아이가 읽을 힌트 문장 만들기 */
(function () {
  'use strict';

  const { josa } = window.U;

  const raw = window.POKEDEX;
  if (!raw || !raw.pokemon) {
    throw new Error('data/pokedex.js를 불러오지 못했습니다.');
  }
  const bookPages = window.BOOK_PAGES || {}; // { "피카츄": 76 } — 없으면 책 힌트 생략

  const all = raw.pokemon;
  const byId = new Map(all.map((p) => [p.id, p]));
  const regions = raw.regions;

  // 지역별 목록 (도감 번호 순)
  const byRegion = new Map();
  regions.forEach((r) => byRegion.set(r.region, []));
  all.forEach((p) => byRegion.get(p.region).push(p));

  // 함정 글자용 음절 풀: 실제 포켓몬 이름에 쓰이는 글자만 모아
  // 그럴듯하게 보이도록 한다(무작위 한글은 티가 난다).
  const syllablePool = (function () {
    const freq = new Map();
    all.forEach((p) => {
      for (const ch of p.name) {
        if (ch >= '가' && ch <= '힣') freq.set(ch, (freq.get(ch) || 0) + 1);
      }
    });
    // 자주 쓰이는 글자가 더 자주 뽑히도록 빈도만큼 넣는다
    const pool = [];
    freq.forEach((count, ch) => {
      for (let i = 0; i < Math.min(count, 6); i += 1) pool.push(ch);
    });
    return pool;
  })();

  const TYPE_COLORS = {
    노말: '#a8a878', 불꽃: '#f08030', 물: '#6890f0', 전기: '#f8d030',
    풀: '#78c850', 얼음: '#98d8d8', 격투: '#c03028', 독: '#a040a0',
    땅: '#e0c068', 비행: '#a890f0', 에스퍼: '#f85888', 벌레: '#a8b820',
    바위: '#b8a038', 고스트: '#705898', 드래곤: '#7038f8', 악: '#705848',
    강철: '#b8b8d0', 페어리: '#ee99ac',
  };

  // color = 지방 카드 왼쪽 띠, tint = 홈 모자이크의 빈 칸 색
  // (아직 아무것도 안 잡았을 때도 7개 지방 구간이 보이도록 옅게 나눈다)
  const REGION_META = {
    관동: { color: '#e0483c', tint: '#ecd8c4', desc: '피카츄가 사는 첫 번째 지방' },
    성도: { color: '#e8a51d', tint: '#ebdfbe', desc: '전설의 새와 개가 있는 지방' },
    호연: { color: '#3f9a56', tint: '#dee3c3', desc: '바다와 화산이 있는 지방' },
    신오: { color: '#2b7cc4', tint: '#d6e0e2', desc: '시간과 공간의 포켓몬이 있는 지방' },
    하나: { color: '#5b6f7a', tint: '#dcdcd5', desc: '새로운 포켓몬이 가득한 지방' },
    칼로스: { color: '#8a3fa6', tint: '#e2d6de', desc: '메가진화가 시작된 지방' },
    알로라: { color: '#0f8f9c', tint: '#d4dfdd', desc: '섬으로 이루어진 따뜻한 지방' },
  };

  // 다음 지역을 열려면 현재 지역에서 이만큼 잡아야 한다
  const UNLOCK_NEED = 30;

  // 지역별 배지 3단계 — 완주까지 기다리지 않고 중간에도 보상이 오게.
  // mark/color는 화면에서 잉크 도장으로 그린다(이모지 대신).
  const BADGE_TIERS = [
    { key: 'bronze', label: '동배지', ratio: 0.2, mark: '동', color: '#a9682f' },
    { key: 'silver', label: '은배지', ratio: 0.5, mark: '은', color: '#7d8890' },
    { key: 'gold', label: '금배지', ratio: 1.0, mark: '금', color: '#d9a428' },
  ];

  const MILESTONES = [1, 5, 10, 25, 50, 100, 150, 200, 300, 400, 500, 650, 802];

  /* ---------- 힌트 문장 ---------- */

  function typeHint(p) {
    const t = p.types;
    if (t.length === 2) {
      return `${t[0]} 타입이면서 ${t[1]} 타입이야.`;
    }
    return `${t[0]} 타입 포켓몬이야.`;
  }

  function genusHint(p) {
    if (!p.genus) return null;
    return `사람들은 나를 ${josa.ira(p.genus)}고 불러.`;
  }

  function sizeHint(p) {
    // 단위를 한글로 적어 소리내어 읽기 연습이 되게 한다
    const h = p.height ? `${p.height.toFixed(1)}미터` : null;
    const w = p.weight ? `${p.weight.toFixed(1)}킬로그램` : null;
    if (h && w) return `키는 ${h}, 몸무게는 ${w}이야.`;
    if (h) return `키는 ${h}이야.`;
    return null;
  }

  function abilityHint(p) {
    const open = (p.abilities || []).filter((a) => !a.hidden).map((a) => a.name);
    if (!open.length) return null;
    return `${josa.ira(open[0])}는 특성을 가지고 있어.`;
  }

  function moveHint(p) {
    const names = (p.moves || []).map((m) => m.name);
    if (!names.length) return null;
    if (names.length === 1) return `${josa.eul(names[0])} 쓸 수 있어!`;
    return `${names.slice(0, 3).join(', ')} 같은 기술을 쓸 수 있어!`;
  }

  function evoHint(p) {
    const { from, to, condition } = p.evo || {};
    const parts = [];
    if (from) {
      // condition 자체가 "레벨 36이 되면" 같은 조건절이므로 뒤를 '진화한 모습'으로 맺는다
      parts.push(
        condition
          ? `${josa.i(from)} ${condition} 진화한 모습이 바로 나야.`
          : `${josa.i(from)} 진화하면 바로 나야.`,
      );
    }
    if (to && to.length === 1) {
      parts.push(`그리고 나는 ${josa.ro(to[0])} 진화해!`);
    } else if (to && to.length > 1) {
      parts.push(`나는 ${to.slice(0, 3).join(', ')} 같은 모습으로 진화할 수 있어!`);
    }
    if (!parts.length) return '나는 진화하지 않는 포켓몬이야.';
    return parts.join(' ');
  }

  function specialHint(p) {
    if (p.mythical) return '아주 만나기 어려운 환상의 포켓몬이야!';
    if (p.legendary) return '아주 강한 전설의 포켓몬이야!';
    if (p.baby) return '아기 포켓몬이야.';
    return null;
  }

  function bookHint(p) {
    const page = bookPages[p.name];
    if (!page) return null;
    return `우리 책 ${page}쪽에 내가 있어! 찾아볼까?`;
  }

  // 도감 설명에는 제 이름이 그대로 들어 있는 경우가 많다("피카츄는 …").
  // 그대로 보여 주면 정답이 새므로 ○로 가린다.
  function maskName(text, name) {
    if (!text || !name) return text;
    return text.split(name).join('○'.repeat(name.length));
  }

  /**
   * 퀴즈 화면에 띄울 단서 목록.
   * 읽는 순서가 곧 난이도 순서(쉬운 단서 → 결정적 단서)가 되도록 배치한다.
   * kind는 화면에서 행 색을 나누는 데 쓴다(도감 설명·책 힌트는 다르게 보인다).
   */
  function hintsFor(p) {
    const cards = [];
    const add = (label, text, kind) => {
      if (text) cards.push({ label, text, kind: kind || 'plain' });
    };
    add('타입', typeHint(p), 'type');
    add('별명', genusHint(p));
    add('크기', sizeHint(p));
    add('특성', abilityHint(p));
    add('기술', moveHint(p));
    add('진화', evoHint(p));
    add('특별', specialHint(p));
    add('도감', maskName(p.flavor, p.name), 'flavor');
    add('책', bookHint(p), 'book');
    return cards;
  }

  const Data = {
    all,
    regions,
    regionNames: regions.map((r) => r.region),
    REGION_META,
    TYPE_COLORS,
    BADGE_TIERS,
    MILESTONES,
    UNLOCK_NEED,
    syllablePool,
    get: (id) => byId.get(Number(id)),
    inRegion: (region) => byRegion.get(region) || [],
    regionSize: (region) => (byRegion.get(region) || []).length,
    total: all.length,
    bookPage: (name) => bookPages[name] || null,
    hintsFor,
    typeColor: (t) => TYPE_COLORS[t] || '#9e9e9e',
  };

  window.Data = Data;
})();
