"""캐릭터 시트(4x5 픽셀아트) 한 장을 트레이너 20명의 투명 배경 이미지로 자른다.

    python tools/crop-trainers.py [시트.png]

배경만 지우려면 '흰색을 다 지우기'로는 안 된다 — 옷·신발·눈의 흰색까지 뚫린다.
그래서 이미지 테두리에서 시작해 연결된 흰 영역만 번지듯 훑어(flood fill) 지운다.
결과: images/trainer/01.webp ~ 20.webp (투명 배경, 높이 256px)
"""
import pathlib
import sys
from collections import deque

import numpy as np
from PIL import Image

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "images" / "trainer"
COLS, ROWS = 5, 4
OUT_H = 256          # 저장 높이 (가로는 비율 유지)
NEAR_WHITE = 236     # 이 값 이상인 RGB는 '배경일 수 있는 흰색'으로 본다
PAD = 6              # 잘라낸 뒤 남길 여백(px)


def find_bands(mask, axis):
    """내용이 있는 구간을 [(시작, 끝), ...] 으로 돌려준다."""
    present = mask.any(axis=axis)
    bands, start = [], None
    for i, v in enumerate(present):
        if v and start is None:
            start = i
        elif not v and start is not None:
            bands.append((start, i))
            start = None
    if start is not None:
        bands.append((start, len(present)))
    return bands


def merge_small(bands, want, span):
    """구간이 want개보다 많으면(팔·모자가 떨어져 잡힌 경우) 가까운 것끼리 합친다."""
    bands = sorted(bands, key=lambda b: b[0])
    while len(bands) > want:
        # 사이 간격이 가장 좁은 두 구간을 합친다
        gaps = [(bands[i + 1][0] - bands[i][1], i) for i in range(len(bands) - 1)]
        _, i = min(gaps)
        bands[i] = (bands[i][0], bands[i + 1][1])
        del bands[i + 1]
    return bands


def background_mask(rgb):
    """테두리에서 연결된 흰 영역만 True (= 배경)."""
    h, w, _ = rgb.shape
    whiteish = (rgb >= NEAR_WHITE).all(axis=2)
    bg = np.zeros((h, w), dtype=bool)
    q = deque()

    def push(y, x):
        if 0 <= y < h and 0 <= x < w and whiteish[y, x] and not bg[y, x]:
            bg[y, x] = True
            q.append((y, x))

    for x in range(w):
        push(0, x)
        push(h - 1, x)
    for y in range(h):
        push(y, 0)
        push(y, w - 1)

    while q:
        y, x = q.popleft()
        push(y - 1, x)
        push(y + 1, x)
        push(y, x - 1)
        push(y, x + 1)
    return bg


def main():
    if len(sys.argv) > 1:
        sheet_path = pathlib.Path(sys.argv[1])
    else:
        cands = sorted(ROOT.glob("Gemini_Generated_Image*.png"))
        if not cands:
            print("캐릭터 시트를 찾지 못했습니다. 파일 경로를 인자로 주세요.")
            return 1
        sheet_path = cands[0]

    img = Image.open(sheet_path).convert("RGB")
    rgb = np.asarray(img)
    print(f"시트: {sheet_path.name}  {img.width} x {img.height}")

    # 1) 배경(테두리와 연결된 흰색)을 찾아 알파를 만든다
    bg = background_mask(rgb)
    print(f"배경으로 판정된 픽셀: {bg.mean() * 100:.1f}%")
    content = ~bg

    # 2) 내용 구간으로 4x5 격자를 찾는다
    col_bands = merge_small(find_bands(content, axis=0), COLS, img.width)
    row_bands = merge_small(find_bands(content, axis=1), ROWS, img.height)
    print(f"열 {len(col_bands)}개: {col_bands}")
    print(f"행 {len(row_bands)}개: {row_bands}")
    if len(col_bands) != COLS or len(row_bands) != ROWS:
        print(f"격자를 {COLS}x{ROWS}로 잡지 못했습니다.")
        return 1

    rgba = np.dstack([rgb, np.where(bg, 0, 255).astype(np.uint8)])
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for f in OUT_DIR.glob("*.webp"):
        f.unlink()

    n = 0
    sizes = []
    for r, (y0, y1) in enumerate(row_bands):
        for c, (x0, x1) in enumerate(col_bands):
            cell = content[y0:y1, x0:x1]
            if not cell.any():
                continue
            # 칸 안에서 실제 내용만 꼭 맞게 다시 자른다
            ys = np.where(cell.any(axis=1))[0]
            xs = np.where(cell.any(axis=0))[0]
            top, bot = y0 + ys[0], y0 + ys[-1] + 1
            left, right = x0 + xs[0], x0 + xs[-1] + 1
            top = max(0, top - PAD)
            left = max(0, left - PAD)
            bot = min(img.height, bot + PAD)
            right = min(img.width, right + PAD)

            piece = Image.fromarray(rgba[top:bot, left:right], "RGBA")
            scale = OUT_H / piece.height
            # 픽셀아트라서 NEAREST로 줄여 또렷함을 유지한다
            piece = piece.resize(
                (max(1, round(piece.width * scale)), OUT_H), Image.NEAREST)
            n += 1
            piece.save(OUT_DIR / f"{n:02d}.webp", "WEBP", quality=92, method=5)
            sizes.append((n, piece.width, piece.height))

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.webp"))
    print(f"\n저장: {n}명 → {OUT_DIR.relative_to(ROOT)}  합계 {total / 1024:.0f} KB")
    print("크기: " + ", ".join(f"{i}:{w}x{h}" for i, w, h in sizes[:5]) + " ...")
    return 0


if __name__ == "__main__":
    sys.exit(main())
