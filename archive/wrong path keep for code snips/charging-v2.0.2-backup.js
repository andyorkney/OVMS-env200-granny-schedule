/**
 * OVMS Smart Charging Scheduler - Phase 1 Minimal Stable Version
 *
 * VERSION: 2.0.2-20251106-0920
 * BUILD: EMERGENCY FIX - Disabled SD logging (was causing abort() crashes)
 *
 * ESSENTIAL FEATURES:
 * 1. Persistent cheap rate window (survives reboot)
 * 2. Persistent target SOC (80%/90%/100%)
 * 3. Persistent pricing (cheap/standard rates)
 * 4. Ready-by mode with optimal start calculation
 * 5. BULLETPROOF stop at target SOC
 * 6. Start ASAP in cheap window for best value
 *
 * USAGE:
 * charging.setSchedule(23,30,5,30)     - Set cheap window 23:30-05:30
 * charging.setLimits(80)                - Set target to 80% (or 90/100)
 * charging.setPricing(0.07,0.29,"£")   - Set cheap/standard rates
 * charging.setReadyBy(8,30)            - Be ready by 08:30
 * charging.status()                     - Show current status
 * charging.start()                      - Manual start charge
 * charging.stop()                       - Manual stop charge
 */

// ============================================================================
// VERSION & MODULE INFO
// ============================================================================

var VERSION = "2.0.2-20251106-0920";
var __moduleLoadStart = Date.now();

// Ensure exports object exists FIRST (before we try to use it!)
if (typeof exports === 'undefined') {
    var exports = {};
}

// ============================================================================
// LOGGING INFRASTRUCTURE
// ============================================================================

// CRITICAL: SD logging DISABLED due to VFS.Save() causing crashes
// The read-modify-write pattern was too heavy and caused stack overflow
// Keeping infrastructure for future implementation with proper batching

/**
 * Universal logging function - CONSOLE ONLY (SD disabled due to crashes)
 */
function log(message) {
    // Always write to console
    print(message);

    // SD logging DISABLED - was causing abort() crashes on core 1
    // VFS.Save() read-modify-write pattern too heavy for frequent calls
    // TODO: Implement batched logging or background writer if needed
}

log("\n");
log("=".repeat(60) + "\n");
log("OVMS Smart Charging Scheduler v" + VERSION + "\n");
log("=".repeat(60) + "\n");

// ============================================================================
// CONFIGURATION (Hardcoded defaults, overridden by persistence)
// ============================================================================

var config = {
    // Cheap electricity window (24-hour format)
    cheapWindowStart: { hour: 23, minute: 30 },
    cheapWindowEnd: { hour: 5, minute: 30 },

    // Charging target (default 80% for battery health)
    targetSOC: 80,

    // Charger power rating (kW)
    chargeRateKW: 1.8,

    // Ready-by time (null = fixed schedule mode)
    readyBy: null,

    // Electricity pricing
    pricing: {
        cheap: 0.07,
        standard: 0.29,
        currency: "£"
    }
};

// ============================================================================
// SESSION TRACKING
// ============================================================================

var chargingSession = {
    active: false,
    startTime: null,
    startSOC: null,
    targetSOC: null  // Track target for this session
};

// ============================================================================
// PERSISTENCE LAYER
// ============================================================================

/**
 * Load persisted configuration from OvmsConfig storage
 */
