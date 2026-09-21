#!/usr/bin/env bash
# Verify the Jarvis (The Lounge) web page. Read-only: nothing is sent, nothing is spent.
#   ./test/run.sh           every mode at every viewport (Chromium)
#   ./test/run.sh webkit    the lock and chat layout in real WebKit via ../webkit-check
# The harness is REGENERATED from index.html on every run; test/build is disposable.
set -u
cd "$(dirname "$0")/.."
# One suite at a time. Three overlapping runs on 2026-09-17 took this Mac to load average 199 and every headless
# run crawled; an earlier round killed the shell outright (exit 137). A second run now says so and stops.
LOCK="$PWD/test/build/.running"
mkdir -p "$PWD/test/build"
if [ -f "$LOCK" ] && kill -0 "$(cat "$LOCK" 2>/dev/null)" 2>/dev/null; then
  echo "A suite is already running (pid $(cat "$LOCK")). Wait for it, or: kill $(cat "$LOCK")"
  exit 2
fi
echo $$ > "$LOCK"
trap 'rm -f "$LOCK"' EXIT INT TERM
B="$PWD/test/build"; INJ="$PWD/test/inject"; mkdir -p "$B"
CHR="$HOME/Library/Caches/ms-playwright/chromium_headless_shell-1217/chrome-headless-shell-mac-x64/chrome-headless-shell"
[ -x "$CHR" ] || { echo "chrome-headless-shell not found at $CHR"; exit 2; }
python3 - "$INJ/chat.txt" "$B/c.html" <<'PY'
import sys
src=open('index.html').read(); inj=open(sys.argv[1]).read()
assert src.count('</body>')==1
open(sys.argv[2],'w').write(src.replace('</body>', inj+'\n</body>'))
PY
cp hero.webp "$B/hero.webp"; cp gargantua.jpg "$B/gargantua.jpg"; cp apple-touch-icon.png favicon-32.png favicon-16.png favicon.ico face.png "$B/"
cp icon-v2.ico icon-32-v2.png icon-16-v2.png icon-180-v2.png icon-192-v2.png icon-512-v2.png "$B/"
# The manifest is the home screen's second way in, and the harness runs from file:// where fetch() is blocked -
# so it is checked here instead: real JSON, and every icon it names exists at the size it claims.
python3 - <<'PY' || exit 1
import json, os, struct
m=json.load(open('manifest.json'))
assert m['name']=='The Lounge' and m['start_url']=='/lounge/', m
for ic in m['icons']:
    p=ic['src']; assert os.path.exists(p), 'manifest names a missing file: '+p
    w,h=struct.unpack('>II', open(p,'rb').read()[16:24])
    assert '%dx%d'%(w,h)==ic['sizes'], '%s is %dx%d, manifest says %s'%(p,w,h,ic['sizes'])
print('  manifest.json: %d icons, each present at its declared size' % len(m['icons']))
PY
title(){ "$CHR" --headless --disable-gpu --hide-scrollbars --virtual-time-budget="${4:-6000}" \
  --window-size="$1","$2" --dump-dom "$3" 2>/dev/null | tr -d '\n' | sed -n 's/.*<title>§\(.*\)§<\/title>.*/\1/p'; }
WHAT="${1:-all}"; PASS=0; FAIL=0
if [ "$WHAT" = all ] || [ "$WHAT" = chat ]; then
  echo "CHAT  (10 modes x 5 viewports)"
  # 440x956 = his iPhone 18 Pro Max (measured off a screenshot 2026-09-18: 1320x2868 at 3x); 393 = the old 15 Pro
  for m in ok badpw expired persist guard hub hubfail arrange lost timeout; do
    for v in "393 700" "393 852" "440 956" "852 393" "2026 1037"; do set -- $v
      budget=8000; [ "$m" = timeout ] && budget=140000; [ "$m" = hub ] && budget=30000   # hub: VaderClawd's climb and drop take real (virtual) seconds
      R=$(title "$1" "$2" "file://$B/c.html?t=$m" $budget)
      p=$(printf '%s' "$R" | grep -o PASS | wc -l | tr -d ' '); f=$(printf '%s' "$R" | grep -o FAIL | wc -l | tr -d ' ')
      PASS=$((PASS+p)); FAIL=$((FAIL+f))
      # a check that never ran looks like a pass: the wide hub run must reach the last edge check
      [ "$m" = hub ] && [ "$1" = 2026 ] && { printf '%s' "$R" | grep -q 'edges: all checks ran' || { FAIL=$((FAIL+1)); echo "  t=hub ${1}x${2}: the edge checks never finished (virtual time ran out?)"; }; }
      { [ "$m" = hub ] || [ "$m" = hubfail ]; } && { printf '%s' "$R" | grep -q 'iss: all checks ran' || { FAIL=$((FAIL+1)); echo "  t=$m ${1}x${2}: the ISS checks never finished"; }; }
      [ "$m" = arrange ] && { printf '%s' "$R" | grep -q 'hold: all checks ran' || { FAIL=$((FAIL+1)); echo "  t=$m ${1}x${2}: the touch-hold checks never finished"; }; }
      { [ "$m" = hub ] || [ "$m" = hubfail ]; } && { printf '%s' "$R" | grep -q 'viewer: all checks ran' || { FAIL=$((FAIL+1)); echo "  t=$m ${1}x${2}: the Viewer checks never finished"; }; }
      [ -z "$R" ] && { FAIL=$((FAIL+1)); echo "  t=$m ${1}x${2}: NO RESULT (harness never reported)"; }
      [ "$f" != 0 ] && { echo "  t=$m ${1}x${2}"; printf '%s' "$R" | sed 's/FAIL/\nFAIL/g' | grep FAIL | sed 's/^/     /'; }
    done
  done
  echo "  -> $PASS pass / $FAIL fail"
fi
if [ "$WHAT" = all ] || [ "$WHAT" = voice ]; then
  # voice mode (2026-09-21): the hologram and talking to Jarvis, its own page and fakes
  python3 - "$INJ/voice.txt" "$B/v.html" <<'PY'
import sys
src=open('index.html').read(); inj=open(sys.argv[1]).read()
assert src.count('</body>')==1
open(sys.argv[2],'w').write(src.replace('</body>', inj+'\n</body>'))
PY
  echo "VOICE (5 viewports)"; VP=0; VF=0
  for v in "393 700" "393 852" "440 956" "852 393" "2026 1037"; do set -- $v
    R=$(title "$1" "$2" "file://$B/v.html" 45000)
    p=$(printf '%s' "$R" | grep -o PASS | wc -l | tr -d ' '); f=$(printf '%s' "$R" | grep -o FAIL | wc -l | tr -d ' ')
    printf '%s' "$R" | grep -q 'voice: all checks ran' || { f=$((f+1)); echo "  voice ${1}x${2}: the checks never finished"; }
    [ -z "$R" ] && echo "  voice ${1}x${2}: NO RESULT"
    [ "$f" != 0 ] && { echo "  voice ${1}x${2}"; printf '%s' "$R" | sed 's/FAIL/\nFAIL/g' | grep FAIL | sed 's/^/     /'; }
    VP=$((VP+p)); VF=$((VF+f))
  done
  echo "  -> $VP pass / $VF fail"; PASS=$((PASS+VP)); FAIL=$((FAIL+VF))
fi
if [ "$WHAT" = webkit ]; then
  node ../webkit-check/check.js "$PWD/index.html" --out "$B/shots"
fi
[ "$FAIL" = 0 ] && echo "ALL GREEN — $PASS assertions, 0 failures" || { echo "FAILURES: $FAIL"; exit 1; }
