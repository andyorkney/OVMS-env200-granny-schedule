# OVMS Smart Charging - Lessons Learned & Debug Log

**Purpose:** Permanent record of what works, what breaks, and why
**Rule:** Update this BEFORE making changes that might repeat past mistakes

---

## CRITICAL: Things That WILL Break OVMS

### 1. OvmsMetrics Calls During Module Load
**Symptom:** JS engine stalls, `script reload` hangs, commands unresponsive
**Cause:** Calling OvmsMetrics.AsFloat() during script initialization
**Solution:** Defer ALL metric calls to first ticker callback
```javascript
// BAD - causes stall
state.lastPluggedIn = isPluggedIn();  // OvmsMetrics call during load

// GOOD - defer to ticker
state.lastPluggedIn = false;  // No metric call
// First ticker will detect plug-in
```

### 2. Subscribing to vehicle.charge.start + Calling charge stop
**Symptom:** Start/stop loop, "Timer On" message, vehicle cannot charge
**Cause:** vehicle.charge.start fires when charging BEGINS (not plug-in)
**Solution:** Use passive ticker-based polling, NOT event subscriptions
```javascript
// BAD - causes start/stop loop
PubSub.subscribe("vehicle.charge.start", function() {
    OvmsCommand.Exec("charge stop");  // STOPS EVERY CHARGE ATTEMPT!
});

// GOOD - passive monitoring
PubSub.subscribe("ticker.60", tickerHandler);
// Detect plug-in via state change polling
```

### 3. const/let Keywords
**Symptom:** Script may load but DukTape ES5.1 engine doesn't support them properly
**Cause:** DukTape is ES5.1, not ES6+
**Solution:** Use `var` exclusively
```javascript
// BAD
const VERSION = "3.0";
let count = 0;

// GOOD
var VERSION = "3.0";
var count = 0;
```

### 4. Anonymous Functions in PubSub.subscribe
**Symptom:** Possible reload stalls
**Cause:** Anonymous function creation during init
**Solution:** Use named function references
```javascript
// POSSIBLY BAD
PubSub.subscribe("ticker.60", function() {
    doStuff();
});

// GOOD - matches v2.0.7 pattern
function tickerHandler() {
    doStuff();
}
PubSub.subscribe("ticker.60", tickerHandler);
```

### 5. xnl Command Prefix
**Symptom:** Commands not recognized or conflicting behavior
**Cause:** xnl is Nissan-specific module prefix
**Solution:** Use generic commands unless specifically needed
```javascript
// SOMETIMES WRONG
OvmsCommand.Exec("xnl charge start");

// USUALLY CORRECT
OvmsCommand.Exec("charge start");
```

---

## Config Key Naming

### Legacy Keys (what OVMS actually has):
```
charging.target.soc
charging.readyby.hour
charging.readyby.minute
charging.window.start.hour
charging.window.start.minute
charging.window.end.hour
charging.window.end.minute
charging.pricing.cheap
charging.pricing.standard
charging.charger.rate
charging.priority
charging.monitoring
```

### WRONG (snake_case we tried to introduce):
```
charging.target_soc
charging.ready_by_hour
charging.cheap_start_hour
charging.cheap_rate
```

**Rule:** Always match existing config keys, don't introduce new naming conventions.

---

## Event Subscriptions That WORK

```javascript
PubSub.subscribe("ticker.60", functionName);  // Safe - 60 second intervals
```

## Event Subscriptions That CAUSE PROBLEMS

```javascript
PubSub.subscribe("vehicle.charge.start", handler);   // Fires when charging BEGINS
PubSub.subscribe("vehicle.charge.prepare", handler); // May also cause issues
PubSub.subscribe("vehicle.charge.pilot.on", handler); // Untested
```

**Rule:** Prefer ticker-based polling over event subscriptions.

---

## Metrics Access Patterns

