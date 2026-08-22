/* 이름 따라 쓰기 — 정답을 맞힌 뒤 포켓몬 이름을 획 순서대로 써야 다음으로 넘어간다.
 *
 * 획 골격을 좌표로 들고 있어서(폰트에 기대지 않음) 안내선과 글자 모양이 늘 일치한다.
 * 각 획을 체크포인트로 잘라 두고, 시작점에서 출발해 순서대로 통과해야 인정한다.
 * 자모 획 데이터와 판정 방식은 사용자의 '한글쓰기 샘플'에서 가져와 맞춰 썼다.
 */
(function () {
  'use strict';

  // 쓰기 화면은 소리를 내지 않는다. 획마다 소리가 나면 한 이름에 스무 번 넘게
  // 울려서 시끄럽다. 잘못 그었을 때는 흔들림과 안내문으로 알려 준다.
  const { el, $ } = window.U;

  /* ================= 획 데이터 ================= */
  // 0~100 좌표계 (y는 아래로 증가)
  function arcPts(cx, cy, rx, ry, a0, a1) {
    const steps = Math.max(6, Math.round(Math.abs(a1 - a0) / 15));
    const out = [];
    for (let i = 0; i <= steps; i += 1) {
      const a = ((a0 + ((a1 - a0) * i) / steps) * Math.PI) / 180;
      out.push([+(cx + rx * Math.cos(a)).toFixed(1), +(cy + ry * Math.sin(a)).toFixed(1)]);
    }
    return out;
  }

  // 한글 자모 — 획 하나가 점 배열 하나
  const JAMO = {
    ㄱ: [[[10, 14], [88, 14], [72, 92]]],
    ㄴ: [[[16, 10], [16, 86], [90, 86]]],
    ㄷ: [[[12, 14], [88, 14]], [[12, 14], [12, 86], [88, 86]]],
    ㄹ: [[[12, 14], [84, 14], [70, 46]], [[16, 46], [84, 46]], [[16, 46], [16, 86], [84, 86]]],
    ㅁ: [[[14, 12], [14, 88]], [[14, 12], [86, 12], [86, 88]], [[14, 88], [86, 88]]],
    ㅂ: [[[16, 10], [16, 90]], [[84, 10], [84, 90]], [[16, 52], [84, 52]], [[16, 90], [84, 90]]],
    ㅅ: [[[50, 12], [14, 90]], [[54, 36], [88, 90]]],
    ㅇ: [arcPts(50, 50, 38, 38, -90, -450)],
    ㅈ: [[[10, 16], [90, 16]], [[50, 16], [14, 90]], [[54, 40], [88, 90]]],
    ㅊ: [[[36, 6], [64, 6]], [[10, 28], [90, 28]], [[50, 28], [14, 92]], [[54, 50], [88, 92]]],
    ㅋ: [[[10, 14], [88, 14], [72, 92]], [[30, 52], [86, 52]]],
    ㅌ: [[[12, 14], [88, 14]], [[12, 14], [12, 86], [88, 86]], [[12, 50], [88, 50]]],
    ㅍ: [[[8, 22], [92, 22]], [[28, 22], [28, 80]], [[72, 22], [72, 80]], [[8, 80], [92, 80]]],
    ㅎ: [[[36, 6], [64, 6]], [[14, 26], [86, 26]], arcPts(50, 64, 30, 30, -90, -450)],
    ㅏ: [[[30, 6], [30, 94]], [[30, 50], [86, 50]]],
    ㅑ: [[[30, 6], [30, 94]], [[30, 32], [86, 32]], [[30, 68], [86, 68]]],
    ㅓ: [[[14, 50], [70, 50]], [[70, 6], [70, 94]]],
    ㅕ: [[[14, 32], [70, 32]], [[14, 68], [70, 68]], [[70, 6], [70, 94]]],
    ㅗ: [[[50, 10], [50, 60]], [[8, 60], [92, 60]]],
    ㅛ: [[[32, 10], [32, 60]], [[68, 10], [68, 60]], [[8, 60], [92, 60]]],
    ㅜ: [[[8, 40], [92, 40]], [[50, 40], [50, 92]]],
    ㅠ: [[[8, 40], [92, 40]], [[32, 40], [32, 92]], [[68, 40], [68, 92]]],
    ㅡ: [[[8, 50], [92, 50]]],
    ㅣ: [[[50, 6], [50, 94]]],
    ㅐ: [[[24, 6], [24, 94]], [[24, 50], [66, 50]], [[80, 6], [80, 94]]],
    ㅒ: [[[24, 6], [24, 94]], [[24, 32], [66, 32]], [[24, 68], [66, 68]], [[80, 6], [80, 94]]],
    ㅔ: [[[14, 50], [52, 50]], [[52, 6], [52, 94]], [[80, 6], [80, 94]]],
    ㅖ: [[[14, 32], [52, 32]], [[14, 68], [52, 68]], [[52, 6], [52, 94]], [[80, 6], [80, 94]]],
    ㅘ: [[[26, 14], [26, 52]], [[4, 52], [50, 52]], [[68, 6], [68, 94]], [[68, 50], [96, 50]]],
    ㅙ: [[[24, 14], [24, 52]], [[2, 52], [46, 52]], [[62, 6], [62, 94]], [[62, 50], [82, 50]], [[92, 6], [92, 94]]],
    ㅚ: [[[26, 14], [26, 52]], [[4, 52], [50, 52]], [[74, 6], [74, 94]]],
    ㅝ: [[[4, 40], [50, 40]], [[26, 40], [26, 92]], [[62, 50], [88, 50]], [[88, 6], [88, 94]]],
    ㅞ: [[[4, 40], [46, 40]], [[24, 40], [24, 92]], [[60, 50], [78, 50]], [[78, 6], [78, 94]], [[92, 6], [92, 94]]],
    ㅟ: [[[4, 40], [50, 40]], [[26, 40], [26, 92]], [[74, 6], [74, 94]]],
    ㅢ: [[[6, 50], [62, 50]], [[78, 6], [78, 94]]],
  };

  // 쌍자음·겹받침은 기본 자모 두 개를 나란히 놓는다
  const JAMO_PAIR = {
    ㄲ: ['ㄱ', 'ㄱ'], ㄸ: ['ㄷ', 'ㄷ'], ㅃ: ['ㅂ', 'ㅂ'], ㅆ: ['ㅅ', 'ㅅ'], ㅉ: ['ㅈ', 'ㅈ'],
    ㄳ: ['ㄱ', 'ㅅ'], ㄵ: ['ㄴ', 'ㅈ'], ㄶ: ['ㄴ', 'ㅎ'], ㄺ: ['ㄹ', 'ㄱ'], ㄻ: ['ㄹ', 'ㅁ'],
    ㄼ: ['ㄹ', 'ㅂ'], ㄽ: ['ㄹ', 'ㅅ'], ㄾ: ['ㄹ', 'ㅌ'], ㄿ: ['ㄹ', 'ㅍ'], ㅀ: ['ㄹ', 'ㅎ'],
    ㅄ: ['ㅂ', 'ㅅ'],
  };

  // 802마리 이름에 한글 아닌 글자는 ♀ ♂ 2 Z : 다섯 개뿐이고,
  // 그중 획으로 쓸 수 있는 건 Z 하나다. 나머지는 획 데이터가 없어 자동으로 넘긴다.
  const LATIN = {
    Z: [[[30, 16], [70, 16]], [[70, 16], [30, 86]], [[30, 86], [70, 86]]],
  };

  const KO_CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'.split('');
  const KO_JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'.split('');
  const KO_JONG = ['', 'ㄱ', 'ㄲ', 'ㄳ', 'ㄴ', 'ㄵ', 'ㄶ', 'ㄷ', 'ㄹ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ',
    'ㄾ', 'ㄿ', 'ㅀ', 'ㅁ', 'ㅂ', 'ㅄ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ'];
  const KO_FLAT = 'ㅗㅛㅜㅠㅡ';        // 가로모음 — 초성이 위, 모음이 아래
  const KO_MIX = 'ㅘㅙㅚㅝㅞㅟㅢ';     // 섞임모음 — 모음이 상자 전체를 감싼다

  // 음절 짜임새별 자리 [x0, y0, x1, y1]
  const KO_BOX = {
    V: { cho: [4, 8, 54, 92], jung: [54, 4, 96, 96] },
    Vb: { cho: [4, 4, 52, 58], jung: [52, 2, 96, 60], jong: [14, 60, 86, 97] },
    H: { cho: [20, 6, 80, 50], jung: [4, 50, 96, 94] },
    Hb: { cho: [24, 2, 76, 34], jung: [4, 34, 96, 66], jong: [24, 64, 76, 97] },
    C: { cho: [6, 4, 50, 46], jung: [2, 2, 98, 97] },
    Cb: { cho: [6, 2, 48, 38], jung: [2, 0, 98, 72], jong: [20, 68, 80, 97] },
  };

  function fitStrokes(strokes, b) {
    const [x0, y0, x1, y1] = b;
    return strokes.map((st) => st.map((p) => [
      +(x0 + (p[0] / 100) * (x1 - x0)).toFixed(1),
      +(y0 + (p[1] / 100) * (y1 - y0)).toFixed(1),
    ]));
  }

  function jamoStrokes(j, b) {
    const pair = JAMO_PAIR[j];
    if (pair) {
      const w = b[2] - b[0];
      const gap = w * 0.05;
      const mid = b[0] + w / 2;
      return fitStrokes(JAMO[pair[0]] || [], [b[0], b[1], mid - gap, b[3]])
        .concat(fitStrokes(JAMO[pair[1]] || [], [mid + gap, b[1], b[2], b[3]]));
    }
    return fitStrokes(JAMO[j] || [], b);
  }

  /** 글자 하나 → 획 목록 (초성 → 중성 → 종성 순서). 쓸 수 없는 글자는 빈 배열 */
  function strokesFor(ch) {
    const code = ch.charCodeAt(0) - 0xac00;
    if (code < 0 || code > 11171) return LATIN[ch] || [];
    const cho = KO_CHO[Math.floor(code / 588)];
    const jung = KO_JUNG[Math.floor((code % 588) / 28)];
    const jong = KO_JONG[code % 28];
    const type = KO_MIX.indexOf(jung) >= 0 ? 'C' : KO_FLAT.indexOf(jung) >= 0 ? 'H' : 'V';
    const box = KO_BOX[type + (jong ? 'b' : '')];
    let out = jamoStrokes(cho, box.cho).concat(jamoStrokes(jung, box.jung));
    if (jong) out = out.concat(jamoStrokes(jong, box.jong));
    // 음절 전체를 칸 안쪽으로 — 획 끝의 둥근 마감까지 칸을 넘지 않게
    return fitStrokes(out, [13, 13, 87, 87]);
  }

  /** 꺾이지 않게 부드러운 곡선으로 (Catmull-Rom → 베지어) */
  function smoothD(pts) {
    if (pts.length < 3) return `M${pts.map((p) => `${p[0]} ${p[1]}`).join(' L ')}`;
    let d = `M${pts[0][0]} ${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6];
      const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6];
      d += ` C${c1[0].toFixed(1)} ${c1[1].toFixed(1)},${c2[0].toFixed(1)} ${c2[1].toFixed(1)},${p2[0]} ${p2[1]}`;
    }
    return d;
  }

  /** 획을 일정 간격 체크포인트로 자른다 (판정용) */
  function samplePts(pts, step) {
    const out = [pts[0].slice()];
    let carry = 0;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 0.001) continue;
      let t = (step - carry) / len;
      while (t <= 1) {
        out.push([x1 + (x2 - x1) * t, y1 + (y2 - y1) * t]);
        t += step / len;
      }
      carry = (carry + len) % step;
    }
    const last = pts[pts.length - 1];
    if (Math.hypot(out[out.length - 1][0] - last[0], out[out.length - 1][1] - last[1]) > 0.5) {
      out.push(last.slice());
    }
    return out;
  }

  /* ================= 판정 기준 ================= */
  const TUNE = {
    tol: 16,       // 체크포인트 인정 반경 (0~100 좌표계)
    offMax: 26,    // 경로에서 이만큼 벗어나면 그 획만 다시
    stallMax: 45,  // 전진 없이 이만큼 움직이면 방향을 알려 준다
    jump: 10,      // 빨리 그어도 한 번에 인정할 최대 전진 체크포인트 수
    linkGap: 10,   // 앞 획 끝과 다음 획 시작이 이만큼 가까우면 손 떼지 않고 이어 그린다
  };

  /* ================= 쓰기 화면 ================= */
  const W = {
    open(name, onDone) {
      this.name = name;
      this.onDone = onDone;
      // 획 데이터가 있는 글자만 쓴다 (♀ ♂ 2 : 같은 글자는 건너뛴다)
      this.chars = Array.from(name).map((ch) => ({ ch, raw: strokesFor(ch) }));
      this.writable = this.chars.filter((c) => c.raw.length);
      if (!this.writable.length) {
        onDone();
        return;
      }
      this.ci_char = 0;
      this.build();
      this.loadChar();
      this.paintChars();
      this.renderPad();
      this.demo();
    },

    /* ---------- 화면 만들기 ---------- */
    build() {
      const old = $('#write');
      if (old) old.remove();

      const root = el('div', 'write');
      root.id = 'write';

      const bar = el('div', 'write-bar');
      bar.appendChild(el('span', 'write-title', '이름을 따라 써 보자'));
      const chars = el('span', 'write-chars');
      chars.id = 'write-chars';
      bar.appendChild(chars);
      root.appendChild(bar);

      const body = el('div', 'write-body');

      const demoCol = el('div', 'write-demo');
      demoCol.appendChild(el('p', 'write-cap', '이렇게 써요'));
      const demoPad = el('div', 'write-demo-pad');
      demoPad.id = 'write-demo';
      demoCol.appendChild(demoPad);
      body.appendChild(demoCol);

      const tryCol = el('div', 'write-try');
      const hint = el('p', 'write-cap write-hint', '① 번 동그라미에서 출발해요');
      hint.id = 'write-hint';
      tryCol.appendChild(hint);
      const pad = el('div', 'write-pad');
      pad.id = 'write-pad';
      tryCol.appendChild(pad);
      body.appendChild(tryCol);

      root.appendChild(body);
      document.body.appendChild(root);
      this.bind(pad);
    },

    close() {
      if (this.demoTimer) clearInterval(this.demoTimer);
      this.demoTimer = null;
      const root = $('#write');
      if (root) root.remove();
    },

    /* ---------- 글자 하나 준비 ---------- */
    loadChar() {
      const c = this.writable[this.ci_char];
      this.char = c.ch;
      this.raw = c.raw;
      this.strokes = this.raw.map((pts) => samplePts(pts, 4.5));
      this.si = 0;
      this.ci = 0;
      this.ink = [];
      this.drawing = false;
      this.charDone = false;
      this.stall = 0;
      this.lastP = null;
      this.dirSet = false;
    },

    /** 이름 글자별 진행 표시 */
    paintChars() {
      const box = $('#write-chars');
      if (!box) return;
      box.innerHTML = '';
      const currentCh = this.writable[this.ci_char];
      let passed = true;
      this.chars.forEach((c) => {
        let cls = 'write-char';
        if (!c.raw.length) {
          cls += ' is-skip';           // 쓸 수 없는 글자 (♀ 2 : 등)
        } else if (c === currentCh) {
          cls += ' is-now';
          passed = false;
        } else if (passed) {
          cls += ' is-done';
        }
        box.appendChild(el('span', cls, c.ch));
      });
    },

    /* ---------- 그리기 ---------- */
    penW() {
      // 한글은 한 칸에 자모 2~4개가 들어가므로 얇게 (뭉개짐·삐져나옴 방지)
      return this.char >= '가' && this.char <= '힣' ? 9 : 15;
    },

    near(p, q) { return Math.hypot(p[0] - q[0], p[1] - q[1]); },
    isClosed(cps) { return this.near(cps[0], cps[cps.length - 1]) < 6; },

    /** i번째 획 끝과 다음 획 시작이 붙어 있나 (붙어 있으면 손 떼지 않고 이어 쓴다) */
    linked(i) {
      const a = this.strokes[i];
      const b = this.strokes[i + 1];
      if (!a || !b) return false;
      return this.near(a[a.length - 1], b[0]) <= TUNE.linkGap * (this.penW() / 15);
    },

    /** 획이 짧으면(한글 자모) 판정을 조금 좁힌다 — 긴 획은 넉넉하게 */
    tolFor(cps) {
      let len = 0;
      for (let i = 1; i < cps.length; i += 1) len += this.near(cps[i], cps[i - 1]);
      return Math.max(8, Math.min(TUNE.tol, len * 0.4));
    },
    offFor(cps) { return this.tolFor(cps) * (TUNE.offMax / TUNE.tol); },

    /** 번호 배지 자리 — 앞 배지와 겹치면 획을 따라 옮긴다 */
    badgeAt(i, placed) {
      const cps = this.strokes[i];
      let bp = cps[0];
      const hit = (q) => this.near(bp, q) < 15;
      const lim = Math.max(1, Math.floor(cps.length * 0.75));
      for (let k = 1; k < lim && placed.some(hit); k += 1) bp = cps[k];
      if (placed.some(hit)) {
        const a = cps[0];
        const b = cps[Math.min(2, cps.length - 1)];
        const dx = b[0] - a[0];
        const dy = b[1] - a[1];
        const m = Math.hypot(dx, dy) || 1;
        bp = [
          Math.max(9, Math.min(91, a[0] - (dy / m) * 13)),
          Math.max(9, Math.min(91, a[1] + (dx / m) * 13)),
        ];
      }
      placed.push(bp);
      return bp;
    },

    renderPad() {
      const pad = $('#write-pad');
      if (!pad) return;
      const pw = this.penW();
      const sc = pw / 15;
      let guide = '<rect class="wr-box" x="6" y="6" width="88" height="88"/>' +
        '<line class="wr-rule" x1="50" y1="8" x2="50" y2="92"/>' +
        '<line class="wr-rule" x1="8" y1="50" x2="92" y2="50"/>';
      let hints = '';
      let ink = '';
      const placed = [];

      this.raw.forEach((pts, i) => {
        const d = smoothD(pts);
        guide += `<path class="wr-guide" style="stroke-width:${pw}" d="${d}"/>`;
        if (i < this.si) {
          ink += `<path class="wr-ink is-done" style="stroke-width:${pw}" d="${d}"/>`;
          return;
        }
        const cur = i === this.si;
        const s = pts[0];
        const e = pts[pts.length - 1];
        hints += `<path class="wr-dash${cur ? ' is-cur' : ''}" d="${d}"/>`;

        // 진행 방향 화살표는 '지금 그을 획'에만 — 모든 획에 깔면 화면이 산만해진다.
        // 닫힌 원(ㅇ·ㅎ)은 끝 화살표가 번호에 겹치므로 길 중간에 여러 개 찍는다.
        if (cur) {
          const cps = this.strokes[i];
          const closed = Math.hypot(e[0] - s[0], e[1] - s[1]) < 6;
          (closed ? [0.3, 0.6, 0.9] : [0.45, 1]).forEach((f) => {
            const k = Math.min(cps.length - 1, Math.max(1, Math.round((cps.length - 1) * f)));
            const a = cps[k - 1];
            const bb = cps[k];
            const ang = (Math.atan2(bb[1] - a[1], bb[0] - a[0]) * 180) / Math.PI;
            hints += `<polygon class="wr-arrow" points="0,-4 8,0 0,4" transform="translate(${bb[0].toFixed(1)},${bb[1].toFixed(1)}) rotate(${ang.toFixed(1)}) scale(${sc.toFixed(2)})"/>`;
          });
        }

        // 획이 많은 글자는 번호가 글자를 가리므로 '지금 그을 획'만 번호를 보여 준다
        if (this.raw.length > 4 && !cur) return;
        const bp = this.badgeAt(i, placed);
        hints += `<circle class="wr-num${cur ? ' is-cur' : ''}" cx="${bp[0].toFixed(1)}" cy="${bp[1].toFixed(1)}" r="${(8 * sc).toFixed(1)}"/>` +
          `<text class="wr-numt" style="font-size:${(11 * sc).toFixed(1)}px" x="${bp[0].toFixed(1)}" y="${bp[1].toFixed(1)}">${i + 1}</text>`;
        if (cur) {
          hints += `<circle class="wr-start" style="stroke-width:${(2.5 * sc).toFixed(1)}" cx="${s[0]}" cy="${s[1]}" r="${(12 * sc).toFixed(1)}"/>`;
        }
      });

      if (this.ink.length > 1) {
        ink += `<path class="wr-ink" style="stroke-width:${pw}" d="${smoothD(this.ink)}"/>`;
      }
      pad.innerHTML = `<svg viewBox="0 0 100 100">${guide}${ink}${hints}</svg>` +
        (this.charDone ? '<div class="wr-ok">✓</div>' : '');
    },

    /** 왼쪽 시범 — 획 순서대로 그려지는 모습을 계속 반복 재생 */
    demo() {
      const host = $('#write-demo');
      if (!host) return;
      if (this.demoTimer) clearInterval(this.demoTimer);
      const pw = this.penW() * 0.87;
      let guide = '<rect class="wr-box" x="6" y="6" width="88" height="88"/>';
      let inks = '';
      this.raw.forEach((pts, i) => {
        const d = smoothD(pts);
        guide += `<path class="wr-guide" d="${d}" style="stroke-width:${pw.toFixed(1)}"/>`;
        inks += `<path class="wr-demo-ink" id="wr-dm-${i}" style="stroke-width:${pw.toFixed(1)}" d="${d}"/>`;
      });
      const placed = [];
      let badges = '';
      this.raw.forEach((pts, i) => {
        const bp = this.badgeAt(i, placed);
        const r = this.raw.length > 4 ? 4.2 : 6.5;
        badges += `<circle class="wr-num" cx="${bp[0].toFixed(1)}" cy="${bp[1].toFixed(1)}" r="${r}"/>` +
          `<text class="wr-numt" x="${bp[0].toFixed(1)}" y="${bp[1].toFixed(1)}" style="font-size:${(r * 1.35).toFixed(1)}px">${i + 1}</text>`;
      });
      host.innerHTML = `<svg viewBox="0 0 100 100">${guide}${inks}${badges}` +
        '<circle class="wr-pen" id="wr-pen" cx="-10" cy="-10" r="3.6"/></svg>';

      const paths = this.raw.map((_, i) => host.querySelector(`#wr-dm-${i}`));
      const pen = host.querySelector('#wr-pen');
      const lens = paths.map((p) => p.getTotalLength());
      const durs = lens.map((L) => Math.max(450, Math.min(1500, L * 16)));
      const gaps = paths.map((_, i) => (this.linked(i) ? 0 : 220));
      const cycle = durs.reduce((s, d, i) => s + d + gaps[i], 0) + 900;
      const t0 = Date.now();

      const draw = () => {
        let t = (Date.now() - t0) % cycle;
        let active = -1;
        let prog = 0;
        for (let i = 0; i < paths.length; i += 1) {
          const seg = durs[i] + gaps[i];
          if (t < seg) { active = i; prog = Math.min(1, t / durs[i]); break; }
          t -= seg;
        }
        paths.forEach((pa, i) => {
          const L = lens[i];
          const off = active < 0 ? 0 : i < active ? 0 : i > active ? L : L * (1 - prog);
          pa.style.strokeDasharray = L;
          pa.style.strokeDashoffset = off;
        });
        if (active >= 0 && prog < 1) {
          const pt = paths[active].getPointAtLength(lens[active] * prog);
          pen.setAttribute('cx', pt.x);
          pen.setAttribute('cy', pt.y);
          pen.style.opacity = '.9';
        } else {
          pen.style.opacity = '0';
        }
      };
      draw();
      this.demoTimer = setInterval(draw, 45);
    },

    /* ---------- 손가락 입력 ---------- */
    at(pad, e) {
      const r = pad.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
    },

    say(msg) {
      const h = $('#write-hint');
      if (h) h.textContent = msg;
    },

    nudge(msg) {
      const pad = $('#write-pad');
      if (pad) {
        pad.classList.remove('shake');
        void pad.offsetWidth;
        pad.classList.add('shake');
      }
      this.say(msg);
    },

    fail(msg) {
      this.drawing = false;
      this.ci = 0;
      this.ink = [];
      this.stall = 0;
      this.lastP = null;
      this.dirSet = false;
      this.renderPad();
      this.nudge(msg);
    },

    bind(pad) {
      pad.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });

      pad.addEventListener('pointerdown', (e) => {
        if (this.charDone) return;
        const p = this.at(pad, e);
        const cps = this.strokes[this.si];
        const reach = this.tolFor(cps) * 1.7;
        // 그리다 손을 뗐으면 멈춘 자리에서 이어서 (처음부터 다시 안 해도 된다)
        if (this.ci > 1 && cps[this.ci - 1] && this.near(p, cps[this.ci - 1]) <= reach) {
          pad.setPointerCapture(e.pointerId);
          this.drawing = true;
          this.stall = 0;
          this.lastP = p;
          this.ink.push(p);
          return;
        }
        if (this.near(p, cps[0]) > reach) {
          this.nudge('① 번 동그라미에서 출발해요');
          return;
        }
        pad.setPointerCapture(e.pointerId);
        this.drawing = true;
        this.ci = 1;
        this.ink = [cps[0].slice(), p];
        this.stall = 0;
        this.lastP = p;
        this.dirSet = false;
        this.renderPad();
      });

      pad.addEventListener('pointermove', (e) => {
        if (!this.drawing) return;
        e.preventDefault();
        const p = this.at(pad, e);
        let cps = this.strokes[this.si];

        // 닫힌 동그라미(ㅇ·ㅎ)는 어느 쪽으로 돌아도 인정 — 반대로 돌면 획을 뒤집는다
        if (!this.dirSet && this.isClosed(cps)) {
          const mv = [p[0] - cps[0][0], p[1] - cps[0][1]];
          if (Math.hypot(mv[0], mv[1]) >= 4) {
            const tg = [cps[1][0] - cps[0][0], cps[1][1] - cps[0][1]];
            if (mv[0] * tg[0] + mv[1] * tg[1] < 0) {
              this.strokes[this.si] = cps.slice().reverse();
              cps = this.strokes[this.si];
              this.ci = 1;
            }
            this.dirSet = true;
          }
        }

        // 경로에서 너무 벗어나면 이 획만 다시
        let best = Infinity;
        for (let i = 0; i < cps.length; i += 1) best = Math.min(best, this.near(p, cps[i]));
        if (best > this.offFor(cps)) {
          this.fail('점선을 따라가 볼까? 다시 ① 부터!');
          return;
        }

        // 빨리 그으면 체크포인트를 건너뛴다 → 닿은 가장 앞선 지점까지 한 번에 인정
        const before = this.ci;
        let adv = -1;
        const limit = Math.min(cps.length, this.ci + TUNE.jump);
        const tol = this.tolFor(cps);
        for (let k = this.ci; k < limit; k += 1) if (this.near(p, cps[k]) <= tol) adv = k;
        if (adv >= 0) this.ci = adv + 1;

        // 반대 방향으로 돌면 전진이 안 된다 → 움직인 거리가 쌓이면 방향을 알려 준다
        if (this.ci > before) {
          this.stall = 0;
        } else {
          this.stall += this.near(p, this.lastP || p);
          if (this.stall > TUNE.stallMax) {
            this.fail(this.isClosed(cps)
              ? '선을 따라 한 바퀴 돌려 볼까?'
              : '화살표 방향으로 그어요! ① 부터 다시');
            return;
          }
        }

        this.lastP = p;
        this.ink.push(p);
        if (this.ink.length % 2 === 0) this.renderPad();
        if (this.ci >= cps.length) this.strokeDone();
      }, { passive: false });

      // 손을 떼도 그은 만큼은 남긴다 — 멈춘 자리를 다시 짚으면 이어서
      const up = () => {
        if (!this.drawing || this.charDone) return;
        this.drawing = false;
        if (this.ci <= 1) {
          this.ci = 0;
          this.ink = [];
          this.renderPad();
          return;
        }
        this.say('손을 뗀 자리를 다시 짚고 이어서 그어요');
        this.renderPad();
      };
      pad.addEventListener('pointerup', up);
      pad.addEventListener('pointercancel', up);
    },

    /* ---------- 진행 ---------- */
    strokeDone() {
      const wasDrawing = this.drawing;
      const link = this.linked(this.si);
      this.drawing = false;
      this.si += 1;
      this.ci = 0;
      this.ink = [];
      this.stall = 0;
      this.lastP = null;
      this.dirSet = false;

      if (this.si >= this.strokes.length) {
        this.finishChar();
        return;
      }
      // 붙어 있는 획이면 손을 떼지 않고 그대로 이어서
      if (wasDrawing && link) {
        this.drawing = true;
        this.ci = 1;
        this.ink = [this.strokes[this.si][0].slice()];
        this.renderPad();
        return;
      }
      this.renderPad();
      this.say(`좋아! 다음은 ${this.si + 1}번 획`);
    },

    finishChar() {
      this.charDone = true;
      this.renderPad();
      this.say(`'${this.char}' 다 썼어!`);

      if (this.ci_char < this.writable.length - 1) {
        setTimeout(() => {
          this.ci_char += 1;
          this.loadChar();
          this.paintChars();
          this.renderPad();
          this.demo();
          this.say('① 번 동그라미에서 출발해요');
        }, 700);
        return;
      }

      // 이름을 다 썼다 (곧 이어지는 몬스터볼 연출에 소리가 있으니 여기선 조용히)
      this.paintChars();
      this.say(`'${this.name}' 다 썼어! 잘했어!`);
      setTimeout(() => {
        const done = this.onDone;
        this.close();
        if (done) done();
      }, 900);
    },
  };

  // 글자 하나의 획을 바깥에서 조회할 수 있게 열어 둔다 (데이터 점검·테스트용)
  W.__strokesFor = strokesFor;

  window.Write = W;
})();
