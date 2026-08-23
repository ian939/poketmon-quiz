/* 진행 상황 저장 (localStorage) */
(function () {
  'use strict';

  const KEY = 'pokequiz.save.v1';

  // 챕터 잠금은 없다 — 아이가 아무 타입이나 바로 고를 수 있다.
  const empty = () => ({
    v: 2,
    profile: null,  // { trainer: 1~20, name: '이름' } — 처음 시작할 때 정한다
    caught: {},     // id -> { at, misses, src } — src: 'quiz' | 'book'
    escaped: {},    // id -> 도망간 횟수 (다시 출제 대상)
    badges: {},     // "물:gold" -> 획득 시각
    lines: {},      // "line:001" -> 진화 라인을 다 모은 시각
    stories: {},    // id -> 그 포켓몬의 도감 문장을 완성한 시각
    milestones: [], // 이미 축하한 마일스톤
    ranks: [],      // 이미 축하한 트레이너 등급 (등급 이름)
    stats: {
      streak: 0, bestStreak: 0, quizzes: 0,
      sentences: 0,           // 문장 조립으로 완성한 문장 수
      startedAt: Date.now(),
    },
    settings: { muted: false },
  });

  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return empty();
      const parsed = JSON.parse(raw);
      // 필드가 빠진 예전 저장본도 안전하게 열리도록 기본값과 합친다
      const base = empty();
      // 잡은 포켓몬은 그대로 살리고, 배지는 지역 기준이던 예전 것을 버린다
      // (v2에서 타입 기준으로 바뀌어 키가 맞지 않는다 — 다시 모으면 축하창이 뜬다)
      const badges = parsed.v === base.v ? parsed.badges || {} : {};
      return {
        ...base,
        ...parsed,
        v: base.v,
        unlocked: undefined,
        profile: parsed.profile && parsed.profile.name ? parsed.profile : null,
        caught: parsed.caught || {},
        escaped: parsed.escaped || {},
        badges,
        lines: parsed.lines || {},
        stories: parsed.stories || {},
        milestones: parsed.milestones || [],
        ranks: parsed.ranks || [],
        stats: { ...base.stats, ...(parsed.stats || {}) },
        settings: { ...base.settings, ...(parsed.settings || {}) },
      };
    } catch (err) {
      console.warn('저장 데이터를 읽지 못했습니다. 새로 시작합니다.', err);
      return empty();
    }
  }

  let pending = null;
  function persist() {
    // 연속 호출을 한 번으로 묶어 저장 (타일을 빠르게 누를 때 부담 줄이기)
    if (pending) return;
    pending = setTimeout(() => {
      pending = null;
      try {
        localStorage.setItem(KEY, JSON.stringify(state));
      } catch (err) {
        console.warn('저장 실패', err);
      }
    }, 120);
  }

  const Save = {
    get state() {
      return state;
    },
    isCaught: (id) => Object.prototype.hasOwnProperty.call(state.caught, id),
    caughtCount: () => Object.keys(state.caught).length,
    caughtIds: () => Object.keys(state.caught).map(Number),

    /** src: 'quiz'(단서 퀴즈) | 'book'(책에서 찾기) — 기록 화면에서 따로 센다 */
    markCaught(id, misses, src) {
      if (!Save.isCaught(id)) {
        state.caught[id] = { at: Date.now(), misses: misses || 0, src: src || 'quiz' };
      }
      delete state.escaped[id];
      state.stats.quizzes += 1;
      state.stats.streak += 1;
      if (state.stats.streak > state.stats.bestStreak) {
        state.stats.bestStreak = state.stats.streak;
      }
      persist();
    },

    markEscaped(id) {
      state.escaped[id] = (state.escaped[id] || 0) + 1;
      state.stats.quizzes += 1;
      state.stats.streak = 0;
      persist();
    },

    escapedCount: (id) => state.escaped[id] || 0,

    /* 내 캐릭터와 이름 */
    get profile() {
      return state.profile;
    },
    hasProfile: () => !!(state.profile && state.profile.name),
    setProfile(trainer, name) {
      state.profile = { trainer: Number(trainer), name: String(name).trim().slice(0, 8) };
      persist();
    },

    /** 특정 방법으로 잡은 마리 수 */
    caughtFrom(src) {
      let n = 0;
      for (const k of Object.keys(state.caught)) {
        if ((state.caught[k].src || 'quiz') === src) n += 1;
      }
      return n;
    },

    /* 진화 라인 완성 */
    hasLine: (key) => Object.prototype.hasOwnProperty.call(state.lines, key),
    awardLine(key) {
      if (!key || Save.hasLine(key)) return false;
      state.lines[key] = Date.now();
      persist();
      return true;
    },
    lineCount: () => Object.keys(state.lines).length,

    /* 문장 조립 기록 */
    /* 도감 문장 완성 — 포켓몬 한 마리에 하나 */
    hasStory: (id) => Object.prototype.hasOwnProperty.call(state.stories, id),
    markStory(id) {
      if (Save.hasStory(id)) return false;
      state.stories[id] = Date.now();
      persist();
      return true;
    },
    storyCount: () => Object.keys(state.stories).length,

    addSentence() {
      state.stats.sentences = (state.stats.sentences || 0) + 1;
      persist();
      return state.stats.sentences;
    },
    sentenceCount: () => state.stats.sentences || 0,

    hasBadge: (key) => Object.prototype.hasOwnProperty.call(state.badges, key),
    awardBadge(key) {
      if (Save.hasBadge(key)) return false;
      state.badges[key] = Date.now();
      persist();
      return true;
    },
    badgeKeys: () => Object.keys(state.badges),

    hasRank: (name) => state.ranks.indexOf(name) !== -1,
    markRank(name) {
      if (!Save.hasRank(name)) {
        state.ranks.push(name);
        persist();
      }
    },

    hasMilestone: (n) => state.milestones.indexOf(n) !== -1,
    markMilestone(n) {
      if (!Save.hasMilestone(n)) {
        state.milestones.push(n);
        persist();
      }
    },

    setMuted(v) {
      state.settings.muted = !!v;
      persist();
    },

    reset() {
      state = empty();
      try {
        localStorage.removeItem(KEY);
      } catch (err) {
        console.warn('초기화 실패', err);
      }
      persist();
    },
  };

  window.Save = Save;
})();
