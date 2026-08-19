# Yakuake Per-Tab Keyboard Layout

A KWin script for Plasma 6 that remembers the keyboard layout independently for each Yakuake tab.

## Problem

Plasma can remember keyboard layouts per application, but all Yakuake tabs share the same window. Switching tabs resets the layout to whatever Plasma remembers for Yakuake as a whole, losing the layout you were using in each tab.

## Behavior

- Remembers a separate keyboard layout for each Yakuake tab/session.
- Restores the saved layout when switching tabs.
- Preserves the tab layout across Yakuake hide/show (F12).
- New or unseen tabs default to the first keyboard layout configured in Plasma (index 0).
- Manual layout changes are learned after a brief stability period to avoid capturing focus-driven transitions.
- No background daemon or systemd service required.

## Requirements

- KDE Plasma 6 with KWin scripting support
- Yakuake
- The `org.kde.keyboard` D-Bus service (provided by Plasma)
- Multiple keyboard layouts configured in Plasma

**Tested on:** Plasma 6 / Wayland. X11 has not been tested.

## Installation

```bash
git clone https://github.com/kivarun/Yakuake-Per-Tab-Keyboard-Layout.git
cd Yakuake-Per-Tab-Keyboard-Layout
kpackagetool6 --type=KWin/Script -i .
```

## Enabling

```bash
kwriteconfig6 \
  --file kwinrc \
  --group Plugins \
  --key yakuake-layoutEnabled true

qdbus6 org.kde.KWin /KWin reconfigure
```

Verify the script loaded:

```bash
qdbus6 org.kde.KWin /Scripting \
  org.kde.kwin.Scripting.isScriptLoaded \
  yakuake-layout
```

Expected output: `true`

## Updating

```bash
kpackagetool6 --type=KWin/Script -u .
qdbus6 org.kde.KWin /KWin reconfigure
```

A logout/login cycle is recommended after updating a running KWin script.

## Uninstallation

```bash
kwriteconfig6 \
  --file kwinrc \
  --group Plugins \
  --key yakuake-layoutEnabled false

kpackagetool6 --type=KWin/Script -r yakuake-layout
qdbus6 org.kde.KWin /KWin reconfigure
```

## How It Works

The script listens to KWin active-window changes to detect when Yakuake is shown or hidden. While Yakuake is active, it polls Yakuake's active session and the current system keyboard layout via D-Bus.

When a tab changes, the script saves the layout of the tab being left and restores the remembered layout of the destination tab. After Yakuake is shown following a hide (F12), a delayed verification step ensures Plasma's own per-window layout handling does not overwrite the saved tab state.

## Debugging

Set `DEBUG = true` in `contents/code/main.js`, then watch KWin's journal:

```bash
journalctl --user -f -o cat | grep YAKLAY
```

## License

MIT. See [LICENSE](LICENSE).
