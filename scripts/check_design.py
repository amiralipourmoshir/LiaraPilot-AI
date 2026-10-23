"""Verify shipped brand assets and semantic text contrast without opening a browser."""
from pathlib import Path
import hashlib
import json
import re
import struct

ROOT = Path(__file__).resolve().parents[1]
css = (ROOT / 'apps/web/src/workspace.css').read_text()
manifest = json.loads((ROOT / 'docs/design/assets.json').read_text())
for asset in manifest['assets']:
    assert hashlib.sha256((ROOT / asset['path']).read_bytes()).hexdigest() == asset['sha256']
png = (ROOT / 'apps/web/public/brand/pilot-mascot.png').read_bytes()
assert png[:8] == b'\x89PNG\r\n\x1a\n'
assert struct.unpack('>II', png[16:24]) == (1254, 1254)
assert png[25] == 6  # RGBA container; alpha range was separately inspected at generation time.

def luminance(color):
    color = color.lstrip('#')
    if len(color) == 3:
        color = ''.join(char * 2 for char in color)
    channels = [int(color[i:i+2], 16) / 255 for i in (0, 2, 4)]
    linear = [value / 12.92 if value <= .04045 else ((value + .055) / 1.055) ** 2.4 for value in channels]
    return sum(value * weight for value, weight in zip(linear, (.2126, .7152, .0722)))

results = []
for theme in ('dark', 'light'):
    match = re.search(r"\[data-theme=['\"]?" + theme + r"['\"]?\]\s*\{([^}]+)\}", css)
    assert match, theme
    tokens = dict(re.findall(r'--([\w-]+):\s*(#[0-9a-fA-F]{3,8})\s*;', match[1]))
    pairs = [('text', 'panel'), ('muted', 'panel'), ('subtle', 'bg'), ('accent', 'panel'), ('#fff', 'accent-strong')]
    for foreground, background in pairs:
        fg = foreground if foreground.startswith('#') else tokens[foreground]
        bg = tokens[background]
        low, high = sorted([luminance(fg), luminance(bg)])
        ratio = (high + .05) / (low + .05)
        assert ratio >= 4.5, (theme, foreground, background, ratio)
        results.append({'theme': theme, 'foreground': foreground, 'background': background, 'ratio': round(ratio, 2), 'passesNormalTextAA': True})
        print(f'{theme}: {foreground}/{background} = {ratio:.2f}:1')
(ROOT / 'docs/design/contrast.json').write_text(json.dumps(results, indent=2) + '\n')
print('Verified asset hashes, PNG dimensions/RGBA format and 10 text contrast pairs. This is not visual or full accessibility QA.')
