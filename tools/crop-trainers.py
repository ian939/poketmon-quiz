"""캐릭터 시트(4x5 픽셀아트) 한 장을 트레이너 20명의 투명 배경 이미지로 자른다.

    python tools/crop-trainers.py [시트.png]

배경만 지우려면 '흰색을 다 지우기'로는 안 된다 — 옷·신발·눈의 흰색까지 뚫린다.
그래서 이미지 테두리에서 시작해 연결된 흰 영역만 번지듯 훑어(flood fill) 지운다.

20명을 **같은 배율**로 줄여 **같은 크기 캔버스**에 담고, 바닥(발끝)을 맞춰 놓는다.
가장 큰 캐릭터가 OUT_H 에 꽉 차고 나머지는 그만큼 작게 보인다 —
캐릭터마다 따로 늘리면 키 비율이 뒤죽박죽이 되고, 고르는 화면의 칸 높이도 어긋난다.
결과: images/trainer/01.webp ~ 20.webp (모두 같은 크기, 투명 배경)
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

    # 1차: 칸마다 내용이 꼭 맞는 범위를 구한다 (아직 자르지 않는다)
    boxes = []
    for (y0, y1) in row_bands:
        for (x0, x1) in col_bands:
            cell = content[y0:y1, x0:x1]
            if not cell.any():
                continue
            ys = np.where(cell.any(axis=1))[0]
            xs = np.where(cell.any(axis=0))[0]
            boxes.append((y0 + ys[0], y0 + ys[-1] + 1, x0 + xs[0], x0 + xs[-1] + 1))

    if not boxes:
        print("잘라낼 캐릭터를 찾지 못했습니다.")
        return 1

    # 2차: 가장 큰 캐릭터를 기준으로 공통 배율과 공통 캔버스 크기를 정한다
    max_h = max(b[1] - b[0] for b in boxes)
    max_w = max(b[3] - b[2] for b in boxes)
    scale = OUT_H / max_h
    canvas_w = max(1, round(max_w * scale)) + PAD * 2
    canvas_h = OUT_H + PAD
    print(f"기준: 가장 큰 캐릭터 {max_w}x{max_h}px → 배율 {scale:.3f}, 캔버스 {canvas_w}x{canvas_h}")

    n = 0
    heights = []
    for (top, bot, left, right) in boxes:
        piece = Image.fromarray(rgba[top:bot, left:right], "RGBA")
        w = max(1, round(piece.width * scale))
        h = max(1, round(piece.height * scale))
        # 픽셀아트라서 NEAREST로 줄여 또렷함을 유지한다
        piece = piece.resize((w, h), Image.NEAREST)

        # 같은 크기 캔버스에 가로 가운데·바닥 맞춰 붙인다 (발끝이 한 줄에 놓인다)
        out = Image.new("RGBA", (canvas_w, canvas_h), (0, 0, 0, 0))
        out.alpha_composite(piece, ((canvas_w - w) // 2, canvas_h - PAD - h))

        n += 1
        out.save(OUT_DIR / f"{n:02d}.webp", "WEBP", quality=92, method=5)
        heights.append(h)

    total = sum(f.stat().st_size for f in OUT_DIR.glob("*.webp"))
    print(f"\n저장: {n}명 → {OUT_DIR.relative_to(ROOT)}  합계 {total / 1024:.0f} KB")
    print(f"모두 {canvas_w}x{canvas_h}px 동일 · 캐릭터 키 {min(heights)}~{max(heights)}px (바닥 정렬)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
