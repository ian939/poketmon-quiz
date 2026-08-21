/* 진행 상황 저장 (localStorage) */
(function () {
  'use strict';

  const KEY = 'pokequiz.save.v1';

  const empty = () => ({
    v: 1,
    caught: {},          // id -> { at, misses }
    escaped: {},         // id -> 도망간 횟수 (다시 출제 대상)
    unlocked: ['관동'],  // 열린 지역
    badges: {},          // "관동:gold" -> 획득 시각
    milestones: [],      // 이미 축하한 마일스톤
    stats: { streak: 0, bestStreak: 0, quizzes: 0, startedAt: Date.now() },
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
      return {
        ...base,
        ...parsed,
        caught: parsed.caught || {},
        escaped: parsed.escaped || {},
        unlocked: parsed.unlocked && parsed.unlocked.length ? parsed.unlocked : base.unlocked,
        badges: parsed.badges || {},
        milestones: parsed.milestones || [],
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

    markCaught(id, misses) {
      if (!Save.isCaught(id)) {
        state.caught[id] = { at: Date.now(), misses: misses || 0 };
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

    isUnlocked: (region) => state.unlocked.indexOf(region) !== -1,
    unlock(region) {
      if (!Save.isUnlocked(region)) {
        state.unlocked.push(region);
        persist();
        return true;
      }
      return false;
    },

    hasBadge: (key) => Object.prototype.hasOwnProperty.call(state.badges, key),
    awardBadge(key) {
      if (Save.hasBadge(key)) return false;
      state.badges[key] = Date.now();
      persist();
      return true;
    },
    badgeKeys: () => Object.keys(state.badges),

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
