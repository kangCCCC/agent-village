"""초록 배경(크로마키) 시트를 투명 PNG 조각으로 자른다.

사용:  .venv/bin/python cut.py <이름> <행 수> <칸 이름들(쉼표)> [원본 png] [내보낼 폴더]
  예:  .venv/bin/python cut.py mychar 2 portrait,idle,work,walkA,walkB,raise
결과:  ../web/art/<이름>/<칸 이름>.png  +  ../web/art/<이름>/sheet.json (각 조각 크기)
순서:  위 줄 왼→오, 아래 줄 왼→오 (그림 설명에서 지정한 순서)
"""
import json, os, sys
import numpy as np
from PIL import Image
from scipy import ndimage

HERE = os.path.dirname(os.path.abspath(__file__))


def key_out(im):
    a = np.asarray(im.convert("RGB")).astype(np.float32)
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    # 초록이 빨강·파랑보다 얼마나 센가 → 셀수록 배경
    greenness = g - np.maximum(r, b)
    alpha = np.clip(1.0 - (greenness - 40) / 80.0, 0, 1)      # 40 이하 = 물체, 120 이상 = 배경
    # 가장자리 초록 번짐 걷어 내기 (despill)
    spill = np.clip(g - np.maximum(r, b), 0, None)
    g2 = g - spill * (1 - alpha) - np.clip(g - (r + b) / 2 - 10, 0, None) * 0.6 * (alpha < 1)
    out = np.dstack([r, np.clip(g2, 0, 255), b, alpha * 255]).astype(np.uint8)
    return Image.fromarray(out, "RGBA"), alpha


def main(name, rows, labels, src=None, outd=None):
    src = src or os.path.join(HERE, "raw", name, "out.png")
    im = Image.open(src)
    rgba, alpha = key_out(im)
    mask = alpha > 0.5
    # 손에 든 소품·반짝이처럼 떨어진 작은 조각을 몸에 붙이려고 살짝 부풀려 묶는다
    grown = ndimage.binary_dilation(mask, iterations=max(6, im.width // 120))
    lab, n = ndimage.label(grown)
    objs = ndimage.find_objects(lab)
    comps = []
    for i, sl in enumerate(objs, 1):
        area = int((lab[sl] == i).sum())
        if area < im.width * im.height * 0.004:
            continue
        ys, xs = sl
        comps.append({"x0": xs.start, "x1": xs.stop, "y0": ys.start, "y1": ys.stop, "area": area})
    comps.sort(key=lambda c: -c["area"])
    comps = comps[:len(labels)]
    if len(comps) != len(labels):
        print(f"경고: 조각 {len(comps)}개 (기대 {len(labels)}개)")
    # 줄 나누기: 세로 중심으로 정렬 → 가장 큰 틈에서 자른다
    comps.sort(key=lambda c: (c["y0"] + c["y1"]) / 2)
    if rows > 1 and len(comps) > 1:
        cys = [(c["y0"] + c["y1"]) / 2 for c in comps]
        gaps = sorted(range(1, len(cys)), key=lambda k: cys[k] - cys[k - 1], reverse=True)[:rows - 1]
        cuts = sorted(gaps)
        groups, last = [], 0
        for k in cuts + [len(comps)]:
            groups.append(sorted(comps[last:k], key=lambda c: c["x0"]))
            last = k
        comps = [c for g in groups for c in g]
    outd = outd or os.path.join(HERE, "..", "web", "art", name)
    os.makedirs(outd, exist_ok=True)
    meta = {}
    for lbl, c in zip(labels, comps):
        pad = 4
        box = (max(0, c["x0"] - pad), max(0, c["y0"] - pad), min(im.width, c["x1"] + pad), min(im.height, c["y1"] + pad))
        piece = rgba.crop(box)
        # 실제 그림이 있는 곳으로 다시 딱 맞게 자르기
        bb = piece.getchannel("A").point(lambda v: 255 if v > 20 else 0).getbbox()
        if bb:
            piece = piece.crop(bb)
        piece.save(os.path.join(outd, lbl + ".png"))
        meta[lbl] = {"w": piece.width, "h": piece.height}
    with open(os.path.join(outd, "sheet.json"), "w") as f:
        json.dump(meta, f)
    print(name, "→", ", ".join(f"{k} {v['w']}x{v['h']}" for k, v in meta.items()))


if __name__ == "__main__":
    main(sys.argv[1], int(sys.argv[2]), sys.argv[3].split(","),
         sys.argv[4] if len(sys.argv) > 4 else None, sys.argv[5] if len(sys.argv) > 5 else None)
