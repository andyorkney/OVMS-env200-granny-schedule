# OVMS + Duktape Development Guidelines

**Version:** 2.0  
**Last Updated:** 2025-12-04  
**Purpose:** Comprehensive reference incorporating all lessons learned from real-world development

---

## Table of Contents
1. [Critical JavaScript Rules](#critical-javascript-rules)
2. [Module Loading Patterns](#module-loading-patterns)
3. [OVMS-Specific Gotchas](#ovms-specific-gotchas)
4. [Configuration Management](#configuration-management)
5. [Event Handling Patterns](#event-handling-patterns)
6. [Metrics Reading Best Practices](#metrics-reading-best-practices)
7. [Documentation Standards](#documentation-standards)
8. [Testing & Validation](#testing--validation)

---

## Critical JavaScript Rules

### Duktape ES5.1 Compatibility

Duktape supports **ECMAScript 5.1 only**. Modern JavaScript features will cause syntax errors or runtime failures.

#### ❌ DO NOT USE:
```javascript
// Modern JavaScript that will FAIL
let x = 5;                              // ❌ No let/const
const API = "https://...";              // ❌ No const
const getName = () => "test";           // ❌ No arrow functions
const msg = `Hello ${name}`;            // ❌ No template literals
const arr = [1, 2, 3];
arr.includes(2);                        // ❌ No .includes()
arr.find(x => x > 1);                   // ❌ No .find()
const {name, age} = obj;                // ❌ No destructuring
const newArr = [...oldArr];             // ❌ No spread operator
class MyClass { }                       // ❌ No classes
async function fetch() { }              // ❌ No async/await
```

#### ✅ DO USE:
```javascript
// ES5.1 JavaScript that WORKS
var x = 5;                              // ✅ Use var
var API = "https://...";                // ✅ Use var for constants
function getName() { return "test"; }   // ✅ Function declarations
var msg = "Hello " + name;              // ✅ String concatenation
var arr = [1, 2, 3];
arr.indexOf(2) !== -1;                  // ✅ Use indexOf
for (var i = 0; i < arr.length; i++) {  // ✅ Traditional loops
  if (arr[i] > 1) { /* ... */ }
}
var name = obj.name;                    // ✅ Direct property access
var age = obj.age;
```

---

## Module Loading Patterns

### Understanding Module Context

OVMS supports **two different patterns** for loading JavaScript code:

1. **`require()` pattern** - Module pattern with `exports` object
2. **`.` (dot) pattern** - Direct script execution in global context

**The critical difference:** `exports` only exists when using `require()`, not when using `.`

### Pattern 1: Module with require() (Persistent Code)

Use this for code that loads automatically via `ovmsmain.js` or needs to be cached.

**File:** `/store/scripts/lib/mymodule.js`
```javascript
/**
 * My Module - Description
 * Load: mymodule = require("lib/mymodule")
 * Use: script eval "mymodule.doSomething()"
 */

// Use exports object
exports.doSomething = function() {
  print("Doing something\n");
};

exports.getStatus = function() {
  return "Ready";
};

// Module auto-loads when required
print("[MYMODULE] Loaded\n");
```

**Loading:**
```bash
# From ovmsmain.js:
mymodule = require("lib/mymodule");

# Or manually:
OVMS# script eval "mymodule = require('lib/mymodule')"
```

**Usage:**
```bash
OVMS# script eval "mymodule.doSomething()"
OVMS# script eval "mymodule.getStatus()"
```

### Pattern 2: Direct Script with . (dot) Command (One-Off Execution)

Use this for testing, debugging, or scripts that run once.

**File:** `/store/scripts/lib/test-script.js`
```javascript
/**
 * Test Script - Description
 * Load: . /store/scripts/lib/test-script.js
 * Use: script eval "test_script.run()"
 */

// Create global object directly (NO exports)
test_script = {};

test_script.run = function() {
  print("Running test\n");
};

test_script.status = function() {
  return "Testing";
};

// Script runs when loaded
print("[TEST-SCRIPT] Loaded\n");
```

**Loading:**
```bash
OVMS# . /store/scripts/lib/test-script.js
[TEST-SCRIPT] Loaded
```

**Usage:**
```bash
OVMS# script eval "test_script.run()"
OVMS# script eval "test_script.status()"
```

### Pattern Comparison

| Aspect | require() Pattern | . (dot) Pattern |
|--------|------------------|-----------------|
| **Object** | `exports.func = ...` | `myobj = {}; myobj.func = ...` |
| **When to use** | Persistent modules | Testing, debugging, one-off |
| **Caching** | Cached by require() | Not cached |
| **Auto-load** | Via ovmsmain.js | Manual execution |
| **Context** | `exports` available | Global context only |

### Universal Module Template (Works with Both)

If you need a module to work with both patterns:

```javascript
/**
 * Universal Module
 * Load Method 1: mymod = require("lib/mymod")
 * Load Method 2: . /store/scripts/lib/mymod.js
 */

// Use IIFE pattern from OVMS docs
mymod = (function(){
  var exports = {};
  
  exports.doWork = function() {
    print("Working\n");
  };
  
  return exports;
})();

// Now available as mymod global
print("[MYMOD] Loaded\n");
```

**This pattern:**
- ✅ Works with `require("lib/mymod")`
- ✅ Works with `. /store/scripts/lib/mymod.js`
- ✅ Creates `mymod` global regardless of load method

---

## OVMS-Specific Gotchas

### 1. OvmsConfig.Get Returns STRING "undefined" ⚠️ CRITICAL

**The Problem:**
```javascript
var value = OvmsConfig.Get("usr", "charging.target.soc");
// Expected: undefined if not set
// Actual: STRING "undefined" (yes, really!)

if (value === undefined) {
  // This NEVER triggers!
}

var targetSOC = parseInt(value);
// Result: NaN (because parseInt("undefined") = NaN)
```

**The Solution:**
```javascript
function getConfig(key) {
  var value = OvmsConfig.Get("usr", key);
  
  // Check for BOTH undefined and STRING "undefined"
  if (value === undefined || value === "undefined" || value === null || value === "") {
    return null;  // or your default
  }
  
  return value;
}

// Use it:
var targetSOC = parseInt(getConfig("charging.target.soc") || "80");
```

### 2. Metric Values Can Be Multiple Types

**The Problem:**
```javascript
var charging = OvmsMetrics.Value("v.c.charging");
// Could be: true, "yes", "1", 1, "true", etc.

if (charging === true) {
  // Might not trigger even when charging!
}
```

**The Solution:**
```javascript
function getSafeMetric(name, defaultValue) {
  try {
    if (!OvmsMetrics.HasValue(name)) return defaultValue;
    
    if (typeof defaultValue === "boolean") {
      // Handle all "truthy" variants
      var val = OvmsMetrics.AsFloat(name);
      return val !== 0;
    } else if (typeof defaultValue === "number") {
      return OvmsMetrics.AsFloat(name);
    } else {
      return OvmsMetrics.Value(name) || defaultValue;
    }
  } catch (e) {
    return defaultValue;
  }
}

// Use it:
var charging = getSafeMetric("v.c.charging", false);  // Always boolean
var soc = getSafeMetric("v.b.soc", 0);                 // Always number
```

### 3. Config Keys MUST Use Dot Notation

**The Problem:**
```javascript
// ❌ WRONG - Underscore notation causes issues
OvmsConfig.Set("usr", "charging_target_soc", "80");
OvmsConfig.Get("usr", "charging_target_soc");

// ❌ WRONG - Inconsistent nesting
OvmsConfig.Set("usr", "charging.targetSoc", "80");
```

**The Solution:**
```javascript
// ✅ CORRECT - Dot notation for hierarchy
OvmsConfig.Set("usr", "charging.target.soc", "80");
OvmsConfig.Set("usr", "charging.window.start.hour", "23");
OvmsConfig.Set("usr", "charging.window.start.minute", "30");

// Convention: namespace.category.subcategory.property
// Examples:
// - charging.target.soc
// - charging.window.start.hour
// - charging.pricing.cheap
// - charging.charger.rate
```

### 4. Notification Character Limits

**The Problem:**
```javascript
var longMessage = "Charging started at 45% SOC. Target is 80%. " +
                  "Estimated completion: 03:45. Energy needed: 12.3 kWh. " +
                  "Cost: £0.86 in cheap rate, £0.00 in standard rate. " +
                  "Ready by: 08:30. This leaves 4 hours 45 minutes margin.";

OvmsNotify.Raise("info", "charge.start", longMessage);
// Result: Notification doesn't appear! No error, just silently fails.
```

**The Solution:**
```javascript
// Keep notifications under 200-300 characters
var shortMessage = "Charging: 45% → 80%\n" +
                   "Ready: ~03:45\n" +
                   "Cost: ~£0.86";

OvmsNotify.Raise("alert", "charge.start", shortMessage);
print("[FULL] " + longMessage + "\n");  // Full details to console
```

### 5. Midnight Crossing in Time Calculations

**The Problem:**
```javascript
var startMinutes = 23 * 60 + 30;  // 23:30 = 1410
var endMinutes = 5 * 60 + 30;      // 05:30 = 330
var duration = endMinutes - startMinutes;  // -1080 (WRONG!)
```

**The Solution:**
```javascript
function calculateDuration(startMinutes, endMinutes) {
  var duration = endMinutes - startMinutes;
  
  // Normalize for midnight crossing
  if (duration < 0) {
    duration += 1440;  // Add 24 hours
  }
  
  return duration;
}

// Usage:
var duration = calculateDuration(1410, 330);  // = 360 minutes (6 hours)
```

### 6. Event Subscription During Module Load CAN CAUSE STALLS

**The Problem:**
```javascript
// During module initialization:
var isPlugged = getSafeMetric("v.c.pilot", false);  // ⚠️ Risky during load
var soc = getSafeMetric("v.b.soc", 0);               // ⚠️ Risky during load

PubSub.subscribe("vehicle.charge.start", handleChargeStart);  // Could stall
```

**The Solution:**
```javascript
// Initialize with safe defaults, NO metric calls during load
var state = {
  lastPluggedIn: false,
  lastSOC: 0,
  initialized: false
};

// Subscribe to ticker, defer initialization to first tick
PubSub.subscribe("ticker.300", function() {
  if (!state.initialized) {
    // First run: Safe to read metrics now
    state.lastPluggedIn = getSafeMetric("v.c.pilot", false);
    state.lastSOC = getSafeMetric("v.b.soc", 0);
    state.initialized = true;
  }
  
  // Normal monitoring logic...
});
```

### 7. Cellular Notification Delays

**The Reality:**
- Notifications can take 10-60+ seconds to reach your phone
- MQTT messages queue if connection is down
- Don't assume failure immediately

**The Pattern:**
```javascript
// Don't do this:
OvmsNotify.Raise("alert", "test", "Testing");
// Wait 5 seconds... no notification? Must be broken! ❌

// Do this:
OvmsNotify.Raise("alert", "test", "Testing @ " + Date.now());
// Wait 1-2 minutes
// Check phone
// Check OVMS Connect app message history
```

---

## Configuration Management

### Safe Configuration Reading Pattern

```javascript
var CONFIG_DEFAULTS = {
  "charging.target.soc": 80,
  "charging.window.start.hour": 23,
  "charging.window.start.minute": 30,
  "charging.charger.rate": 2.0
};

function getConfig(key, defaultValue) {
  if (defaultValue === undefined) {
    defaultValue = CONFIG_DEFAULTS[key];
  }
  
  var value = OvmsConfig.Get("usr", key);
  
  // Handle OVMS "undefined" string quirk
  if (value === undefined || value === "undefined" || value === null || value === "") {
    return defaultValue;
  }
  
  return value;
}

function getConfigInt(key, defaultValue) {
  var value = getConfig(key, defaultValue);
  var parsed = parseInt(value);
  
  // Validate parsed value
  if (isNaN(parsed)) {
    print("[CONFIG] Warning: Invalid integer for " + key + ", using default " + defaultValue + "\n");
    return defaultValue;
  }
  
  return parsed;
}

function getConfigFloat(key, defaultValue) {
  var value = getConfig(key, defaultValue);
  var parsed = parseFloat(value);
  
  if (isNaN(parsed)) {
    print("[CONFIG] Warning: Invalid float for " + key + ", using default " + defaultValue + "\n");
    return defaultValue;
  }
  
  return parsed;
}

// Usage:
var targetSOC = getConfigInt("charging.target.soc", 80);
var chargerRate = getConfigFloat("charging.charger.rate", 2.0);
```

### Safe Configuration Writing

```javascript
function setConfig(key, value) {
  try {
    // Always convert to string
    OvmsConfig.Set("usr", key, String(value));
    return true;
  } catch (e) {
    print("[CONFIG] Error setting " + key + ": " + e + "\n");
    return false;
  }
}

// Usage:
setConfig("charging.target.soc", 80);
setConfig("charging.charger.rate", 2.5);
```

---

## Event Handling Patterns

### ✅ Current Implementation Status (v1.3.x)

**What We Actually Use:**
- ✅ **ticker.300** (5-minute intervals) - Schedule checking and rate tracking
- ✅ **vehicle.charge.prepare** - Plug-in detection
- ✅ **vehicle.charge.pilot.off** - Unplug detection
- ✅ **vehicle.charge.stop** - Charge completion events
- ✅ **Native OVMS suffsoc** - Automatic SOC-based stopping (no manual monitoring needed!)

**What We DON'T Use:**
- ❌ Clock events (`/store/events/clock.HHMM/`) - Deprecated since v0.x
- ❌ `vehicle.charge.start` event - Causes start/stop loops

**Critical Feature Status:**
- ✅ **SOC Stopping:** WORKING - Uses native OVMS `suffsoc` + `autocharge`
- ✅ **Schedule Starting:** WORKING - ticker.300 checks window
- ✅ **Notifications:** WORKING - All actions notify
- The "98% overcharge" issue was fixed in v1.0.0 (Nov 2023) and remains fixed in current versions

### Ticker-Based Monitoring (Current Pattern)

Use ticker events for polling-based monitoring. More reliable than vehicle events.

```javascript
// Subscribe once during module load
var tickerSubscription = PubSub.subscribe("ticker.300", function() {
  try {
    checkStatus();
  } catch (e) {
    print("[ERROR] Ticker failed: " + e + "\n");
  }
});

function checkStatus() {
  var charging = getSafeMetric("v.c.charging", false);
  var soc = getSafeMetric("v.b.soc", 0);
  
  // Your monitoring logic here
}
```

**Common ticker periods:**
- `ticker.1` - Every second (use sparingly)
- `ticker.10` - Every 10 seconds
- `ticker.60` - Every minute
- `ticker.300` - Every 5 minutes (good default)
- `ticker.600` - Every 10 minutes
- `ticker.3600` - Every hour

### Vehicle Event Pattern (Use Specific Events Only)

**⚠️ Be selective with vehicle events:**

```javascript
// ✅ SAFE - These events work well
PubSub.subscribe("vehicle.charge.prepare", handlePlugIn);  // Plug-in detection
PubSub.subscribe("vehicle.charge.pilot.off", handleUnplug);  // Unplug detection
PubSub.subscribe("vehicle.charge.stop", handleChargeStop);  // Charge completion

function handlePlugIn() {
  print("[EVENT] Vehicle plugged in\n");
  // Your logic here
}

// ❌ DANGEROUS - Avoid this event
PubSub.subscribe("vehicle.charge.start", function() {
  // DON'T call OvmsCommand.Exec("charge stop") here!
  // This creates a start/stop loop that prevents all charging
});
```

**Why vehicle.charge.start is problematic:**
- Fires when charging BEGINS (not when plugged in)
- Calling `charge stop` in this handler creates infinite loop
- Vehicle alternates between starting and stopping
- Results in "Timer On" message and no charging

### ⚠️ Deprecated Patterns (Historical Reference Only)

#### Clock Event Pattern (NOT USED - Replaced by Ticker in v1.0.0)

**Status:** Deprecated - Do not use in new code

Early versions (v0.x) used clock events for scheduled actions. This was replaced with ticker-based monitoring in v1.0.0 because:
- Clock events created 48 files (one per 30-min interval)
- Required separate event management scripts
- Ticker pattern is simpler and more maintainable

**Historical reference only:**

```bash
# In /store/events/clock.2330 (for 23:30)
script eval "charging.checkSchedule()"
```

**Setup Script Pattern:**
```javascript
function installClockEvents() {
  var hours = [23, 0, 1, 2, 3, 4, 5];  // Window hours
  
  for (var i = 0; i < hours.length; i++) {
    var hour = hours[i];
    for (var min = 0; min < 60; min += 30) {  // Every 30 minutes
      var hourStr = (hour < 10 ? "0" : "") + hour;
      var minStr = (min < 10 ? "0" : "") + min;
      var eventName = "clock." + hourStr + minStr;
      
      // Create event file
      VFS.Write("/store/events/" + eventName, 
                'script eval "charging.checkSchedule()"\n');
    }
  }
}
```

---

## Metrics Reading Best Practices

### Always Use Safety Wrapper

```javascript
function getSafeMetric(name, defaultValue) {
  try {
    if (!OvmsMetrics.HasValue(name)) return defaultValue;
    
    if (typeof defaultValue === "boolean") {
      var val = OvmsMetrics.AsFloat(name);
      return val !== 0;
    } else if (typeof defaultValue === "number") {
      return OvmsMetrics.AsFloat(name);
    } else {
      var val = OvmsMetrics.Value(name);
      return (val === undefined || val === null) ? defaultValue : val;
    }
  } catch (e) {
    return defaultValue;
  }
}
```

### Common Metrics

```javascript
// Battery state
var soc = getSafeMetric("v.b.soc", 0);           // State of Charge (%)
var soh = getSafeMetric("v.b.soh", 100);         // State of Health (%)
var voltage = getSafeMetric("v.b.voltage", 0);   // Battery voltage (V)
var current = getSafeMetric("v.b.current", 0);   // Battery current (A)
var temp = getSafeMetric("v.b.temp", 0);         // Battery temp (°C)

// Charging state
var charging = getSafeMetric("v.c.charging", false);  // Is charging?
var pilot = getSafeMetric("v.c.pilot", false);        // Plugged in?
var power = getSafeMetric("v.c.power", 0);            // Charge power (kW)
var kwh = getSafeMetric("v.c.kwh", 0);                // Session energy (kWh)

// Environment
var ambientTemp = getSafeMetric("v.e.temp", null);    // Ambient temp (°C)

// Nissan Leaf specific (xnl.*)
var leafSOC = getSafeMetric("xnl.v.b.soc.instrument", null);  // Dashboard SOC
var gids = getSafeMetric("xnl.v.b.gids", 0);                  // GIDS value
```

---

## Documentation Standards

### Command Syntax in All Documentation

**ALWAYS use full command syntax in examples:**

```javascript
/**
 * Set charging schedule
 * 
 * @param startHour - Start hour (0-23)
 * @param startMin - Start minute (0-59)
 * @param endHour - End hour (0-23)
 * @param endMin - End minute (0-59)
 * 
 * Usage: script eval "charging.setSchedule(startHour, startMin, endHour, endMin)"
 * Example: script eval "charging.setSchedule(23, 30, 5, 30)"
 */
exports.setSchedule = function(startHour, startMin, endHour, endMin) {
  // Implementation...
};
```

**Why:** Users copy/paste examples directly. Without `script eval "..."`, commands fail.

### README Command Examples

```markdown
## Commands

### Set Schedule
```bash
script eval "charging.setSchedule(23, 30, 5, 30)"
```
Sets the cheap rate window from 23:30 to 05:30.

### Check Status
```bash
script eval "charging.status()"
```
Displays current charging status and configuration.
```

---

## Testing & Validation

### Pre-Deployment Checklist

```bash
# 1. Syntax check (if Node.js available)
node -c charging.js

# 2. Upload to OVMS
scp charging.js root@192.168.7.204:/store/scripts/lib/

# 3. SSH to OVMS
ssh root@192.168.7.204

# 4. Load script
. /store/scripts/lib/charging.js

# 5. Verify no errors
# Should see: [MODULE] Loaded

# 6. Test basic function
script eval "charging.status()"

# 7. Check metrics access
script eval "print(getSafeMetric('v.b.soc', 0))"
```

### Common Errors and Solutions

| Error | Cause | Solution |
|-------|-------|----------|
| `ReferenceError: identifier 'exports' undefined` | Using `exports` with `.` command | Use global object pattern instead |
| `SyntaxError: invalid object literal` | Arrow functions or template literals | Convert to ES5 syntax |
| `TypeError: undefined not callable` | Modern array methods | Use ES5 alternatives (loops, indexOf) |
| Script loads but functions don't work | Module not assigned to global | Add `modulename = exports;` or use global pattern |
| `undefined not callable` from metric read | Metric doesn't exist | Always use getSafeMetric wrapper |
| Config returns NaN | Reading "undefined" string | Check for string "undefined", not just undefined |

---

## Quick Reference Card

### Current Implementation (v1.3.x)
- ✅ ES5.1 JavaScript only
- ✅ ticker.300 for monitoring
- ✅ Native OVMS suffsoc for stopping
- ✅ ticker.300 + vehicle events
- ❌ No clock events (deprecated)
- ❌ No vehicle.charge.start event

### Module Loading
- `require()` → Use `exports.func = ...`
- `.` command → Use `myobj = {}; myobj.func = ...`

### OVMS Quirks
- Config Get returns STRING "undefined"
- Metrics can be bool/string/number
- Use dot notation for config keys
- Notifications limited to ~200 chars
- Normalize time calculations for midnight

### Command Syntax
- Always: `script eval "function()"`
- Never: `function()` alone

### Event Patterns (Current)
- ✅ ticker.300 for schedule checks
- ✅ vehicle.charge.prepare for plug-in
- ✅ vehicle.charge.pilot.off for unplug
- ✅ vehicle.charge.stop for completion
- ❌ No clock events
- ❌ No vehicle.charge.start

### Critical Status
- ✅ SOC stopping: WORKING (native suffsoc)
- ✅ Schedule starting: WORKING
- ✅ Notifications: WORKING
- ✅ Cost calculations: WORKING

---

## For AI Assistants / Future Sessions

**Before making ANY changes:**
1. ✅ Read this file completely
2. ✅ Check existing code patterns
3. ✅ Verify ES5.1 compatibility
4. ✅ Test command syntax
5. ✅ Consider OVMS quirks

**When in doubt:**
- Follow existing code patterns
- Test on actual OVMS hardware
- Ask user before major changes

---

**Last Updated:** 2025-12-04  
**Maintained by:** Andy (andyorkney)  
**Project:** OVMS Smart Charging System for Nissan ENV200
