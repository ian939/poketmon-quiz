/* 화면 전환, 홈 화면, 겹쳐 뜨는 창, 설정 */
(function () {
  'use strict';

  const { el, $, $$, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;
  const Dex = window.Dex;
  const Quiz = window.Quiz;

  const RESET_WORD = '초기화';
  const TRAINERS = 20;                 // images/trainer/01.webp ~ 20.webp
  const trainerImg = (n) => `images/trainer/${String(n).padStart(2, '0')}.webp`;

  const TITLES = {
    setup: '나를 정하자',
    home: '포켓몬 도감 퀴즈',
    quiz: '누구일까',
    sentence: '문장 맞추기',
    dex: '내 도감',
    badge: '배지와 기록',
  };

  /* ---------- 화면 전환 ---------- */
  function show(name) {
    // 퀴즈를 떠나면 단서 잠금 타이머를 정리한다
    if (name !== 'quiz' && window.Quiz) window.Quiz.leave();
    $$('.screen').forEach((s) => s.classList.remove('is-on'));
    const target = $(`#screen-${name}`);
    if (target) target.classList.add('is-on');
    // 초기화는 홈에서만, 처음으로는 홈·시작화면이 아닐 때만 보인다
    $('#btn-back').classList.toggle('is-hidden', name === 'home' || name === 'setup');
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
    const top = stack[stack.length - 1];
    // variant 는 창의 결(예: 전설 포획 = 금색)을 바꾼다
    sheet.className = `sheet${top.variant ? ` sheet--${top.variant}` : ''}`;
    sheet.appendChild(top.node);
    overlay.classList.add('is-on');
  }

  const entry = (node, opts) => ({
    node,
    sticky: !!(opts && opts.sticky),
    variant: (opts && opts.variant) || null,
  });

  function openOverlay(node, opts) {
    stack.push(entry(node, opts));
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
    stack.push(entry(node, opts));
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

  /* ---------- 처음 시작: 캐릭터와 이름 정하기 ---------- */
  let pickedTrainer = null;

  function renderSetup(editing) {
    const grid = $('#trainer-grid');
    const input = $('#setup-name');
    const cancel = $('#setup-cancel');
    const go = $('#setup-go');
    const p = Save.profile;

    pickedTrainer = editing && p ? p.trainer : null;
    input.value = editing && p ? p.name : '';
    go.textContent = editing ? '바꾸기' : '시작하기';
    cancel.classList.toggle('is-hidden', !editing);

    grid.innerHTML = '';
    for (let n = 1; n <= TRAINERS; n += 1) {
      const btn = el('button', `trainer${n === pickedTrainer ? ' is-on' : ''}`);
      const img = el('img');
      img.src = trainerImg(n);
      img.alt = `${n}번 캐릭터`;
      img.loading = 'lazy';
      btn.appendChild(img);
      btn.onclick = () => {
        pickedTrainer = n;
        $$('#trainer-grid .trainer').forEach((b, i) => b.classList.toggle('is-on', i + 1 === n));
        Sound.tap();
        paintSetupState();
      };
      grid.appendChild(btn);
    }
    paintSetupState();
    show('setup');
  }

  function paintSetupState() {
    const name = $('#setup-name').value.trim();
    const ok = !!pickedTrainer && name.length > 0;
    $('#setup-go').disabled = !ok;
    const hint = $('#setup-hint');
    hint.classList.toggle('is-ready', ok);
    if (ok) hint.textContent = `좋아, ${name}! 이제 시작할 수 있어.`;
    else if (!pickedTrainer) hint.textContent = '먼저 캐릭터를 골라 줘.';
    else hint.textContent = '이름을 써 줘.';
  }

  /* ---------- 홈 ---------- */

  /** 트레이너 등급 — 도감 수가 늘면 자란다. 다음 등급까지 몇 마리인지 같이 보여 준다. */
  function renderRank(caught) {
    const r = Data.rankOf(caught);
    const title = $('#rank-title');
    title.textContent = r.rank.name;
    title.style.color = r.rank.color;
    $('#rank-step').textContent = `트레이너 ${r.step}단계 / ${r.steps} · 도감 ${caught}마리`;
    $('#rank-fill').style.width = `${(r.ratio * 100).toFixed(1)}%`;
    $('#rank-fill').style.background = (r.next || r.rank).color;
    $('#rank-next').textContent = r.next
      ? `${r.next.name}까지 ${r.need}마리 더!`
      : '전국도감을 다 채웠다!';
    $('#rank-bar').setAttribute('aria-label',
      r.next ? `다음 등급까지 ${r.need}마리` : '마지막 등급');
  }

  /** 캐릭터 밑 배지 진열장 — 모은 배지가 늘어나면 눈에 보이게 쌓인다. */
  function renderBadgecase() {
    const row = $('#badgecase-row');
    row.innerHTML = '';
    let n = 0;
    Data.typeNames.forEach((type) => {
      Data.BADGE_TIERS.forEach((tier) => {
        if (!Save.hasBadge(`${type}:${tier.key}`)) return;
        n += 1;
        const chip = el('i', 'bchip', tier.mark);
        chip.style.setProperty('--bg', Data.typeColor(type));
        chip.style.setProperty('--ring', tier.color);
        chip.style.color = Data.typeTextColor(type);
        chip.title = `${type} ${tier.label}`;
        chip.setAttribute('aria-label', `${type} ${tier.label}`);
        row.appendChild(chip);
      });
    });
    const max = Data.typeNames.length * Data.BADGE_TIERS.length;
    $('#badgecase-count').textContent = `${n} / ${max}`;
    $('#badgecase').classList.toggle('is-empty', n === 0);
    if (!n) row.appendChild(el('span', 'bchip-none', '타입을 20%만 모아도 첫 배지를 받아!'));
  }
  function renderHome() {
    Dex.renderMosaic();

    const p = Save.profile;
    const img = $('#hero-trainer');
    if (p) {
      img.src = trainerImg(p.trainer);
      img.alt = `${p.name}의 캐릭터`;
      $('#hero-name').textContent = p.name;
      $('#hero-me').title = '캐릭터와 이름 바꾸기';
    }

    const t = Dex.totalProgress();
    renderRank(t.caught);
    renderBadgecase();

    const badgeMax = Data.typeNames.length * Data.BADGE_TIERS.length;
    $('#menu-dex-count').textContent = `${t.caught} / ${t.total}`;
    $('#menu-badge-count').textContent = `배지 ${Save.badgeKeys().length} / ${badgeMax}`;
    const sg = window.Sentence.progress();
    $('#menu-sent-count').textContent = `${sg.done} / ${sg.total}`;
    const meta = $('#profile-meta');
    if (meta) meta.textContent = p ? p.name : '';

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

  /** id를 주면 그 포켓몬의 문장부터 낸다 (도감 빈칸에서 넘어올 때) */
  function playSentence(id) {
    clearOverlays();
    show('sentence');
    window.Sentence.start(id);
  }

  function goHome() {
    clearOverlays();
    // 아직 캐릭터와 이름을 정하지 않았으면 그것부터
    if (!Save.hasProfile()) {
      renderSetup(false);
      return;
    }
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
      // 프로필까지 지워지므로 캐릭터·이름 정하기 화면부터 다시 시작한다
      goHome();
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
    $('#btn-sentence').onclick = () => playSentence();
    $('#btn-back').onclick = goHome;
    $('#btn-reset').onclick = confirmReset;

    // 캐릭터·이름 정하기
    $('#setup-name').addEventListener('input', paintSetupState);
    $('#setup-name').addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !$('#setup-go').disabled) $('#setup-go').click();
    });
    $('#setup-go').onclick = () => {
      const name = $('#setup-name').value.trim();
      if (!pickedTrainer || !name) return;
      Save.setProfile(pickedTrainer, name);
      Sound.unlock();
      goHome();
    };
    $('#setup-cancel').onclick = goHome;
    $('#hero-me').onclick = () => renderSetup(true);
    $('#btn-profile').onclick = () => renderSetup(true);

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
    show, playSentence, openOverlay, closeOverlay, replaceOverlay, clearOverlays, goHome, renderHome,
  };

  bind();
  goHome();   // 프로필이 없으면 캐릭터·이름 정하기 화면부터 뜬다
  $('#loading').classList.add('is-hidden');
})();
