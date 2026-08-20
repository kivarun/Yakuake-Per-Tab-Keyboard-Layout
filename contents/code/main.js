const POLL_INTERVAL = 100;
const ACTIVATE_DELAY = 100;
const VERIFY_DELAY = 600;
const LEARN_GUARD = 300;
const MANUAL_STABLE = 500;

const DEFAULT_LAYOUT = 0; // First keyboard layout configured in Plasma.
const DEBUG = false;

const YAKUAKE_SERVICE = "org.kde.yakuake";
const YAKUAKE_PATH = "/yakuake/sessions";
const YAKUAKE_IFACE = "org.kde.yakuake";

const KEYBOARD_SERVICE = "org.kde.keyboard";
const KEYBOARD_PATH = "/Layouts";
const KEYBOARD_IFACE = "org.kde.KeyboardLayouts";

let layouts = {};
let currentSession = null;

let yakuakeActive = false;
let pollBusy = false;
let restoring = false;
let restoreGeneration = 0;

let learnBlockedUntil = 0;

let candidateLayout = null;
let candidateSince = 0;

let activationTarget = null;


/*
 * Declare timers before any function that references them to avoid
 * KWin's "variable used before its declaration" warning. The connected
 * handlers are function declarations and are hoisted, so they are
 * available at this point.
 */
const activationTimer = new QTimer();
activationTimer.singleShot = true;
activationTimer.interval = ACTIVATE_DELAY;
activationTimer.timeout.connect(restoreAfterActivation);


const verifyTimer = new QTimer();
verifyTimer.singleShot = true;
verifyTimer.interval = VERIFY_DELAY;
verifyTimer.timeout.connect(verifyAfterActivation);


const pollTimer = new QTimer();
pollTimer.interval = POLL_INTERVAL;
pollTimer.timeout.connect(poll);
pollTimer.start();


function log(message) {
    if (DEBUG) {
        print("YAKLAY " + message);
    }
}


function now() {
    return Date.now();
}


function toInt(value) {
    const n = parseInt(value, 10);
    return isNaN(n) ? null : n;
}


function hasLayout(session) {
    return Object.prototype.hasOwnProperty.call(layouts, session);
}


/*
 * KWin may report different identifiers for the Yakuake window
 * depending on the platform (X11 vs Wayland) and Plasma version.
 * On some Plasma 6 / Wayland setups, resourceClass is "yakuake"
 * instead of "org.kde.yakuake". Check all known identifiers to
 * ensure reliable detection.
 */
function isYakuake(window) {
    if (!window) {
        return false;
    }

    return (
        window.resourceClass === "org.kde.yakuake" ||
        window.resourceClass === "yakuake" ||
        window.resourceName === "yakuake" ||
        window.desktopFileName === "org.kde.yakuake"
    );
}


function resetCandidate() {
    candidateLayout = null;
    candidateSince = 0;
}


function blockLearning(ms) {
    learnBlockedUntil = Math.max(
        learnBlockedUntil,
        now() + ms
    );
    resetCandidate();
}


function getActiveSession(callback) {
    callDBus(
        YAKUAKE_SERVICE,
        YAKUAKE_PATH,
        YAKUAKE_IFACE,
        "activeSessionId",
        function(value) {
            callback(toInt(value));
        }
    );
}


function getLayout(callback) {
    callDBus(
        KEYBOARD_SERVICE,
        KEYBOARD_PATH,
        KEYBOARD_IFACE,
        "getLayout",
        function(value) {
            callback(toInt(value));
        }
    );
}


/*
 * setLayout() expects a D-Bus uint. To avoid depending on implicit
 * JavaScript -> D-Bus uint conversion, cycle until the target layout
 * is reached.
 */
function restoreLayout(target, callback) {
    const generation = ++restoreGeneration;

    restoring = true;
    resetCandidate();

    function finish() {
        if (generation !== restoreGeneration) {
            return;
        }

        restoring = false;

        if (callback) {
            callback();
        }
    }

    function step(attempt) {
        if (
            generation !== restoreGeneration ||
            !yakuakeActive
        ) {
            return;
        }

        getLayout(function(current) {
            if (
                generation !== restoreGeneration ||
                !yakuakeActive
            ) {
                return;
            }

            if (current === target) {
                finish();
                return;
            }

            if (attempt >= 16) {
                log(
                    "restore failed target=" + target +
                    " current=" + current
                );
                finish();
                return;
            }

            callDBus(
                KEYBOARD_SERVICE,
                KEYBOARD_PATH,
                KEYBOARD_IFACE,
                "switchToNextLayout",
                function() {
                    step(attempt + 1);
                }
            );
        });
    }

    step(0);
}


function cleanupSessions() {
    callDBus(
        YAKUAKE_SERVICE,
        YAKUAKE_PATH,
        YAKUAKE_IFACE,
        "sessionIdList",
        function(value) {
            const matches =
                String(value).match(/\d+/g) || [];

            const existing = {};

            for (let i = 0; i < matches.length; ++i) {
                existing[parseInt(matches[i], 10)] = true;
            }

            for (const sid in layouts) {
                if (!existing[sid]) {
                    delete layouts[sid];
                }
            }
        }
    );
}


