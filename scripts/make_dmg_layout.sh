#!/usr/bin/env bash
# The disk image's window, as Finder shows it when it opens: big icons (128 points, so the
# icon is seen), the app on the left and Applications on the right, no toolbar or sidebar.
# Finder reads it from the image's .DS_Store, which this writes once, to
# packaging/dmg/DS_Store (checked in; scripts/build_mac_app.sh copies it in), with the
# ds_store library (pinned, checked) in a throwaway virtualenv. Run it again only to change it.
set -euo pipefail
cd "$(dirname "$0")/.."

VENV=$(mktemp -d)
trap 'rm -rf "$VENV"' EXIT
python3 -m venv "$VENV"
cat >"$VENV/requirements.txt" <<'REQ'
ds_store==1.3.3 --hash=sha256:b92a371efbf1b4ccce2a04d1ed13fceacc4736c81ba09cf5aefb74c088160a35
mac_alias==2.2.3 --hash=sha256:7362b521d2132ef92f606a37abfed5fcd849ceb2f28b6f9743e014b02af92f0d
REQ
PIP_DISABLE_PIP_VERSION_CHECK=1 "$VENV/bin/pip" install -q --only-binary :all: --require-hashes -r "$VENV/requirements.txt"

mkdir -p packaging/dmg
"$VENV/bin/python" -I - packaging/dmg/DS_Store <<'PY'
import sys
from ds_store import DSStore

W, H = 560, 380        # the window's inside, in points
ICON = 128
with DSStore.open(sys.argv[1], 'w+') as d:
    d['.']['bwsp'] = {
        'WindowBounds': '{{200, 140}, {%d, %d}}' % (W, H),
        'ShowToolbar': False, 'ShowSidebar': False, 'ContainerShowSidebar': False,
        'ShowStatusBar': False, 'ShowPathbar': False, 'ShowTabView': False, 'PreviewPaneVisibility': False,
    }
    d['.']['icvp'] = {
        'viewOptionsVersion': 1, 'iconSize': float(ICON), 'textSize': 13.0, 'gridSpacing': 100.0,
        'gridOffsetX': 0.0, 'gridOffsetY': 0.0, 'labelOnBottom': True, 'showItemInfo': False,
        'showIconPreview': True, 'arrangeBy': 'none', 'backgroundType': 0,
        'backgroundColorRed': 1.0, 'backgroundColorGreen': 1.0, 'backgroundColorBlue': 1.0,
    }
    d['.']['vSrn'] = ('long', 1)
    d['.']['icvl'] = ('type', b'icnv')   # icon view
    d['Mouse Party.app']['Iloc'] = (W // 4 + 10, H // 2 - 10)
    d['Applications']['Iloc'] = (W * 3 // 4 - 10, H // 2 - 10)
PY
echo "Wrote packaging/dmg/DS_Store"
