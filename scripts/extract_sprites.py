#!/usr/bin/env python3
"""
Extract sprites from UNA mascot sprite sheet using connected component analysis.
Filters to keep only large sprite characters (mascot poses).
"""

import os
import sys
import numpy as np
from PIL import Image
from scipy import ndimage

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
INPUT_FILE = os.path.join(PROJECT_ROOT, "sprite_sheet.png")
OUTPUT_DIR = os.path.join(PROJECT_ROOT, "assets", "sprites")

BG_COLOR = np.array([13, 13, 20])
BG_THRESHOLD = 25
MIN_SPRITE_W = 80   # минимальная ширина спрайта персонажа
MIN_SPRITE_H = 80   # минимальная высота
MAX_SPRITE_W = 600  # максимальная ширина
MAX_SPRITE_H = 600  # максимальная высота
MIN_PIXELS = 3000   # минимальное количество непустых пикселей


def main():
    os.makedirs(OUTPUT_DIR, exist_ok=True)

    if not os.path.exists(INPUT_FILE):
        print(f"ERROR: File not found: {INPUT_FILE}")
        sys.exit(1)

    img = Image.open(INPUT_FILE)
    print(f"Image: {img.width}x{img.height}, Mode: {img.mode}")

    data = np.array(img.convert('RGB'))
    h, w = data.shape[:2]

    # Mask: True where pixel is NOT background
    diff = np.abs(data.astype(int) - BG_COLOR).sum(axis=2)
    mask = diff > BG_THRESHOLD

    # Connected component labeling (8-connectivity)
    structure = np.ones((3, 3), dtype=int)
    labeled, num_features = ndimage.label(mask, structure=structure)

    print(f"Found {num_features} connected components")

    slices = ndimage.find_objects(labeled)

    sprites = []
    for i, sl in enumerate(slices):
        if sl is None:
            continue
        y1, y2 = sl[0].start, sl[0].stop
        x1, x2 = sl[1].start, sl[1].stop
        sprite_w = x2 - x1
        sprite_h = y2 - y1

        # Size filter: only keep mascot-sized sprites
        if sprite_w < MIN_SPRITE_W or sprite_h < MIN_SPRITE_H:
            continue
        if sprite_w > MAX_SPRITE_W or sprite_h > MAX_SPRITE_H:
            continue

        component_mask = (labeled == (i + 1))
        pixel_count = component_mask.sum()

        if pixel_count < MIN_PIXELS:
            continue

        sprites.append({
            'x1': x1, 'y1': y1, 'x2': x2, 'y2': y2,
            'width': sprite_w, 'height': sprite_h,
            'pixels': pixel_count,
        })

    # Sort by position: top-to-bottom, left-to-right
    sprites.sort(key=lambda s: (s['y1'], s['x1']))

    print(f"\nValid mascot sprites ({len(sprites)}):")
    for idx, s in enumerate(sprites):
        print(f"  {idx:02d}: ({s['x1']:4d},{s['y1']:4d})-({s['x2']:4d},{s['y2']:4d}) "
              f"{s['width']:3d}x{s['height']:3d} px={s['pixels']:6d}")

    # Save each sprite with padding for consistent size
    for idx, s in enumerate(sprites):
        sprite_img = img.crop((s['x1'], s['y1'], s['x2'], s['y2']))
        output_path = os.path.join(OUTPUT_DIR, f"una_{idx:02d}.png")
        sprite_img.save(output_path, "PNG")
        print(f"  Saved: una_{idx:02d}.png ({s['width']}x{s['height']})")

    print(f"\nDone! Extracted {len(sprites)} sprites to {OUTPUT_DIR}")


if __name__ == "__main__":
    main()