function loadPersistedConfig() {
    log("[LOAD] Loading persisted configuration...\n");

    try {
        // Load cheap window
        var startHour = OvmsConfig.Get("usr", "charging.window.start.hour");
        if (startHour && startHour !== "" && startHour !== "undefined") {
            config.cheapWindowStart.hour = parseInt(startHour);
            config.cheapWindowStart.minute = parseInt(OvmsConfig.Get("usr", "charging.window.start.minute") || "0");
            config.cheapWindowEnd.hour = parseInt(OvmsConfig.Get("usr", "charging.window.end.hour") || "0");
            config.cheapWindowEnd.minute = parseInt(OvmsConfig.Get("usr", "charging.window.end.minute") || "0");
            log("[LOAD] Cheap window: " + pad(config.cheapWindowStart.hour) + ":" +
                  pad(config.cheapWindowStart.minute) + " to " +
                  pad(config.cheapWindowEnd.hour) + ":" + pad(config.cheapWindowEnd.minute) + "\n");
        }

        // Load target SOC
        var target = OvmsConfig.Get("usr", "charging.target.soc");
        if (target && target !== "" && target !== "undefined") {
            var t = parseInt(target);
            if (!isNaN(t) && t >= 20 && t <= 100) {
                config.targetSOC = t;
                log("[LOAD] Target SOC: " + t + "%\n");
            }
        }

        // Load charge rate
        var rate = OvmsConfig.Get("usr", "charging.rate.kw");
        if (rate && rate !== "" && rate !== "undefined") {
            var r = parseFloat(rate);
            if (!isNaN(r) && r > 0) {
                config.chargeRateKW = r;
                log("[LOAD] Charge rate: " + r + " kW\n");
            }
        }

        // Load pricing
        var cheap = OvmsConfig.Get("usr", "charging.price.cheap");
        if (cheap && cheap !== "" && cheap !== "undefined") {
            var c = parseFloat(cheap);
            var s = parseFloat(OvmsConfig.Get("usr", "charging.price.standard") || "0.29");
            var curr = OvmsConfig.Get("usr", "charging.price.currency");

            if (!isNaN(c) && !isNaN(s)) {
                config.pricing.cheap = c;
                config.pricing.standard = s;
                if (curr && curr !== "" && curr !== "undefined") {
                    config.pricing.currency = curr;
                }
                log("[LOAD] Pricing: " + config.pricing.currency + c.toFixed(2) +
                      " cheap, " + config.pricing.currency + s.toFixed(2) + " standard\n");
            }
        }

        // Load ready-by
        var rbHour = OvmsConfig.Get("usr", "charging.readyby.hour");
        if (rbHour && rbHour !== "" && rbHour !== "undefined") {
            var h = parseInt(rbHour);
            var m = parseInt(OvmsConfig.Get("usr", "charging.readyby.minute") || "0");

            if (!isNaN(h) && !isNaN(m)) {
                config.readyBy = { hour: h, minute: m };
                log("[LOAD] Ready-by: " + pad(h) + ":" + pad(m) + "\n");
            }
        }

        log("[LOAD] Configuration loaded successfully\n");

    } catch (e) {
        log("[ERROR] Failed to load config: " + e.message + "\n");
        log("[LOAD] Using defaults\n");
    }
}

/**
 * Persist a value to OvmsConfig
 */
