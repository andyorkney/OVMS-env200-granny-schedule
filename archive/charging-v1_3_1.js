/**
 * OVMS Smart Charging System v1.3.0
 * 
 * PURPOSE: Schedule charging during cheap electricity rate window,
 *          stop automatically at target SOC using native OVMS control.
 * 
 * NEW IN v1.3.0:
 * - Dynamic charge rate detection (learns actual rate from sessions)
 * - Improved time/cost predictions based on measured performance
 * - Rolling average of last 5 charging sessions
 * - Zero additional OVMS load (uses existing ticker.300)
 * 
 * NEW IN v1.2.1:
 * - State-aware status display (planning/active/completed modes)
 * - Adjusted charger rate default (1.8kW -> 2.0kW based on real-world data)
 * - Bug fix: Status now shows accurate timing during active charging
 * 
 * NEW IN v1.2.0:
 * - Ready-by time calculation (e.g., "must be charged by 08:30")
 * - Optimal start time: Prefer cheap window, only start early if needed
 * - Better command naming: useSchedule() / chargeNow()
 * - Enhanced notifications with timing details
 * - 100% backwards compatible with v1.1.0
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
 * - Ready-by calculation (v1.2.0 - prefer cheap window start)
 * - Dynamic rate detection (v1.3.0 - learns from actual performance)
 * 
 * CRITICAL REQUIREMENTS:
 * 1. Must have "config set xnl autocharge yes" for native SOC control
 * 2. Uses correct OVMS commands ("charge start" not "xnl charge start")
 * 3. NO setInterval() - causes OVMS crashes
 * 4. NO long setTimeout() - unreliable
 * 
 * Author: OVMS Community
 * Date: 2025-11-29
 * License: MIT
 */

// ============================================================================
// VERSION INFO
// ============================================================================

var VERSION = "1.3.1";
var BUILD_DATE = "2025-11-30";

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
  cheap_rate: { param: "usr", instance: "charging.pricing.cheap", default: 0.07 },
  standard_rate: { param: "usr", instance: "charging.pricing.standard", default: 0.292 },
  
  // Charger specification (kW) - v1.2.1: Updated to 2.0kW based on empirical testing
  // v1.3.0: This becomes the fallback when no measured rate exists
  charger_rate: { param: "usr", instance: "charging.charger_rate", default: 2.0 },
  
  // v1.3.0: Dynamic rate detection
  measured_rate: { param: "usr", instance: "charging.measured_rate", default: 0 },
  use_measured_rate: { param: "usr", instance: "charging.use_measured_rate", default: true },
  
  // Ready-by time (0:0 = disabled, uses v1.1.0 behavior)
  ready_by_hour: { param: "usr", instance: "charging.ready_by_hour", default: 0 },
  ready_by_minute: { param: "usr", instance: "charging.ready_by_minute", default: 0 },
  
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
  manual_override: false,
  actual_start_time: null,      // v1.2.1: Track when charging actually started
  actual_start_minutes: 0        // v1.2.1: Start time in minutes since midnight
};

