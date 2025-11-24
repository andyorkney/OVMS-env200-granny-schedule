/**
 * OVMS Smart Charging Scheduler - ULTRA-MINIMAL Emergency Version
 *
 * VERSION: 2.0.3-20251106-0930
 * BUILD: Stripped to absolute essentials - NO dynamic subscriptions
 *
 * CRITICAL FIXES:
 * - Removed dynamic ticker.60 subscribe/unsubscribe (was causing stack overflow)
 * - Minimal logging to reduce stack usage
 * - Single static ticker.60 subscription at startup
 * - Removed all event handlers (vehicle.charge.start/stop)
 *
 * ESSENTIAL FEATURES:
 * 1. Persistent config (target SOC, cheap window)
 * 2. Auto-start in cheap window
 * 3. Stop at target SOC
 * 4. Manual start/stop
 *
 * USAGE:
 * charging.setSchedule(23,30,5,30)  - Set cheap window
 * charging.setLimits(80)             - Set target to 80%
 * charging.status()                  - Show status
 */

// ============================================================================
// VERSION & MODULE INFO
// ============================================================================

var VERSION = "2.0.3-20251106-0930";

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
    targetSOC: 80
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
        OvmsCommand.Exec("charge start");
        print("[START] Charging started\n");
        return true;
    } catch (e) {
        print("[START] Error: " + e.message + "\n");
        return false;
    }
};

exports.stop = function() {
    try {
        session.monitoring = false;
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
        // Auto-stop outside window
        else if (!inWindow && charging) {
            print("[SCHEDULE] Auto-stop\n");
            exports.stop();
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

exports.status = function() {
    print("\n");
    print("OVMS Smart Charging v" + VERSION + "\n");
    print("=".repeat(50) + "\n");

    print("Window: " + pad(config.cheapWindowStart.hour) + ":" + pad(config.cheapWindowStart.minute) +
          " to " + pad(config.cheapWindowEnd.hour) + ":" + pad(config.cheapWindowEnd.minute) + "\n");
    print("Target: " + config.targetSOC + "%\n");

    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", false);
    var plugged = getMetric("v.c.pilot", false);

    print("SOC: " + soc.toFixed(0) + "%, Charging: " + charging + ", Plugged: " + plugged + "\n");
    print("\n");
};

// ============================================================================
// INITIALIZATION
// ============================================================================

loadConfig();

// Subscribe ticker.60 ONCE at startup (not dynamically)
PubSub.subscribe("ticker.60", monitorSOC);

print("[INIT] Config loaded - Target: " + config.targetSOC + "%\n");
print("[INIT] Ready\n");
print("=".repeat(50) + "\n\n");