function persistValue(key, value) {
    try {
        OvmsConfig.Set("usr", key, value.toString());
    } catch (e) {
        log("[ERROR] Failed to save " + key + ": " + e.message + "\n");
    }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Pad number to 2 digits
 */
function pad(num) {
    return num < 10 ? "0" + num : num.toString();
}

/**
 * Safely get metric value with fallback
 */
function getSafeMetric(name, defaultValue) {
    try {
        if (OvmsMetrics.HasValue(name)) {
            return OvmsMetrics.AsFloat(name);
        }
    } catch (e) {
        log("[ERROR] Failed to read metric " + name + ": " + e.message + "\n");
    }
    return defaultValue;
}

/**
 * Safe notification
 */
function safeNotify(type, subtype, message) {
    try {
        OvmsNotify.Raise(type, subtype, message);
    } catch (e) {
        log("[ERROR] Notification failed: " + e.message + "\n");
    }
}

// ============================================================================
// CHARGING CONTROL
// ============================================================================

/**
 * Start charging
 */
exports.start = function() {
    log("\n[START] Initiating charge\n");

    var soc = getSafeMetric("v.b.soc", 0);
    var plugged = getSafeMetric("v.c.pilot", false);
    var charging = getSafeMetric("v.c.charging", false);

    if (!plugged) {
        log("[START] ERROR: Vehicle not plugged in\n");
        return false;
    }

    if (charging) {
        log("[START] Already charging\n");
        return true;
    }

    if (soc >= config.targetSOC) {
        log("[START] Already at target (" + soc.toFixed(0) + "% >= " + config.targetSOC + "%)\n");
        return false;
    }

    log("[START] Current SOC: " + soc.toFixed(0) + "%, Target: " + config.targetSOC + "%\n");

    try {
        // Initialize session tracking
        chargingSession.active = true;
        chargingSession.startTime = Date.now();
        chargingSession.startSOC = soc;
        chargingSession.targetSOC = config.targetSOC;

        var result = OvmsCommand.Exec("charge start");
        log("[START] Command result: " + result + "\n");

        // Subscribe to monitoring
        PubSub.subscribe("ticker.60", monitorSOC);
        log("[START] SOC monitoring active (ticker.60)\n");

        var msg = "Charging started: " + soc.toFixed(0) + "% → " + config.targetSOC + "%";
        safeNotify("info", "charge.start", msg);

        return true;

    } catch (e) {
        log("[START] ERROR: " + e.message + "\n");
        chargingSession.active = false;
        return false;
    }
};

/**
 * Stop charging
 */
exports.stop = function() {
    log("\n[STOP] Stopping charge\n");

    var charging = getSafeMetric("v.c.charging", false);
    if (!charging) {
        log("[STOP] Not currently charging\n");
        return true;
    }

    var soc = getSafeMetric("v.b.soc", 0);
    log("[STOP] Final SOC: " + soc.toFixed(0) + "%\n");

    try {
        var result = OvmsCommand.Exec("charge stop");
        log("[STOP] Command result: " + result + "\n");

        // Unsubscribe from monitoring
        PubSub.unsubscribe("ticker.60", monitorSOC);
        log("[STOP] SOC monitoring stopped\n");

        var msg = "Charging stopped at " + soc.toFixed(0) + "%";
        if (chargingSession.active && chargingSession.startSOC !== null) {
            var gain = soc - chargingSession.startSOC;
            var duration = (Date.now() - chargingSession.startTime) / (1000 * 60);
            msg += " (+" + gain.toFixed(0) + "%, " + duration.toFixed(0) + " min)";
        }

        safeNotify("info", "charge.stop", msg);

        // Clear session
        chargingSession.active = false;
        chargingSession.startTime = null;
        chargingSession.startSOC = null;
        chargingSession.targetSOC = null;

        return true;

    } catch (e) {
        log("[STOP] ERROR: " + e.message + "\n");
        return false;
    }
};

/**
 * Monitor SOC and stop at target - BULLETPROOF VERSION
 */
function monitorSOC() {
    try {
        var charging = getSafeMetric("v.c.charging", false);
        if (!charging) {
            return;
        }

        var soc = getSafeMetric("v.b.soc", 0);
        var power = getSafeMetric("v.c.power", 0);

        // Use session target if available, otherwise use config
        var target = chargingSession.targetSOC || config.targetSOC;

        log("[MONITOR] SOC: " + soc.toFixed(1) + "%, Power: " + power.toFixed(2) +
              "kW, Target: " + target + "%\n");

        // CRITICAL: Stop at target
        if (soc >= target) {
            log("[MONITOR] *** TARGET REACHED *** " + soc.toFixed(1) + "% >= " + target + "%\n");
            exports.stop();
        }

    } catch (e) {
        log("[MONITOR] ERROR: " + e.message + "\n");
    }
}

/**
 * Check schedule and auto-start/stop as needed
 */
exports.checkSchedule = function() {
    try {
        log("\n[SCHEDULE] Checking schedule...\n");

        var now = new Date();
        var currentMin = now.getHours() * 60 + now.getMinutes();

        var soc = getSafeMetric("v.b.soc", 0);
        var charging = getSafeMetric("v.c.charging", false);
        var plugged = getSafeMetric("v.c.pilot", false);

        log("[SCHEDULE] Time: " + pad(now.getHours()) + ":" + pad(now.getMinutes()) +
              ", SOC: " + soc.toFixed(0) + "%, Charging: " + charging + ", Plugged: " + plugged + "\n");

        // Calculate window times
        var startMin = config.cheapWindowStart.hour * 60 + config.cheapWindowStart.minute;
        var endMin = config.cheapWindowEnd.hour * 60 + config.cheapWindowEnd.minute;

        // Determine if we're in the cheap window
        var inWindow = false;
        if (startMin > endMin) {
            // Overnight window (e.g., 23:30 to 05:30)
            inWindow = (currentMin >= startMin || currentMin < endMin);
        } else {
            // Same-day window
            inWindow = (currentMin >= startMin && currentMin < endMin);
        }

        log("[SCHEDULE] Cheap window: " + pad(config.cheapWindowStart.hour) + ":" +
              pad(config.cheapWindowStart.minute) + " to " +
              pad(config.cheapWindowEnd.hour) + ":" + pad(config.cheapWindowEnd.minute) +
              ", In window: " + inWindow + "\n");

        // Decision logic
        if (inWindow && !charging && plugged && soc < config.targetSOC) {
            log("[SCHEDULE] *** AUTO-START *** In cheap window, SOC below target\n");
            exports.start();
        } else if (!inWindow && charging) {
            log("[SCHEDULE] *** AUTO-STOP *** Outside cheap window\n");
            exports.stop();
        } else {
            log("[SCHEDULE] No action needed\n");
        }

    } catch (e) {
        log("[SCHEDULE] ERROR: " + e.message + "\n");
    }
};

// ============================================================================
// USER COMMANDS
// ============================================================================

/**
 * Set cheap rate window
 */
exports.setSchedule = function(startHour, startMin, endHour, endMin) {
    log("\n[CONFIG] Setting cheap window\n");

    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
        startMin < 0 || startMin > 59 || endMin < 0 || endMin > 59) {
        log("[CONFIG] ERROR: Invalid time values\n");
        return false;
    }

    config.cheapWindowStart = { hour: startHour, minute: startMin };
    config.cheapWindowEnd = { hour: endHour, minute: endMin };

    // Persist
    persistValue("charging.window.start.hour", startHour);
    persistValue("charging.window.start.minute", startMin);
    persistValue("charging.window.end.hour", endHour);
    persistValue("charging.window.end.minute", endMin);

    log("[CONFIG] Cheap window: " + pad(startHour) + ":" + pad(startMin) +
          " to " + pad(endHour) + ":" + pad(endMin) + " [SAVED]\n");

    return true;
};

