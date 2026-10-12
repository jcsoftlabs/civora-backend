#!/usr/bin/env bash
# Captures de l'application membre pour le site commercial (SOC-12), en français et en créole, sur l'émulateur
# Android, à partir du jeu de démonstration local (`pnpm db:demo`, puis l'API en marche).
# Usage : apps/mobile/scripts/screenshots.sh   (un émulateur démarré, 1344 × 2992 : Pixel 8 Pro)
# Sortie : apps/web/static/marketing/<langue>/app-<écran>.jpg, barres du système retirées.
set -euo pipefail
cd "$(dirname "$0")/.."
ROOT=$(cd ../.. && pwd)
ADB=${ADB:-$HOME/Library/Android/sdk/platform-tools/adb}
OUT=$ROOT/apps/web/static/marketing
TMP=$(mktemp -d)
TOKEN=$(python3 -c "import json;print(json.load(open('$ROOT/.demo-session.json'))['memberToken'])")

flutter build apk --debug --dart-define=DEMO_SESSION=horizon:$TOKEN >/dev/null
$ADB install -r build/app/outputs/flutter-apk/app-debug.apk >/dev/null
$ADB shell pm clear app.civora.civora >/dev/null

shot() { $ADB exec-out screencap -p > "$TMP/$1.png"; }
tap() { $ADB shell input tap "$1" "$2"; sleep "${3:-3}"; }
# Touche l'élément dont le texte est donné, retrouvé dans l'arbre d'interface (Moi défilé jusqu'aux réglages).
tap_text() {
  for _ in 1 2 3 4 5 6; do $ADB shell input swipe 670 2300 670 900 250; sleep 1; done
  $ADB shell uiautomator dump /sdcard/ui.xml >/dev/null
  local xy
  xy=$($ADB exec-out cat /sdcard/ui.xml | python3 -c "
import re, sys
x = sys.stdin.read()
m = re.search(r'(?:text|content-desc)=\"$1[^\"]*\"[^>]*bounds=\"\\[(\\d+),(\\d+)\\]\\[(\\d+),(\\d+)\\]', x)
print((int(m[1]) + int(m[3])) // 2, (int(m[2]) + int(m[4])) // 2)")
  tap $xy 3
}

capture() {
  local lang=$1
  $ADB shell am force-stop app.civora.civora
  $ADB shell am start -n app.civora.civora/.MainActivity >/dev/null
  sleep 30 # premier lancement de l'émulateur : moteur, polices, données
  if [ "$lang" = "ht" ]; then
    tap 1175 2840 3 # Moi
    tap_text Kreyòl
    tap 171 2840 5  # Accueil
  fi
  shot "$lang-wallet"
  tap 429 2840 5; shot "$lang-news"
  tap 916 2840 5; shot "$lang-act"
  tap 1175 2840 3
  for _ in 1 2 3 4 5 6; do $ADB shell input swipe 670 900 670 2300 200; done # Moi garde sa position : retour en haut
  sleep 2; shot "$lang-me"
  tap 673 2745 5; shot "$lang-card"
  $ADB shell input keyevent 4; sleep 1
}
capture fr
capture ht
# Retour au français pour la suite.
tap 1175 2840 3
tap_text Français

python3 - "$TMP" "$OUT" <<'PY'
import sys
from PIL import Image
tmp, out = sys.argv[1], sys.argv[2]
for lang in ("fr", "ht"):
    for name in ("wallet", "news", "act", "me", "card"):
        im = Image.open(f"{tmp}/{lang}-{name}.png").convert("RGB")
        w, h = im.size
        # Barre d'état (150 px) et barre de gestes (78 px) retirées : pas de fausse barre système sur le site.
        im = im.crop((0, 150, w, h - 78)).resize((672, int((h - 228) * 672 / w)), Image.LANCZOS)
        im.save(f"{out}/{lang}/app-{name}.jpg", quality=84, optimize=True)
        print(f"{lang}/app-{name}.jpg")
PY
rm -rf "$TMP"
