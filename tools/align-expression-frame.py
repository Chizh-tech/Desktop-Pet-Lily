"""把生成的角色图对齐到参考帧尺寸，用于做「同一角色的另一帧」（闭眼、表情变体）。

为什么要对齐：生成模型给不出像素级一致的构图。直接整套换图，眨眼/换表情时会
出现整体缩放跳动。这里按三个基准（头部最宽行的宽度、头部最宽行的 y、脚底 y）
把新图缩放到参考帧的坐标系里，再做短促切帧时就看不出位移。

用法：
    python tools/align-expression-frame.py 生成的图.png [--reference idle.png] [--out 输出.png]

默认参考帧是内置的 src/assets/default-pet/assets/idle.png。
"""

import argparse
import os

import numpy as np
from PIL import Image


def cut_background(path):
    """抠掉生成图里的棋盘格/纯色背景，顺便丢掉角落水印。

    生成图的"透明"通常是画进去的棋盘格，alpha 全 255。做法：从四边泛洪
    接近中性的浅色像素得到背景，取反后用最大前景连通块排除水印。
    """
    rgb = np.array(Image.open(path).convert("RGB"))
    h, w, _ = rgb.shape
    a = rgb.astype(np.int16)
    candidate = (a.min(axis=2) >= 214) & ((a.max(axis=2) - a.min(axis=2)) <= 34)

    def flood(passable, seeds):
        reach = seeds & passable
        for _ in range(6000):
            nxt = reach.copy()
            nxt[1:, :] |= reach[:-1, :]
            nxt[:-1, :] |= reach[1:, :]
            nxt[:, 1:] |= reach[:, :-1]
            nxt[:, :-1] |= reach[:, 1:]
            nxt &= passable
            if np.array_equal(nxt, reach):
                break
            reach = nxt
        return reach

    border = np.zeros((h, w), bool)
    border[0, :] = border[-1, :] = True
    border[:, 0] = border[:, -1] = True
    background = flood(candidate, border)
    foreground = ~background

    ys, xs = np.nonzero(foreground)
    if len(ys) == 0:
        raise SystemExit(f"没有找到前景，检查输入图：{path}")
    seed_index = np.argmin((ys - h // 2) ** 2 + (xs - w // 2) ** 2)
    seed = np.zeros((h, w), bool)
    seed[ys[seed_index], xs[seed_index]] = True
    keep = flood(foreground, seed)

    ys, xs = np.nonzero(keep)
    alpha = np.where(keep, 255, 0).astype(np.uint8)
    rgba = np.dstack([rgb, alpha])
    return Image.fromarray(rgba, "RGBA").crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))


def measure(image):
    """量出对齐用的三个基准。"""
    alpha = np.array(image)[..., 3] > 16
    rows = alpha.sum(axis=1)
    height = alpha.shape[0]
    head_band = rows[: int(height * 0.45)]
    head_row = int(np.argmax(head_band))
    return {
        "head_width": int(head_band.max()),
        "head_row": head_row,
        "foot_row": int(np.nonzero(rows)[0].max())
    }


def align(subject, reference):
    """先把新图缩到参考帧高度，再量基准、做微调。

    必须分两步：直接在大图上量「头部最宽行」，45% 的取景范围会落进出界完全不同的
    位置（可能量到肩膀），缩放系数就废了。先统一高度，两边的度量才可比。
    """
    normalized = subject.resize(
        (round(subject.width * reference.height / subject.height), reference.height),
        Image.LANCZOS,
    )

    ref_metrics = measure(reference)
    sub_metrics = measure(normalized)

    scale_x = ref_metrics["head_width"] / sub_metrics["head_width"]
    scale_y = ((ref_metrics["foot_row"] - ref_metrics["head_row"])
               / (sub_metrics["foot_row"] - sub_metrics["head_row"]))

    resized = normalized.resize(
        (round(normalized.width * scale_x), round(normalized.height * scale_y)),
        Image.LANCZOS,
    )
    offset_y = ref_metrics["head_row"] - round(sub_metrics["head_row"] * scale_y)
    offset_x = round((reference.width - resized.width) / 2)

    canvas = Image.new("RGBA", reference.size, (0, 0, 0, 0))
    canvas.alpha_composite(resized, (offset_x, offset_y))
    return canvas, {
        "normalized": normalized.size,
        "scale_x": scale_x,
        "scale_y": scale_y,
        "offset": (offset_x, offset_y),
        "reference": ref_metrics,
        "subject": sub_metrics,
    }


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("input", help="生成出来的角色图")
    parser.add_argument(
        "--reference",
        default="src/assets/default-pet/assets/idle.png",
        help="要对齐到的参考帧",
    )
    parser.add_argument("--out", default="", help="输出路径，默认在当前目录")
    args = parser.parse_args()

    reference = Image.open(args.reference).convert("RGBA")
    subject = cut_background(args.input)
    aligned, info = align(subject, reference)

    out = args.out or os.path.join(
        os.path.dirname(os.path.abspath(__file__)),
        os.path.basename(args.input).rsplit(".", 1)[0] + "-aligned.png",
    )
    aligned.save(out, optimize=True)
    print(f"wrote {out} ({aligned.width}x{aligned.height})")
    print(
        "  scale x={scale_x:.4f} y={scale_y:.4f} offset={offset}".format(**info)
    )
    print(
        "  reference head_w={head_width} head_row={head_row} foot_row={foot_row}".format(
            **info["reference"]
        )
    )


if __name__ == "__main__":
    main()
