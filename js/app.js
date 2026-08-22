/* 화면 전환, 홈 화면, 겹쳐 뜨는 창, 설정 */
(function () {
  'use strict';

  const { el, $, $$, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;
  const Dex = window.Dex;
  const Quiz = window.Quiz;

  const RESET_WORD = '초기화';

  const TITLES = {
    home: '포켓몬 도감 퀴즈',
    quiz: '누구일까',
    dex: '내 도감',
    badge: '배지와 기록',
  };

  /* ---------- 화면 전환 ---------- */
  function show(name) {
    $$('.screen').forEach((s) => s.classList.remove('is-on'));
    const target = $(`#screen-${name}`);
    if (target) target.classList.add('is-on');
    // 초기화는 홈에서만, 처음으로는 홈이 아닐 때만 보인다
    $('#btn-back').classList.toggle('is-hidden', name === 'home');
    $('#btn-reset').classList.toggle('is-hidden', name !== 'home');
    $('#mast-title').textContent = TITLES[name] || TITLES.home;
  }

  /* ---------- 겹쳐 뜨는 창 (겹쳐 열 수 있게 스택으로) ---------- */
  const stack = [];

  function paint() {
    const overlay = $('#overlay');
    const sheet = $('#sheet');
    sheet.innerHTML = '';
    if (!stack.length) {
      overlay.classList.remove('is-on');
      return;
    }
    sheet.appendChild(stack[stack.length - 1].node);
    overlay.classList.add('is-on');
  }

  function openOverlay(node, opts) {
    stack.push({ node, sticky: !!(opts && opts.sticky) });
    paint();
  }

  function closeOverlay() {
    stack.pop();
    paint();
  }

  /** 지금 창을 다음 창으로 갈아 끼운다(연출 → 결과처럼 이어지는 화면용).
   *  openOverlay를 연달아 쓰면 앞 창이 밑에 남아 닫을 때 다시 나타난다. */
  function replaceOverlay(node, opts) {
    stack.pop();
    stack.push({ node, sticky: !!(opts && opts.sticky) });
    paint();
  }

  function clearOverlays() {
    stack.length = 0;
    paint();
  }

  $('#overlay').addEventListener('click', (e) => {
    if (e.target !== $('#overlay')) return;
    const top = stack[stack.length - 1];
    if (top && top.sticky) return; // 연출 중에는 바깥을 눌러도 닫히지 않게
    closeOverlay();
  });

  function buildNotice(title, text) {
    const sheet = el('div');
    sheet.appendChild(el('h2', 'sheet-title', title));
    sheet.appendChild(el('p', 'sheet-text', text));
    const buttons = el('div', 'sheet-buttons');
    const ok = el('button', 'btn btn--go', '알았어');
    ok.onclick = closeOverlay;
    buttons.appendChild(ok);
    sheet.appendChild(buttons);
    return sheet;
  }

  /* ---------- 홈 ---------- */
  function renderHome() {
    Dex.renderMosaic();

    const t = Dex.totalProgress();
    const badgeMax = Data.typeNames.length * Data.BADGE_TIERS.length;
    $('#menu-dex-count').textContent = `${t.caught} / ${t.total}`;
    $('#menu-badge-count').textContent = `배지 ${Save.badgeKeys().length} / ${badgeMax}`;

    const grid = $('#type-list');
    grid.innerHTML = '';

    Data.typeNames.forEach((type) => {
      const { caught, total, ratio } = Dex.typeProgress(type);
      const color = Data.typeColor(type);

      const tile = el('button', 'type-tile');
      tile.style.setProperty('--type', color);
      tile.style.setProperty('--type-ink', Data.typeTextColor(type));

      const head = el('div', 'type-head');
      head.appendChild(el('span', 'type-name', type));
      head.appendChild(el('span', 'type-count', `${caught}/${total}`));
      tile.appendChild(head);

      const body = el('div', 'type-body');
      body.appendChild(el('p', 'type-note', Data.typeNote(type)));
      const bar = el('div', 'type-bar');
      const fill = el('i');
      fill.style.width = `${(ratio * 100).toFixed(1)}%`;
      fill.style.background = color;
      bar.appendChild(fill);
      body.appendChild(bar);
      tile.appendChild(body);

      const earned = Data.BADGE_TIERS.filter((tier) => Save.hasBadge(`${type}:${tier.key}`));
      if (earned.length) {
        const stamps = el('div', 'type-stamps');
        earned.forEach((tier) => {
          const dot = el('i');
          dot.style.background = tier.color;
          stamps.appendChild(dot);
        });
        body.appendChild(stamps);
      }

      tile.setAttribute('aria-label', `${type} 타입 ${caught} / ${total} 마리`);
      tile.onclick = () => startQuiz(type);
      grid.appendChild(tile);
    });
  }

  function startQuiz(chapter) {
    show('quiz');
    Quiz.start(chapter);
  }

  /** 아무 타입이나 섞어서 — 802마리 전부가 나올 수 있다 */
  function playAny() {
    if (Save.caughtCount() >= Data.total) {
      openOverlay(buildNotice('도감 완성', '802마리를 모두 모았어. 정말 대단해!'));
      return;
    }
    startQuiz(Dex.ALL);
  }

  function goHome() {
    clearOverlays();
    renderHome();
    show('home');
  }

  /* ---------- 도감 초기화 ----------
   * 아이가 실수로 지우지 못하게, '초기화'라고 직접 입력해야 눌릴 수 있게 한다. */
  function confirmReset() {
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', '되돌릴 수 없음'));
    sheet.appendChild(el('h2', 'sheet-title', '도감을 초기화할까?'));
    const have = Save.caughtCount();
    sheet.appendChild(
      el(
        'p',
        'sheet-text',
        (have
          ? `지금까지 모은 ${have}마리와 배지가 모두 사라져.\n`
          : '아직 모은 포켓몬은 없어.\n') +
          `정말 지우려면 아래에 "${RESET_WORD}"라고 쓴 다음 지우기를 눌러.`,
      ),
    );

    const input = el('input', 'reset-input');
    input.type = 'text';
    input.setAttribute('autocomplete', 'off');
    input.setAttribute('autocapitalize', 'off');
    input.setAttribute('spellcheck', 'false');
    input.setAttribute('aria-label', `초기화하려면 ${RESET_WORD}라고 입력`);
    input.placeholder = RESET_WORD;
    sheet.appendChild(input);

    const hint = el('p', 'reset-hint', `"${RESET_WORD}"라고 쓰면 지우기 버튼이 켜져.`);
    sheet.appendChild(hint);

    const buttons = el('div', 'sheet-buttons');
    const wipe = el('button', 'btn btn--stop', '지우기');
    wipe.disabled = true;
    const keep = el('button', 'btn btn--go', '그만두기');
    keep.onclick = closeOverlay;
    buttons.appendChild(keep);
    buttons.appendChild(wipe);
    sheet.appendChild(buttons);

    const matched = () => input.value.trim() === RESET_WORD;
    input.addEventListener('input', () => {
      const ok = matched();
      wipe.disabled = !ok;
      hint.textContent = ok
        ? '이제 지우기를 누르면 처음부터 시작해.'
        : `"${RESET_WORD}"라고 쓰면 지우기 버튼이 켜져.`;
      hint.classList.toggle('is-ready', ok);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && matched()) wipe.click();
    });

    wipe.onclick = () => {
      if (!matched()) return;
      Save.reset();
      Sound.setMuted(Save.state.settings.muted);
      paintSound();
      closeOverlay();
      goHome();
      openOverlay(buildNotice('처음부터 시작', '도감을 비웠어.\n다시 모아 보자!'));
    };

    openOverlay(sheet);
    setTimeout(() => input.focus(), 60);
  }

  /* ---------- 소리 ---------- */
  function paintSound() {
    $('#btn-sound').textContent = Save.state.settings.muted ? '소리 켜기' : '소리 끄기';
  }

  /* ---------- 시작 ---------- */
  function bind() {
    $('#btn-play').onclick = playAny;
    $('#btn-dex').onclick = () => {
      Dex.renderDex(Dex.activeTab || Dex.ALL);
      show('dex');
    };
    $('#btn-badge').onclick = () => {
      Dex.renderBadges();
      show('badge');
    };
    $('#btn-back').onclick = goHome;
    $('#btn-reset').onclick = confirmReset;

    $('#btn-sound').onclick = () => {
      const next = !Save.state.settings.muted;
      Save.setMuted(next);
      Sound.setMuted(next);
      paintSound();
      if (!next) Sound.tap();
    };

    // 모자이크에서 잡은 칸을 누르면 그 포켓몬 기록을 본다
    $('#mosaic').addEventListener('click', (e) => {
      const cell = e.target.closest('.mosaic-cell.is-known');
      if (!cell) return;
      Dex.openDetail(Number(cell.dataset.id));
    });

    Sound.setMuted(Save.state.settings.muted);
    paintSound();
  }

  window.App = {
    show, openOverlay, closeOverlay, replaceOverlay, clearOverlays, goHome, renderHome,
  };

  bind();
  renderHome();
  show('home');
  $('#loading').classList.add('is-hidden');
})();
