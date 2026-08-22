/* 포획 연출 — 정답을 맞히고 이름을 쓴 뒤 도감에 등록되는 구간.
 *
 * 단서 퀴즈와 '책이랑 찾기'가 같은 흐름을 쓰도록 따로 떼어 놓았다.
 *
 *   보통          몬스터볼 던지기 → 등록 카드
 *   진화          이전 모습 → 섬광 → 새 모습 → 등록 카드
 *   전설·환상     금색 등록 카드 + 전용 팡파레
 *
 * 그 뒤에 보상 축하창(배지 · 진화 라인 완성 · 마일스톤)을 하나씩 이어 보여 준다.
 */
(function () {
  'use strict';

  const { el, josa, Sound } = window.U;
  const Data = window.Data;
  const Dex = window.Dex;

  const pad3 = (n) => String(n).padStart(3, '0');

  /**
   * @param {object} p         방금 잡은 포켓몬
   * @param {Array}  rewards   Dex.claimRewards(p) 결과
   * @param {object} opts
   *   evolvedFrom: 이전 단계 포켓몬(이미 잡고 있었다면) — 있으면 진화 연출
   *   onDone:      연출과 보상을 다 보고 '다음'을 눌렀을 때
   *   onStop:      '그만하기'를 눌렀을 때
   *   nextLabel:   '다음' 버튼 문구 (기본 '다음 포켓몬')
   */
  function play(p, rewards, opts) {
    const o = opts || {};
    if (o.evolvedFrom) evolveScene(p, rewards, o);
    else throwBall(p, rewards, o);
  }

  /* ---------- 몬스터볼 던지기 ---------- */
  function throwBall(p, rewards, o) {
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

    setTimeout(() => showRecord(p, rewards, o), 1750);
  }

  /* ---------- 진화 연출 ----------
   * 이전 모습을 먼저 보여주고, 흰 섬광으로 덮은 뒤 새 모습으로 바꾼다.
   * 이미지를 갈아 끼우는 방식이라 두 장을 겹쳐 두고 투명도만 바꾼다. */
  function evolveScene(p, rewards, o) {
    const before = o.evolvedFrom;
    const sheet = el('div');
    sheet.appendChild(el('p', 'sheet-eyebrow', '어라…?'));
    const title = el('h2', 'sheet-title', `${josa.i(before.name)} 모습이…!`);
    sheet.appendChild(title);

    const stage = el('div', 'evolve');
    const oldArt = el('img', 'evolve-art');
    oldArt.src = before.img;
    oldArt.alt = before.name;
    const newArt = el('img', 'evolve-art is-after');
    newArt.src = p.img;
    newArt.alt = p.name;
    const flash = el('div', 'evolve-flash');
    stage.appendChild(oldArt);
    stage.appendChild(newArt);
    stage.appendChild(flash);
    sheet.appendChild(stage);

    const caption = el('p', 'sheet-text', ' ');
    sheet.appendChild(caption);

    window.App.openOverlay(sheet, { sticky: true });
    Sound.evolveStart();

    // 섬광이 가장 밝을 때 그림을 바꾼다
    setTimeout(() => {
      stage.classList.add('is-flashing');
    }, 420);
    setTimeout(() => {
      stage.classList.add('is-evolved');
    }, 1150);
    setTimeout(() => {
      Sound.evolveDone();
      title.textContent = `${josa.ro(p.name)} 진화했다!`;
      caption.textContent = `${before.name} → ${p.name}`;
    }, 1500);

    setTimeout(() => showRecord(p, rewards, o), 2600);
  }

  /* ---------- 등록 카드 ---------- */
  function showRecord(p, rewards, o) {
    const t = Dex.totalProgress();
    const special = Data.isSpecial(p);

    const sheet = el('div');
    sheet.appendChild(
      el('p', 'sheet-eyebrow', special
        ? (p.mythical ? '환상의 포켓몬' : '전설의 포켓몬')
        : '도감에 등록'),
    );
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
      chip.style.color = Data.typeTextColor(tp);
      chips.appendChild(chip);
    });
    sheet.appendChild(chips);

    if (special) {
      sheet.appendChild(
        el('p', 'sheet-text', p.mythical
          ? '환상의 포켓몬을 잡았다!\n아주 만나기 어려운 포켓몬이야.'
          : '전설의 포켓몬을 잡았다!\n아주 귀한 포켓몬이야.'),
      );
    }

    sheet.appendChild(
      el('p', 'sheet-data', `No. ${pad3(p.id)} · 내 도감 ${t.caught} / ${t.total}`),
    );

    const buttons = el('div', 'sheet-buttons');
    const next = el('button', 'btn btn--go', o.nextLabel || '다음 포켓몬');
    next.onclick = () => {
      window.App.closeOverlay();
      afterRewards(rewards, o.onDone || (() => {}));
    };
    const detail = el('button', 'btn', '자세히 보기');
    detail.onclick = () => Dex.openDetail(p.id);
    const stop = el('button', 'btn', '그만하기');
    stop.onclick = () => {
      window.App.closeOverlay();
      afterRewards(rewards, o.onStop || (() => window.App.goHome()));
    };
    buttons.appendChild(next);
    buttons.appendChild(detail);
    buttons.appendChild(stop);
    sheet.appendChild(buttons);

    // 앞의 연출 창을 이 카드로 갈아 끼운다(밑에 남겨 두면 닫을 때 되살아난다)
    window.App.replaceOverlay(sheet, { sticky: true, variant: special ? 'gold' : null });
    if (special) Sound.legendary();
    else Sound.caught();
  }

  /* ---------- 보상 축하창을 하나씩 ---------- */
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
          el('p', 'sheet-text', ev.tier.ratio >= 1
            ? `${ev.group} 타입을 전부 모았어!`
            : `${ev.group} 타입의 ${Math.round(ev.tier.ratio * 100)}%를 모았어.`),
        );
      } else if (ev.type === 'line') {
        Sound.fanfare();
        sheet.appendChild(el('p', 'sheet-eyebrow', '진화 라인 완성'));
        sheet.appendChild(el('h2', 'sheet-title', '가족을 다 모았다!'));
        sheet.appendChild(lineFamily(ev.ids));
        sheet.appendChild(
          el('p', 'sheet-text', `${ev.ids.length}마리가 모두 도감에 들어왔어.`),
        );
      } else if (ev.type === 'rank') {
        Sound.fanfare();
        const stamp = el('div', 'stamp', String(ev.info.step));
        stamp.style.setProperty('--stamp', ev.rank.color);
        sheet.appendChild(stamp);
        sheet.appendChild(el('p', 'sheet-eyebrow', '트레이너 승급'));
        sheet.appendChild(el('h2', 'sheet-title', ev.rank.name));
        sheet.appendChild(
          el('p', 'sheet-text', ev.info.next
            ? `${ev.rank.at}마리를 모아서 자랐어!\n`
              + `다음은 ${ev.info.next.name}, ${ev.info.need}마리 더!`
            : '802마리를 모두 모았어.\n너는 전설의 트레이너야!'),
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

  /** 진화 라인 전원이 나란히 선 가족사진 */
  function lineFamily(ids) {
    const box = el('div', 'family');
    ids.forEach((id, i) => {
      const target = Data.get(id);
      if (!target) return;
      if (i > 0) box.appendChild(el('span', 'family-arrow', '▸'));
      const node = el('div', 'family-node');
      const img = el('img');
      img.src = target.img;
      img.alt = target.name;
      node.appendChild(img);
      node.appendChild(el('div', null, target.name));
      box.appendChild(node);
    });
    return box;
  }

  window.Catch = { play, afterRewards };
})();
