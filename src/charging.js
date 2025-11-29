/**
 * OVMS Smart Charging System v1.0.0
 * 
 * PURPOSE: Schedule charging during cheap electricity rate window,
 *          stop automatically at target SOC using native OVMS control.
 * 
 * BREAKTHROUGH: Uses native OVMS charge control (autocharge + suffsoc)
 *               eliminating need for custom SOC monitoring!
 * 
 * Vehicle: Nissan ENV200 / Leaf
 * OVMS: v3 Module
 * Tariff: Intelligent Octopus Go (UK) or similar time-of-use tariff
 * 
 * PROVEN APPROACH:
 * - ticker.300 (5-minute) schedule checking (from v0.1.0 - stable)
 * - Native OVMS SOC control (2025-11-23 discovery - perfect accuracy)
 * - Simple time window logic (from v0.1.0 - works across midnight)
 * - CONFIG_PARAMS structure (from v3.1.0 - well organized)
 * 
 * CRITICAL REQUIREMENTS:
 * 1. Must have "config set xnl autocharge yes" for native SOC control
 * 2. Uses correct OVMS commands ("charge start" not "xnl charge start")
 * 3. NO setInterval() - causes OVMS crashes
 * 4. NO long setTimeout() - unreliable
 * 
 * Author: OVMS Community
 * Date: 2025-11-23
 * License: MIT
 */

// ============================================================================
// VERSION INFO
// ============================================================================

var VERSION = "1.1.0";
var BUILD_DATE = "2025-11-23";

// ============================================================================
// CONFIGURATION PARAMETERS
// ============================================================================

var CONFIG_PARAMS = {
  // Charging targets
  target_soc: { param: "usr", instance: "charging.target_soc", default: 80 },
  
  // Cheap electricity window (24-hour format)
  cheap_start_hour: { param: "usr", instance: "charging.cheap_start_hour", default: 23 },
  cheap_start_minute: { param: "usr", instance: "charging.cheap_start_minute", default: 30 },
  cheap_end_hour: { param: "usr", instance: "charging.cheap_end_hour", default: 5 },
  cheap_end_minute: { param: "usr", instance: "charging.cheap_end_minute", default: 30 },
  
  // Electricity rates (£/kWh)
  cheap_rate: { param: "usr", instance: "charging.cheap_rate", default: 0.07 },
  standard_rate: { param: "usr", instance: "charging.standard_rate", default: 0.292 },
  
  // Charger specification (kW)
  charger_rate: { param: "usr", instance: "charging.charger_rate", default: 1.8 },
  
  // Battery overrides (0 = auto-detect)
  battery_override: { param: "usr", instance: "charging.battery_override", default: 0 },
  soh_override: { param: "usr", instance: "charging.soh_override", default: 0 }
};

// ============================================================================
// STATE (Runtime, not persisted)
// ============================================================================

var state = {
  ticker_subscription: null,
  scheduled_charge_active: false,
  manual_override: false
};

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Get configuration value with fallback to default
 */
function getConfig(key) {
  var cfg = CONFIG_PARAMS[key];
  if (!cfg) return null;
  
  var value = OvmsConfig.Get(cfg.param, cfg.instance);
  
  // Return default if value is undefined, empty string, or would parse to NaN
  if (value === undefined || value === "" || value === null) {
    return cfg.default;
  }
  
  return value;
}

/**
 * Check if scheduling is enabled
 */
function isSchedulingEnabled() {
  var enabled = OvmsConfig.Get("usr", "charging.enabled");
  // Default to true if not set (enabled by default)
  return (enabled === undefined || enabled === "" || enabled === "true");
}

/**
 * Set configuration value
 */
function setConfig(key, value) {
  var cfg = CONFIG_PARAMS[key];
  if (!cfg) return false;
  
  OvmsConfig.Set(cfg.param, cfg.instance, String(value));
  return true;
}

/**
 * Get current SOC percentage
 */
function getSOC() {
  return OvmsMetrics.AsFloat("v.b.soc") || 0;
}

/**
 * Check if vehicle is plugged in
 */
