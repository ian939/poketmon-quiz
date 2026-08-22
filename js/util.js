/* 공통 유틸: DOM, 한글 조사, 무작위, 효과음 */
(function () {
  'use strict';

  const HANGUL_START = 0xac00;
  const HANGUL_END = 0xd7a3;

  /** 마지막 글자에 받침이 있는지 */
  function hasJong(word) {
    if (!word) return false;
    const code = word.charCodeAt(word.length - 1);
    if (code < HANGUL_START || code > HANGUL_END) return false;
    return (code - HANGUL_START) % 28 !== 0;
  }

  function jongIndex(word) {
    if (!word) return 0;
    const code = word.charCodeAt(word.length - 1);
    if (code < HANGUL_START || code > HANGUL_END) return 0;
    return (code - HANGUL_START) % 28;
  }

  // 힌트 문장이 어색하지 않도록 조사를 받침에 맞춰 붙인다.
  const josa = {
    eun: (w) => w + (hasJong(w) ? '은' : '는'),
    i: (w) => w + (hasJong(w) ? '이' : '가'),
    eul: (w) => w + (hasJong(w) ? '을' : '를'),
    wa: (w) => w + (hasJong(w) ? '과' : '와'),
    // (으)로: 받침이 없거나 ㄹ 받침이면 '로'
    ro: (w) => {
      const j = jongIndex(w);
      return w + (j === 0 || j === 8 ? '로' : '으로');
    },
    ida: (w) => w + (hasJong(w) ? '이야' : '야'),
    // 인용형 어간: 뒤에 '고'(…이라고) 또는 '는'(…이라는)을 붙여 쓴다
    ira: (w) => w + (hasJong(w) ? '이라' : '라'),
  };

  function shuffle(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.from((root || document).querySelectorAll(sel));

  /* ---------- 효과음 (외부 파일 없이 Web Audio로 생성) ---------- */
  const Sound = (function () {
    let ctx = null;
    let muted = false;

    function ensure() {
      if (muted) return null;
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(freq, start, dur, gain, type) {
      const ac = ensure();
      if (!ac) return;
      const osc = ac.createOscillator();
      const amp = ac.createGain();
      osc.type = type || 'triangle';
      osc.frequency.value = freq;
      const t0 = ac.currentTime + start;
      amp.gain.setValueAtTime(0, t0);
      amp.gain.linearRampToValueAtTime(gain, t0 + 0.015);
      amp.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(amp).connect(ac.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    function melody(notes, gain) {
      notes.forEach(([freq, at, dur]) => tone(freq, at, dur, gain || 0.16));
    }

    return {
      tap: () => tone(660, 0, 0.07, 0.09, 'square'),
      erase: () => tone(300, 0, 0.08, 0.08, 'square'),
      wrong: () => {
        tone(220, 0, 0.14, 0.14, 'sawtooth');
        tone(170, 0.1, 0.2, 0.12, 'sawtooth');
      },
      correct: () => melody([[784, 0, 0.12], [988, 0.1, 0.12], [1319, 0.22, 0.3]]),
      catchBall: () => {
        tone(500, 0, 0.06, 0.1, 'square');
        tone(400, 0.18, 0.06, 0.1, 'square');
        tone(320, 0.36, 0.06, 0.1, 'square');
      },
      caught: () =>
        melody([
          [523, 0, 0.12], [659, 0.11, 0.12], [784, 0.22, 0.12],
          [1047, 0.34, 0.32], [784, 0.5, 0.3],
        ], 0.18),
      escape: () => {
        tone(400, 0, 0.1, 0.1, 'sine');
        tone(300, 0.1, 0.1, 0.1, 'sine');
        tone(200, 0.2, 0.25, 0.1, 'sine');
      },
      fanfare: () =>
        melody([
          [523, 0, 0.1], [523, 0.12, 0.1], [523, 0.24, 0.1], [659, 0.38, 0.4],
          [587, 0.8, 0.14], [659, 0.96, 0.14], [784, 1.12, 0.45],
        ], 0.18),
      unlock: () => melody([[392, 0, 0.14], [523, 0.14, 0.14], [659, 0.3, 0.35]], 0.17),
      // 진화: 올라가는 음이 반복되며 조여드는 느낌 → 마지막에 활짝
      evolveStart: () =>
        melody([
          [523, 0, 0.1], [587, 0.12, 0.1], [523, 0.24, 0.1], [587, 0.36, 0.1],
          [659, 0.48, 0.1], [698, 0.6, 0.1], [659, 0.72, 0.1], [784, 0.84, 0.14],
        ], 0.13),
      evolveDone: () =>
        melody([[784, 0, 0.14], [988, 0.14, 0.14], [1175, 0.28, 0.16], [1568, 0.46, 0.4]], 0.18),
      // 전설·환상: 더 길고 화려하게
      legendary: () =>
        melody([
          [523, 0, 0.12], [659, 0.12, 0.12], [784, 0.24, 0.12], [1047, 0.36, 0.2],
          [988, 0.58, 0.12], [1047, 0.7, 0.12], [1319, 0.84, 0.5], [1568, 1.0, 0.5],
        ], 0.17),
      setMuted: (v) => {
        muted = v;
        if (v && ctx) ctx.suspend();
      },
      isMuted: () => muted,
    };
  })();

  window.U = { hasJong, josa, shuffle, pick, el, $, $$, Sound };
})();
