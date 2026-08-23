/* 문장 맞추기 — 도감 설명에 뚫린 빈칸을 어절 타일로 채운다.
 *
 * 이름 맞히기는 낱말 단위 읽기다. 문장 조립은 조사(을/를·에·는)를 보고
 * 낱말의 역할을 판단해야 풀리므로, 같은 글감으로 한 단계 위의 읽기가 된다.
 *
 * 잡은 포켓몬만 출제한다 — 아는 이야기를 다시 읽으니 복습이 되고,
 * 그림과 이름을 보여 줘도 정답이 새지 않는다.
 *
 * 포켓몬 한 마리에 문장 하나가 고정되어 있고(Data.storySentence),
 * 맞히면 그 포켓몬의 도감 설명이 완성되면서 도감 칸에 ★ 배지가 붙는다.
 * 그래서 '몇 문장 읽었다'가 아니라 '도감 몇 칸을 채웠다'가 된다.
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
  /** 잡았고 문장이 있는데 아직 안 채운 포켓몬들 */
  function pool() {
    return Data.all.filter((p) => Save.isCaught(p.id)
      && Data.storySentence(p) && !Save.hasStory(p.id));
  }

  /** 잡았고 문장이 있는 포켓몬 전부 — 진행 표시의 분모 */
  function scope() {
    return Data.all.filter((p) => Save.isCaught(p.id) && Data.storySentence(p));
  }

  /** 채운 수 / 채울 수 있는 수 — "3 / 192" */
  function progress() {
    const total = scope().length;
    const done = total - pool().length;
    return { done, total, left: total - done };
  }

  /* ---------- 화면 ---------- */
  function renderHead() {
    const p = cur.p;
    const art = $('#sent-art');
    art.src = p.img;
    art.alt = p.name;
    $('#sent-name').textContent = `${p.name}의 이야기`;
    const g = progress();
    const count = $('#sent-count');
    count.textContent = `${g.done} / ${g.total}`;
    count.title = `도감 문장 ${g.done}개 완성 · ${g.left}개 남음`;

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
      // 처음부터 놓여 있는 첫 낱말 타일은 아예 감춘다 — 눌러도 갈 곳이 없다
      if (t.fixed) return;
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
    for (let i = cur.given; i < cur.slots.length; i += 1) {
      const tileIndex = cur.fill[i];
      if (tileIndex !== undefined && cur.tiles[tileIndex]) cur.tiles[tileIndex].used = false;
      cur.slots[i] = null;
      delete cur.fill[i];
    }
  }

  /** 앞에서 n개 어절을 미리 놓아 준다 (첫 낱말은 늘 1개) */
  function give(n) {
    for (let i = cur.given; i < n && i < cur.words.length; i += 1) {
      const w = cur.words[i];
      const ti = cur.tiles.findIndex((t) => t.w === w && !t.used);
      if (ti >= 0) {
        cur.tiles[ti].used = true;
        if (i === 0) cur.tiles[ti].fixed = true;
        cur.fill[i] = ti;
      }
      cur.slots[i] = w;
    }
    cur.given = Math.min(n, cur.words.length);
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
      // 첫 낱말은 이미 놓여 있으니, 두 번 틀리면 둘째 낱말까지 놓아 준다
      if (cur.misses >= 2) give(2);
      renderHead();
      renderSlots();
      renderTiles();
      busy = false;
      say(cur.misses >= 2
        ? '둘째 낱말도 놓아 줄게. 책에 있는 순서로 맞춰 볼까?'
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
    // 보상: 이 포켓몬의 도감 설명이 완성되고 도감 칸에 ★ 배지가 붙는다
    const fresh = Save.markStory(cur.p.id);
    const total = Save.addSentence();
    renderHead();
    say('맞았어! 소리 내어 한 번 읽어 보자.');

    setTimeout(() => {
      const cheer = total % CHEER_EVERY === 0;
      showResult(true, cheer ? total : 0, fresh);
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
    setTimeout(() => showResult(false, 0, false), 900);
  }

  function showResult(right, cheerAt, fresh) {
    const p = cur.p;
    const g = progress();
    const sheet = el('div');

    if (right && fresh) {
      // 새로 얻은 ★ 배지를 크게 한 번 보여 준다
      const stamp = el('div', 'stamp stamp--story', '★');
      sheet.appendChild(stamp);
      sheet.appendChild(el('p', 'sheet-eyebrow', '도감 완성'));
      sheet.appendChild(el('h2', 'sheet-title', `${p.name} 설명을 채웠다!`));
    } else {
      sheet.appendChild(el('p', 'sheet-eyebrow', right ? '잘했어' : '이번엔 알려 줄게'));
      sheet.appendChild(el('h2', 'sheet-title', right ? '문장 완성!' : '이런 순서였어'));
    }

    const art = el('img', 'sheet-art');
    art.src = p.img;
    art.alt = p.name;
    sheet.appendChild(art);

    // 완성했으면 도감 설명 전체를 보여 준다 — 채운 문장이 어디에 들어갔는지 읽는다
    sheet.appendChild(el('p', 'sheet-text',
      right && fresh ? p.flavor : `${cur.words.join(' ')}.`));

    sheet.appendChild(el('p', 'sheet-data',
      right && fresh
        ? `도감 설명 ${g.done} / ${g.total} 완성 · ${g.left}개 남았어`
        : `${p.name} · 도감 설명 ${g.done} / ${g.total}`));

    const buttons = el('div', 'sheet-buttons');
    const next = el('button', 'btn btn--go', '다음 문장');
    next.onclick = () => {
      window.App.closeOverlay();
      if (cheerAt) cheer(cheerAt, () => nextQuestion());
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

    window.App.openOverlay(sheet, { sticky: true, variant: right && fresh ? 'gold' : null });
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
  /** want: 도감에서 특정 포켓몬의 빈칸을 눌러 들어온 경우 그 포켓몬 */
  function nextQuestion(want) {
    const list = pool();
    if (!list.length) {
      noStock();
      return;
    }
    const p = (want && list.indexOf(want) >= 0)
      ? want
      : list[Math.floor(Math.random() * list.length)];
    const s = Data.storySentence(p);

    cur = {
      p,
      words: s.words.slice(),
      slots: new Array(s.words.length).fill(null),
      fill: {},
      tiles: shuffle(s.words).map((w) => ({ w, used: false, fixed: false })),
      misses: 0,
      given: 0,
    };
    // 첫 낱말은 늘 놓아 준다 — 문장이 어디서 시작하는지 보이면 나머지를 읽기 쉽다
    give(1);
    busy = false;
    renderHead();
    renderSlots();
    renderTiles();
    say('첫 낱말 뒤를 순서대로 채워 봐.');
    $('#sent-body').scrollTop = 0;
  }

  /** 채울 문장이 없을 때 — 아직 없는 것과 다 채운 것을 구분해 알려 준다 */
  function noStock() {
    const g = progress();
    const allDone = g.total > 0;
    const sheet = el('div');
    sheet.appendChild(el('h2', 'sheet-title',
      allDone ? '도감 설명을 다 채웠다!' : '아직 채울 문장이 없어'));
    sheet.appendChild(el('p', 'sheet-text', allDone
      ? `잡은 포켓몬 ${g.total}마리의 설명을 모두 채웠어.\n포켓몬을 더 잡으면 새 문장이 생겨!`
      : '문장 맞추기는 이미 잡은 포켓몬의 도감 설명으로 해.\n포켓몬을 더 잡아 오자!'));
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
    /** id: 도감에서 그 포켓몬의 빈칸을 눌러 들어온 경우 */
    start(id) {
      nextQuestion(id ? Data.get(id) : null);
    },
    /** 홈에서 '문장 맞추기'를 눌러도 되는 상태인지 */
    ready: () => pool().length > 0,
    poolSize: () => pool().length,
    progress,
  };
})();
