/**
 * OVMS Smart Charging Scheduler - Core Function
 *
 * VERSION: 0.1.0-20251122
 * SCOPE: Rock-solid core charging automation
 *
 * CORE FUNCTION:
 * 1. Monitor ALL charging (manual or scheduled)
 * 2. Stop at target SOC automatically
 * 3. Start scheduled charging at cheap window opening
 * 4. User-configurable target and window (persistent)
 *
 * EXCLUDED (for v1.x):
 * - Ready-by calculations
 * - Pricing/cost tracking
 * - Extended window start
 * - Session analytics
 *
 * USAGE:
 * charging.setTarget(80)              - Set target SOC (persists)
 * charging.setWindow(23,30,5,30)      - Set cheap window (persists)
 * charging.status()                   - Show current status
 * charging.enable()                   - Enable scheduler
 * charging.disable()                  - Disable scheduler
 */

// ============================================================================
// VERSION & MODULE INFO
// ============================================================================

var VERSION = "0.1.0-20251122";
var __moduleLoadStart = Date.now();

if (typeof exports === 'undefined') {
    var exports = {};
}

// ============================================================================
// LOGGING
// ============================================================================

function log(message) {
    print(message);
}

log("\n");
log("=".repeat(60) + "\n");
log("OVMS Smart Charging Scheduler v" + VERSION + "\n");
log("(Core function - rock solid foundation)\n");
log("=".repeat(60) + "\n");

// ============================================================================
// CONFIGURATION
// ============================================================================

var config = {
    // Cheap electricity window (24-hour format)
    windowStart: { hour: 23, minute: 30 },
    windowEnd: { hour: 5, minute: 30 },
    
    // Charging target SOC
    targetSOC: 80,
    
    // Scheduler enabled/disabled
    enabled: true
};

// Monitoring state (not persisted)
var monitoring = false;

// ============================================================================
// PERSISTENCE
// ============================================================================

function loadConfig() {
    log("[LOAD] Loading configuration...\n");
    
    try {
        // Load window start
        var startHour = OvmsConfig.Get("usr", "charging.window.start.hour");
        if (startHour && startHour !== "") {
            var h = parseInt(startHour);
            if (!isNaN(h)) {
                config.windowStart.hour = h;
            }
        }
        
        var startMin = OvmsConfig.Get("usr", "charging.window.start.minute");
        if (startMin && startMin !== "") {
            var m = parseInt(startMin);
            if (!isNaN(m)) {
                config.windowStart.minute = m;
            }
        }
        
        // Load window end
        var endHour = OvmsConfig.Get("usr", "charging.window.end.hour");
        if (endHour && endHour !== "") {
            var h = parseInt(endHour);
            if (!isNaN(h)) {
                config.windowEnd.hour = h;
            }
        }
        
        var endMin = OvmsConfig.Get("usr", "charging.window.end.minute");
        if (endMin && endMin !== "") {
            var m = parseInt(endMin);
            if (!isNaN(m)) {
                config.windowEnd.minute = m;
            }
        }
        
        log("[LOAD] Window: " + pad(config.windowStart.hour) + ":" + 
            pad(config.windowStart.minute) + " to " +
            pad(config.windowEnd.hour) + ":" + pad(config.windowEnd.minute) + "\n");
        
        // Load target SOC
        var target = OvmsConfig.Get("usr", "charging.target.soc");
        if (target && target !== "") {
            var t = parseInt(target);
            if (!isNaN(t) && t >= 20 && t <= 100) {
                config.targetSOC = t;
            }
        }
        log("[LOAD] Target SOC: " + config.targetSOC + "%\n");
        
        // Load enabled state
        var enabled = OvmsConfig.Get("usr", "charging.enabled");
        if (enabled && enabled !== "") {
            config.enabled = (enabled === "true");
        }
        log("[LOAD] Scheduler: " + (config.enabled ? "ENABLED" : "DISABLED") + "\n");
        
        log("[LOAD] Configuration loaded\n");
        
    } catch (e) {
        log("[LOAD] Error: " + e + "\n");
        log("[LOAD] Using defaults\n");
    }
}

function saveValue(key, value) {
    try {
        OvmsConfig.Set("usr", key, String(value));
    } catch (e) {
        log("[SAVE] Error saving " + key + ": " + e + "\n");
    }
}

// ============================================================================
// UTILITIES
// ============================================================================

function pad(num) {
    if (num < 10) {
        return "0" + num;
    }
    return String(num);
}

function getMetric(name, defaultValue) {
    try {
        if (OvmsMetrics.HasValue(name)) {
            return OvmsMetrics.AsFloat(name);
        }
    } catch (e) {
        log("[METRIC] Error reading " + name + ": " + e + "\n");
    }
    return defaultValue;
}

function notify(type, subtype, message) {
    try {
        OvmsNotify.Raise(type, subtype, message);
    } catch (e) {
        log("[NOTIFY] Error: " + e + "\n");
    }
}