function isPluggedIn() {
  var pilot = OvmsMetrics.Value("v.c.pilot");
  // Handle different formats: "yes", true, 1
  return (pilot === "yes" || pilot === true || pilot === "1" || pilot === 1);
}

/**
 * Check if currently charging
 */
function isCharging() {
  var charging = OvmsMetrics.Value("v.c.charging");
  // Handle different formats: "yes", true, 1
  return (charging === "yes" || charging === true || charging === "1" || charging === 1);
}

/**
 * Get battery parameters (capacity, SOH)
 */
function getBatteryParams() {
  var nominal_capacity = OvmsMetrics.AsFloat("v.b.capacity") || 40; // ENV200 default
  
  var soh = OvmsMetrics.AsFloat("v.b.soh");
  if (!soh || soh === 0) soh = 100;
  
  var soh_override = parseFloat(getConfig("soh_override"));
  var battery_override = parseFloat(getConfig("battery_override"));
  
  var effective_soh = (soh_override > 0) ? soh_override : soh;
  var effective_capacity = (battery_override > 0) ? 
    battery_override : (nominal_capacity * effective_soh / 100);
  
  return {
    nominal_capacity: nominal_capacity,
    effective_capacity: effective_capacity,
    soh: effective_soh
  };
}

/**
 * Get current minute of day (0-1439)
 * Simple approach from v0.1.0 - works perfectly
 */
function getCurrentMinuteOfDay() {
  var now = new Date();
  return now.getHours() * 60 + now.getMinutes();
}

/**
 * Format time as HH:MM
 */
function formatTime(hour, minute) {
  var h = (hour < 10) ? "0" + hour : String(hour);
  var m = (minute < 10) ? "0" + minute : String(minute);
  return h + ":" + m;
}

/**
 * Get timestamp for notifications
 */
function getTimestamp() {
  var now = new Date();
  var h = (now.getHours() < 10) ? "0" + now.getHours() : String(now.getHours());
  var m = (now.getMinutes() < 10) ? "0" + now.getMinutes() : String(now.getMinutes());
  return h + ":" + m;
}

/**
 * Send notification to OVMS app
 */
function notify(message) {
  var msg = "[" + getTimestamp() + "] " + message;
  print(msg + "\n");
  try {
    OvmsNotify.Raise("info", "charge.smart", msg);
  } catch (e) {
    // Notification failed, but we printed to console
  }
}

// ============================================================================
// TIME WINDOW LOGIC (v0.1.0 approach - simple and works!)
// ============================================================================

/**
 * Check if current time is within cheap electricity window
 * Handles overnight windows correctly (e.g., 23:30-05:30)
 */
function isWithinWindow() {
  var now = getCurrentMinuteOfDay();
  
  var start_hour = parseInt(getConfig("cheap_start_hour"));
  var start_minute = parseInt(getConfig("cheap_start_minute"));
  var end_hour = parseInt(getConfig("cheap_end_hour"));
  var end_minute = parseInt(getConfig("cheap_end_minute"));
  
  var start = start_hour * 60 + start_minute;
  var end = end_hour * 60 + end_minute;
  
  if (start < end) {
    // Same day window (e.g., 09:00-17:00)
    return now >= start && now < end;
  } else {
    // Overnight window (e.g., 23:30-05:30)
    return now >= start || now < end;
  }
}

// ============================================================================
// COST CALCULATION (v1.1.0 - Future-proof for v1.2.0)
// ============================================================================

/**
 * Convert time (hours, minutes) to minutes since midnight
 */
function timeToMinutes(hour, minute) {
  return hour * 60 + minute;
}

/**
 * Get window duration in hours
 */
function getWindowDurationHours() {
  var start_hour = parseInt(getConfig("cheap_start_hour"));
  var start_minute = parseInt(getConfig("cheap_start_minute"));
  var end_hour = parseInt(getConfig("cheap_end_hour"));
  var end_minute = parseInt(getConfig("cheap_end_minute"));
  
  var start_minutes = timeToMinutes(start_hour, start_minute);
  var end_minutes = timeToMinutes(end_hour, end_minute);
  
  var duration_minutes;
  if (start_minutes < end_minutes) {
    // Same day window
    duration_minutes = end_minutes - start_minutes;
  } else {
    // Overnight window
    duration_minutes = (24 * 60) - start_minutes + end_minutes;
  }
  
  return duration_minutes / 60;
}