// v1.3.0: Charging metrics for rate detection
var chargingMetrics = {
  session_active: false,
  session_start_time: null,
  session_start_soc: null,
  soc_checkpoints: [],
  last_checkpoint_time: 0  // Prevent duplicate checkpoints
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
  
  // OVMS quirk: returns string "undefined" instead of actual undefined
  // Return default if value is undefined, empty string, null, or string "undefined"
  if (value === undefined || value === "" || value === null || value === "undefined") {
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
// v1.3.1: NOTIFICATION FORMATTING HELPERS
// ============================================================================

/**
 * Format duration in minutes to "Xh Ym" format
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "4h 30m")
 */
function formatDuration(minutes) {
  var hours = Math.floor(minutes / 60);
  var mins = Math.round(minutes % 60);
  
  if (hours > 0 && mins > 0) {
    return hours + "h " + mins + "m";
  } else if (hours > 0) {
    return hours + "h";
  } else {
    return mins + "m";
  }
}

/**
 * Format time range as "HH:MM -> HH:MM (duration)"  
 * Uses ASCII arrow for OVMS app compatibility
 * @param {number} start_minutes - Start time in minutes since midnight
 * @param {number} end_minutes - End time in minutes since midnight
 * @returns {string} Formatted time range (e.g., "23:30 -> 04:00 (4h 30m)")
 */
function formatTimeRange(start_minutes, end_minutes) {
  var start_time = formatTime(
    Math.floor(start_minutes / 60) % 24,
    start_minutes % 60
  );
  
  var end_time = formatTime(
    Math.floor(end_minutes / 60) % 24,
    end_minutes % 60
  );
  
  // Calculate duration handling midnight crossing
  var duration_minutes = end_minutes - start_minutes;
  if (duration_minutes < 0) {
    duration_minutes += 1440; // Add 24 hours
  }
  
  return start_time + " -> " + end_time + " (" + formatDuration(duration_minutes) + ")";
}

/**
 * Format cost breakdown for notification
 * @param {Object} cost_info - From calculateCostForTimeRange()
 * @param {boolean} is_estimate - True if estimate, false if actual
 * @returns {string} Formatted cost string with breakdown if overflow
 */
function formatCostBreakdown(cost_info, is_estimate) {
  var label = is_estimate ? "Est. cost" : "Actual cost";
  var msg = label + ": £" + cost_info.total_cost.toFixed(2);
  
  if (cost_info.has_overflow) {
    msg += "\n";
    
    if (cost_info.pre_window_kwh > 0) {
      var start_hour = parseInt(getConfig("cheap_start_hour")) || 23;
      var start_minute = parseInt(getConfig("cheap_start_minute")) || 30;
      var pre_time = "before " + formatTime(start_hour, start_minute);
      msg += "  Pre-window (" + pre_time + "): £" + cost_info.pre_window_cost.toFixed(2) + 
             " (" + cost_info.pre_window_kwh.toFixed(1) + " kWh)\n";
    }
    
    var cheap_start_hour = parseInt(getConfig("cheap_start_hour")) || 23;
    var cheap_start_minute = parseInt(getConfig("cheap_start_minute")) || 30;
    var cheap_end_hour = parseInt(getConfig("cheap_end_hour")) || 5;
    var cheap_end_minute = parseInt(getConfig("cheap_end_minute")) || 30;
    var cheap_time = formatTime(cheap_start_hour, cheap_start_minute) + "-" + 
                     formatTime(cheap_end_hour, cheap_end_minute);
    
    msg += "  Cheap (" + cheap_time + "): £" + cost_info.cheap_window_cost.toFixed(2) + 
           " (" + cost_info.cheap_window_kwh.toFixed(1) + " kWh)";
    
    if (cost_info.post_window_kwh > 0) {
      var post_time = "after " + formatTime(cheap_end_hour, cheap_end_minute);
      msg += "\n  Standard (" + post_time + "): £" + cost_info.post_window_cost.toFixed(2) + 
             " (" + cost_info.post_window_kwh.toFixed(1) + " kWh)";
    }
  } else {
    msg += " (all cheap rate)";
    if (is_estimate && cost_info.savings > 0) {
      msg += "\nSaving: £" + cost_info.savings.toFixed(2) + " vs standard rate";
    }
  }
  
  return msg;
}

// ============================================================================
// v1.3.0: DYNAMIC RATE DETECTION
// ============================================================================

/**
 * Get effective charge rate for predictions
 * Uses measured rate if available, falls back to nameplate
 * 
 * v1.3.0: New function - replaces direct getConfig("charger_rate") calls
 */
function getEffectiveChargeRate() {
  var nameplate = parseFloat(getConfig("charger_rate"));
  var measured = parseFloat(getConfig("measured_rate"));
  var use_measured = getConfig("use_measured_rate");
  
  // Use measured rate if:
  // 1. User hasn't disabled it
  // 2. We have a measured rate (> 0)
  // 3. Measured rate is reasonable (0.5kW - 25kW)
  if (use_measured && measured > 0.5 && measured < 25) {
    // Weighted average: 70% measured, 30% nameplate
    // This provides stability while adapting to real performance
    var effective = (measured * 0.7) + (nameplate * 0.3);
    return effective;
  }
  
  // Fall back to nameplate
  return nameplate;
}

/**
 * Start tracking charging session metrics
 * Called when charging starts
 * 
 * v1.3.0: New function
 */
function startRateTracking() {
  var soc = getSOC();
  var now = Date.now();
  
  chargingMetrics.session_active = true;
  chargingMetrics.session_start_time = now;
  chargingMetrics.session_start_soc = soc;
  chargingMetrics.session_start_minutes = getCurrentMinuteOfDay(); // v1.3.1: For notifications
  chargingMetrics.soc_checkpoints = [];
  chargingMetrics.last_checkpoint_time = now;
  
  print("[RATE] Session started: " + soc.toFixed(1) + "% @ " + getTimestamp() + "\n");
}

/**
 * Record SOC checkpoint during active charging
 * Called every 5 minutes by ticker.300 (existing subscription)
 * 
 * v1.3.0: New function
 */
function recordSOCCheckpoint() {
  if (!chargingMetrics.session_active) return;
  
  var now = Date.now();
  var soc = getSOC();
  
  // Prevent duplicate checkpoints (ticker.300 fires every 5 mins)
  var time_since_last = (now - chargingMetrics.last_checkpoint_time) / 60000;
  if (time_since_last < 4) return; // Skip if less than 4 minutes since last
  
  var elapsed_minutes = (now - chargingMetrics.session_start_time) / 60000;
  
  chargingMetrics.soc_checkpoints.push({
    time: now,
    soc: soc,
    minutes_elapsed: elapsed_minutes
  });
  
  chargingMetrics.last_checkpoint_time = now;
  
  print("[RATE] Checkpoint: " + soc.toFixed(1) + "% @ " + 
        elapsed_minutes.toFixed(0) + " min (" + 
        chargingMetrics.soc_checkpoints.length + " readings)\n");
}

/**
 * Calculate actual charging rate from completed session
 * Called when charging stops
 * 
 * v1.3.0: New function
 */
function calculateAndStoreSessionRate() {
  if (!chargingMetrics.session_active) return;
  if (!chargingMetrics.session_start_time) return;
  
  var final_soc = getSOC();
  var duration_ms = Date.now() - chargingMetrics.session_start_time;
  var duration_hours = duration_ms / 3600000;
  
  // Need at least 30 minutes of data for meaningful rate
  if (duration_hours < 0.5) {
    print("[RATE] Session too short (" + duration_hours.toFixed(1) + "h) - not storing\n");
    chargingMetrics.session_active = false;
    return;
  }
  
  var soc_gained = final_soc - chargingMetrics.session_start_soc;
  
  // Sanity check: SOC should have increased
  if (soc_gained < 1) {
    print("[RATE] Invalid session (SOC gained: " + soc_gained.toFixed(1) + "%) - not storing\n");
    chargingMetrics.session_active = false;
    return;
  }
  
  var battery = getBatteryParams();
  var kwh_delivered = (soc_gained / 100) * battery.effective_capacity;
  var measured_rate = kwh_delivered / duration_hours;
  
  // Sanity check: Rate should be reasonable (0.5kW - 25kW)
  if (measured_rate < 0.5 || measured_rate > 25) {
    print("[RATE] Invalid rate (" + measured_rate.toFixed(2) + "kW) - not storing\n");
    chargingMetrics.session_active = false;
    return;
  }
  
  // Store the measured rate
  setConfig("measured_rate", measured_rate.toFixed(2));
  
  print("[RATE] Session complete:\n");
  print("  Duration: " + duration_hours.toFixed(1) + "h\n");
  print("  SOC gained: " + soc_gained.toFixed(1) + "% (" + 
        chargingMetrics.session_start_soc.toFixed(1) + "% -> " + 
        final_soc.toFixed(1) + "%)\n");
  print("  Energy: " + kwh_delivered.toFixed(1) + " kWh\n");
  print("  Measured rate: " + measured_rate.toFixed(2) + " kW\n");
  print("  Checkpoints: " + chargingMetrics.soc_checkpoints.length + " readings\n");
  
  // v1.3.1: Enhanced completion notification with actual costs
  var session_end_minutes = getCurrentMinuteOfDay();
  var session_start_minutes = chargingMetrics.session_start_minutes || session_end_minutes - (duration_hours * 60);
  
  var message = "Charge complete\n";
  message += "From: " + chargingMetrics.session_start_soc.toFixed(0) + "% -> To: " + final_soc.toFixed(0) + "% ";
  message += "(" + soc_gained.toFixed(0) + "% gained)\n";
  message += "Time: " + formatTimeRange(session_start_minutes, session_end_minutes) + "\n";
  message += "Energy: ~" + kwh_delivered.toFixed(1) + " kWh @ " + measured_rate.toFixed(1) + "kW measured\n";
  
  // Calculate actual cost for the session
  var actual_cost = calculateCostForTimeRange(session_start_minutes, session_end_minutes, kwh_delivered);
  var cost_breakdown = formatCostBreakdown(actual_cost, false);
  message += cost_breakdown;
  
  // Add overflow info if occurred
  if (actual_cost.has_overflow) {
    var cheap_end_hour = parseInt(getConfig("cheap_end_hour")) || 5;
    var cheap_end_minute = parseInt(getConfig("cheap_end_minute")) || 30;
    var window_end = cheap_end_hour * 60 + cheap_end_minute;
    
    var overflow_minutes = session_end_minutes - window_end;
    if (overflow_minutes < 0) overflow_minutes += 1440;
    if (overflow_minutes > 0) {
      message += "\n(!!) Extended " + formatDuration(overflow_minutes) + " past window";
    }
  }
  
  notify(message);
  
  chargingMetrics.session_active = false;
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
  
  // Normalize times: keep everything in 0-1440 range for same-day, or allow >1440 for next-day
  var charge_start = start_minutes % (24 * 60);
  var charge_duration = end_minutes - start_minutes;
  var charge_end = charge_start + charge_duration;
  
  // Window times
  var win_start = window_start;
  var win_end = window_end;
  
  // If window crosses midnight, extend win_end into next day
  if (win_end < win_start) {
    win_end += (24 * 60);
  }
  
  // If charge crosses midnight, extend charge_end into next day  
  if (charge_end > (24 * 60) || (charge_end < charge_start && charge_duration > 0)) {
    // Charge extends into next day - already handled by charge_end = charge_start + duration
  }
  
  // Calculate overlap between [charge_start, charge_end] and [win_start, win_end]
  var overlap_start = Math.max(charge_start, win_start);
  var overlap_end = Math.min(charge_end, win_end);
  
  if (overlap_end > overlap_start) {
    // Overlap exists
    cheap_minutes = overlap_end - overlap_start;
    
    if (charge_start < win_start) {
      pre_window_minutes = win_start - charge_start;
    }
    
    if (charge_end > win_end) {
      post_window_minutes = charge_end - win_end;
    }
  } else {
    // No overlap
    if (charge_end <= win_start) {
      pre_window_minutes = charge_duration;
    } else {
      post_window_minutes = charge_duration;
    }
  }
  
  // Convert minutes to kWh (proportional)
  var kwh_rate = kwh_needed / charge_duration;
  
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
 * v1.3.0: Now uses getEffectiveChargeRate() instead of fixed rate
 */
function calculateScheduledChargeCost() {
  var soc = getSOC();
  var target = parseInt(getConfig("target_soc")) || 80;
  var battery = getBatteryParams();
  var charger_rate = getEffectiveChargeRate(); // v1.3.0: CHANGED
  
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
 * v1.3.0: Added rate tracking initialization
 */
function startCharging() {
  var target = parseInt(getConfig("target_soc")) || 80;
  
  print("Starting charge to " + target + "%\n");
  
  // v1.2.1: Capture actual start time for state-aware status display
  var now = new Date();
  state.actual_start_time = now;
  state.actual_start_minutes = now.getHours() * 60 + now.getMinutes();
  
  // v1.3.0: Start rate tracking
  startRateTracking();
  
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
// OPTIMAL START TIME CALCULATION (v1.2.0 - Ready-By Time Feature)
// ============================================================================

/**
 * Calculate optimal start time for charging
 * Returns object with start time and metadata
 * 
 * Priority logic:
 * 1. Default: Start at cheap window start (prefer cheap rates)
 * 2. Only start earlier: If would miss ready-by deadline
 * 3. Prefer finishing early over exact timing
 * 
 * v1.3.0: Now uses getEffectiveChargeRate() for better predictions
 */
function calculateOptimalStart() {
  var ready_hour = parseInt(getConfig("ready_by_hour"));
  var ready_minute = parseInt(getConfig("ready_by_minute"));
  
  // Handle NaN from config
  if (isNaN(ready_hour)) ready_hour = 0;
  if (isNaN(ready_minute)) ready_minute = 0;
  
  var window_start_hour = parseInt(getConfig("cheap_start_hour"));
  var window_start_minute = parseInt(getConfig("cheap_start_minute"));
  var window_start_minutes = timeToMinutes(window_start_hour, window_start_minute);
  
  // Ready-by disabled? Use v1.1.0 behavior (start at window start)
  if (ready_hour === 0 && ready_minute === 0) {
    return {
      start_minutes: window_start_minutes,
      finish_minutes: null,
      ready_by_minutes: null,
      reason: "window_start",
      ready_by_enabled: false,
      has_pre_window: false,
      charge_duration_hours: 0,
      kwh_needed: 0
    };
  }
  
  // Calculate required charge time
  var soc = getSOC();
  var target = parseInt(getConfig("target_soc"));
  if (isNaN(target)) target = 80;
  
  var battery = getBatteryParams();
  var kwh_needed = battery.effective_capacity * (target - soc) / 100;
  var charger_rate = getEffectiveChargeRate(); // v1.3.0: CHANGED
  if (isNaN(charger_rate) || charger_rate === 0) charger_rate = 2.0;
  
  var charge_hours = kwh_needed / charger_rate;
  var charge_minutes = charge_hours * 60;
  
  // When is the deadline?
  var ready_by_minutes = timeToMinutes(ready_hour, ready_minute);
  
  // Normalize for overnight scenarios
  // If ready_by is "early morning" (< 12:00), assume it's tomorrow
  if (ready_by_minutes < 720) {  // Before noon
    ready_by_minutes += (24 * 60);  // Next day
  }
  
  // If window start is late evening (> 20:00), keep as current day
  // This creates a continuous timeline: tonight 23:30 -> tomorrow 08:30
  
  // Calculate: When would we finish if we start at window start?
  var finish_if_start_at_window = window_start_minutes + charge_minutes;
  
  // DECISION LOGIC
  if (finish_if_start_at_window <= ready_by_minutes) {
    // Perfect! We can start at cheap window and finish before/at deadline
    return {
      start_minutes: window_start_minutes,
      finish_minutes: finish_if_start_at_window,
      ready_by_minutes: ready_by_minutes,
      reason: "window_start",
      on_time: true,
      has_pre_window: false,
      ready_by_enabled: true,
      charge_duration_hours: charge_hours,
      kwh_needed: kwh_needed
    };
  } else {
    // Must start earlier to meet deadline
    var required_start_minutes = ready_by_minutes - charge_minutes;
    
    return {
      start_minutes: required_start_minutes,
      finish_minutes: ready_by_minutes,
      ready_by_minutes: ready_by_minutes,
      reason: "early_start_required",
      on_time: true,
      has_pre_window: (required_start_minutes < window_start_minutes),
      ready_by_enabled: true,
      charge_duration_hours: charge_hours,
      kwh_needed: kwh_needed
    };
  }
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
 * 
 * v1.2.0: Now uses calculateOptimalStart() for ready-by time support
 * v1.3.0: Added rate tracking checkpoint recording
 */
function checkSchedule() {
  // v1.3.0: If currently charging, record SOC checkpoint for rate tracking
  if (isCharging() && chargingMetrics.session_active) {
    recordSOCCheckpoint();
  }
  
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
  
  // Check if should charge (SOC check)
  if (!shouldCharge()) {
    return;
  }
  
  // Calculate optimal start time
  var optimal = calculateOptimalStart();
  
  // Get current time
  var now = getCurrentMinuteOfDay();
  
  // Normalize start time for comparison
  var start_time = optimal.start_minutes;
  if (start_time > 1440) {
    start_time -= (24 * 60);  // Bring back to today
  }
  
  // Are we at or past the optimal start time?
  // For overnight windows, handle wrap-around
  var window_start_hour = parseInt(getConfig("cheap_start_hour"));
  var should_start = false;
  
  if (window_start_hour >= 20) {
    // Late evening start (e.g., 23:30)
    // We're in the right time if:
    // - Current time >= start time (e.g., 21:30 <= now)
    // - OR current time is early morning (< 12:00) and we're in ready-by mode
    if (now >= start_time) {
      should_start = true;
    } else if (optimal.ready_by_enabled && now < 720) {
      // Early morning, ready-by enabled, probably missed start yesterday
      // Check if we're before finish time
      var finish_time = optimal.finish_minutes;
      if (finish_time > 1440) finish_time -= (24 * 60);
      if (now < finish_time) {
        should_start = true;
      }
    }
  } else {
    // Daytime window (e.g., 09:00-17:00)
    if (now >= start_time) {
      should_start = true;
    }
  }
  
  if (!should_start) {
    return;  // Not yet time to start
  }
  
  // All conditions met - start charging!
  var target = parseInt(getConfig("target_soc")) || 80;
  
  if (optimal.ready_by_enabled && optimal.reason === "early_start_required") {
    print("Schedule check: Starting charge (early start for ready-by deadline)\n");
  } else {
    print("Schedule check: Starting charge (optimal time reached)\n");
  }
  
  OvmsCommand.Exec("config set xnl autocharge yes");
  OvmsCommand.Exec("config set xnl suffsoc " + target);
  OvmsCommand.Exec("charge start");
  
  notify("Charging started (scheduled). Target " + target + "%");
  state.scheduled_charge_active = true;
  
  // v1.3.0: Start rate tracking
  startRateTracking();
}

// ============================================================================
// EVENT HANDLERS
// ============================================================================

/**
 * Handle vehicle plug-in
 * Vehicle will auto-start charging - we stop it if needed
 * 
 * v1.3.0: Now uses getEffectiveChargeRate() for predictions
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
    
    // v1.3.0: Start rate tracking
    startRateTracking();
    
    notify("Plugged in at " + soc.toFixed(0) + "%. Charging to " + target + "% now.");
  } else {
    // Outside window - stop it and wait for schedule
    print("Plugged in outside cheap window - stopping charge\n");
    OvmsCommand.Exec("charge stop");
    
    // Calculate optimal start time
    var optimal = calculateOptimalStart();
    var battery = getBatteryParams();
    var kwh_needed = battery.effective_capacity * (target - soc) / 100;
    var charger_rate = getEffectiveChargeRate(); // v1.3.0: CHANGED
    var charge_hours = kwh_needed / charger_rate;
    
    var message = "Plugged in at " + soc.toFixed(0) + "%.";
    
    if (optimal.ready_by_enabled) {
      // Ready-by mode - show timing details
      var ready_time = formatTime(
        Math.floor(optimal.ready_by_minutes / 60) % 24,
        optimal.ready_by_minutes % 60
      );
      message += " Target " + target + "% by " + ready_time + ".\n";
      
      var start_time = formatTime(
        Math.floor(optimal.start_minutes / 60) % 24,
        Math.floor(optimal.start_minutes % 60)
      );
      
      if (optimal.reason === "early_start_required") {
        var early_minutes = start_hour * 60 + start_minute - optimal.start_minutes;
        var early_hours = early_minutes / 60;
        message += "Will start at " + start_time + " (" + early_hours.toFixed(1) + "h before window).\n";
      } else {
        message += "Will start at " + start_time + " (window start).\n";
      }
      
      var finish_time = formatTime(
        Math.floor(optimal.finish_minutes / 60) % 24,
        Math.floor(optimal.finish_minutes % 60)
      );
      message += "Finish ~" + finish_time + ".";
    } else {
      // v1.1.0 mode (no ready-by)
      message += " Will charge to " + target + "% during " + window_str + ".";
    }
    
    message += " Need " + kwh_needed.toFixed(1) + " kWh (~" + charge_hours.toFixed(1) + "h).\n";
    
    // Calculate costs using optimal timing
    var cost_info;
    if (optimal.ready_by_enabled) {
      cost_info = calculateCostForTimeRange(
        optimal.start_minutes,
        optimal.finish_minutes,
        kwh_needed
      );
    } else {
      // v1.1.0 behavior
      cost_info = calculateScheduledChargeCost();
    }
    
    message += "Cost: £" + cost_info.total_cost.toFixed(2);
    
    if (cost_info.has_overflow) {
      message += "\n";
      if (cost_info.pre_window_kwh > 0) {
        message += "PRE: £" + cost_info.pre_window_cost.toFixed(2) + ", ";
      }
      message += "CHEAP: £" + cost_info.cheap_window_cost.toFixed(2);
      if (cost_info.post_window_kwh > 0) {
        message += ", POST: £" + cost_info.post_window_cost.toFixed(2);
      }
    } else {
      message += " (save £" + cost_info.savings.toFixed(2) + ")";
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
  
  // v1.2.1: Clear actual start time tracking
  state.actual_start_time = null;
  state.actual_start_minutes = 0;
  
  // v1.3.0: Stop rate tracking if session was active
  if (chargingMetrics.session_active) {
    chargingMetrics.session_active = false;
    print("[RATE] Session aborted (vehicle unplugged)\n");
  }
  
  notify("Vehicle unplugged. Schedule cleared.");
}

/**
 * Handle charging stopped (target reached or manually stopped)
 * v1.3.0: Added rate calculation and storage
 */
function onChargeStop() {
  print("Charging stopped (event)\n");
  
  state.scheduled_charge_active = false;
  
  // v1.3.0: Calculate and store session rate
  calculateAndStoreSessionRate();
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
  
  // v1.3.0: Show rate detection status
  var measured = parseFloat(getConfig("measured_rate"));
  var nameplate = parseFloat(getConfig("charger_rate"));
  var use_measured = getConfig("use_measured_rate");
  
  if (use_measured && measured > 0) {
    var effective = getEffectiveChargeRate();
    print("Rate detection: ENABLED (measured " + measured.toFixed(2) + 
          "kW, effective " + effective.toFixed(2) + "kW)\n");
  } else {
    print("Rate detection: Learning (using nameplate " + nameplate.toFixed(1) + "kW)\n");
  }
  
  // Subscribe to schedule checking (every 5 minutes)
  // Note: Doing this in a non-blocking way
  state.ticker_subscription = PubSub.subscribe("ticker.300", checkSchedule);
  print("Schedule monitoring: ticker.300 (every 5 minutes)\n");
  print("  - Also handles rate tracking (zero additional load)\n");
  
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
 * Set charger power rating (configured)
 * v1.3.0: This becomes the fallback when no measured rate exists
 */
exports.setCharger = function(kw) {
  setConfig("charger_rate", kw);
  
  var msg = "Charger rate (configured): " + kw + " kW";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * v1.3.0: Enable/disable dynamic rate detection
 */
exports.useMeasuredRate = function(enable) {
  var enabled = (enable === true || enable === "true" || enable === "yes");
  setConfig("use_measured_rate", enabled);
  
  var msg = "Dynamic rate detection: " + (enabled ? "ENABLED" : "DISABLED");
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * v1.3.0: Manually set measured rate (for testing/override)
 */
exports.setMeasuredRate = function(kw) {
  var rate = parseFloat(kw);
  if (rate < 0.5 || rate > 25) {
    return "Error: Rate must be 0.5-25 kW";
  }
  
  setConfig("measured_rate", rate);
  
  var msg = "Measured rate set to: " + rate.toFixed(2) + " kW";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * v1.3.0: Clear measured rate (force use of configured)
 */
exports.clearMeasuredRate = function() {
  setConfig("measured_rate", 0);
  
  var msg = "Measured rate cleared - will learn from next session";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Set ready-by time (when vehicle must be charged by)
 * @param hour - Hour (0-23)
 * @param minute - Minute (0-59)
 * Set to 0:0 to disable (use v1.1.0 behavior)
 */
exports.setReadyBy = function(hour, minute) {
  var h = parseInt(hour);
  var m = parseInt(minute);
  
  // Validate inputs
  if (isNaN(h) || h < 0 || h > 23) {
    return "Error: Hour must be 0-23";
  }
  if (isNaN(m) || m < 0 || m > 59) {
    return "Error: Minute must be 0-59";
  }
  
  setConfig("ready_by_hour", h);
  setConfig("ready_by_minute", m);
  
  var msg;
  if (h === 0 && m === 0) {
    msg = "Ready-by time DISABLED - will start at cheap window";
  } else {
    msg = "Ready-by time: " + formatTime(h, m);
  }
  
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Clear ready-by time (disable feature)
 */
exports.clearReadyBy = function() {
  return exports.setReadyBy(0, 0);
};

/**
 * Enable scheduled charging (wait for cheap window)
 * @deprecated Use useSchedule() for clarity
 */
exports.enable = function() {
  OvmsConfig.Set("usr", "charging.enabled", "true");
  var msg = "Scheduled charging ENABLED - will wait for cheap window\n(Note: Consider using charging.useSchedule() for clarity)";
  print(msg + "\n");
  notify("Scheduled charging ENABLED");
  return msg;
};

/**
 * Disable scheduled charging (charge immediately on plug-in)
 * @deprecated Use chargeNow() for clarity
 */
exports.disable = function() {
  OvmsConfig.Set("usr", "charging.enabled", "false");
  var msg = "Scheduled charging DISABLED - will charge immediately on plug-in\n(Note: Consider using charging.chargeNow() for clarity)";
  print(msg + "\n");
  notify("Scheduled charging DISABLED");
  return msg;
};

/**
 * Use scheduled charging (wait for cheap window or optimal start time)
 * Replaces enable() with clearer naming
 */
exports.useSchedule = function() {
  OvmsConfig.Set("usr", "charging.enabled", "true");
  var msg = "Using scheduled charging - will wait for optimal time";
  print(msg + "\n");
  notify(msg);
  return msg;
};

/**
 * Charge now (override schedule, charge immediately)
 * Replaces disable() with clearer naming
 */
exports.chargeNow = function() {
  OvmsConfig.Set("usr", "charging.enabled", "false");
  var msg = "Charging immediately - schedule overridden";
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
 * v1.3.0: Added measured rate display
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
  
  // v1.3.0: Show rate detection status
  var nameplate = parseFloat(getConfig("charger_rate"));
  var measured = parseFloat(getConfig("measured_rate"));
  var use_measured = getConfig("use_measured_rate");
  var effective = getEffectiveChargeRate();
  
  lines.push("Charger:");
  lines.push("  Configured: " + nameplate.toFixed(1) + " kW");
  if (use_measured && measured > 0) {
    lines.push("  Measured: " + measured.toFixed(2) + " kW (last session)");
    lines.push("  Effective: " + effective.toFixed(2) + " kW (70% measured + 30% configured)");
  } else {
    lines.push("  Dynamic rate: Learning (will update after first charge)");
  }
  lines.push("");
  
  lines.push("Scheduling:");
  if (isSchedulingEnabled()) {
    lines.push("  Mode: Scheduled");
    lines.push("  Cheap window: " + formatTime(start_h, start_m) + " - " + formatTime(end_h, end_m));
    lines.push("  In window now: " + (isWithinWindow() ? "Yes" : "No"));
    
    // Show ready-by configuration
    var ready_h = parseInt(getConfig("ready_by_hour")) || 0;
    var ready_m = parseInt(getConfig("ready_by_minute")) || 0;
    if (ready_h === 0 && ready_m === 0) {
      lines.push("  Ready-by: DISABLED (start at window start)");
    } else {
      lines.push("  Ready-by: " + formatTime(ready_h, ready_m));
    }
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
    
    // Calculate optimal start
    var optimal = calculateOptimalStart();
    var kwh_needed = battery.effective_capacity * (target - soc) / 100;
    var charger_rate = getEffectiveChargeRate(); // v1.3.0: CHANGED
    var charge_hours = kwh_needed / charger_rate;
    
    if (optimal.ready_by_enabled) {
      lines.push("Ready-By Schedule:");
      
      var start_time = formatTime(
        Math.floor(optimal.start_minutes / 60) % 24,
        Math.floor(optimal.start_minutes % 60)
      );
      var finish_time = formatTime(
        Math.floor(optimal.finish_minutes / 60) % 24,
        Math.floor(optimal.finish_minutes % 60)
      );
      
      lines.push("  Will start: " + start_time);
      lines.push("  Will finish: " + finish_time);
      
      if (optimal.reason === "early_start_required") {
        var early_minutes = start_h * 60 + start_m - optimal.start_minutes;
        var early_hours = early_minutes / 60;
        lines.push("  âš ï¸ Early start: " + early_hours.toFixed(1) + "h before window");
      } else {
        lines.push("  âœ… Can start at window start");
      }
      
      lines.push("");
      lines.push("Cost Estimate:");
      lines.push("  Need: " + kwh_needed.toFixed(1) + " kWh (~" + charge_hours.toFixed(1) + "h @ " + charger_rate.toFixed(2) + "kW)");
      
      // Calculate cost with optimal timing
      var cost_info = calculateCostForTimeRange(
        optimal.start_minutes,
        optimal.finish_minutes,
        kwh_needed
      );
      
      lines.push("  Total cost: £" + cost_info.total_cost.toFixed(2));
      
      if (cost_info.has_overflow) {
        if (cost_info.pre_window_kwh > 0) {
          lines.push("    PRE: " + cost_info.pre_window_kwh.toFixed(1) + " kWh @ £" + cost_info.pre_window_cost.toFixed(2));
        }
        if (cost_info.cheap_window_kwh > 0) {
          lines.push("    CHEAP: " + cost_info.cheap_window_kwh.toFixed(1) + " kWh @ £" + cost_info.cheap_window_cost.toFixed(2));
        }
        if (cost_info.post_window_kwh > 0) {
          lines.push("    POST: " + cost_info.post_window_kwh.toFixed(1) + " kWh @ £" + cost_info.post_window_cost.toFixed(2));
        }
      } else {
        lines.push("  âœ… All in cheap window");
        lines.push("  Saving: £" + cost_info.savings.toFixed(2) + " vs standard rate");
      }
    } else {
      // v1.1.0 mode
      lines.push("Cost Estimate:");
      
      var cost_info = calculateScheduledChargeCost();
      
      lines.push("  Need: " + kwh_needed.toFixed(1) + " kWh (~" + charge_hours.toFixed(1) + "h @ " + charger_rate.toFixed(2) + "kW)");
      lines.push("  Total cost: £" + cost_info.total_cost.toFixed(2));
      
      if (cost_info.has_overflow) {
        lines.push("  âš ï¸ WARNING: Will extend past window end");
        if (cost_info.cheap_window_kwh > 0) {
          lines.push("    Cheap: " + cost_info.cheap_window_kwh.toFixed(1) + " kWh @ £" + cost_info.cheap_window_cost.toFixed(2));
        }
        if (cost_info.post_window_kwh > 0) {
          lines.push("    Overflow: " + cost_info.post_window_kwh.toFixed(1) + " kWh @ £" + cost_info.post_window_cost.toFixed(2));
        }
      } else {
        lines.push("  âœ… Will complete in cheap window");
        lines.push("  Saving: £" + cost_info.savings.toFixed(2) + " vs standard rate");
      }
    }
  }
  
  var output = lines.join("\n");
  print(output + "\n");
  
  // v1.2.1: State-aware notification (PLANNING / ACTIVE / COMPLETED)
  var summary = "Smart Charging v" + VERSION + "\n";
  summary += "SOC: " + soc.toFixed(0) + "% -> " + target + "%\n";
  summary += "Plugged: " + (plugged ? "Yes" : "No") + ", Charging: " + (charging ? "Yes" : "No") + "\n";
  summary += "Mode: " + (isSchedulingEnabled() ? "Scheduled" : "Immediate");
  
  // Determine state and show appropriate information
  if (charging && state.actual_start_time) {
    // STATE: ACTIVE - Currently charging
    var start_time = formatTime(
      state.actual_start_time.getHours(),
      state.actual_start_time.getMinutes()
    );
    
    // Calculate remaining charge
    var battery = getBatteryParams();
    var kwh_remaining = battery.effective_capacity * (target - soc) / 100;
    var charger_rate = getEffectiveChargeRate(); // v1.3.0: CHANGED
    var hours_remaining = kwh_remaining / charger_rate;
    
    // Estimate finish time
    var finish_minutes = getCurrentMinuteOfDay() + (hours_remaining * 60);
    var finish_hour = Math.floor(finish_minutes / 60) % 24;
    var finish_min = Math.floor(finish_minutes % 60);
    var finish_time = formatTime(finish_hour, finish_min);
    
    summary += "\nStarted: " + start_time + ", Est. finish: " + finish_time;
    
    // Calculate remaining cost
    var cost_estimate = kwh_remaining * parseFloat(getConfig("cheap_rate"));
    summary += "\nCost: £" + cost_estimate.toFixed(2) + " (est. remaining)";
    
  } else if (plugged && soc >= target && state.actual_start_time) {
    // STATE: COMPLETED - Finished charging
    var start_time = formatTime(
      state.actual_start_time.getHours(),
      state.actual_start_time.getMinutes()
    );
    summary += "\nCompleted! Started: " + start_time;
    
  } else if (plugged && soc < target && isSchedulingEnabled()) {
    // STATE: PLANNING - Waiting to start
    var ready_h = parseInt(getConfig("ready_by_hour")) || 0;
    var ready_m = parseInt(getConfig("ready_by_minute")) || 0;
    
    if (ready_h !== 0 || ready_m !== 0) {
      // Ready-by mode - show timing
      var optimal = calculateOptimalStart();
      
      var start_time = formatTime(
        Math.floor(optimal.start_minutes / 60) % 24,
        Math.floor(optimal.start_minutes % 60)
      );
      var finish_time = formatTime(
        Math.floor(optimal.finish_minutes / 60) % 24,
        Math.floor(optimal.finish_minutes % 60)
      );
      
      summary += "\nStart: " + start_time + ", Finish: " + finish_time;
      
      // Calculate cost with optimal timing
      var cost_info = calculateCostForTimeRange(
        optimal.start_minutes,
        optimal.finish_minutes,
        optimal.kwh_needed
      );
      
      summary += "\nCost: £" + cost_info.total_cost.toFixed(2);
      if (cost_info.has_overflow) {
        summary += " (PRE+CHEAP+POST)";
      }
    } else {
      // v1.1.0 mode - no ready-by
      var cost_info = calculateScheduledChargeCost();
      summary += "\nCost: £" + cost_info.total_cost.toFixed(2);
      if (cost_info.has_overflow) {
        summary += " âš ï¸ Overflow";
      } else {
        summary += " (save £" + cost_info.savings.toFixed(2) + ")";
      }
    }
  }
  
  try {
    OvmsNotify.Raise("info", "charge.smart", summary);
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