// ============================================================================
// SOC MONITORING (Core Function)
// ============================================================================

/**
 * Monitor SOC and stop at target
 * Called every 60 seconds while charging
 */
function monitorSOC() {
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", 0);
    var power = getMetric("v.c.power", 0);
    
    log("[MONITOR] SOC: " + soc + "%, Power: " + power + " kW, Charging: " + charging + "\n");
    
    // If not charging, stop monitoring
    if (charging === 0) {
        log("[MONITOR] Not charging, will stop monitoring\n");
        return;
    }
    
    // Check if target reached
    if (soc >= config.targetSOC) {
        log("[MONITOR] *** TARGET REACHED *** " + soc + "% >= " + config.targetSOC + "%\n");
        stopCharge("target reached");
    }
}

/**
 * Start SOC monitoring
 */
function startMonitoring() {
    if (!monitoring) {
        try {
            PubSub.subscribe("ticker.60", monitorSOC);
            monitoring = true;
            log("[MONITOR] Started SOC monitoring\n");
        } catch (e) {
            log("[MONITOR] Error starting: " + e + "\n");
        }
    }
}

/**
 * Stop SOC monitoring
 */
function stopMonitoring() {
    if (monitoring) {
        try {
            PubSub.unsubscribe("ticker.60", monitorSOC);
            monitoring = false;
            log("[MONITOR] Stopped SOC monitoring\n");
        } catch (e) {
            log("[MONITOR] Error stopping: " + e + "\n");
        }
    }
}

// ============================================================================
// CHARGING CONTROL
// ============================================================================

/**
 * Start charging
 */
function startCharge(reason) {
    log("\n[START] Starting charge (" + reason + ")\n");
    
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", 0);
    var plugged = getMetric("v.c.pilot", 0);
    
    if (plugged === 0) {
        log("[START] Not plugged in\n");
        return false;
    }
    
    if (charging !== 0) {
        log("[START] Already charging\n");
        return false;
    }
    
    if (soc >= config.targetSOC) {
        log("[START] Already at target (" + soc + "% >= " + config.targetSOC + "%)\n");
        return false;
    }
    
    try {
        var result = OvmsCommand.Exec("charge start");
        log("[START] Command result: " + result + "\n");
        log("[START] Will monitor and stop at " + config.targetSOC + "%\n");
        
        notify("info", "charge.start", "Charge started: " + soc + "% -> " + config.targetSOC + "%");
        
        // Monitoring will be started by vehicle.charge.start event
        return true;
        
    } catch (e) {
        log("[START] Error: " + e + "\n");
        return false;
    }
}

/**
 * Stop charging
 */
function stopCharge(reason) {
    log("\n[STOP] Stopping charge (" + reason + ")\n");
    
    var charging = getMetric("v.c.charging", 0);
    if (charging === 0) {
        log("[STOP] Not charging\n");
        return true;
    }
    
    var soc = getMetric("v.b.soc", 0);
    
    try {
        var result = OvmsCommand.Exec("charge stop");
        log("[STOP] Command result: " + result + "\n");
        log("[STOP] Final SOC: " + soc + "%\n");
        
        notify("info", "charge.stop", "Charge stopped at " + soc + "%");
        
        // Monitoring will be stopped by vehicle.charge.stop event
        return true;
        
    } catch (e) {
        log("[STOP] Error: " + e + "\n");
        return false;
    }
}

// ============================================================================
// SCHEDULE CHECKING
// ============================================================================

/**
 * Check if currently in cheap window
 */
function inWindow() {
    var now = new Date();
    var currentMin = now.getHours() * 60 + now.getMinutes();
    
    var startMin = config.windowStart.hour * 60 + config.windowStart.minute;
    var endMin = config.windowEnd.hour * 60 + config.windowEnd.minute;
    
    if (startMin > endMin) {
        // Overnight window (e.g., 23:30 to 05:30)
        return (currentMin >= startMin || currentMin < endMin);
    } else {
        // Same-day window
        return (currentMin >= startMin && currentMin < endMin);
    }
}

/**
 * Check schedule and start charge if needed
 * Called every 5 minutes by ticker.300
 */
function checkSchedule() {
    if (!config.enabled) {
        return;
    }
    
    var now = new Date();
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", 0);
    var plugged = getMetric("v.c.pilot", 0);
    
    log("\n[SCHEDULE] Check at " + pad(now.getHours()) + ":" + pad(now.getMinutes()) + "\n");
    log("[SCHEDULE] SOC: " + soc + "%, Charging: " + charging + ", Plugged: " + plugged + "\n");
    
    var isInWindow = inWindow();
    log("[SCHEDULE] In cheap window: " + isInWindow + "\n");
    
    // Decision: Start if in window, plugged in, not charging, below target
    if (isInWindow && plugged !== 0 && charging === 0 && soc < config.targetSOC) {
        log("[SCHEDULE] *** AUTO-START *** Conditions met\n");
        startCharge("scheduled");
    } else {
        log("[SCHEDULE] No action needed\n");
    }
}

