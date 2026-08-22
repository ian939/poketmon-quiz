/* 문장 조립 — 잡은 포켓몬의 도감 설명을 어절 타일로 섞어 순서를 맞춘다.
 *
 * 이름 맞히기는 낱말 단위 읽기다. 문장 조립은 조사(을/를·에·는)를 보고
 * 낱말의 역할을 판단해야 풀리므로, 같은 글감으로 한 단계 위의 읽기가 된다.
 *
 * 잡은 포켓몬만 출제한다 — 아는 이야기를 다시 읽으니 복습이 되고,
 * 그림과 이름을 보여 줘도 정답이 새지 않는다.
 */
(function () {
  'use strict';

  const { el, $, $$, shuffle, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;

  const MAX_TRY = 3;
  const CHEER_EVERY = 10;   // 이만큼 맞힐 때마다 축하

  let cur = null;   // { p, words, slots, fill, tiles, misses, given }
  let busy = false;

  /* ---------- 출제 ---------- */
  /** 잡았고 문장 후보가 있는 포켓몬들 */
  function pool() {
    return Data.all.filter((p) => Save.isCaught(p.id) && Data.hasSentence(p));
  }

  function pickQuestion() {
    const list = pool();
    if (!list.length) return null;
    const p = list[Math.floor(Math.random() * list.length)];
    const cands = Data.sentencesFor(p);
    const s = cands[Math.floor(Math.random() * cands.length)];
    return { p, sentence: s };
  }

  /* ---------- 화면 ---------- */
  function renderHead() {
    const p = cur.p;
    const art = $('#sent-art');
    art.src = p.img;
    art.alt = p.name;
    $('#sent-name').textContent = `${p.name}의 이야기`;
    $('#sent-count').textContent = `${Save.sentenceCount()}문장`;

    const tries = $('#sent-lives');
    tries.innerHTML = '';
    for (let i = 0; i < MAX_TRY; i += 1) {
      tries.appendChild(el('i', i < MAX_TRY - cur.misses ? '' : 'is-spent'));
    }
    tries.setAttribute('aria-label', `남은 기회 ${MAX_TRY - cur.misses}번`);
  }

  function renderSlots() {
    const box = $('#sent-slots');
    box.innerHTML = '';
    cur.slots.forEach((w, i) => {
      const slot = el('div', 'wslot', w || '');
      if (i < cur.given) slot.classList.add('is-given');
      else if (!w) slot.classList.add('is-empty');
      if (w && i >= cur.given) {
        slot.setAttribute('role', 'button');
        slot.setAttribute('aria-label', `${w} 지우기`);
        slot.onclick = () => {
          if (busy) return;
          removeAt(i);
        };
      }
      box.appendChild(slot);
    });
    // 문장 끝 마침표는 늘 붙어 있다 (타일에 넣으면 마지막 어절이 드러난다)
    box.appendChild(el('span', 'wslot-dot', '.'));
  }

  function renderTiles() {
    const box = $('#sent-tiles');
    box.innerHTML = '';
    cur.tiles.forEach((t, i) => {
      const btn = el('button', `wtile${t.used ? ' is-used' : ''}`, t.w);
      btn.onclick = () => {
        if (busy || t.used) return;
        place(i);
      };
      box.appendChild(btn);
    });
    const erase = el('button', 'wtile wtile--erase', '지우기');
    erase.onclick = () => {
      if (busy) return;
      eraseLast();
    };
    box.appendChild(erase);
  }

  function say(msg) {
    $('#sent-hint').textContent = msg;
  }

  /* ---------- 입력 ---------- */
  const firstEmpty = () => cur.slots.findIndex((w) => !w);

  function place(tileIndex) {
    const slot = firstEmpty();
    if (slot < 0) return;
    cur.slots[slot] = cur.tiles[tileIndex].w;
    cur.tiles[tileIndex].used = true;
    cur.fill[slot] = tileIndex;
    Sound.tap();
    renderSlots();
    renderTiles();
    if (firstEmpty() < 0) setTimeout(check, 420);
  }

  function removeAt(slotIndex) {
    if (slotIndex < cur.given || !cur.slots[slotIndex]) return;
    const tileIndex = cur.fill[slotIndex];
    if (tileIndex !== undefined && cur.tiles[tileIndex]) cur.tiles[tileIndex].used = false;
    cur.slots[slotIndex] = null;
    delete cur.fill[slotIndex];
    Sound.erase();
    renderSlots();
    renderTiles();
  }

  function eraseLast() {
    for (let i = cur.slots.length - 1; i >= cur.given; i -= 1) {
      if (cur.slots[i]) {
        removeAt(i);
        return;
      }
    }
  }

  function clearInput() {
    for (let i = 0; i < cur.slots.length; i += 1) {
      const tileIndex = cur.fill[i];
      if (tileIndex !== undefined && cur.tiles[tileIndex]) cur.tiles[tileIndex].used = false;
      cur.slots[i] = null;
      delete cur.fill[i];
    }
  }

  /* ---------- 판정 ---------- */
  function check() {
    if (cur.slots.join(' ') === cur.words.join(' ')) return onRight();
    return onWrong();
  }

  function onWrong() {
    busy = true;
    cur.misses += 1;
    Sound.wrong();
    $$('#sent-slots .wslot').forEach((s) => s.classList.add('is-wrong'));
    $('#sent-slots').classList.add('shake');

    setTimeout(() => {
      $('#sent-slots').classList.remove('shake');
      if (cur.misses >= MAX_TRY) {
        giveUp();
        return;
      }
      clearInput();
      // 두 번 틀리면 첫 어절을 고정해 준다
      if (cur.misses >= 2) {
        cur.given = 1;
        cur.slots[0] = cur.words[0];
        const ti = cur.tiles.findIndex((t) => t.w === cur.words[0] && !t.used);
        if (ti >= 0) {
          cur.tiles[ti].used = true;
          cur.fill[0] = ti;
        }
      }
      renderHead();
      renderSlots();
      renderTiles();
      busy = false;
      say(cur.misses >= 2
        ? '첫 낱말을 알려 줄게. 책에 있는 순서로 맞춰 볼까?'
        : '책에 있는 순서로 맞춰 볼까?');
    }, 520);
  }

  function onRight() {
    busy = true;
    Sound.correct();
    $$('#sent-slots .wslot').forEach((s) => {
      s.classList.remove('is-wrong');
      s.classList.add('is-right');
    });
    const total = Save.addSentence();
    renderHead();
    say('맞았어! 소리 내어 한 번 읽어 보자.');

    setTimeout(() => {
      const cheer = total % CHEER_EVERY === 0;
      showResult(true, cheer ? total : 0);
    }, 1100);
  }

  /** 세 번 틀리면 정답을 보여 주고 읽게 한다 (잡은 포켓몬이라 '도망'은 없다) */
  function giveUp() {
    Sound.escape();
    cur.slots = cur.words.slice();
    cur.given = cur.words.length;
    renderHead();
    renderSlots();
    renderTiles();
    say('이게 맞는 순서야. 소리 내어 읽어 보자!');
    setTimeout(() => showResult(false, 0), 900);
  }

  function showResult(right, cheerAt) {
    const p = cur.p;
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', right ? '잘했어' : '이번엔 알려 줄게'));
    sheet.appendChild(el('h2', 'sheet-title', right ? '문장 완성!' : '이런 순서였어'));

    const art = el('img', 'sheet-art');
    art.src = p.img;
    art.alt = p.name;
    sheet.appendChild(art);

    sheet.appendChild(el('p', 'sheet-text', `${cur.words.join(' ')}.`));
    sheet.appendChild(el('p', 'sheet-data', `${p.name} · 읽은 문장 ${Save.sentenceCount()}개`));

    const buttons = el('div', 'sheet-buttons');
    const next = el('button', 'btn btn--go', '다음 문장');
    next.onclick = () => {
      window.App.closeOverlay();
      if (cheerAt) cheer(cheerAt, nextQuestion);
      else nextQuestion();
    };
    const stop = el('button', 'btn', '그만하기');
    stop.onclick = () => {
      window.App.closeOverlay();
      if (cheerAt) cheer(cheerAt, () => window.App.goHome());
      else window.App.goHome();
    };
    buttons.appendChild(next);
    buttons.appendChild(stop);
    sheet.appendChild(buttons);

    window.App.openOverlay(sheet, { sticky: true });
    busy = false;
  }

  function cheer(n, done) {
    Sound.fanfare();
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', '기념'));
    sheet.appendChild(el('h2', 'sheet-title', `${n}문장 읽었다!`));
    sheet.appendChild(el('p', 'sheet-text', `벌써 ${n}개나 맞췄어. 읽기가 늘고 있어!`));
    const buttons = el('div', 'sheet-buttons');
    const ok = el('button', 'btn btn--go', '좋아');
    ok.onclick = () => {
      window.App.closeOverlay();
      done();
    };
    buttons.appendChild(ok);
    sheet.appendChild(buttons);
    window.App.replaceOverlay(sheet, { sticky: true });
  }

  /* ---------- 문제 시작 ---------- */
  function nextQuestion() {
    const q = pickQuestion();
    if (!q) {
      noStock();
      return;
    }
    cur = {
      p: q.p,
      words: q.sentence.words.slice(),
      slots: new Array(q.sentence.words.length).fill(null),
      fill: {},
      tiles: shuffle(q.sentence.words).map((w) => ({ w, used: false })),
      misses: 0,
      given: 0,
    };
    busy = false;
    renderHead();
    renderSlots();
    renderTiles();
    say('낱말을 순서대로 눌러 문장을 만들어 봐.');
    $('#sent-body').scrollTop = 0;
  }

  /** 잡은 포켓몬 중 문장 후보가 없을 때 */
  function noStock() {
    const sheet = el('div');
    sheet.appendChild(el('h2', 'sheet-title', '아직 이야기가 없어'));
    sheet.appendChild(
      el('p', 'sheet-text', '문장 맞추기는 이미 잡은 포켓몬의 이야기로 해.\n포켓몬을 더 잡아 오자!'),
    );
    const buttons = el('div', 'sheet-buttons');
    const go = el('button', 'btn btn--go', '퀴즈 풀러 가기');
    go.onclick = () => {
      window.App.closeOverlay();
      window.App.goHome();
    };
    buttons.appendChild(go);
    sheet.appendChild(buttons);
    window.App.openOverlay(sheet, { sticky: true });
  }

  window.Sentence = {
    start() {
      nextQuestion();
    },
    /** 홈에서 '문장 맞추기'를 눌러도 되는 상태인지 */
    ready: () => pool().length > 0,
    poolSize: () => pool().length,
  };
})();
