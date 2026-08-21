/* 도감 화면, 진행률, 배지·마일스톤 판정, 상세 카드 */
(function () {
  'use strict';

  const { el, $ } = window.U;
  const Data = window.Data;
  const Save = window.Save;

  let activeRegion = null;

  const pad3 = (n) => String(n).padStart(3, '0');

  /* ---------- 진행률 ---------- */
  function regionProgress(region) {
    const list = Data.inRegion(region);
    let caught = 0;
    for (const p of list) if (Save.isCaught(p.id)) caught += 1;
    return { caught, total: list.length, ratio: list.length ? caught / list.length : 0 };
  }

  function totalProgress() {
    const caught = Save.caughtCount();
    return { caught, total: Data.total, ratio: caught / Data.total };
  }

  /** 다음 지역을 열기까지 필요한 마리 수 */
  function unlockNeed(region) {
    return Math.min(Data.UNLOCK_NEED, Data.regionSize(region));
  }

  /**
   * 잡은 뒤 새로 생긴 보상을 모아 돌려준다.
   * (지역 해제 / 배지 / 전체 마일스톤)
   */
  function claimRewards() {
    const events = [];
    const names = Data.regionNames;

    // 지역 해제: 앞 지역에서 목표 수를 채우면 다음 지역이 열린다
    for (let i = 0; i < names.length - 1; i += 1) {
      const cur = names[i];
      const next = names[i + 1];
      if (!Save.isUnlocked(cur)) continue;
      if (regionProgress(cur).caught >= unlockNeed(cur) && Save.unlock(next)) {
        events.push({ type: 'unlock', region: next });
      }
    }

    // 배지: 지역별 20% / 50% / 100%
    // 한 번에 여러 단계를 넘었으면(저장을 옮겼거나 건너뛴 경우) 축하창이
    // 줄줄이 뜨지 않도록 가장 높은 단계만 알린다. 나머지는 조용히 기록.
    names.forEach((region) => {
      const { caught, total } = regionProgress(region);
      let top = null;
      Data.BADGE_TIERS.forEach((tier) => {
        const need = Math.max(1, Math.ceil(total * tier.ratio));
        if (caught >= need && Save.awardBadge(`${region}:${tier.key}`)) {
          top = tier; // BADGE_TIERS는 낮은 단계부터이므로 마지막이 가장 높다
        }
      });
      if (top) events.push({ type: 'badge', region, tier: top });
    });

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
   * 칸 하나가 포켓몬 한 마리. 잡으면 그 포켓몬의 타입 색으로 칠해지므로,
   * 모으는 동안 도감이 타입 색으로 물들어 간다. */
  function renderMosaic() {
    const box = $('#mosaic');
    if (!box) return;
    box.innerHTML = '';
    const frag = document.createDocumentFragment();

    Data.all.forEach((p) => {
      const known = Save.isCaught(p.id);
      const cell = el(known ? 'button' : 'div', `mosaic-cell${known ? ' is-known' : ''}`);
      if (known) {
        cell.style.background = Data.typeColor(p.types[0]);
        cell.dataset.id = String(p.id);
        cell.title = `No.${pad3(p.id)} ${p.name}`;
        cell.setAttribute('aria-label', `No.${pad3(p.id)} ${p.name}`);
      } else {
        // 빈 칸도 지방마다 조금 다른 색으로 두어 구간이 보이게 한다
        const meta = Data.REGION_META[p.region];
        if (meta) cell.style.background = meta.tint;
        cell.setAttribute('aria-hidden', 'true');
      }
      frag.appendChild(cell);
    });
    box.appendChild(frag);

    const t = totalProgress();
    $('#mosaic-caption').textContent =
      `802칸 중 ${t.caught}칸 채움 · ${(t.ratio * 100).toFixed(1)}%`;
  }

  /* ---------- 도감 그리드 ---------- */
  function renderTabs() {
    const tabs = $('#dex-tabs');
    tabs.innerHTML = '';
    Data.regionNames.forEach((region) => {
      const unlocked = Save.isUnlocked(region);
      const { caught, total } = regionProgress(region);
      const btn = el('button', 'tab');
      if (region === activeRegion) btn.classList.add('is-on');
      if (!unlocked) btn.classList.add('is-locked');
      btn.appendChild(el('span', null, region));
      btn.appendChild(el('span', 'tab-count', unlocked ? `${caught}/${total}` : '잠김'));
      btn.onclick = () => {
        activeRegion = region;
        renderDex(region);
      };
      tabs.appendChild(btn);
    });
  }

  function renderDex(region) {
    activeRegion = region || activeRegion || Data.regionNames[0];
    renderTabs();

    const { caught, total, ratio } = regionProgress(activeRegion);
    const t = totalProgress();
    $('#dex-progress').textContent =
      `${activeRegion} ${caught} / ${total} (${Math.round(ratio * 100)}%)   전체 ${t.caught} / ${t.total}`;

    const grid = $('#dex-grid');
    grid.innerHTML = '';
    const frag = document.createDocumentFragment();

    Data.inRegion(activeRegion).forEach((p) => {
      const known = Save.isCaught(p.id);
      // 아직 못 잡은 칸은 실루엣도 보여 주지 않는다 — 퀴즈에서 모습을 가리는 것과
      // 같은 규칙이어야 도감을 뒤져 답을 찾는 일이 없다.
      if (!known) {
        const cell = el('div', 'cell');
        cell.appendChild(el('span', 'cell-q', '?'));
        cell.appendChild(el('span', 'cell-no', `No.${pad3(p.id)}`));
        cell.appendChild(el('span', 'cell-name', '???'));
        frag.appendChild(cell);
        return;
      }
      const cell = el('button', 'cell is-known');
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
    if (p.moves && p.moves.length) {
      const box = el('div', 'row');
      box.appendChild(el('div', 'row-key', '쓸 수 있는 기술'));
      p.moves.forEach((m) => {
        box.appendChild(
          el(
            'div',
            'row-value',
            `${m.name} — ${m.type}${m.power ? `, 위력 ${m.power}` : ''}` +
              `${m.level ? `, 레벨 ${m.level}에 배움` : ''}`,
          ),
        );
      });
      rows.appendChild(box);
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
    addStat(t.caught, '잡은 포켓몬');
    addStat(`${Math.round(t.ratio * 100)}%`, '도감 완성도');
    addStat(stats.bestStreak, '최고 연속 정답');
    addStat(Save.badgeKeys().length, '모은 배지');

    const grid = $('#badge-grid');
    grid.innerHTML = '';
    Data.regionNames.forEach((region) => {
      const { caught, total } = regionProgress(region);
      Data.BADGE_TIERS.forEach((tier) => {
        const has = Save.hasBadge(`${region}:${tier.key}`);
        const need = Math.max(1, Math.ceil(total * tier.ratio));
        const card = el('div', `badge${has ? '' : ' is-off'}`);
        const stamp = el('div', 'stamp', has ? tier.mark : '');
        if (has) stamp.style.setProperty('--stamp', tier.color);
        card.appendChild(stamp);
        card.appendChild(el('div', 'badge-name', `${region} ${tier.label}`));
        card.appendChild(el('div', 'badge-cond', has ? '획득' : `${caught} / ${need}`));
        grid.appendChild(card);
      });
    });
  }

  window.Dex = {
    renderDex,
    renderBadges,
    renderMosaic,
    openDetail,
    regionProgress,
    totalProgress,
    unlockNeed,
    claimRewards,
    get activeRegion() {
      return activeRegion;
    },
    set activeRegion(v) {
      activeRegion = v;
    },
  };
})();