### Safe Pattern (in ticker callback):
```javascript
function tickerHandler() {
    var soc = getMetric("v.b.soc", 0);
    var plugged = getMetric("v.c.pilot", 0) !== 0;
}

function getMetric(name, defaultVal) {
    try {
        if (OvmsMetrics.HasValue(name)) {
            return OvmsMetrics.AsFloat(name);
        }
        return defaultVal;
    } catch (e) {
        return defaultVal;
    }
}
```

### UNSAFE Pattern (during module load):
```javascript
// At module scope, NOT in a function
var currentSOC = OvmsMetrics.AsFloat("v.b.soc");  // MAY STALL
```

---

## Version History: What Worked vs What Broke

### v2.0.7.3 - WORKING
- 429 lines
- Single ticker.60 subscription to named function
- No OvmsMetrics calls during init
- Legacy config keys
- No charge stop on plug-in
- Window-based priority (stops at window end - DESIGN FLAW but stable)

### v3.4.0 - BROKEN
- 1129 lines
- Subscribed to vehicle.charge.start event
- Called charge stop in event handler
- CAUSED START/STOP LOOP
- "Timer On" prevented all charging

### v3.5.0 - IN TESTING
- 680 lines
- Passive ticker-based monitoring (like v2.0.7)
- No OvmsMetrics calls during init
- Named function for ticker subscription
- Stops at target SOC (not window end)
- Missing: one-shot auto-stop, persistence

---

## Design Flaws to Avoid

### 1. Stop at Window End (v2.0.7's "window" priority)
**Problem:** Violates Priority #1: Reach target SOC
**User impact:** Wakes up with partial charge
**Solution:** Always charge to target, use window only to determine start time

### 2. Event-Driven Charge Control
**Problem:** Events fire at unexpected times, cause interference
**Solution:** Passive polling - check state, don't react to events

### 3. Complex Timer Systems
**Problem:** DukTape doesn't have setTimeout, custom implementations are fragile
**Solution:** Use ticker.60 for all timing needs, track state with timestamps

---

## Pending Issues to Resolve

### 1. One-Shot Auto-Stop on Plug-In
**Need:** Stop ENV200 auto-charge once on plug-in, then don't interfere
**Challenge:** Distinguish auto-start from our scheduled start
**Approach:** Track `stoppedAutoChargeThisSession` flag, reset on unplug

### 2. Persistence for Reboot Recovery
**Need:** Resume charging after power cut / firmware update
**Challenge:** Know if we were mid-session
**Approach:** Persist schedule to OVMS config, check on boot

### 3. Charge Recovery After Power Cut
**Need:** If charging interrupted mid-schedule, resume
**Challenge:** Detect we were charging vs just plugged in
**Approach:** Store `charging.session.active = true` in config

---

## Testing Checklist

Before deploying ANY version:
- [ ] Script loads without stall (script reload works)
- [ ] Manual charge start is not stopped by script
- [ ] Manual charge stop works
- [ ] status() command works
- [ ] Config values load correctly
- [ ] No start/stop loop on plug-in
- [ ] Ticker fires every 60 seconds (check logs)

---

## Debug Commands

```bash
# View script output
log level verbose scripts

# Check loaded scripts
script list

# Reload after edit
script reload

# Check metrics
metrics list v.c.*
metrics list v.b.*

# View config
config list usr

# Manual charge control
charge start
charge stop
charge status
```

---

## Files That Matter

- `charging.js` - Main script (in /store/scripts/lib/)
- `ovmsmain.js` - Loads charging.js (must have `charging = require("lib/charging")`)
- `/store/events/` - Event-based scripts (not recommended, use ticker instead)

---

## When Things Go Wrong

### JS Engine Stalled
1. Module reboot: `module reset`
2. Or full reboot via OVMS Connect app
3. Check log for error before stall

### Can't Charge Vehicle
1. Verify no script is running charge stop: `script reload`
2. Check for start/stop loop in logs
3. Try manual `charge start` without script

### Config Not Loading
1. Check key names match exactly: `config list usr | grep charging`
2. Verify values are valid numbers
3. Check loadConfig() error messages in log

---

**This document is our institutional memory. UPDATE IT when you learn something new!**

---

*Last Updated: 2025-11-17*
*Current Version: v3.5.0*
