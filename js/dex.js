/* 도감 화면, 진행률, 배지·마일스톤 판정, 상세 카드
 * 챕터는 타입 기준이고, 잠긴 챕터는 없다 — 아이가 원하는 타입을 바로 고를 수 있다. */
(function () {
  'use strict';

  const { el, $ } = window.U;
  const Data = window.Data;
  const Save = window.Save;

  const ALL = '전체';
  let activeTab = ALL;

  const pad3 = (n) => String(n).padStart(3, '0');

  /* ---------- 진행률 ---------- */
  function typeProgress(type) {
    const list = Data.inType(type);
    let caught = 0;
    for (const p of list) if (Save.isCaught(p.id)) caught += 1;
    return { caught, total: list.length, ratio: list.length ? caught / list.length : 0 };
  }

  /** 잡은 전설·환상 마리 수 */
  function specialCaught() {
    let n = 0;
    for (const p of Data.all) if (Data.isSpecial(p) && Save.isCaught(p.id)) n += 1;
    return n;
  }

  function totalProgress() {
    const caught = Save.caughtCount();
    return { caught, total: Data.total, ratio: caught / Data.total };
  }

  /** 탭이나 챕터 이름으로 목록/진행률을 얻는다 ('전체'면 802마리 전부) */
  const listOf = (tab) => (tab === ALL ? Data.all : Data.inType(tab));
  const progressOf = (tab) => (tab === ALL ? totalProgress() : typeProgress(tab));

  /**
   * 잡은 뒤 새로 생긴 보상을 모아 돌려준다.
   * (타입 배지 / 진화 라인 완성 / 전체 마일스톤) 챕터 잠금이 없으므로 해제 보상은 없다.
   * justCaught: 방금 잡은 포켓몬 — 진화 라인 완성을 판정하는 데 쓴다.
   */
  function claimRewards(justCaught) {
    const events = [];

    // 타입 배지: 20% / 50% / 100%
    // 한 번에 여러 단계를 넘었으면(저장을 옮겼거나 건너뛴 경우) 축하창이
    // 줄줄이 뜨지 않도록 가장 높은 단계만 알린다. 나머지는 조용히 기록.
    Data.typeNames.forEach((type) => {
      const { caught, total } = typeProgress(type);
      let top = null;
      Data.BADGE_TIERS.forEach((tier) => {
        const need = Math.max(1, Math.ceil(total * tier.ratio));
        if (caught >= need && Save.awardBadge(`${type}:${tier.key}`)) {
          top = tier; // BADGE_TIERS는 낮은 단계부터이므로 마지막이 가장 높다
        }
      });
      if (top) events.push({ type: 'badge', group: type, tier: top });
    });

    // 진화 라인 완성 — 방금 잡은 포켓몬의 라인이 다 찼는지 본다
    if (justCaught) {
      const key = Data.lineKey(justCaught);
      const ids = (justCaught.evo && justCaught.evo.lineIds) || [];
      if (key && ids.length >= 2 && ids.every((id) => Save.isCaught(id))
          && Save.awardLine(key)) {
        events.push({ type: 'line', pokemon: justCaught, ids });
      }
    }

    // 전체 마일스톤 — 마찬가지로 새로 넘은 것 중 가장 큰 것만 축하한다
    const caughtAll = Save.caughtCount();
    let topMilestone = null;
    Data.MILESTONES.forEach((n) => {
      if (caughtAll >= n && !Save.hasMilestone(n)) {
        Save.markMilestone(n);
        topMilestone = n;
      }
    });
    if (topMilestone !== null) events.push({ type: 'milestone', n: topMilestone });

    return events;
  }

  /* ---------- 홈 히어로: 802칸 모자이크 ----------
   * 칸 하나가 포켓몬 한 마리. 책과 같은 타입 순서로 늘어놓았고,
   * 잡으면 그 포켓몬의 타입 색으로 칠해져 도감이 색으로 물들어 간다. */
  function renderMosaic() {
    const box = $('#mosaic');
    if (!box) return;
    box.innerHTML = '';
    const frag = document.createDocumentFragment();

    Data.mosaicOrder.forEach((p) => {
      const known = Save.isCaught(p.id);
      const cell = el(known ? 'button' : 'div', `mosaic-cell${known ? ' is-known' : ''}`);
      if (known) {
        cell.style.background = Data.typeColor(p.types[0]);
        cell.dataset.id = String(p.id);
        cell.title = `No.${pad3(p.id)} ${p.name}`;
        cell.setAttribute('aria-label', `No.${pad3(p.id)} ${p.name}`);
      } else {
        // 빈 칸도 타입마다 조금 다르게 두어 타입 구간이 보이게 한다.
        // 색 섞기는 CSS에 맡겨 color-mix를 모르는 브라우저에서도 기본색으로 보이게 한다.
        cell.style.setProperty('--tint', Data.typeColor(p.types[0]));
        cell.dataset.tint = '';
        cell.setAttribute('aria-hidden', 'true');
      }
      frag.appendChild(cell);
    });
    box.appendChild(frag);

    const t = totalProgress();
    $('#mosaic-caption').textContent =
      `802칸 중 ${t.caught}칸 채움 · ${(t.ratio * 100).toFixed(1)}%`;
  }

  /* ---------- 도감 ---------- */
  function renderTabs() {
    const tabs = $('#dex-tabs');
    tabs.innerHTML = '';
    [ALL].concat(Data.typeNames).forEach((tab) => {
      const { caught, total } = progressOf(tab);
      const btn = el('button', 'tab');
      if (tab === activeTab) btn.classList.add('is-on');
      if (tab !== ALL) {
        btn.style.setProperty('--tab', Data.typeColor(tab));
        btn.classList.add('tab--type');
      }
      btn.appendChild(el('span', null, tab));
      btn.appendChild(el('span', 'tab-count', `${caught}/${total}`));
      btn.onclick = () => {
        activeTab = tab;
        renderDex(tab);
      };
      tabs.appendChild(btn);
    });
  }

  function renderDex(tab) {
    activeTab = tab || activeTab || ALL;
    renderTabs();

    const { caught, total, ratio } = progressOf(activeTab);
    const t = totalProgress();
    const label = activeTab === ALL ? '전체' : `${activeTab} 타입`;
    $('#dex-progress').textContent =
      `${label} ${caught} / ${total} (${Math.round(ratio * 100)}%)` +
      (activeTab === ALL ? '' : `   도감 전체 ${t.caught} / ${t.total}`);

    const grid = $('#dex-grid');
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    listOf(activeTab).forEach((p) => {
      const known = Save.isCaught(p.id);
      // 아직 못 잡은 칸은 모습을 보여 주지 않는다 — 퀴즈에서 가리는 것과 같은 규칙이어야
      // 도감을 뒤져 답을 찾는 일이 없다.
      // 전설·환상은 잡기 전에도 금테로 표시한다 — '여기 특별한 게 숨어 있다'는 예고
      const gold = Data.isSpecial(p) ? ' is-special' : '';
      if (!known) {
        const cell = el('div', `cell${gold}`);
        cell.appendChild(el('span', 'cell-q', '?'));
        cell.appendChild(el('span', 'cell-no', `No.${pad3(p.id)}`));
        cell.appendChild(el('span', 'cell-name', '???'));
        frag.appendChild(cell);
        return;
      }
      const cell = el('button', `cell is-known${gold}`);
      const img = el('img');
      img.src = p.img;
      img.alt = p.name;
      img.loading = 'lazy';
      img.onerror = () => { img.style.visibility = 'hidden'; };
      cell.appendChild(img);
      cell.appendChild(el('span', 'cell-no', `No.${pad3(p.id)}`));
      cell.appendChild(el('span', 'cell-name', p.name));
      cell.onclick = () => openDetail(p.id);
      frag.appendChild(cell);
    });

    grid.appendChild(frag);
  }

  /* ---------- 상세 카드 ---------- */
  function typeChips(p) {
    const wrap = el('div', 'clue-chips');
    p.types.forEach((t) => {
      const chip = el('span', 'chip', t);
      chip.style.background = Data.typeColor(t);
      chip.style.color = Data.typeTextColor(t);
      wrap.appendChild(chip);
    });
    return wrap;
  }

  function row(key, value) {
    const box = el('div', 'row');
    box.appendChild(el('div', 'row-key', key));
    box.appendChild(el('div', 'row-value', value));
    return box;
  }

  function evoLine(p) {
    const ids = (p.evo && p.evo.lineIds) || [];
    if (ids.length < 2) return null;
    const line = el('div', 'evo');
    ids.forEach((id, i) => {
      if (i > 0) line.appendChild(el('span', 'evo-arrow', '▸'));
      const target = Data.get(id);
      if (!target) return;
      const known = Save.isCaught(id);
      const node = el(
        'div',
        `evo-node${known ? '' : ' is-unknown'}${id === p.id ? ' is-self' : ''}`,
      );
      const img = el('img');
      img.src = target.img;
      img.alt = known ? target.name : '아직 모르는 포켓몬';
      img.loading = 'lazy';
      node.appendChild(img);
      node.appendChild(el('div', null, known ? target.name : '???'));
      line.appendChild(node);
    });
    return line;
  }

  function openDetail(id) {
    const p = Data.get(id);
    if (!p) return;
    const sheet = el('div');

    const head = el('div', 'detail-head');
    const img = el('img');
    img.src = p.img;
    img.alt = p.name;
    head.appendChild(img);
    const title = el('div');
    title.appendChild(el('div', 'detail-id', `No.${pad3(p.id)} · ${p.region} 지방`));
    title.appendChild(el('div', 'detail-name', p.name));
    if (p.genus) title.appendChild(el('div', 'detail-genus', p.genus));
    title.appendChild(typeChips(p));
    head.appendChild(title);
    sheet.appendChild(head);

    const rows = el('div', 'rows');
    if (p.flavor) rows.appendChild(row('도감 설명', p.flavor));
    rows.appendChild(row('크기', `키 ${p.height.toFixed(1)}m · 몸무게 ${p.weight.toFixed(1)}kg`));
    if (p.abilities && p.abilities.length) {
      rows.appendChild(
        row(
          '특성',
          p.abilities.map((a) => (a.hidden ? `${a.name} (숨겨진 특성)` : a.name)).join(', '),
        ),
      );
    }
    const evo = evoLine(p);
    if (evo) {
      const box = el('div', 'row');
      box.appendChild(el('div', 'row-key', '진화'));
      box.appendChild(evo);
      rows.appendChild(box);
    } else {
      rows.appendChild(row('진화', '진화하지 않는 포켓몬이야.'));
    }
    if (p.legendary || p.mythical) {
      rows.appendChild(row('특별', p.mythical ? '환상의 포켓몬' : '전설의 포켓몬'));
    }
    const page = Data.bookPage(p.name);
    if (page) rows.appendChild(row('우리 책', `${page}쪽에서 볼 수 있어.`));
    sheet.appendChild(rows);

    const buttons = el('div', 'sheet-buttons');
    buttons.style.marginTop = '14px';
    const close = el('button', 'btn', '닫기');
    close.onclick = () => window.App.closeOverlay();
    buttons.appendChild(close);
    sheet.appendChild(buttons);

    window.App.openOverlay(sheet);
  }

  /* ---------- 기록과 배지 ---------- */
  function renderBadges() {
    const stats = Save.state.stats;
    const t = totalProgress();

    const box = $('#stat-row');
    box.innerHTML = '';
    const addStat = (value, key) => {
      const s = el('div', 'stat');
      s.appendChild(el('div', 'stat-value', String(value)));
      s.appendChild(el('div', 'stat-key', key));
      box.appendChild(s);
    };
    const badgeMax = Data.typeNames.length * Data.BADGE_TIERS.length;
    addStat(t.caught, '잡은 포켓몬');
    addStat(`${Math.round(t.ratio * 100)}%`, '도감 완성도');
    addStat(stats.bestStreak, '최고 연속 정답');
    addStat(`${Save.badgeKeys().length}/${badgeMax}`, '모은 배지');
    addStat(`${Save.lineCount()}/${Data.EVO_LINES}`, '완성한 진화 라인');
    addStat(`${specialCaught()}/${Data.SPECIALS}`, '전설·환상');
    addStat(Save.sentenceCount(), '읽은 문장');
    addStat(Save.caughtFrom('book'), '책에서 찾은 포켓몬');

    const grid = $('#badge-grid');
    grid.innerHTML = '';
    Data.typeNames.forEach((type) => {
      const { caught, total } = typeProgress(type);
      Data.BADGE_TIERS.forEach((tier) => {
        const has = Save.hasBadge(`${type}:${tier.key}`);
        const need = Math.max(1, Math.ceil(total * tier.ratio));
        const card = el('div', `badge${has ? '' : ' is-off'}`);
        const stamp = el('div', 'stamp', has ? tier.mark : '');
        if (has) stamp.style.setProperty('--stamp', tier.color);
        card.appendChild(stamp);
        card.appendChild(el('div', 'badge-name', `${type} ${tier.label}`));
        card.appendChild(el('div', 'badge-cond', has ? '획득' : `${caught} / ${need}`));
        grid.appendChild(card);
      });
    });
  }

  window.Dex = {
    ALL,
    renderDex,
    renderBadges,
    renderMosaic,
    openDetail,
    typeProgress,
    totalProgress,
    specialCaught,
    progressOf,
    listOf,
    claimRewards,
    get activeTab() {
      return activeTab;
    },
    set activeTab(v) {
      activeTab = v;
    },
  };
})();