/**
 * Calculate cost for charging between start and end times
 * Future-proof: works for both fixed schedule (v1.0) and ready-by (v1.2)
 * 
 * @param start_minutes - Start time in minutes since midnight
 * @param end_minutes - End time in minutes since midnight  
 * @param kwh_needed - Total kWh to charge
 * @return Object with cost breakdown
 */
function calculateCostForTimeRange(start_minutes, end_minutes, kwh_needed) {
  var cheap_rate = parseFloat(getConfig("cheap_rate"));
  var standard_rate = parseFloat(getConfig("standard_rate"));
  
  var window_start_hour = parseInt(getConfig("cheap_start_hour"));
  var window_start_minute = parseInt(getConfig("cheap_start_minute"));
  var window_end_hour = parseInt(getConfig("cheap_end_hour"));
  var window_end_minute = parseInt(getConfig("cheap_end_minute"));
  
  var window_start = timeToMinutes(window_start_hour, window_start_minute);
  var window_end = timeToMinutes(window_end_hour, window_end_minute);
  
  // Handle overnight charging (spans midnight)
  var total_minutes = end_minutes - start_minutes;
  if (total_minutes < 0) {
    total_minutes += (24 * 60); // Add 24 hours
  }
  
  // Calculate overlap with cheap window
  var cheap_minutes = 0;
  var pre_window_minutes = 0;
  var post_window_minutes = 0;
  
  // Handle overnight window crossing midnight
  var in_window_start = false;
  var in_window_end = false;
  
  if (window_start < window_end) {
    // Normal window (same day)
    in_window_start = (start_minutes >= window_start && start_minutes < window_end);
    in_window_end = (end_minutes > window_start && end_minutes <= window_end);
  } else {
    // Overnight window
    in_window_start = (start_minutes >= window_start || start_minutes < window_end);
    in_window_end = (end_minutes >= window_start || end_minutes < window_end);
  }
  
  // Simplified calculation (proportional distribution)
  if (in_window_start && in_window_end) {
    // All charging in window
    cheap_minutes = total_minutes;
  } else if (!in_window_start && !in_window_end) {
    // All outside window
    if (start_minutes < window_start) {
      pre_window_minutes = total_minutes;
    } else {
      post_window_minutes = total_minutes;
    }
  } else {
    // Spans window boundaries - approximate proportionally
    var window_duration = getWindowDurationHours() * 60;
    
    if (start_minutes < window_start) {
      // Starts before window
      pre_window_minutes = window_start - start_minutes;
      var remaining = total_minutes - pre_window_minutes;
      cheap_minutes = Math.min(remaining, window_duration);
      post_window_minutes = Math.max(0, remaining - cheap_minutes);
    } else {
      // Starts in window, ends after
      cheap_minutes = window_end - start_minutes;
      if (cheap_minutes < 0) cheap_minutes += (24 * 60);
      post_window_minutes = total_minutes - cheap_minutes;
    }
  }
  
  // Convert minutes to kWh (proportional)
  var kwh_rate = kwh_needed / total_minutes;
  var pre_kwh = (kwh_rate * pre_window_minutes) || 0;
  var cheap_kwh = (kwh_rate * cheap_minutes) || 0;
  var post_kwh = (kwh_rate * post_window_minutes) || 0;
  
  // Calculate costs
  var pre_cost = pre_kwh * standard_rate;
  var cheap_cost = cheap_kwh * cheap_rate;
  var post_cost = post_kwh * standard_rate;
  var total_cost = pre_cost + cheap_cost + post_cost;
  
  // Calculate savings vs all standard rate
  var standard_cost = kwh_needed * standard_rate;
  var savings = standard_cost - total_cost;
  
  return {
    pre_window_kwh: pre_kwh,
    cheap_window_kwh: cheap_kwh,
    post_window_kwh: post_kwh,
    pre_window_cost: pre_cost,
    cheap_window_cost: cheap_cost,
    post_window_cost: post_cost,
    total_cost: total_cost,
    savings: savings,
    has_overflow: (pre_kwh > 0 || post_kwh > 0)
  };
}

