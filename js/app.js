/* 화면 전환, 홈 화면, 겹쳐 뜨는 창, 설정 */
(function () {
  'use strict';

  const { el, $, $$, Sound } = window.U;
  const Data = window.Data;
  const Save = window.Save;
  const Dex = window.Dex;
  const Quiz = window.Quiz;

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
    $('#btn-back').classList.toggle('is-hidden', name === 'home');
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

  /* ---------- 홈 ---------- */
  function renderHome() {
    Dex.renderMosaic();

    const t = Dex.totalProgress();
    $('#menu-dex-count').textContent = `${t.caught} / ${t.total}`;
    $('#menu-badge-count').textContent = `배지 ${Save.badgeKeys().length} / 21`;

    const list = $('#region-list');
    list.innerHTML = '';

    Data.regionNames.forEach((name, i) => {
      const meta = Data.REGION_META[name];
      const unlocked = Save.isUnlocked(name);
      const { caught, total, ratio } = Dex.regionProgress(name);

      const card = el('button', `region${unlocked ? '' : ' is-locked'}`);
      card.style.borderLeftColor = meta.color;

      const body = el('div');
      body.appendChild(el('div', 'region-name', `${name} 지방`));

      if (unlocked) {
        body.appendChild(el('div', 'region-note', meta.desc));
        const bar = el('div', 'region-bar');
        const fill = el('i');
        fill.style.width = `${(ratio * 100).toFixed(1)}%`;
        bar.appendChild(fill);
        body.appendChild(bar);
      } else {
        const prev = Data.regionNames[i - 1];
        const need = Dex.unlockNeed(prev);
        const have = Dex.regionProgress(prev).caught;
        body.appendChild(
          el('div', 'region-note', `${prev} 지방에서 ${need}마리를 모으면 열려. 지금 ${have}마리.`),
        );
      }
      card.appendChild(body);

      const right = el('div');
      right.className = 'region-chip';
      right.textContent = unlocked ? `${caught}/${total}` : '잠김';
      card.appendChild(right);

      if (unlocked) {
        const earned = Data.BADGE_TIERS.filter((tier) => Save.hasBadge(`${name}:${tier.key}`));
        if (earned.length) {
          const stamps = el('div', 'region-stamps');
          earned.forEach((tier) => {
            const dot = el('i');
            dot.style.background = tier.color;
            stamps.appendChild(dot);
          });
          right.appendChild(stamps);
        }
      }

      card.onclick = () => {
        if (!unlocked) {
          Sound.erase();
          toastLocked(name, i);
          return;
        }
        startQuiz(name);
      };
      list.appendChild(card);
    });
  }

  function toastLocked(name, i) {
    const prev = Data.regionNames[i - 1];
    const need = Dex.unlockNeed(prev);
    const have = Dex.regionProgress(prev).caught;
    openOverlay(
      buildNotice(
        '아직 잠겨 있어',
        `${name} 지방은 ${prev} 지방에서 ${need}마리를 모으면 열려.\n지금 ${have}마리 모았어.`,
      ),
    );
  }

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

  function startQuiz(region) {
    show('quiz');
    Quiz.start(region);
  }

  /** 아직 다 못 잡은, 열려 있는 지방 중 첫 번째부터 이어서 */
  function playNext() {
    const target = Data.regionNames.find(
      (r) => Save.isUnlocked(r) && Dex.regionProgress(r).caught < Data.regionSize(r),
    );
    if (!target) {
      openOverlay(buildNotice('도감 완성', '802마리를 모두 모았어. 정말 대단해!'));
      return;
    }
    startQuiz(target);
  }

  function goHome() {
    clearOverlays();
    renderHome();
    show('home');
  }

  /* ---------- 도감 초기화 (두 번 확인) ---------- */
  function confirmReset() {
    const first = el('div');
    first.appendChild(el('p', 'sheet-eyebrow', '되돌릴 수 없음'));
    first.appendChild(el('h2', 'sheet-title', '정말 지울까?'));
    first.appendChild(
      el('p', 'sheet-text', `지금까지 모은 ${Save.caughtCount()}마리가 모두 사라져.\n처음부터 다시 할래?`),
    );
    const buttons = el('div', 'sheet-buttons');
    const keep = el('button', 'btn btn--go', '아니야, 그냥 둘래');
    keep.onclick = closeOverlay;
    const drop = el('button', 'btn', '지울래');
    drop.onclick = () => {
      closeOverlay();
      const second = el('div');
      second.appendChild(el('p', 'sheet-eyebrow', '마지막 확인'));
      second.appendChild(el('h2', 'sheet-title', '진짜 지울까?'));
      second.appendChild(el('p', 'sheet-text', '한 번 지우면 되돌릴 수 없어.'));
      const buttons2 = el('div', 'sheet-buttons');
      const keep2 = el('button', 'btn btn--go', '그만두기');
      keep2.onclick = closeOverlay;
      const wipe = el('button', 'btn btn--stop', '모두 지우기');
      wipe.onclick = () => {
        Save.reset();
        Sound.setMuted(Save.state.settings.muted);
        paintSound();
        closeOverlay();
        goHome();
      };
      buttons2.appendChild(keep2);
      buttons2.appendChild(wipe);
      second.appendChild(buttons2);
      openOverlay(second);
    };
    buttons.appendChild(keep);
    buttons.appendChild(drop);
    first.appendChild(buttons);
    openOverlay(first);
  }

  /* ---------- 소리 ---------- */
  function paintSound() {
    $('#btn-sound').textContent = Save.state.settings.muted ? '소리 켜기' : '소리 끄기';
  }

  /* ---------- 시작 ---------- */
  function bind() {
    $('#btn-play').onclick = playNext;
    $('#btn-dex').onclick = () => {
      const first =
        Dex.activeRegion ||
        Data.regionNames.find((r) => Save.isUnlocked(r)) ||
        Data.regionNames[0];
      Dex.renderDex(first);
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
