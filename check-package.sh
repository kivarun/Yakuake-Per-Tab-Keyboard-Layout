#!/bin/bash
set -euo pipefail

PASS=0
FAIL=0

check() {
    local desc="$1"
    shift
    if "$@" >/dev/null 2>&1; then
        echo "  [OK]   $desc"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] $desc"
        FAIL=$((FAIL + 1))
    fi
}

echo "Yakuake Per-Tab Keyboard Layout — Package Check"
echo "================================================"

# Required files
for f in metadata.json contents/code/main.js LICENSE README.md; do
    check "$f exists" test -f "$f"
done

# metadata.json is valid JSON
check "metadata.json is valid JSON" python3 -c "import json; json.load(open('metadata.json'))"

# metadata.json has required fields
check "metadata.json has KPackageStructure" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d.get('KPackageStructure')=='KWin/Script'"

check "metadata.json has KPlugin.Id" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d['KPlugin'].get('Id')"

check "metadata.json has KPlugin.Name" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d['KPlugin'].get('Name')"

check "metadata.json has KPlugin.Version" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d['KPlugin'].get('Version')"

check "metadata.json has KPlugin.License" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d['KPlugin'].get('License')"

check "metadata.json has X-Plasma-MainScript" \
    python3 -c "import json; d=json.load(open('metadata.json')); assert d.get('X-Plasma-MainScript')=='code/main.js'"

# main.js syntax check (node if available)
if command -v node >/dev/null 2>&1; then
    check "main.js JavaScript syntax" node --check contents/code/main.js
else
    echo "  [SKIP] main.js JavaScript syntax (node not available)"
fi

# LICENSE matches metadata
check "LICENSE file mentions MIT" grep -q "MIT" LICENSE

# kpackagetool6 isolated install test
if command -v kpackagetool6 >/dev/null 2>&1; then
    _tmpdir=$(mktemp -d)
    _tmpdata="${_tmpdir}/local/share"
    mkdir -p "$_tmpdata"
    if XDG_DATA_HOME="$_tmpdata" kpackagetool6 --type=KWin/Script -i . 2>/dev/null; then
        echo "  [OK]   kpackagetool6 isolated install"
        PASS=$((PASS + 1))
    else
        echo "  [FAIL] kpackagetool6 isolated install"
        FAIL=$((FAIL + 1))
    fi
    rm -rf "$_tmpdir"
else
    echo "  [SKIP] kpackagetool6 isolated install (kpackagetool6 not available)"
fi

# Regression: stale activation verification on tab switch (v1.0.2)
# poll() must cancel the verify timer when the active session changes,
# otherwise verifyAfterActivation() can restore the wrong layout.
check "poll cancels verifyTimer on session switch" \
    python3 -c "
import re, sys
src = open('contents/code/main.js').read()
# Find the poll function body
m = re.search(r'function poll\(\)\s*\{(.*?)\n\}', src, re.DOTALL)
if not m:
    sys.exit(1)
poll_body = m.group(1)
# The session-switch block is between the same-tab path
# (marked by maybeLearnLayout) and the restoreLayout call.
same_tab_idx = poll_body.index('maybeLearnLayout')
restore_idx = poll_body.index('restoreLayout(target)')
block = poll_body[same_tab_idx:restore_idx]
if 'verifyTimer.stop()' not in block:
    print('missing verifyTimer.stop()'); sys.exit(1)
if 'activationTarget = null' not in block:
    print('missing activationTarget = null'); sys.exit(1)
"

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