/*
 * Learn a layout change on the current tab only after it has remained
 * unchanged for MANUAL_STABLE milliseconds. This filters out layout
 * transitions produced by focus/activation handling in Plasma.
 */
function maybeLearnLayout(session, layout) {
    if (now() < learnBlockedUntil) {
        resetCandidate();
        return;
    }

    const saved = layouts[session];

    if (layout === saved) {
        resetCandidate();
        return;
    }

    if (candidateLayout !== layout) {
        candidateLayout = layout;
        candidateSince = now();
        return;
    }

    if (now() - candidateSince < MANUAL_STABLE) {
        return;
    }

    layouts[session] = layout;

    log(
        "learned session=" + session +
        " layout=" + layout
    );

    resetCandidate();
}


function poll() {
    if (
        !yakuakeActive ||
        pollBusy ||
        restoring
    ) {
        return;
    }

    pollBusy = true;

    getActiveSession(function(session) {
        if (!yakuakeActive || session === null) {
            pollBusy = false;
            return;
        }

        getLayout(function(layout) {
            pollBusy = false;

            if (
                !yakuakeActive ||
                restoring ||
                layout === null
            ) {
                return;
            }

            // Preserve the currently selected layout on first observation.
            if (currentSession === null) {
                currentSession = session;
                layouts[session] = layout;

                blockLearning(LEARN_GUARD);

                log(
                    "initial session=" + session +
                    " layout=" + layout
                );

                return;
            }

            // Same tab: this may be a manual layout change.
            if (session === currentSession) {
                maybeLearnLayout(session, layout);
                return;
            }

            /*
             * The Yakuake tab changed. Cancel any pending activation
             * verification so its stale target cannot overwrite the
             * layout of the destination tab.
             */
            verifyTimer.stop();
            activationTarget = null;

            /*
             * The Yakuake tab changed. At this point the global layout
             * still belongs to the tab being left, so save it before
             * restoring the destination tab.
             */
            const previous = currentSession;

            layouts[previous] = layout;

            currentSession = session;
            resetCandidate();

            const target = hasLayout(session)
                ? layouts[session]
                : DEFAULT_LAYOUT;

            layouts[session] = target;

            cleanupSessions();

            blockLearning(
                VERIFY_DELAY + LEARN_GUARD
            );

            log(
                "session " + previous +
                " -> " + session +
                ", restoring layout=" + target
            );

            restoreLayout(target);
        });
    });
}


function restoreAfterActivation() {
    if (!yakuakeActive) {
        return;
    }

    getActiveSession(function(session) {
        if (!yakuakeActive || session === null) {
            return;
        }

        // First activation after loading the script: preserve current state.
        if (currentSession === null) {
            currentSession = session;

            getLayout(function(layout) {
                if (
                    !yakuakeActive ||
                    layout === null
                ) {
                    return;
                }

                layouts[session] = layout;
                activationTarget = layout;

                blockLearning(
                    VERIFY_DELAY + LEARN_GUARD
                );

                log(
                    "initial activation session=" +
                    session +
                    " layout=" + layout
                );

                verifyTimer.start();
            });

            return;
        }

        currentSession = session;
        resetCandidate();

        const target = hasLayout(session)
            ? layouts[session]
            : DEFAULT_LAYOUT;

        layouts[session] = target;
        activationTarget = target;

        blockLearning(
            VERIFY_DELAY + LEARN_GUARD
        );

        log(
            "activated session=" + session +
            ", restoring layout=" + target
        );

        restoreLayout(target, function() {
            /*
             * Plasma may still perform a late per-window layout switch,
             * so verify once more after the activation sequence settles.
             */
            verifyTimer.start();
        });
    });
}


function verifyAfterActivation() {
    if (
        !yakuakeActive ||
        activationTarget === null
    ) {
        return;
    }

    const target = activationTarget;

    getActiveSession(function(session) {
        if (
            !yakuakeActive ||
            session === null ||
            session !== currentSession
        ) {
            return;
        }

        log(
            "verify session=" + session +
            ", layout=" + target
        );

        restoreLayout(target, function() {
            blockLearning(LEARN_GUARD);
        });
    });
}


workspace.windowActivated.connect(function(window) {
    const active = isYakuake(window);

    if (active === yakuakeActive) {
        return;
    }

    yakuakeActive = active;
    resetCandidate();

    if (active) {
        log("Yakuake activated");

        blockLearning(
            ACTIVATE_DELAY +
            VERIFY_DELAY +
            LEARN_GUARD
        );

        activationTimer.start();
        return;
    }

    log("Yakuake deactivated");

    activationTimer.stop();
    verifyTimer.stop();

    activationTarget = null;

    ++restoreGeneration;
    restoring = false;
    pollBusy = false;

    resetCandidate();
});


yakuakeActive = isYakuake(workspace.activeWindow);

if (yakuakeActive) {
    blockLearning(
        ACTIVATE_DELAY +
        VERIFY_DELAY +
        LEARN_GUARD
    );

    activationTimer.start();
}