/**
 * Set target SOC
 */
exports.setLimits = function(targetSOC) {
    log("\n[CONFIG] Setting target SOC\n");

    if (targetSOC < 20 || targetSOC > 100) {
        log("[CONFIG] ERROR: Target must be 20-100%\n");
        return false;
    }

    config.targetSOC = targetSOC;

    // Persist
    persistValue("charging.target.soc", targetSOC);

    log("[CONFIG] Target SOC: " + targetSOC + "% [SAVED]\n");

    return true;
};

/**
 * Set charge rate
 */
exports.setChargeRate = function(rateKW) {
    log("\n[CONFIG] Setting charge rate\n");

    if (rateKW < 1 || rateKW > 350) {
        log("[CONFIG] ERROR: Invalid charge rate\n");
        return false;
    }

    config.chargeRateKW = rateKW;

    // Persist
    persistValue("charging.rate.kw", rateKW);

    var type = rateKW < 2.5 ? "granny" : rateKW < 4 ? "Type 2 slow" :
               rateKW < 10 ? "Type 2 fast" : "rapid";
    log("[CONFIG] Charge rate: " + rateKW + " kW (" + type + ") [SAVED]\n");

    return true;
};

/**
 * Set pricing
 */
exports.setPricing = function(cheapRate, standardRate, currency) {
    log("\n[CONFIG] Setting pricing\n");

    if (cheapRate < 0 || standardRate < 0) {
        log("[CONFIG] ERROR: Invalid rates\n");
        return false;
    }

    config.pricing.cheap = cheapRate;
    config.pricing.standard = standardRate;
    if (currency) {
        config.pricing.currency = currency;
    }

    // Persist
    persistValue("charging.price.cheap", cheapRate);
    persistValue("charging.price.standard", standardRate);
    if (currency) {
        persistValue("charging.price.currency", currency);
    }

    log("[CONFIG] Pricing: " + config.pricing.currency + cheapRate.toFixed(2) +
          " cheap, " + config.pricing.currency + standardRate.toFixed(2) + " standard [SAVED]\n");

    return true;
};

/**
 * Set ready-by time
 */
exports.setReadyBy = function(hour, minute) {
    log("\n[CONFIG] Setting ready-by time\n");

    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
        log("[CONFIG] ERROR: Invalid time\n");
        return false;
    }

    config.readyBy = { hour: hour, minute: minute };

    // Persist
    persistValue("charging.readyby.hour", hour);
    persistValue("charging.readyby.minute", minute);

    log("[CONFIG] Ready-by: " + pad(hour) + ":" + pad(minute) + " [SAVED]\n");
    log("[CONFIG] Charging will start at cheap window start (" +
          pad(config.cheapWindowStart.hour) + ":" + pad(config.cheapWindowStart.minute) +
          ") to maximize cheap rate usage\n");

    return true;
};

