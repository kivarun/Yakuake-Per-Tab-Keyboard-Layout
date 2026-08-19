# Yakuake Per-Tab Keyboard Layout

A small KWin script that remembers the keyboard layout independently for each Yakuake tab/session.

Plasma can remember keyboard layouts per application, but all Yakuake tabs belong to the same application window. This script fills that gap by tracking the active Yakuake session and restoring its previously used keyboard layout.

## Features

- Remembers a separate keyboard layout for each Yakuake tab/session.
- Restores the saved layout when switching tabs.
- Preserves the tab layout across Yakuake hide/show (`F12`).
- New/unseen tabs start with keyboard layout index `0` (the first layout configured in Plasma).
- No background daemon or systemd service.
- Uses only KWin scripting plus the existing Yakuake and Plasma keyboard-layout D-Bus APIs.

## Requirements

- KDE Plasma 6 / KWin 6
- Yakuake
- Multiple keyboard layouts configured in Plasma

Tested on Plasma 6 under Wayland. X11 has not been tested yet.

## Installation from source

```bash
git clone https://github.com/kivarun/Yakuake-Per-Tab-Keyboard-Layout.git
cd Yakuake-Per-Tab-Keyboard-Layout

kpackagetool6 --type=KWin/Script -i .

kwriteconfig6 \
  --file kwinrc \
  --group Plugins \
  --key yakuake-layoutEnabled true

qdbus6 org.kde.KWin /KWin reconfigure
```

Verify that KWin loaded it:

```bash
qdbus6 org.kde.KWin /Scripting \
  org.kde.kwin.Scripting.isScriptLoaded \
  yakuake-layout
```

Expected result:

```text
true
```

## Updating

From a checkout of the new version:

```bash
kpackagetool6 --type=KWin/Script -u .
qdbus6 org.kde.KWin /KWin reconfigure
```

A logout/login can be useful when testing changes to a currently loaded KWin script.

## Uninstallation

```bash
kwriteconfig6 \
  --file kwinrc \
  --group Plugins \
  --key yakuake-layoutEnabled false

kpackagetool6 --type=KWin/Script -r yakuake-layout
qdbus6 org.kde.KWin /KWin reconfigure
```

## How it works

The script listens to KWin active-window changes so it knows when Yakuake becomes active or inactive. While Yakuake is active, it polls Yakuake's active session and Plasma's current keyboard layout.

When a tab changes, the script remembers the layout of the tab being left and restores the saved layout of the destination tab. When Yakuake is shown again after being hidden, the saved layout is restored only after the activation sequence settles; a delayed verification prevents Plasma's own per-window layout restoration from overwriting the Yakuake tab state.

Manual layout changes are learned only after they remain stable for a short period. This avoids treating focus/activation layout changes as user choices.

## Configuration

The constants near the top of `contents/code/main.js` control timing and the default layout.

```js
const DEFAULT_LAYOUT = 0;
```

`0` means the first keyboard layout configured in Plasma.

Diagnostic logging is disabled by default. To enable it temporarily:

```js
const DEBUG = true;
```

Then watch KWin's user journal:

```bash
journalctl --user -f -o cat | grep YAKLAY
```

## License

MIT. See [LICENSE](LICENSE).