// ============================================================================
// USER COMMANDS
// ============================================================================

/**
 * Enable scheduler
 */
exports.enable = function() {
    config.enabled = true;
    saveValue("charging.enabled", "true");
    log("\n[CONFIG] Scheduler ENABLED\n");
    notify("info", "charging.config", "Scheduler enabled");
};

/**
 * Disable scheduler
 */
exports.disable = function() {
    config.enabled = false;
    saveValue("charging.enabled", "false");
    log("\n[CONFIG] Scheduler DISABLED\n");
    notify("info", "charging.config", "Scheduler disabled");
};

/**
 * Set target SOC
 */
exports.setTarget = function(target) {
    if (typeof target !== "number" || target < 20 || target > 100) {
        log("\n[CONFIG] Error: Target must be 20-100\n");
        return false;
    }
    
    config.targetSOC = target;
    saveValue("charging.target.soc", String(target));
    
    log("\n[CONFIG] Target SOC set to " + target + "% [SAVED]\n");
    notify("info", "charging.config", "Target SOC: " + target + "%");
    return true;
};

/**
 * Set cheap rate window
 */
exports.setWindow = function(startHour, startMin, endHour, endMin) {
    if (startHour < 0 || startHour > 23 || endHour < 0 || endHour > 23 ||
        startMin < 0 || startMin > 59 || endMin < 0 || endMin > 59) {
        log("\n[CONFIG] Error: Invalid time values\n");
        return false;
    }
    
    config.windowStart.hour = startHour;
    config.windowStart.minute = startMin;
    config.windowEnd.hour = endHour;
    config.windowEnd.minute = endMin;
    
    saveValue("charging.window.start.hour", String(startHour));
    saveValue("charging.window.start.minute", String(startMin));
    saveValue("charging.window.end.hour", String(endHour));
    saveValue("charging.window.end.minute", String(endMin));
    
    log("\n[CONFIG] Window: " + pad(startHour) + ":" + pad(startMin) +
        " to " + pad(endHour) + ":" + pad(endMin) + " [SAVED]\n");
    
    notify("info", "charging.config", "Window updated");
    return true;
};

/**
 * Show status
 */
exports.status = function() {
    var now = new Date();
    var soc = getMetric("v.b.soc", 0);
    var charging = getMetric("v.c.charging", 0);
    var plugged = getMetric("v.c.pilot", 0);
    var temp = getMetric("v.b.temp", 0);
    
    log("\n");
    log("=".repeat(60) + "\n");
    log("OVMS Smart Charging v" + VERSION + "\n");
    log("=".repeat(60) + "\n");
    log("Time: " + now.toISOString() + "\n\n");
    
    log("Scheduler: " + (config.enabled ? "ENABLED" : "DISABLED") + "\n\n");
    
    log("Configuration:\n");
    log("  Cheap window: " + pad(config.windowStart.hour) + ":" + 
        pad(config.windowStart.minute) + " to " +
        pad(config.windowEnd.hour) + ":" + pad(config.windowEnd.minute) + "\n");
    log("  Target SOC: " + config.targetSOC + "%\n");
    log("  In window now: " + (inWindow() ? "YES" : "NO") + "\n\n");
    
    log("Vehicle:\n");
    log("  SOC: " + soc + "%\n");
    log("  Charging: " + (charging ? "YES" : "NO") + "\n");
    log("  Plugged in: " + (plugged ? "YES" : "NO") + "\n");
    log("  Battery temp: " + temp + " C\n");
    log("  Monitoring: " + (monitoring ? "ACTIVE" : "INACTIVE") + "\n\n");
    
    log("Next scheduled check: ticker.300 (every 5 minutes)\n");
    log("\n");
};

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * When vehicle starts charging (manual OR scheduled)
 * Start monitoring SOC
 */
PubSub.subscribe("vehicle.charge.start", function() {
    log("\n[EVENT] Charge started\n");
    startMonitoring();
});

/**
 * When vehicle stops charging
 * Stop monitoring SOC
 */
PubSub.subscribe("vehicle.charge.stop", function() {
    log("\n[EVENT] Charge stopped\n");
    stopMonitoring();
});

/**
 * Schedule checker - runs every 5 minutes
 */
PubSub.subscribe("ticker.300", checkSchedule);

// ============================================================================
// INITIALIZATION
// ============================================================================

loadConfig();

var loadTime = Date.now() - __moduleLoadStart;
log("[INIT] Loaded in " + loadTime + " ms\n");
log("[INIT] Scheduler: " + (config.enabled ? "ENABLED" : "DISABLED") + "\n");
log("[INIT] Ready\n");
log("=".repeat(60) + "\n\n");