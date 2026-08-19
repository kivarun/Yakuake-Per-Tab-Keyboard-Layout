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

echo ""
echo "Results: $PASS passed, $FAIL failed"

if [ "$FAIL" -gt 0 ]; then
    exit 1
fi