/**
 * Calculate charging cost for current fixed schedule (v1.0.0 behavior)
 */
function calculateScheduledChargeCost() {
  var soc = getSOC();
  var target = parseInt(getConfig("target_soc")) || 80;
  var battery = getBatteryParams();
  var charger_rate = parseFloat(getConfig("charger_rate"));
  
  // How much energy needed?
  var kwh_needed = battery.effective_capacity * (target - soc) / 100;
  
  // How long will it take?
  var charge_hours = kwh_needed / charger_rate;
  
  // When would we start? (window start)
  var start_hour = parseInt(getConfig("cheap_start_hour"));
  var start_minute = parseInt(getConfig("cheap_start_minute"));
  var start_minutes = timeToMinutes(start_hour, start_minute);
  
  // When would we finish?
  var end_minutes = start_minutes + (charge_hours * 60);
  
  // Calculate cost
  return calculateCostForTimeRange(start_minutes, end_minutes, kwh_needed);
}

// ============================================================================
// CHARGING CONTROL
// ============================================================================

/**
 * Start charging (simplified - native OVMS handles stopping)
 */
function startCharging() {
  var target = parseInt(getConfig("target_soc")) || 80;
  
  print("Starting charge to " + target + "%\n");
  
  OvmsCommand.Exec("config set xnl autocharge yes");
  OvmsCommand.Exec("config set xnl suffsoc " + target);
  OvmsCommand.Exec("charge start");
  
  notify("Charging started. Target " + target + "% (OVMS will stop automatically)");
  
  state.scheduled_charge_active = true;
}

/**
 * Stop charging
 */
function stopCharging() {
  print("Stopping charge\n");
  OvmsCommand.Exec("charge stop");
  
  state.scheduled_charge_active = false;
  state.manual_override = false;
}

// ============================================================================
// SCHEDULE CHECKING (v0.1.0 approach - ticker.300 = every 5 minutes)
// ============================================================================

/**
 * Check if should charge based on current conditions
 */
function shouldCharge() {
  var soc = getSOC();
  var target = parseInt(getConfig("target_soc")) || 80;
  
  // Only charge if below target
  if (soc >= target) {
    print("Already at target (" + soc.toFixed(0) + "% >= " + target + "%)\n");
    return false;
  }
  
  return true;
}

/**
 * Check schedule and start charging if conditions are met
 * Called every 5 minutes by ticker.300
 */
