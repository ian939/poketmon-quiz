/* 도감 데이터 조회 + 아이가 읽을 단서 문장 만들기
 *
 * 챕터는 지방이 아니라 **타입**으로 묶는다. 아이가 보는 책이 타입별로 실려 있어서
 * (풀 12~22쪽, 불꽃 23~30쪽, 물 31~45쪽 …) 화면 구성이 책과 같아야 찾기 쉽다. */
(function () {
  'use strict';

  const { josa } = window.U;

  const raw = window.POKEDEX;
  if (!raw || !raw.pokemon) {
    throw new Error('data/pokedex.js를 불러오지 못했습니다.');
  }
  const bookPages = window.BOOK_PAGES || {}; // { "피카츄": 76 } — 없으면 책 단서 생략

  const all = raw.pokemon;
  const byId = new Map(all.map((p) => [p.id, p]));

  const TYPE_COLORS = {
    노말: '#a8a878', 불꽃: '#f08030', 물: '#6890f0', 전기: '#f8d030',
    풀: '#78c850', 얼음: '#98d8d8', 격투: '#c03028', 독: '#a040a0',
    땅: '#e0c068', 비행: '#a890f0', 에스퍼: '#f85888', 벌레: '#a8b820',
    바위: '#b8a038', 고스트: '#705898', 드래곤: '#7038f8', 악: '#705848',
    강철: '#b8b8d0', 페어리: '#ee99ac',
  };

  // 책이 타입을 싣는 순서. data/book-pages.json의 페이지 번호에서 뽑아냈고,
  // 타입마다 페이지 구간이 거의 겹치지 않아 순서가 분명하다.
  const TYPE_ORDER = [
    '풀', '불꽃', '물', '벌레', '노말', '독', '땅', '전기', '격투',
    '에스퍼', '바위', '강철', '고스트', '얼음', '악', '드래곤', '비행', '페어리',
  ];

  const TYPE_NOTES = {
    풀: '풀과 나무를 닮은 포켓몬',
    불꽃: '뜨거운 불을 다루는 포켓몬',
    물: '물속에서 사는 포켓몬',
    벌레: '벌레를 닮은 포켓몬',
    노말: '특별한 힘은 없지만 튼튼한 포켓몬',
    독: '독을 쓰는 포켓몬',
    땅: '땅을 파고 흙을 다루는 포켓몬',
    전기: '번쩍번쩍 전기를 쓰는 포켓몬',
    격투: '주먹과 발차기로 싸우는 포켓몬',
    에스퍼: '마음의 힘을 쓰는 포켓몬',
    바위: '단단한 바위 같은 포켓몬',
    강철: '쇠처럼 튼튼한 포켓몬',
    고스트: '스르륵 사라지는 유령 포켓몬',
    얼음: '차가운 얼음을 다루는 포켓몬',
    악: '나쁜 꾀를 부리는 포켓몬',
    드래곤: '강하고 멋진 용 포켓몬',
    비행: '하늘을 나는 포켓몬',
    페어리: '반짝반짝 요정 포켓몬',
  };

  // 타입 챕터에는 그 타입을 하나라도 가진 포켓몬이 모두 들어간다.
  // (첫 번째 타입만 세면 비행 타입이 3마리밖에 안 된다 — 대부분 두 번째 타입이다)
  const byType = new Map();
  TYPE_ORDER.forEach((t) => byType.set(t, []));
  all.forEach((p) => {
    p.types.forEach((t) => {
      if (byType.has(t)) byType.get(t).push(p);
    });
  });

  // 홈 모자이크는 첫 번째 타입 기준으로 한 마리에 한 칸씩 — 책과 같은 순서로 늘어놓는다
  const typeRank = new Map(TYPE_ORDER.map((t, i) => [t, i]));
  const mosaicOrder = all.slice().sort((a, b) => {
    const ra = typeRank.has(a.types[0]) ? typeRank.get(a.types[0]) : 99;
    const rb = typeRank.has(b.types[0]) ? typeRank.get(b.types[0]) : 99;
    return ra - rb || a.id - b.id;
  });

  const byName = new Map(all.map((p) => [p.name, p]));

  /* ---------- 진화 ----------
   * evo.from 은 이름이라 id 로 바꿔 쓴다. lineIds 의 '바로 앞'을 쓰면 안 된다 —
   * 이브이 계열처럼 갈라지는 진화는 [이브이, 샤미드, 쥬피썬더 …] 로 평탄화돼 있어서
   * 쥬피썬더의 앞이 샤미드로 잡힌다. */
  function evoFromId(p) {
    const from = p.evo && p.evo.from;
    if (!from) return null;
    const prev = byName.get(from);
    return prev ? prev.id : null;
  }

  /** 진화 라인의 대표 키 — 라인 안 가장 작은 도감 번호 */
  function lineKey(p) {
    const ids = (p.evo && p.evo.lineIds) || [];
    if (ids.length < 2) return null;
    return `line:${String(Math.min.apply(null, ids)).padStart(3, '0')}`;
  }

  // 2단계 이상인 진화 라인의 개수 (기록 화면의 분모)
  const EVO_LINES = (function () {
    const keys = new Set();
    all.forEach((p) => {
      const k = lineKey(p);
      if (k) keys.add(k);
    });
    return keys.size;
  })();

  /* ---------- 전설·환상 ---------- */
  const isSpecial = (p) => !!(p && (p.legendary || p.mythical));
  const SPECIALS = all.filter(isSpecial).length;

  /** 배경색이 밝으면 검은 글자, 어두우면 흰 글자 (읽기 대비 확보) */
  function textOn(hex) {
    const c = String(hex).replace('#', '');
    const lin = [0, 2, 4]
      .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    const lum = 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
    return lum > 0.42 ? '#211d16' : '#fffcf2';
  }

  // 타입 챕터 3단계 배지 — 완주까지 기다리지 않고 중간에도 보상이 오게
  const BADGE_TIERS = [
    { key: 'bronze', label: '동배지', ratio: 0.2, mark: '동', color: '#a9682f' },
    { key: 'silver', label: '은배지', ratio: 0.5, mark: '은', color: '#7d8890' },
    { key: 'gold', label: '금배지', ratio: 1.0, mark: '금', color: '#d9a428' },
  ];

  const MILESTONES = [1, 5, 10, 25, 50, 100, 150, 200, 300, 400, 500, 650, 802];

/* 트레이너 등급 — 도감 수에 따라 8단계로 자란다.
 * 초반 칸은 좁게(10·30) 잡아 시작하자마자 한 번 올라가 보게 하고,
 * 뒤로 갈수록 넓혀 마지막 '전설'은 802마리 완성으로 둔다.
 * 이름은 일곱 살이 읽을 수 있는 낱말만 썼다.
 */
  const TRAINER_RANKS = [
    { at: 0, name: '시작 트레이너', color: '#9aa2a8' },
    { at: 10, name: '새내기 트레이너', color: '#7fa86b' },
    { at: 30, name: '씩씩한 트레이너', color: '#3f9b78' },
    { at: 70, name: '멋진 트레이너', color: '#3a8cae' },
    { at: 150, name: '뛰어난 트레이너', color: '#5567c2' },
    { at: 300, name: '대단한 트레이너', color: '#8a54bd' },
    { at: 550, name: '최고의 트레이너', color: '#cf3a2c' },
    { at: 802, name: '전설의 트레이너', color: '#d9a428' },
  ];

  /**
   * 지금 도감 수의 등급과 '다음 등급까지 몇 마리'를 알려 준다.
   * ratio는 지금 등급 안에서의 진행률 — 막대 길이에 쓴다.
   */
  function rankOf(caught) {
    let i = 0;
    for (let k = 0; k < TRAINER_RANKS.length; k += 1) {
      if (caught >= TRAINER_RANKS[k].at) i = k;
    }
    const rank = TRAINER_RANKS[i];
    const next = TRAINER_RANKS[i + 1] || null;
    const need = next ? next.at - caught : 0;
    const span = next ? next.at - rank.at : 1;
    return {
      index: i, rank, next, need,
      step: i + 1,
      steps: TRAINER_RANKS.length,
      ratio: next ? Math.min(1, (caught - rank.at) / span) : 1,
    };
  }

  /* ---------- 단서 문장 ---------- */

  function typeHint(p) {
    const t = p.types;
    if (t.length === 2) return `${t[0]} 타입이면서 ${t[1]} 타입이야.`;
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

  // '레벨 36이 되면' 같은 게임 수치는 책에도 없고 아이에게 필요하지도 않다
  function softenCondition(c) {
    if (!c) return null;
    return /레벨/.test(c) ? '더 자라면' : c;
  }

  function evoHint(p) {
    const { from, to } = p.evo || {};
    const condition = softenCondition((p.evo || {}).condition);
    const parts = [];
    if (from) {
      // condition 은 "더 자라면" 같은 조건절이므로 뒤를 '진화한 모습'으로 맺는다
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

  function homeHint(p) {
    if (!p.region) return null;
    return `${p.region} 지방에서 온 포켓몬이야.`;
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
   * 책에 실린 도감 설명을 맨 앞에 둔다 — 읽을거리가 가장 많고, 아이가 책에서 본
   * 문장을 떠올리게 하는 단서라서 먼저 읽는 게 맞다. 그 뒤는 쉬운 단서 → 결정적 단서 순.
   * kind는 화면에서 행 색을 나누는 데 쓴다(도감 설명·책 단서는 다르게 보인다).
   */
  function hintsFor(p) {
    const cards = [];
    const add = (label, text, kind) => {
      if (text) cards.push({ label, text, kind: kind || 'plain' });
    };
    add('도감', maskName(p.flavor, p.name), 'flavor');
    add('타입', typeHint(p));
    add('별명', genusHint(p));
    add('크기', sizeHint(p));
    add('고향', homeHint(p));
    add('특성', abilityHint(p));
    add('진화', evoHint(p));
    add('특별', specialHint(p));
    add('책', bookHint(p), 'book');
    return cards;
  }

  /* ---------- 문장 조립용 후보 ----------
   * 도감 설명을 문장으로 나누고, 어절 타일로 만들기 좋은 것만 남긴다.
   *   - 3~6어절 (7어절 이상은 타일이 너무 많다)
   *   - 제 이름이 든 문장은 제외 (○○○를 섞으면 어색하다)
   *   - 같은 어절이 두 번 나오는 문장은 제외 (어느 타일이든 맞아 판정이 흐릿하다)
   *   - 끝 마침표는 떼어 낸다 — 타일에 '…다.' 가 보이면 마지막 어절이 드러난다
   * 후보 728개 / 552마리. */
  const SENT_MIN = 3;
  const SENT_MAX = 6;

  /** 문장 단위로 나눈다 (정규식 lookbehind 는 옛 사파리에서 안 되므로 직접 자른다) */
  function splitSentences(text) {
    const out = [];
    let buf = '';
    for (const ch of String(text || '')) {
      buf += ch;
      if (ch === '.' || ch === '!' || ch === '?') {
        out.push(buf.trim());
        buf = '';
      }
    }
    if (buf.trim()) out.push(buf.trim());
    return out.filter(Boolean);
  }

  const sentenceCache = new Map();

  /** 포켓몬 하나의 문장 후보 — [{ words: [...], text: '원문' }, ...] */
  function sentencesFor(p) {
    if (!p) return [];
    if (sentenceCache.has(p.id)) return sentenceCache.get(p.id);
    const out = [];
    splitSentences(p.flavor).forEach((raw) => {
      if (raw.indexOf(p.name) >= 0) return;
      const bare = raw.replace(/[.!?]+$/, '').trim();
      const words = bare.split(/\s+/).filter(Boolean);
      if (words.length < SENT_MIN || words.length > SENT_MAX) return;
      if (new Set(words).size !== words.length) return;
      out.push({ words, text: bare });
    });
    sentenceCache.set(p.id, out);
    return out;
  }

  /** 문장 후보가 있는 포켓몬인지 */
  const hasSentence = (p) => sentencesFor(p).length > 0;

  /* ---------- 함정 글자 풀 ---------- */
  // 실제 포켓몬 이름에 쓰이는 글자만 모아 그럴듯하게 보이도록 한다
  const syllablePool = (function () {
    const freq = new Map();
    all.forEach((p) => {
      for (const ch of p.name) {
        if (ch >= '가' && ch <= '힣') freq.set(ch, (freq.get(ch) || 0) + 1);
      }
    });
    const pool = [];
    freq.forEach((count, ch) => {
      for (let i = 0; i < Math.min(count, 6); i += 1) pool.push(ch);
    });
    return pool;
  })();

  window.Data = {
    all,
    mosaicOrder,
    typeNames: TYPE_ORDER,
    TYPE_NOTES,
    TYPE_COLORS,
    BADGE_TIERS,
    MILESTONES,
    TRAINER_RANKS,
    rankOf,
    syllablePool,
    get: (id) => byId.get(Number(id)),
    getByName: (name) => byName.get(name) || null,
    inType: (type) => byType.get(type) || [],
    evoFromId,
    lineKey,
    isSpecial,
    EVO_LINES,
    SPECIALS,
    typeSize: (type) => (byType.get(type) || []).length,
    total: all.length,
    bookPage: (name) => bookPages[name] || null,
    hintsFor,
    sentencesFor,
    hasSentence,
    typeColor: (t) => TYPE_COLORS[t] || '#9e9e9e',
    typeTextColor: (t) => textOn(TYPE_COLORS[t] || '#9e9e9e'),
    typeNote: (t) => TYPE_NOTES[t] || '',
  };
})();
