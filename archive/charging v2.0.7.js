/**
 * OVMS Smart Charging Scheduler - Minimal Stable Version
 *
 * VERSION: 2.0.7.3-20251115-1100
 * BUILD: Fixed JS reload stall issue
 *
 * BASED ON: v2.0.7.2 (439 lines, persistent monitoring working)
 *
 * NEW IN v2.0.7.3:
 * - Removed orphaned session detection from init (was causing JS reload stalls)
 * - Simpler initialization (no getMetric/saveValue calls during module load)
 * - Monitoring state still persists and restores, just no active validation
 * - Fixes JS reload hanging with broken poller firmware
 *
 * NEW IN v2.0.7.2:
 * - Persistent monitoring state (survives reboots/firmware updates)
 * - Enhanced status() shows monitoring state and expected behavior
 * - Status tells you: ACTIVE (managing), INACTIVE (manual), or Ready (scheduled)
 * - Fixes issue where reboot during charge lost tracking
 *
 * NEW IN v2.0.7.1:
 * - Priority modes: "target" (default) vs "window"
 * - "target" mode: Always charge to target SOC (window guides start time only)
 * - "window" mode: Stop at window end regardless of SOC (strict cost control)
 * - setPriority() command to change and persist mode
 * - Status display shows current priority mode
 *
 * ENHANCEMENTS FROM v2.0.4:
 * - UK miles conversion for range display
 * - App button support via OvmsNotify for status()
 * - debug() command for troubleshooting internal state
 * - Enhanced status display with range information
 *
 * STABLE BASE FROM v2.0.4:
 * - Static ticker.60 subscription (no dynamic subscribe/unsubscribe)
 * - Flag-based monitoring (session.monitoring)
 * - Minimal code, maximum stability
 * - Simple print() statements (no logger overhead)
 *
 * USAGE:
 * script eval charging.setSchedule(23,30,5,30)  - Set cheap window
 * script eval charging.setLimits(80)             - Set target to 80%
 * script eval charging.setPriority(target)       - Set priority mode (target or window)
 * script eval charging.status()                  - Show status (works in console AND app button)
 * script eval charging.debug()                   - Show internal state for troubleshooting
 */

// ============================================================================
// VERSION & MODULE INFO
// ============================================================================

var VERSION = "2.0.7.3-20251115-1100";

if (typeof exports === 'undefined') {
    var exports = {};
}

print("\n");
print("OVMS Smart Charging v" + VERSION + "\n");
print("=".repeat(50) + "\n");

// ============================================================================
// CONFIGURATION
// ============================================================================

var config = {
    cheapWindowStart: { hour: 23, minute: 30 },
    cheapWindowEnd: { hour: 5, minute: 30 },
    targetSOC: 80,
    chargePriority: "target"  // "target" = always reach target, "window" = stop at window end
};

var session = {
    monitoring: false  // Flag to enable/disable SOC monitoring
};

// ============================================================================
// PERSISTENCE
// ============================================================================

function loadConfig() {
    try {
        var target = OvmsConfig.Get("usr", "charging.target.soc");
        if (target && target !== "") {
            var t = parseInt(target);
            if (!isNaN(t) && t >= 20 && t <= 100) {
                config.targetSOC = t;
            }
        }

        var sh = OvmsConfig.Get("usr", "charging.window.start.hour");
        if (sh && sh !== "") {
            config.cheapWindowStart.hour = parseInt(sh);
            config.cheapWindowStart.minute = parseInt(OvmsConfig.Get("usr", "charging.window.start.minute") || "0");
            config.cheapWindowEnd.hour = parseInt(OvmsConfig.Get("usr", "charging.window.end.hour") || "0");
            config.cheapWindowEnd.minute = parseInt(OvmsConfig.Get("usr", "charging.window.end.minute") || "0");
        }

        var priority = OvmsConfig.Get("usr", "charging.priority");
        if (priority && priority !== "") {
            if (priority === "target" || priority === "window") {
                config.chargePriority = priority;
            }
        }

        // Restore monitoring state (survives reboots)
        var monitoring = OvmsConfig.Get("usr", "charging.monitoring");
        if (monitoring === "true") {
            session.monitoring = true;
        }
    } catch (e) {
        print("[ERROR] Load config: " + e.message + "\n");
    }
}

function saveValue(key, value) {
    try {
        OvmsConfig.Set("usr", key, value.toString());
    } catch (e) {}
}

// ============================================================================
// UTILITIES
// ============================================================================

function pad(n) {
    return n < 10 ? "0" + n : n.toString();
}