function checkSchedule() {
  // Must be plugged in
  if (!isPluggedIn()) {
    return;
  }
  
  // Don't interfere with manual charging
  if (state.manual_override) {
    return;
  }
  
  // Already charging on schedule
  if (state.scheduled_charge_active && isCharging()) {
    return;
  }
  
  // Scheduling must be enabled
  if (!isSchedulingEnabled()) {
    return;
  }
  
  // Check if within cheap window
  if (!isWithinWindow()) {
    return;
  }
  
  // Check if should charge
  if (!shouldCharge()) {
    return;
  }
  
  // All conditions met - start charging!
  print("Schedule check: Starting charge (within cheap window)\n");
  
  var target = parseInt(getConfig("target_soc")) || 80;
  OvmsCommand.Exec("config set xnl autocharge yes");
  OvmsCommand.Exec("config set xnl suffsoc " + target);
  OvmsCommand.Exec("charge start");
  
  notify("Charging started (scheduled). Target " + target + "%");
  state.scheduled_charge_active = true;
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle vehicle plug-in
 * Vehicle will auto-start charging - we stop it if needed
 */
function onPlugIn() {
  print("Vehicle plugged in\n");
  
  var soc = getSOC();
  var target = parseInt(getConfig("target_soc")) || 80;
  
  // Check if already at target
  if (soc >= target) {
    notify("Plugged in at " + soc.toFixed(0) + "%. Already at target " + target + "%.");
    OvmsCommand.Exec("charge stop");
    return;
  }
  
  // Check if scheduling is disabled
  if (!isSchedulingEnabled()) {
    notify("Plugged in at " + soc.toFixed(0) + "%. Charging to " + target + "% (schedule disabled)");
    // Configure suffsoc for auto-stop
    OvmsCommand.Exec("config set xnl autocharge yes");
    OvmsCommand.Exec("config set xnl suffsoc " + target);
    return;
  }
  
  // Scheduling is enabled - check if in window
  var start_hour = parseInt(getConfig("cheap_start_hour")) || 23;
  var start_minute = parseInt(getConfig("cheap_start_minute")) || 30;
  var end_hour = parseInt(getConfig("cheap_end_hour")) || 5;
  var end_minute = parseInt(getConfig("cheap_end_minute")) || 30;
  
  var window_str = formatTime(start_hour, start_minute) + "-" + formatTime(end_hour, end_minute);
  
  if (isWithinWindow()) {
    // In cheap window - configure and let it charge
    print("Plugged in during cheap window - allowing charge\n");
    OvmsCommand.Exec("config set xnl autocharge yes");
    OvmsCommand.Exec("config set xnl suffsoc " + target);
    notify("Plugged in at " + soc.toFixed(0) + "%. Charging to " + target + "% now.");
  } else {
    // Outside window - stop it and wait for schedule
    print("Plugged in outside cheap window - stopping charge\n");
    OvmsCommand.Exec("charge stop");
    
    // Calculate and show cost estimate
    var cost_info = calculateScheduledChargeCost();
    var battery = getBatteryParams();
    var kwh_needed = battery.effective_capacity * (target - soc) / 100;
    var charger_rate = parseFloat(getConfig("charger_rate"));
    var charge_hours = kwh_needed / charger_rate;
    
    var message = "Plugged in at " + soc.toFixed(0) + "%. Will charge to " + target + "% during " + window_str + ".\n";
    message += "Need " + kwh_needed.toFixed(1) + " kWh (~" + charge_hours.toFixed(1) + "h).\n";
    message += "Est. cost: £" + cost_info.total_cost.toFixed(2);
    
    if (cost_info.has_overflow) {
      message += " ⚠️\n";
      if (cost_info.pre_window_kwh > 0) {
        message += "PRE-WINDOW: " + cost_info.pre_window_kwh.toFixed(1) + " kWh @ £" + cost_info.pre_window_cost.toFixed(2) + "\n";
      }
      if (cost_info.cheap_window_kwh > 0) {
        message += "CHEAP: " + cost_info.cheap_window_kwh.toFixed(1) + " kWh @ £" + cost_info.cheap_window_cost.toFixed(2) + "\n";
      }
      if (cost_info.post_window_kwh > 0) {
        message += "OVERFLOW: " + cost_info.post_window_kwh.toFixed(1) + " kWh @ £" + cost_info.post_window_cost.toFixed(2);
      }
    } else {
      message += " (saving £" + cost_info.savings.toFixed(2) + ")";
    }
    
    notify(message);
  }
}

/**
 * Handle vehicle unplug
 */
function onUnplug() {
  print("Vehicle unplugged\n");
  
  state.scheduled_charge_active = false;
  state.manual_override = false;
  
  notify("Vehicle unplugged. Schedule cleared.");
}

/**
 * Handle charging stopped (target reached or manually stopped)
 */
function onChargeStop() {
  print("Charging stopped (event)\n");
  
  state.scheduled_charge_active = false;
}

// ============================================================================
// INITIALIZATION
// ============================================================================

/**
 * Initialize charging system
 */
function initialize() {
  print("\n");
  print("============================================================\n");
  print("OVMS Smart Charging v" + VERSION + "\n");
  print("Build: " + BUILD_DATE + "\n");
  print("============================================================\n");
  
  // Note: We use native OVMS autocharge + suffsoc for stopping
  // Scheduling controls when to START charging
  print("Charge control: Native OVMS (autocharge + suffsoc)\n");
  
  // Subscribe to schedule checking (every 5 minutes)
  // Note: Doing this in a non-blocking way
  state.ticker_subscription = PubSub.subscribe("ticker.300", checkSchedule);
  print("Schedule monitoring: ticker.300 (every 5 minutes)\n");
  
  // Subscribe to vehicle events
  PubSub.subscribe("vehicle.charge.prepare", onPlugIn);
  PubSub.subscribe("vehicle.charge.pilot.off", onUnplug);
  PubSub.subscribe("vehicle.charge.stop", onChargeStop);
  print("Event subscriptions: ACTIVE\n");
  
  // Display current configuration
  var target = parseInt(getConfig("target_soc")) || 80;
  var start_h = parseInt(getConfig("cheap_start_hour")) || 23;
  var start_m = parseInt(getConfig("cheap_start_minute")) || 30;
  var end_h = parseInt(getConfig("cheap_end_hour")) || 5;
  var end_m = parseInt(getConfig("cheap_end_minute")) || 30;
  
  print("\n");
  print("Configuration:\n");
  print("  Target SOC: " + target + "%\n");
  print("  Cheap window: " + formatTime(start_h, start_m) + " - " + formatTime(end_h, end_m) + "\n");
  print("============================================================\n");
  print("Ready!\n\n");
}

// ============================================================================
// USER COMMANDS (from v3.1.0 - excellent API design)
// ============================================================================

// Initialize exports if not already defined
if (typeof exports === "undefined") {
  var exports = {};
}

/**
 * Initialize the system (exposed for manual init if needed)
 */
exports.init = initialize;

/**
 * Set target SOC percentage
 */
exports.setTarget = function(soc) {
  var target = parseInt(soc);
  if (target < 20 || target > 100) {
    return "Error: SOC must be 20-100";
  }
  
  setConfig("target_soc", target);
  
  // CRITICAL: Also update suffsoc to keep native OVMS in sync
  OvmsCommand.Exec("config set xnl suffsoc " + target);
  
  var msg = "Target SOC set to " + target + "%";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Set skip-if-above threshold
 */
/**
 * Set cheap electricity window
 */
exports.setWindow = function(startHour, startMin, endHour, endMin) {
  setConfig("cheap_start_hour", startHour);
  setConfig("cheap_start_minute", startMin);
  setConfig("cheap_end_hour", endHour);
  setConfig("cheap_end_minute", endMin);
  
  var msg = "Cheap window: " + formatTime(startHour, startMin) + " - " + formatTime(endHour, endMin);
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Set electricity rates
 */
exports.setRates = function(cheap, standard) {
  setConfig("cheap_rate", cheap);
  setConfig("standard_rate", standard);
  
  var msg = "Rates: £" + cheap + " (cheap), £" + standard + " (standard)";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Set charger power rating
 */
exports.setCharger = function(kw) {
  setConfig("charger_rate", kw);
  
  var msg = "Charger rate: " + kw + " kW";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Enable scheduled charging (wait for cheap window)
 */
exports.enable = function() {
  OvmsConfig.Set("usr", "charging.enabled", "true");
  var msg = "Scheduled charging ENABLED - will wait for cheap window";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Disable scheduled charging (charge immediately on plug-in)
 */
exports.disable = function() {
  OvmsConfig.Set("usr", "charging.enabled", "false");
  var msg = "Scheduled charging DISABLED - will charge immediately on plug-in";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Manual start charging (override schedule)
 */
exports.start = function() {
  var soc = getSOC();
  var plugged = isPluggedIn();
  var target = parseInt(getConfig("target_soc"));
  
  if (!plugged) {
    return "Error: Not plugged in";
  }
  
  if (soc >= target) {
    return "Already at target (" + soc.toFixed(0) + "% >= " + target + "%)";
  }
  
  state.manual_override = true;
  state.scheduled_charge_active = false;
  
  startCharging();
  
  return "Manual charge started: " + soc.toFixed(0) + "% -> " + target + "%";
};

/**
 * Stop charging
 */
exports.stop = function() {
  stopCharging();
  notify("Charging stopped (manual)");
  return "Charging stopped";
};

/**
 * Show current status
 */
exports.status = function() {
  var soc = getSOC();
  var battery = getBatteryParams();
  var plugged = isPluggedIn();
  var charging = isCharging();
  var target = parseInt(getConfig("target_soc")) || 80;
  
  var start_h = parseInt(getConfig("cheap_start_hour")) || 23;
  var start_m = parseInt(getConfig("cheap_start_minute")) || 30;
  var end_h = parseInt(getConfig("cheap_end_hour")) || 5;
  var end_m = parseInt(getConfig("cheap_end_minute")) || 30;
  
  var lines = [];
  lines.push("=== Smart Charging v" + VERSION + " ===");
  lines.push("");
  lines.push("Battery:");
  lines.push("  SOC: " + soc.toFixed(0) + "% (target " + target + "%)");
  lines.push("  SOH: " + battery.soh.toFixed(0) + "%");
  lines.push("  Capacity: " + battery.effective_capacity.toFixed(1) + " kWh");
  lines.push("");
  lines.push("Status:");
  lines.push("  Plugged in: " + (plugged ? "Yes" : "No"));
  lines.push("  Charging: " + (charging ? "Yes" : "No"));
  lines.push("");
  lines.push("Scheduling:");
  if (isSchedulingEnabled()) {
    lines.push("  Mode: Scheduled (wait for cheap window)");
    lines.push("  Cheap window: " + formatTime(start_h, start_m) + " - " + formatTime(end_h, end_m));
    lines.push("  In window now: " + (isWithinWindow() ? "Yes" : "No"));
  } else {
    lines.push("  Mode: Immediate (charge on plug-in)");
  }
  lines.push("");
  lines.push("Native OVMS Control:");
  var autocharge = OvmsConfig.Get("xnl", "autocharge") || "no";
  var suffsoc = OvmsConfig.Get("xnl", "suffsoc") || "0";
  lines.push("  autocharge: " + autocharge);
  lines.push("  suffsoc: " + suffsoc + "%");
  
  // Add cost estimate if plugged in and below target
  if (plugged && soc < target && isSchedulingEnabled()) {
    lines.push("");
    lines.push("Cost Estimate:");
    
    var cost_info = calculateScheduledChargeCost();
    var kwh_needed = battery.effective_capacity * (target - soc) / 100;
    var charger_rate = parseFloat(getConfig("charger_rate"));
    var charge_hours = kwh_needed / charger_rate;
    
    lines.push("  Need: " + kwh_needed.toFixed(1) + " kWh (~" + charge_hours.toFixed(1) + "h @ " + charger_rate.toFixed(1) + "kW)");
    lines.push("  Total cost: £" + cost_info.total_cost.toFixed(2));
    
    if (cost_info.has_overflow) {
      lines.push("  ⚠️ WARNING: Will extend past window end");
      if (cost_info.cheap_window_kwh > 0) {
        lines.push("    Cheap: " + cost_info.cheap_window_kwh.toFixed(1) + " kWh @ £" + cost_info.cheap_window_cost.toFixed(2));
      }
      if (cost_info.post_window_kwh > 0) {
        lines.push("    Overflow: " + cost_info.post_window_kwh.toFixed(1) + " kWh @ £" + cost_info.post_window_cost.toFixed(2));
      }
    } else {
      lines.push("  ✅ Will complete in cheap window");
      lines.push("  Saving: £" + cost_info.savings.toFixed(2) + " vs standard rate");
    }
  }
  
  var output = lines.join("\n");
  print(output + "\n");
  
  // Send FULL output as notification so it appears in app
  try {
    OvmsNotify.Raise("info", "charge.smart", output);
  } catch (e) {
    // Notification failed
  }
  
  return output;
};

/**
 * Get version info
 */
exports.version = function() {
  return "v" + VERSION + " (" + BUILD_DATE + ")";
};

// ============================================================================
// AUTO-INITIALIZE
// ============================================================================

// Initialize on module load (safe now - no blocking OvmsCommand.Exec)
initialize();

// Export for require()
if (typeof module !== "undefined") {
  module.exports = exports;
}