/**
 * Clear ready-by (return to fixed schedule)
 */
exports.clearReadyBy = function() {
    log("\n[CONFIG] Clearing ready-by time\n");

    config.readyBy = null;

    // Clear from persistence
    persistValue("charging.readyby.hour", "");
    persistValue("charging.readyby.minute", "");

    log("[CONFIG] Ready-by cleared - using fixed schedule mode [SAVED]\n");

    return true;
};

/**
 * Show current status
 */
exports.status = function() {
    log("\n");
    log("=".repeat(60) + "\n");
    log("OVMS Smart Charging Status v" + VERSION + "\n");
    log("=".repeat(60) + "\n");
    log("Time: " + new Date().toString() + "\n\n");

    // Configuration
    log("Configuration:\n");
    log("  Cheap window: " + pad(config.cheapWindowStart.hour) + ":" +
          pad(config.cheapWindowStart.minute) + " to " +
          pad(config.cheapWindowEnd.hour) + ":" + pad(config.cheapWindowEnd.minute) + "\n");
    log("  Target SOC: " + config.targetSOC + "%\n");
    log("  Charge rate: " + config.chargeRateKW + " kW\n");
    log("  Pricing: " + config.pricing.currency + config.pricing.cheap.toFixed(2) +
          " cheap, " + config.pricing.currency + config.pricing.standard.toFixed(2) + " standard\n");

    if (config.readyBy) {
        log("  Ready-by: " + pad(config.readyBy.hour) + ":" + pad(config.readyBy.minute) + "\n");
    } else {
        log("  Mode: Fixed schedule\n");
    }

    // Vehicle status
    var soc = getSafeMetric("v.b.soc", 0);
    var charging = getSafeMetric("v.c.charging", false);
    var plugged = getSafeMetric("v.c.pilot", false);
    var temp = getSafeMetric("v.b.temp", null);

    log("\nVehicle:\n");
    log("  SOC: " + soc.toFixed(0) + "%\n");
    log("  Charging: " + charging + "\n");
    log("  Plugged in: " + plugged + "\n");
    if (temp !== null) {
        log("  Battery temp: " + temp.toFixed(0) + " C\n");
    }

    log("\n");
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

// Auto-start monitoring when vehicle starts charging
PubSub.subscribe("vehicle.charge.start", function(msg, data) {
    log("\n[EVENT] Vehicle charge started\n");

    if (!chargingSession.active) {
        var soc = getSafeMetric("v.b.soc", 0);
        chargingSession.active = true;
        chargingSession.startTime = Date.now();
        chargingSession.startSOC = soc;
        chargingSession.targetSOC = config.targetSOC;
        log("[EVENT] Session tracking initialized: " + soc.toFixed(0) + "% → " +
              config.targetSOC + "%\n");
    }

    PubSub.subscribe("ticker.60", monitorSOC);
    log("[EVENT] SOC monitoring activated\n");
});

// Auto-stop monitoring when vehicle stops charging
PubSub.subscribe("vehicle.charge.stop", function(msg, data) {
    log("\n[EVENT] Vehicle charge stopped\n");

    PubSub.unsubscribe("ticker.60", monitorSOC);
    log("[EVENT] SOC monitoring deactivated\n");

    if (chargingSession.active) {
        var soc = getSafeMetric("v.b.soc", 0);
        var gain = soc - chargingSession.startSOC;
        var duration = (Date.now() - chargingSession.startTime) / (1000 * 60);

        log("[EVENT] Session complete: " + chargingSession.startSOC.toFixed(0) + "% → " +
              soc.toFixed(0) + "% (+" + gain.toFixed(0) + "%, " + duration.toFixed(0) + " min)\n");

        // Clear session
        chargingSession.active = false;
        chargingSession.startTime = null;
        chargingSession.startSOC = null;
        chargingSession.targetSOC = null;
    }
});

// ============================================================================
// INITIALIZATION
// ============================================================================

// Load persisted configuration
loadPersistedConfig();

var __moduleLoadTime = Date.now() - __moduleLoadStart;
log("[INIT] Module loaded in " + __moduleLoadTime + " ms\n");
log("[INIT] Ready for operation\n");
log("=".repeat(60) + "\n");
log("\n");