function getMetric(name, def) {
    try {
        return OvmsMetrics.HasValue(name) ? OvmsMetrics.AsFloat(name) : def;
    } catch (e) {
        return def;
    }
}

/**
 * Convert km to miles for UK users
 */
function kmToMiles(km) {
    return km * 0.621371;
}

// ============================================================================
// CHARGING CONTROL
// ============================================================================

exports.start = function() {
    var soc = getMetric("v.b.soc", 0);
    var plugged = getMetric("v.c.pilot", false);

    if (!plugged) {
        print("[START] Not plugged in\n");
        return false;
    }

    if (soc >= config.targetSOC) {
        print("[START] Already at target\n");
        return false;
    }

    try {
        session.monitoring = true;
        saveValue("charging.monitoring", "true");  // Persist monitoring state

        OvmsCommand.Exec("charge start");
        print("[START] Charging started: " + soc.toFixed(0) + "% → " + config.targetSOC + "%\n");

        // Notify OVMS app
        try {
            OvmsNotify.Raise("info", "charge.smart",
                "Smart charging: " + soc.toFixed(0) + "% → " + config.targetSOC + "%");
        } catch (e) {}

        return true;
    } catch (e) {
        print("[START] Error: " + e.message + "\n");
        return false;
    }
};

exports.stop = function() {
    try {
        session.monitoring = false;
        saveValue("charging.monitoring", "false");  // Persist monitoring state

        OvmsCommand.Exec("charge stop");
        print("[STOP] Charging stopped\n");
        return true;
    } catch (e) {
        print("[STOP] Error: " + e.message + "\n");
        return false;
    }
};

// ============================================================================
// MONITORING - Called by ticker.60 (subscribed once at startup)
// ============================================================================

function monitorSOC() {
    try {
        // Only monitor if flag is set
        if (!session.monitoring) {
            return;
        }

        var charging = getMetric("v.c.charging", false);
        if (!charging) {
            session.monitoring = false;
            return;
        }

        var soc = getMetric("v.b.soc", 0);

        // Check target
        if (soc >= config.targetSOC) {
            print("[MONITOR] Target reached: " + soc.toFixed(0) + "%\n");

            // Notify OVMS app
            try {
                OvmsNotify.Raise("info", "charge.smart",
                    "Target reached: " + soc.toFixed(0) + "% (target " + config.targetSOC + "%)");
            } catch (e) {}

            exports.stop();
        }
    } catch (e) {
        // Silent fail - don't spam console
    }
}

// ============================================================================
// SCHEDULING
// ============================================================================

exports.checkSchedule = function() {
    try {
        var now = new Date();
        var min = now.getHours() * 60 + now.getMinutes();

        var soc = getMetric("v.b.soc", 0);
        var charging = getMetric("v.c.charging", false);
        var plugged = getMetric("v.c.pilot", false);

        var startMin = config.cheapWindowStart.hour * 60 + config.cheapWindowStart.minute;
        var endMin = config.cheapWindowEnd.hour * 60 + config.cheapWindowEnd.minute;

        var inWindow = (startMin > endMin) ?
            (min >= startMin || min < endMin) :
            (min >= startMin && min < endMin);

        // Auto-start in window
        if (inWindow && !charging && plugged && soc < config.targetSOC) {
            print("[SCHEDULE] Auto-start\n");
            exports.start();
        }
        // Auto-stop outside window (only if priority mode is "window")
        else if (!inWindow && charging) {
            if (config.chargePriority === "window") {
                print("[SCHEDULE] Window ended, stopping (window mode)\n");
                exports.stop();
            }
            // If "target" mode: do nothing, monitorSOC will stop at target SOC
        }
    } catch (e) {
        // Silent fail
    }
};

// ============================================================================
// USER COMMANDS
// ============================================================================

exports.setSchedule = function(sh, sm, eh, em) {
    config.cheapWindowStart = { hour: sh, minute: sm };
    config.cheapWindowEnd = { hour: eh, minute: em };

    saveValue("charging.window.start.hour", sh);
    saveValue("charging.window.start.minute", sm);
    saveValue("charging.window.end.hour", eh);
    saveValue("charging.window.end.minute", em);

    print("[CONFIG] Window: " + pad(sh) + ":" + pad(sm) + " to " + pad(eh) + ":" + pad(em) + "\n");
    return true;
};

exports.setLimits = function(target) {
    if (target < 20 || target > 100) {
        print("[CONFIG] Invalid target\n");
        return false;
    }

    config.targetSOC = target;
    saveValue("charging.target.soc", target);

    print("[CONFIG] Target: " + target + "%\n");
    return true;
};

