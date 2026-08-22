/* 퀴즈 진행: 미확인 기록 판(?) + 단서 행 + 글자 타일 입력 + 정답/오답 연출
 *
 * 포켓몬 모습은 문제를 푸는 동안 전혀 보여 주지 않는다. 실루엣만 봐도 맞힐 수
 * 있으면 단서를 읽지 않기 때문이다. 판에는 'No. ???'와 '?'만 두고,
 * 맞혔을 때(또는 도망갔을 때) 비로소 모습을 공개한다. */
(function () {
  'use strict';

  const { el, $, $$, shuffle, josa, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;
  const Dex = window.Dex;

  const MAX_TRY = 3;
  const DISTRACTORS = 3;   // 함정 글자 개수
  const MAX_TILES = 9;

  // chapter === Dex.ALL('전체')이면 802마리 전부에서, 타입 이름이면 그 타입에서 출제
  let chapter = null;
  let cur = null;   // { p, answer, slots, fill, tiles, misses, given }
  let busy = false; // 연출 중 입력 막기

  const chapterLabel = () => (chapter === Dex.ALL ? '전체' : `${chapter} 타입`);

  /* ---------- 출제 대상 고르기 ---------- */
  // 아직 못 잡은 포켓몬 중에서 고르게 뽑는다. 순서대로 내지 않기 때문에
  // 어떤 포켓몬이든 나올 수 있다.
  function pickTarget() {
    const uncaught = Dex.listOf(chapter).filter((p) => !Save.isCaught(p.id));
    if (!uncaught.length) return null;

    const fresh = uncaught.filter((p) => !Save.escapedCount(p.id));
    const retry = uncaught.filter((p) => Save.escapedCount(p.id));

    // 도망간 포켓몬도 잊지 않도록 가끔 다시 낸다
    const pool = retry.length && (!fresh.length || Math.random() < 0.3) ? retry : fresh;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  /* ---------- 타일 만들기 ---------- */
  function buildTiles(answer) {
    const chars = Array.from(answer);
    const used = new Set(chars);
    const extras = [];
    const pool = Data.syllablePool;
    const want = Math.min(DISTRACTORS, Math.max(0, MAX_TILES - chars.length));
    let guard = 0;
    while (extras.length < want && guard < 400) {
      guard += 1;
      const ch = pool[Math.floor(Math.random() * pool.length)];
      if (used.has(ch)) continue;
      used.add(ch);
      extras.push(ch);
    }
    return shuffle(chars.concat(extras));
  }

  /* ---------- 화면 그리기 ---------- */
  function renderBar() {
    const { caught, total } = Dex.progressOf(chapter);
    const where = $('#quiz-region');
    where.textContent = chapterLabel();
    // 타입 챕터면 그 타입 색을 상단 줄에 얹어 지금 어디를 푸는지 한눈에 보이게
    where.style.background = chapter === Dex.ALL ? '' : Data.typeColor(chapter);
    where.style.color = chapter === Dex.ALL ? '' : Data.typeTextColor(chapter);
    $('#quiz-progress').textContent = `${caught} / ${total}`;
    const tries = $('#quiz-lives');
    tries.innerHTML = '';
    for (let i = 0; i < MAX_TRY; i += 1) {
      tries.appendChild(el('i', i < MAX_TRY - cur.misses ? '' : 'is-spent'));
    }
    tries.setAttribute('aria-label', `남은 기회 ${MAX_TRY - cur.misses}번`);
  }

  function renderClues() {
    const box = $('#hints');
    box.innerHTML = '';
    Data.hintsFor(cur.p).forEach((c, i) => {
      const row = el('div', `clue${c.kind === 'plain' ? '' : ` clue--${c.kind}`}`);
      // 차례로 나타나게 해서 위에서 아래로 읽도록 유도한다
      row.style.animationDelay = `${Math.min(i, 8) * 45}ms`;

      row.appendChild(el('p', 'clue-text', c.text));
      row.appendChild(el('span', 'clue-tag', c.label));
      box.appendChild(row);
    });
  }

  function renderSlots() {
    const box = $('#slots');
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
    const box = $('#tiles');
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

  /* ---------- 입력 ---------- */
  function firstEmpty() {
    for (let i = 0; i < cur.slots.length; i += 1) if (!cur.slots[i]) return i;
    return -1;
  }

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

  /** 카드 아래 타입 띠 — 타입은 이미 알려 주는 단서이므로 문제를 푸는 동안에도 보인다 */
  function renderPlateTypes() {
    const box = $('#plate-types');
    box.innerHTML = '';
    cur.p.types.forEach((t) => {
      const chip = el('span', 'plate-chip', t);
      chip.style.background = Data.typeColor(t);
      chip.style.color = Data.typeTextColor(t);
      box.appendChild(chip);
    });
  }

  /* ---------- 판 공개 ---------- */
  function openPlate() {
    const p = cur.p;
    const art = $('#plate-art');
    art.src = p.img;
    art.alt = p.name;
    art.removeAttribute('aria-hidden');
    $('#plate-no').textContent = `No. ${String(p.id).padStart(3, '0')}`;
    $('#plate').classList.add('is-open');
  }

  /* ---------- 정답 판정 ---------- */
  function check() {
    if (cur.slots.join('') === cur.answer) return onRight();
    return onWrong();
  }

  function onWrong() {
    busy = true;
    cur.misses += 1;
    Sound.wrong();
    $$('#slots .slot').forEach((s) => s.classList.add('is-wrong'));
    $('#slots').classList.add('shake');

    setTimeout(() => {
      $('#slots').classList.remove('shake');
      if (cur.misses >= MAX_TRY) {
        onEscaped();
        return;
      }
      clearInput();
      // 두 번 틀리면 첫 글자를 열어 준다
      if (cur.misses >= 2) {
        cur.given = 1;
        cur.slots[0] = cur.answer[0];
        const tileIndex = cur.tiles.findIndex((t) => t.ch === cur.answer[0] && !t.used);
        if (tileIndex >= 0) {
          cur.tiles[tileIndex].used = true;
          cur.fill[0] = tileIndex;
        }
      }
      renderBar();
      renderSlots();
      renderTiles();
      busy = false;
      toast(
        cur.misses >= 2
          ? '첫 글자를 알려 줄게. 단서를 한 번 더 읽어 보자.'
          : '아깝다. 단서를 다시 읽어 볼까?',
      );
    }, 500);
  }

  function onRight() {
    busy = true;
    Sound.correct();
    $$('#slots .slot').forEach((s) => {
      s.classList.remove('is-wrong');
      s.classList.add('is-right');
    });
    openPlate();

    const p = cur.p;
    Save.markCaught(p.id, cur.misses);
    const rewards = Dex.claimRewards();

    setTimeout(() => {
      renderBar();
      throwBall(p, rewards);
    }, 950);
  }

  function onEscaped() {
    Sound.escape();
    openPlate();   // 답을 알려 줘야 다음에 맞힐 수 있다
    const p = cur.p;
    Save.markEscaped(p.id);
    renderBar();

    setTimeout(() => {
      const sheet = el('div');
      sheet.appendChild(el('p', 'sheet-eyebrow', '이번엔 놓쳤어'));
      sheet.appendChild(el('h2', 'sheet-title', '도망가 버렸다'));
      const art = el('img', 'sheet-art');
      art.src = p.img;
      art.alt = p.name;
      sheet.appendChild(art);
      sheet.appendChild(
        el('p', 'sheet-text', `이 포켓몬은 ${josa.ida(p.name)}.\n다음에 또 만날 수 있어.`),
      );
      sheet.appendChild(
        el('p', 'sheet-data', `No. ${String(p.id).padStart(3, '0')} · ${p.types.join(' / ')}`),
      );

      const buttons = el('div', 'sheet-buttons');
      const next = el('button', 'btn btn--go', '다음 포켓몬');
      next.onclick = () => {
        window.App.closeOverlay();
        nextQuestion();
      };
      const stop = el('button', 'btn', '그만하기');
      stop.onclick = () => {
        window.App.closeOverlay();
        window.App.goHome();
      };
      buttons.appendChild(next);
      buttons.appendChild(stop);
      sheet.appendChild(buttons);

      window.App.openOverlay(sheet, { sticky: true });
      busy = false;
    }, 750);
  }

  /* ---------- 포획 연출 ---------- */
  function throwBall(p, rewards) {
    const sheet = el('div');
    const ball = el('div', 'ball is-thrown');
    sheet.appendChild(ball);
    sheet.appendChild(el('p', 'sheet-text', '몬스터볼을 던졌다!'));
    window.App.openOverlay(sheet, { sticky: true });
    Sound.catchBall();

    setTimeout(() => {
      ball.classList.remove('is-thrown');
      ball.classList.add('is-wobbling');
    }, 510);

    setTimeout(() => {
      Sound.caught();
      showRecord(p, rewards);
    }, 1750);
  }

  /** 도감에 새로 채워진 기록 카드 */
  function showRecord(p, rewards) {
    const t = Dex.totalProgress();
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', '도감에 등록'));
    sheet.appendChild(el('h2', 'sheet-title', p.name));
    const art = el('img', 'sheet-art');
    art.src = p.img;
    art.alt = p.name;
    sheet.appendChild(art);

    const chips = el('div', 'clue-chips');
    chips.style.justifyContent = 'center';
    p.types.forEach((tp) => {
      const chip = el('span', 'chip', tp);
      chip.style.background = Data.typeColor(tp);
      chips.appendChild(chip);
    });
    sheet.appendChild(chips);

    sheet.appendChild(
      el('p', 'sheet-data', `No. ${String(p.id).padStart(3, '0')} · 내 도감 ${t.caught} / ${t.total}`),
    );

    const buttons = el('div', 'sheet-buttons');
    const next = el('button', 'btn btn--go', '다음 포켓몬');
    next.onclick = () => {
      window.App.closeOverlay();
      afterRewards(rewards, nextQuestion);
    };
    const detail = el('button', 'btn', '자세히 보기');
    detail.onclick = () => Dex.openDetail(p.id);
    const stop = el('button', 'btn', '그만하기');
    stop.onclick = () => {
      window.App.closeOverlay();
      afterRewards(rewards, () => window.App.goHome());
    };
    buttons.appendChild(next);
    buttons.appendChild(detail);
    buttons.appendChild(stop);
    sheet.appendChild(buttons);

    // 몬스터볼 창을 이 카드로 갈아 끼운다(밑에 남겨 두면 닫을 때 되살아난다)
    window.App.replaceOverlay(sheet, { sticky: true });
    busy = false;
  }

  /** 보상 축하창을 하나씩 보여 준 뒤 done() 실행 */
  function afterRewards(rewards, done) {
    const queue = (rewards || []).slice();
    let opened = false;

    function step() {
      // 앞서 띄운 축하창을 반드시 닫는다(안 닫으면 오버레이가 화면을 계속 덮는다)
      if (opened) {
        window.App.closeOverlay();
        opened = false;
      }
      if (!queue.length) {
        done();
        return;
      }
      const ev = queue.shift();
      const sheet = el('div');

      if (ev.type === 'badge') {
        Sound.fanfare();
        const stamp = el('div', 'stamp', ev.tier.mark);
        stamp.style.setProperty('--stamp', ev.tier.color);
        sheet.appendChild(stamp);
        sheet.appendChild(el('p', 'sheet-eyebrow', '배지 획득'));
        sheet.appendChild(el('h2', 'sheet-title', `${ev.group} ${ev.tier.label}`));
        sheet.appendChild(
          el(
            'p',
            'sheet-text',
            ev.tier.ratio >= 1
              ? `${ev.group} 타입을 전부 모았어!`
              : `${ev.group} 타입의 ${Math.round(ev.tier.ratio * 100)}%를 모았어.`,
          ),
        );
      } else {
        Sound.fanfare();
        sheet.appendChild(el('p', 'sheet-eyebrow', '기념'));
        sheet.appendChild(el('h2', 'sheet-title', `${ev.n}마리 달성`));
        sheet.appendChild(el('p', 'sheet-text', `벌써 ${ev.n}마리를 모았어. 대단해!`));
      }

      const buttons = el('div', 'sheet-buttons');
      const ok = el('button', 'btn btn--go', '좋아');
      ok.onclick = step;
      buttons.appendChild(ok);
      sheet.appendChild(buttons);
      window.App.openOverlay(sheet, { sticky: true });
      opened = true;
    }
    step();
  }

  /* ---------- 안내 말풍선 ---------- */
  let toastTimer = null;
  function toast(text) {
    let node = $('#toast');
    if (!node) {
      node = el('div', 'toast');
      node.id = 'toast';
      $('#screens').appendChild(node);
    }
    node.textContent = text;
    node.style.opacity = '1';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.style.opacity = '0'; }, 2600);
  }

  /* ---------- 문제 시작 ---------- */
  function nextQuestion() {
    const p = pickTarget();
    if (!p) {
      showChapterClear();
      return;
    }
    cur = {
      p,
      answer: p.name,
      slots: new Array(Array.from(p.name).length).fill(null),
      fill: {},
      tiles: buildTiles(p.name).map((ch) => ({ ch, used: false })),
      misses: 0,
      given: 0,
    };
    busy = false;

    // 판을 다시 덮는다 — 모습은 맞히기 전까지 보여 주지 않는다
    const plate = $('#plate');
    plate.classList.remove('is-open');
    const art = $('#plate-art');
    art.removeAttribute('src');
    art.alt = '';
    art.setAttribute('aria-hidden', 'true');
    $('#plate-no').textContent = 'No. ???';

    renderBar();
    renderPlateTypes();
    renderClues();
    renderSlots();
    renderTiles();
    $('#quiz-body').scrollTop = 0;
  }

  /** 이 챕터를 다 잡았을 때: 아직 남은 다른 타입으로 이어 준다 */
  function showChapterClear() {
    const names = Data.typeNames;
    const idx = names.indexOf(chapter);
    const nextType = names
      .slice(idx + 1)
      .concat(names.slice(0, Math.max(idx, 0)))
      .find((t) => Dex.typeProgress(t).caught < Data.typeSize(t));

    const done = Dex.progressOf(chapter);
    const sheet = el('div');
    if (chapter === Dex.ALL) {
      sheet.appendChild(el('p', 'sheet-eyebrow', '도감 완성'));
      sheet.appendChild(el('h2', 'sheet-title', '802마리를 모두 모았다'));
      sheet.appendChild(el('p', 'sheet-text', '도감을 끝까지 채웠어.\n정말 대단해!'));
    } else {
      sheet.appendChild(el('p', 'sheet-eyebrow', '타입 완성'));
      sheet.appendChild(el('h2', 'sheet-title', `${chapter} 타입을 다 모았다`));
      sheet.appendChild(
        el(
          'p',
          'sheet-text',
          nextType
            ? `${chapter} 타입 포켓몬을 모두 모았어.\n이제 ${nextType} 타입을 해 볼까?`
            : `${chapter} 타입 포켓몬을 모두 모았어.\n정말 대단해!`,
        ),
      );
    }
    sheet.appendChild(el('p', 'sheet-data', `${chapterLabel()} ${done.caught} / ${done.total}`));

    const buttons = el('div', 'sheet-buttons');
    if (nextType) {
      const go = el('button', 'btn btn--go', `${nextType} 타입 풀기`);
      go.onclick = () => {
        window.App.closeOverlay();
        chapter = nextType;
        nextQuestion();
      };
      buttons.appendChild(go);
    }
    const home = el('button', 'btn', '처음으로');
    home.onclick = () => {
      window.App.closeOverlay();
      window.App.goHome();
    };
    buttons.appendChild(home);
    sheet.appendChild(buttons);

    Sound.fanfare();
    window.App.openOverlay(sheet, { sticky: true });
    busy = false;
  }

  window.Quiz = {
    /** chapter: Dex.ALL('전체') 또는 타입 이름 */
    start(c) {
      chapter = c || Dex.ALL;
      nextQuestion();
    },
    get chapter() {
      return chapter;
    },
  };
})();
