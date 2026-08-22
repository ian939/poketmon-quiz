/* 책이랑 찾기 — 그림과 쪽수를 주면 아이가 진짜 책을 펴서 이름을 읽고 옮겨 쓴다.
 *
 * 이 게임만 할 수 있는 문제다 — 책 색인을 판독해 801마리의 책 페이지가 붙어 있다.
 * 목적은 추리가 아니라 '모르는 것은 책에서 찾는다'는 찾아 읽기 습관이다.
 * 그래서 본 퀴즈의 '모습 가리기' 원칙을 여기서만 일부러 어긴다 —
 * 그림이 없으면 책에서 찾을 수가 없다. 별도 화면으로만 들어오게 해서
 * 본 퀴즈의 긴장감과 섞이지 않게 했다.
 *
 * 정답 처리는 본 퀴즈와 같은 파이프라인을 쓴다: 이름 따라 쓰기 → 포획 → 도감 등록.
 * 책이 답지이므로 도망은 없다. 세 번 틀리면 쪽수를 다시 알려 주고 계속 시도한다.
 */
(function () {
  'use strict';

  const { el, $, $$, shuffle, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;
  const Dex = window.Dex;

  const DISTRACTORS = 3;
  const MAX_TILES = 9;
  const NUDGE_AT = 3;    // 이만큼 틀리면 쪽수를 다시 크게 알려 준다

  let cur = null;   // { p, page, answer, slots, fill, tiles, misses, given }
  let busy = false;

  /* ---------- 출제 ---------- */
  /** 아직 안 잡았고 책 페이지가 있는 포켓몬 (마샤도 1마리는 페이지가 없어 제외된다) */
  function pool() {
    return Data.all.filter((p) => !Save.isCaught(p.id) && Data.bookPage(p.name));
  }

  function buildTiles(answer) {
    const chars = Array.from(answer);
    const used = new Set(chars);
    const extras = [];
    const src = Data.syllablePool;
    const want = Math.min(DISTRACTORS, Math.max(0, MAX_TILES - chars.length));
    let guard = 0;
    while (extras.length < want && guard < 400) {
      guard += 1;
      const ch = src[Math.floor(Math.random() * src.length)];
      if (used.has(ch)) continue;
      used.add(ch);
      extras.push(ch);
    }
    return shuffle(chars.concat(extras));
  }

  /* ---------- 화면 ---------- */
  function renderHead() {
    $('#book-page').textContent = `${cur.page}쪽`;
    $('#book-count').textContent = `${Save.caughtFrom('book')}마리 찾음`;
    const tries = $('#book-tries');
    tries.innerHTML = '';
    // 도망이 없으므로 '남은 기회'가 아니라 '틀린 횟수'를 보여 준다
    tries.textContent = cur.misses ? `${cur.misses}번 틀렸어` : '';
  }

  function renderQuestion() {
    const art = $('#book-art');
    art.src = cur.p.img;
    art.alt = '이 포켓몬';
    $('#book-ask').textContent = `이 친구가 우리 책 ${cur.page}쪽에 있어!`;
  }

  function renderSlots() {
    const box = $('#book-slots');
    box.innerHTML = '';
    cur.slots.forEach((ch, i) => {
      const slot = el('div', 'slot', ch || '');
      if (i < cur.given) slot.classList.add('is-given');
      else if (!ch) slot.classList.add('is-empty');
      if (ch && i >= cur.given) {
        slot.setAttribute('role', 'button');
        slot.setAttribute('aria-label', `${ch} 지우기`);
        slot.onclick = () => {
          if (busy) return;
          removeAt(i);
        };
      }
      box.appendChild(slot);
    });
  }

  function renderTiles() {
    const box = $('#book-tiles');
    box.innerHTML = '';
    cur.tiles.forEach((t, i) => {
      const btn = el('button', `tile${t.used ? ' is-used' : ''}`, t.ch);
      btn.onclick = () => {
        if (busy || t.used) return;
        place(i);
      };
      box.appendChild(btn);
    });
    const erase = el('button', 'tile tile--erase', '지우기');
    erase.onclick = () => {
      if (busy) return;
      eraseLast();
    };
    box.appendChild(erase);
  }

  const say = (msg) => { $('#book-hint').textContent = msg; };

  /* ---------- 입력 ---------- */
  const firstEmpty = () => cur.slots.findIndex((c) => !c);

  function place(tileIndex) {
    const slot = firstEmpty();
    if (slot < 0) return;
    cur.slots[slot] = cur.tiles[tileIndex].ch;
    cur.tiles[tileIndex].used = true;
    cur.fill[slot] = tileIndex;
    Sound.tap();
    renderSlots();
    renderTiles();
    if (firstEmpty() < 0) setTimeout(check, 380);
  }

  function removeAt(slotIndex) {
    if (slotIndex < cur.given || !cur.slots[slotIndex]) return;
    const ti = cur.fill[slotIndex];
    if (ti !== undefined && cur.tiles[ti]) cur.tiles[ti].used = false;
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
      const ti = cur.fill[i];
      if (ti !== undefined && cur.tiles[ti]) cur.tiles[ti].used = false;
      cur.slots[i] = null;
      delete cur.fill[i];
    }
  }

  /* ---------- 판정 ---------- */
  function check() {
    if (cur.slots.join('') === cur.answer) return onRight();
    return onWrong();
  }

  function onWrong() {
    busy = true;
    cur.misses += 1;
    Sound.wrong();
    $$('#book-slots .slot').forEach((s) => s.classList.add('is-wrong'));
    $('#book-slots').classList.add('shake');

    setTimeout(() => {
      $('#book-slots').classList.remove('shake');
      clearInput();
      // 책이 답지이므로 첫 글자는 알려 주지 않는다 — 대신 쪽수를 다시 짚어 준다
      renderHead();
      renderSlots();
      renderTiles();
      busy = false;
      say(cur.misses >= NUDGE_AT
        ? `책 ${cur.page}쪽을 다시 잘 봐! 이름을 천천히 읽어 보자.`
        : `아깝다. 책 ${cur.page}쪽에서 이름을 찾아볼까?`);
    }, 520);
  }

  function onRight() {
    busy = true;
    Sound.correct();
    $$('#book-slots .slot').forEach((s) => {
      s.classList.remove('is-wrong');
      s.classList.add('is-right');
    });
    say(`맞았어! ${cur.p.name}!`);

    const p = cur.p;
    // 진화 판정은 '잡기 전에' — 이전 단계를 이미 갖고 있었는지가 기준
    const fromId = Data.evoFromId(p);
    const evolvedFrom = fromId && Save.isCaught(fromId) ? Data.get(fromId) : null;

    Save.markCaught(p.id, cur.misses, 'book');
    const rewards = Dex.claimRewards(p);

    setTimeout(() => {
      window.Write.open(p.name, () => window.Catch.play(p, rewards, {
        evolvedFrom,
        onDone: nextQuestion,
        onStop: () => window.App.goHome(),
      }));
    }, 800);
  }

  /* ---------- 문제 시작 ---------- */
  function nextQuestion() {
    const list = pool();
    if (!list.length) {
      allDone();
      return;
    }
    const p = list[Math.floor(Math.random() * list.length)];
    cur = {
      p,
      page: Data.bookPage(p.name),
      answer: p.name,
      slots: new Array(Array.from(p.name).length).fill(null),
      fill: {},
      tiles: buildTiles(p.name).map((ch) => ({ ch, used: false })),
      misses: 0,
      given: 0,
    };
    busy = false;
    renderHead();
    renderQuestion();
    renderSlots();
    renderTiles();
    say('책에서 이름을 찾아 글자를 눌러 봐.');
    $('#book-body').scrollTop = 0;
  }

  function allDone() {
    const sheet = el('div');
    sheet.appendChild(el('h2', 'sheet-title', '책에 있는 친구를 다 모았다!'));
    sheet.appendChild(
      el('p', 'sheet-text', '책에 실린 포켓몬을 모두 잡았어.\n정말 대단해!'),
    );
    const buttons = el('div', 'sheet-buttons');
    const home = el('button', 'btn btn--go', '처음으로');
    home.onclick = () => {
      window.App.closeOverlay();
      window.App.goHome();
    };
    buttons.appendChild(home);
    sheet.appendChild(buttons);
    window.App.openOverlay(sheet, { sticky: true });
  }

  /** 진입할 때 한 번 — 책이 필요하다는 안내 */
  function intro(onStart) {
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', '준비물'));
    sheet.appendChild(el('h2', 'sheet-title', '책이 필요해!'));
    sheet.appendChild(
      el('p', 'sheet-text',
        '《포켓몬 전국대도감》을 옆에 두고 시작해.\n'
        + '그림과 쪽수를 보여 줄 테니, 책에서 찾아\n이름을 읽고 만들면 돼.'),
    );
    const buttons = el('div', 'sheet-buttons');
    const go = el('button', 'btn btn--go', '책 준비했어!');
    go.onclick = () => {
      window.App.closeOverlay();
      onStart();
    };
    const back = el('button', 'btn', '나중에 할래');
    back.onclick = () => {
      window.App.closeOverlay();
      window.App.goHome();
    };
    buttons.appendChild(go);
    buttons.appendChild(back);
    sheet.appendChild(buttons);
    window.App.openOverlay(sheet, { sticky: true });
  }

  window.Book = {
    start() {
      intro(nextQuestion);
    },
    poolSize: () => pool().length,
  };
})();