exports.setPriority = function(mode) {
    if (mode !== "target" && mode !== "window") {
        print("[CONFIG] Invalid priority mode: " + mode + "\n");
        print("[CONFIG] Valid modes: target, window\n");
        return false;
    }

    config.chargePriority = mode;
    saveValue("charging.priority", mode);

    var desc = mode === "target" ?
        "Always reach target SOC (window guides start time)" :
        "Stop at window end (strict cost control)";

    print("[CONFIG] Priority: " + mode + " - " + desc + "\n");
    return true;
};

/**
 * Status display - works in console AND OVMS app buttons
 * Uses string building + OvmsNotify pattern for app compatibility
 */
exports.status = function() {
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", false);
    var plugged = getMetric("v.c.pilot", false);
    var rangeKm = getMetric("v.b.range.est", 0);
    var rangeMiles = kmToMiles(rangeKm);
    var voltage = getMetric("v.b.voltage", 0);
    var power = getMetric("v.c.power", 0);

    // Build status message - MOST IMPORTANT INFO FIRST (for app preview)
    var msg = "";

    // Line 1: Status/monitoring state (most critical)
    if (session.monitoring) {
        msg += "ACTIVE: " + soc.toFixed(0) + "% → " + config.targetSOC + "%";
        if (charging) {
            msg += " (charging)";
        }
    } else {
        if (charging) {
            msg += "MANUAL: " + soc.toFixed(0) + "% (no auto-stop)";
        } else {
            msg += "READY: " + soc.toFixed(0) + "% | Target " + config.targetSOC + "%";
        }
    }
    msg += "\n";

    // Line 2: Range and plugged status (quick reference)
    msg += rangeMiles.toFixed(0) + " miles | " + (plugged ? "Plugged" : "Unplugged");
    if (charging && power > 0) {
        msg += " | " + power.toFixed(1) + "kW";
    }
    msg += "\n";

    // Rest of details
    msg += "----------------------------------------\n";
    msg += "Schedule: " + pad(config.cheapWindowStart.hour) + ":" +
           pad(config.cheapWindowStart.minute) + "-" +
           pad(config.cheapWindowEnd.hour) + ":" +
           pad(config.cheapWindowEnd.minute) + "\n";
    msg += "Priority: " + config.chargePriority +
           (config.chargePriority === "target" ? " (reach target)" : " (stop at window end)") + "\n";
    msg += "Voltage: " + voltage.toFixed(1) + "V\n";
    msg += "v" + VERSION + "\n";

    // Print to console
    print("\n" + msg + "\n");

    // Send to OVMS app (for button actions)
    try {
        OvmsNotify.Raise("info", "charge.status", msg);
    } catch (e) {
        print("[WARN] App notification failed\n");
    }
};

/**
 * Debug display - show internal state for troubleshooting
 */
exports.debug = function() {
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", false);
    var plugged = getMetric("v.c.pilot", false);

    var msg = "";
    msg += "DEBUG - Internal State\n";
    msg += "=".repeat(40) + "\n\n";
    msg += "Session:\n";
    msg += "  monitoring: " + session.monitoring + "\n\n";
    msg += "Config:\n";
    msg += "  targetSOC: " + config.targetSOC + "%\n";
    msg += "  chargePriority: " + config.chargePriority + "\n";
    msg += "  window: " + pad(config.cheapWindowStart.hour) + ":" +
           pad(config.cheapWindowStart.minute) + " to " +
           pad(config.cheapWindowEnd.hour) + ":" +
           pad(config.cheapWindowEnd.minute) + "\n\n";
    msg += "Metrics:\n";
    msg += "  SOC: " + soc.toFixed(1) + "%\n";
    msg += "  Charging: " + charging + "\n";
    msg += "  Plugged: " + plugged + "\n";

    print("\n" + msg + "\n");

    // Also send as notification for app button support
    try {
        OvmsNotify.Raise("info", "charge.debug", msg);
    } catch (e) {
        print("[WARN] App notification failed\n");
    }
};

// ============================================================================
// INITIALIZATION
// ============================================================================

loadConfig();

// Subscribe ticker.60 ONCE at startup (not dynamically)
PubSub.subscribe("ticker.60", monitorSOC);

print("[INIT] Config loaded - Target: " + config.targetSOC + "%\n");
print("[INIT] Priority: " + config.chargePriority + "\n");
if (session.monitoring) {
    print("[INIT] Monitoring active (restored from config)\n");
}
print("[INIT] Ready for operation\n");
print("=".repeat(50) + "\n\n");