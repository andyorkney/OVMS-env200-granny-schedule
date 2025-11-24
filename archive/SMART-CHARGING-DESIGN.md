# Smart Charging System - Design Specification v1.1

**Status: LOCKED** - Changes require mutual agreement and CHANGELOG entry
**Date:** 2025-01-15 (Updated)
**Vehicle:** Nissan ENV200
**OVMS:** v3 Module
**Tariff:** Intelligent Octopus Go (UK)

---

## Purpose

Automatically schedule vehicle charging to maximize use of cheap electricity rate window while ensuring vehicle is ready when needed.

---

## Core Principles (Priority Order)

1. **HIGHEST:** Reach target SOC (e.g., 80%)
2. **SECOND:** Be ready by departure time (e.g., 07:30)
3. **THIRD:** Maximize charging in cheap window (23:30-05:30)
4. **FOURTH:** System stability (don't crash OVMS)
5. **FIFTH:** User configuration flexibility

---

## User Scenarios

### Scenario 1: Normal Weekday Evening

```
18:00 - Arrive home, plug in ENV200
        SOC: 50%
        Target: 80%
        Cheap window: 23:30-05:30
        Ready by: 07:30

Expected:
→ Car starts charging briefly (auto-start)
→ OVMS stops it within 15-60 seconds
→ Notification: "[18:01] Scheduled for 23:30. Will reach 80% by 02:30. Est. cost £0.71"
→ 23:30 - Charging starts automatically
→ Notification: "[23:30] Charging started. Target 80%."
→ 02:30 - Reaches 80%, stops
→ Notification: "[02:30] Charged to 80%"
```

### Scenario 2: Overspill Required

```
18:00 - Plug in
        SOC: 40%
        Target: 80%
        Granny charger: 1.8 kW
        Need: 8.7 hours
        Cheap window: 6 hours

Expected:
→ Notification: "[18:01] Scheduled for 23:30. Will reach 80% by 08:12.
                 Est. cost £1.80 (includes 2.7h at standard rate)"
→ Accepts overspill to reach target
```

### Scenario 3: Must Start Early

```
18:00 - Plug in
        SOC: 20%
        Target: 100%
        Need: 12 hours
        Ready by: 07:30

Expected:
→ Notification: "[18:01] Scheduled for 19:30. Will reach 100% by 07:30.
                 Est. cost £2.58 (must start 4h before cheap window)"
→ Starts before cheap window to meet deadline
```

### Scenario 4: Already Charged

```
18:00 - Plug in
        SOC: 82%
        Target: 80%

Expected:
→ Notification: "[18:01] Already at 82% (target 80%). Charge skipped."
→ No charging occurs
```

### Scenario 5: Manual Override

```
20:00 - Need to leave unexpectedly
        User opens app → "Start Charge"

Expected:
→ Notification: "[20:00] Manual charge started. Target 80%."
→ Charges immediately, ignores schedule
→ Stops at 80%
```

### Scenario 6: Charge Interruption with Auto-Recovery (NEW v1.1)

```
23:30 - Scheduled charge starts, SOC 50%
01:00 - Power cut / pilot signal lost
        SOC now 65%

Expected:
→ Notification: "[01:00] Charging interrupted at 65%. Retrying in 2 minutes... (attempt 1/3)"
→ Wait 2 minutes
→ Climate wake cycle (on 10s, off 5s) to restore pilot signal
→ Restart charging
→ Notification: "[01:02] Charging restarted. Target 80%."

If retry fails:
→ Notification: "[01:02] Charging interrupted at 65%. Retrying in 5 minutes... (attempt 2/3)"
→ Repeat up to 3 times

After 3 failures:
→ Notification: "[01:17] Charging failed multiple times at 65% (target 80%).
                 Please check vehicle and charger."
```

---

## Configuration

### User Settings (Stored in OVMS config)

```javascript
charging.target_soc = 80          // Target state of charge (%)
charging.ready_by = "07:30"       // Departure time (HH:MM)
charging.cheap_start = "23:30"    // Cheap rate window start
charging.cheap_end = "05:30"      // Cheap rate window end
charging.cheap_rate = 0.07        // £0.07 per kWh (Intelligent Octopus Go)
charging.standard_rate = 0.292    // £0.292 per kWh (UK average)
charging.charger_rate = 1.8       // Charger power in kW (granny default)
charging.battery_override = 0     // Override capacity (0 = auto-detect)
charging.soh_override = 0         // Override SOH (0 = auto-detect)
```

### Auto-Detected from Vehicle

```javascript
v.b.soc           // Current state of charge (%)
v.b.capacity      // Nominal battery capacity (kWh)
v.b.soh           // State of health (%) - defaults to 100% if not available
v.c.voltage       // Charging voltage (V) - when charging
v.c.current       // Charging current (A) - when charging
v.c.pilot         // Charge pilot present (plugged in)
v.c.charging      // Currently charging (true/false)
```

---

## Calculations

### Actual Battery Capacity (SOH-Aware)

```
effective_capacity = battery_capacity × (soh / 100)

Example:
- Nominal: 40 kWh
- SOH: 85% (degraded battery)
- Effective: 40 × 0.85 = 34 kWh
```

### Energy Needed

```
soc_needed = target_soc - current_soc
kwh_needed = (soc_needed / 100) × effective_capacity

Example:
- Current: 50%, Target: 80%
- Need: 30% of 34 kWh = 10.2 kWh
```

### Charge Duration

```javascript
// Planning (use config value)
hours_needed = kwh_needed / charger_rate_config

// During charge (use actual detected rate)
actual_rate = (v.c.voltage × v.c.current) / 1000  // kW
hours_remaining = kwh_remaining / actual_rate
```

### Cost Calculation

```
cheap_hours = min(hours_needed, hours_in_cheap_window)
overspill_hours = max(0, hours_needed - hours_in_cheap_window)

cheap_cost = cheap_hours × charger_rate × cheap_rate
overspill_cost = overspill_hours × charger_rate × standard_rate
total_cost = cheap_cost + overspill_cost
```

---

## Decision Logic

### On Plug-In (vehicle.charge.prepare or vehicle.charge.start)

```
1. Read current SOC
   IF current_soc >= target_soc THEN
     → Stop charging
     → Notify: "[HH:MM] Already at X% (target Y%). Charge skipped."
     → EXIT

2. Calculate charge requirement
   → effective_capacity = capacity × (soh / 100)
   → kwh_needed = (target_soc - current_soc) / 100 × effective_capacity
   → hours_needed = kwh_needed / charger_rate

3. Determine start time
   → latest_start = ready_by - hours_needed

   IF latest_start >= cheap_start THEN
     → scheduled_start = cheap_start (prefer cheap window)
   ELSE
     → scheduled_start = latest_start (must start early)

4. Calculate finish time and costs
   → scheduled_end = scheduled_start + hours_needed
   → Calculate cheap/overspill hours and costs

5. Stop auto-charge (ENV200 auto-starts when plugged in)
   → Execute: "charge stop"

6. Send notification with schedule and cost estimate (with timestamp)

7. Set timer for scheduled_start
```

### At Scheduled Start Time

```
1. Verify still plugged in
   IF NOT plugged_in THEN
     → Notify: "[HH:MM] Scheduled charge cannot start - vehicle not plugged in!"
     → EXIT

2. Verify still needs charging
   IF current_soc >= target_soc THEN
     → Notify: "[HH:MM] Already at target. Charge skipped."
     → EXIT

3. Start charging
   → Execute: "charge start"
   → Notify: "[HH:MM] Charging started. Target X%."
   → Set flag: scheduled_charge_active = TRUE

4. Begin SOC monitoring (every 30 seconds)
```

### During Charging (Every 30 seconds)

```
1. Read current SOC
   IF current_soc >= target_soc THEN
     → Execute: "charge stop"
     → Notify: "[HH:MM] Charged to X%"
     → Clear flag: scheduled_charge_active = FALSE
     → EXIT monitoring

2. Verify still charging
   IF NOT charging AND scheduled_charge_active THEN
     → Trigger charge interruption handler (NEW v1.1)
```

### On Charge Interruption (NEW v1.1)

```
IF charging stops unexpectedly during scheduled charge:

  1. Increment retry_count (max 3 attempts)

  2. IF retry_count > 3 THEN
       → Notify: "[HH:MM] Charging failed multiple times at X% (target Y%).
                  Please check vehicle and charger."
       → Clear scheduled_charge_active
       → EXIT

  3. Set retry delay:
       - Attempt 1: 2 minutes
       - Attempt 2: 5 minutes
       - Attempt 3: 10 minutes

  4. Notify: "[HH:MM] Charging interrupted at X%. Retrying in Y minutes... (attempt N/3)"

  5. Wait retry delay

  6. Verify still plugged in and below target

  7. Perform climate wake cycle:
       → Execute: "climatecontrol on"
       → Wait 10 seconds
       → Execute: "climatecontrol off"
       → Wait 5 seconds

  8. Restart charging
       → Execute: "charge start"
       → Notify: "[HH:MM] Charging restarted. Target X%."

  9. Continue SOC monitoring

NOTE: Manual override charges do NOT auto-retry (user is present to handle)
```

### On Manual Start (User presses "Start Charge")

```
1. Set flags
   → manual_override = TRUE
   → scheduled_charge_active = FALSE
   → Cancel scheduled start timer

2. Start charging immediately
   → Execute: "charge start"
   → Notify: "[HH:MM] Manual charge started. Target X%."

3. Begin SOC monitoring (every 30 seconds)
   → Same as scheduled charge monitoring
   → NO AUTO-RETRY on interruption (user present)
```

### On Unplug (vehicle.charge.pilot.off)

```
1. Clear all flags and timers
   → scheduled_charge_active = FALSE
   → manual_override = FALSE
   → retry_count = 0
   → Cancel all timers

2. Log: "Unplugged - schedule cleared"
```

---

## Notification Formats (All with Timestamps)

### Normal Schedule (Fits in Cheap Window)
```
"[18:01] Scheduled for 23:30. Will reach 80% by 02:30. Est. cost £0.71"
```

### Overspill Required
```
"[18:01] Scheduled for 23:30. Will reach 80% by 08:12. Est. cost £1.80 (includes 2.7h at standard rate)"
```

### Must Start Early
```
"[18:01] Scheduled for 19:30. Will reach 100% by 07:30. Est. cost £2.58 (must start 4h before cheap window)"
```

### Already Charged
```
"[18:01] Already at 82% (target 80%). Charge skipped."
```

### Manual Override
```
"[20:15] Manual charge started. Target 80%."
```

### Charge Complete
```
"[02:30] Charged to 80%"
```

### Missed Schedule (Not Plugged In)
```
"[23:30] Scheduled charge cannot start - vehicle not plugged in!"
```

### Interrupted (NEW v1.1)
```
"[01:00] Charging interrupted at 65%. Retrying in 2 minutes... (attempt 1/3)"
"[01:02] Charging restarted. Target 80%."
```

### Failed After Retries (NEW v1.1)
```
"[01:17] Charging failed multiple times at 65% (target 80%). Please check vehicle and charger."
```

---

## Command Interface

### Configuration Commands

```javascript
charging.setTarget(80)              // Set SOC target to 80%
charging.setReadyBy(7, 30)          // Set ready-by to 07:30
charging.setWindow(23, 30, 5, 30)   // Cheap window 23:30-05:30
charging.setRates(0.07, 0.292)      // Set cheap/standard rates (£/kWh)
charging.setCharger(1.8)            // Set charger rate (kW)
```

### Status & Control

```javascript
charging.status()    // Show current config, schedule, and vehicle state
charging.start()     // Manual start (override schedule)
charging.stop()      // Manual stop
```

### OVMS Native Config (Persisted)

```bash
config set charging target_soc 80
config set charging ready_by 07:30
config set charging cheap_start 23:30
config set charging cheap_end 05:30
config set charging cheap_rate 0.07
config set charging standard_rate 0.292
config set charging charger_rate 1.8
```

---

## Edge Cases

### Impossible Ready-By Time

```
IF hours_needed > (ready_by - current_time) THEN
  → Start at cheap_window anyway
  → Notify: "[HH:MM] Cannot reach X% by ready-by time (need Yh, only Zh available).
             Scheduled for cheap window start. Will finish late."
```

### SOH Not Available

```
IF v.b.soh is undefined or 0 THEN
  → Use soh = 100 (assume healthy battery)
  → Log warning: "SOH not available, assuming 100%"
```

### Charger Rate Detection Failed

```
IF v.c.voltage or v.c.current not available THEN
  → Use charger_rate from config
  → Continue normally
```

### Climate Wake Cycle Fails (NEW v1.1)

```
Climate wake is best-effort to restore pilot signal.
If it doesn't work after 3 attempts, system gives up and notifies user.
No harm done if climate commands fail - just won't help pilot recovery.
```

---

## Out of Scope (Future Features)

- ❌ Low battery reminder alerts (at home, not plugged in)
- ❌ Cost minimization mode (stop at window end, accept not reaching target)
- ❌ Dynamic window adjustment (Octopus changing cheap times)
- ❌ Battery preconditioning
- ❌ Historical charge tracking
- ❌ Web UI configuration

---

## Technical Notes

### Event Subscriptions Required

```javascript
PubSub.subscribe("vehicle.charge.prepare", onPlugIn)  // Or...
PubSub.subscribe("vehicle.charge.start", onPlugIn)    // Whichever fires on ENV200
PubSub.subscribe("vehicle.charge.pilot.off", onUnplug)
// Ticker for SOC monitoring while charging (30-second interval)
```

### OVMS Commands

```javascript
OvmsCommand.Exec("charge start")          // Start charging
OvmsCommand.Exec("charge stop")           // Stop charging
OvmsCommand.Exec("climatecontrol on")     // Start climate (wake pilot)
OvmsCommand.Exec("climatecontrol off")    // Stop climate
```

### Metrics to Monitor

```javascript
OvmsMetrics.AsFloat("v.b.soc")        // State of charge
OvmsMetrics.AsFloat("v.b.capacity")   // Battery capacity
OvmsMetrics.AsFloat("v.b.soh")        // State of health
OvmsMetrics.AsFloat("v.c.voltage")    // Charge voltage
OvmsMetrics.AsFloat("v.c.current")    // Charge current
OvmsMetrics.Value("v.c.pilot")        // Pilot signal (plugged in)
OvmsMetrics.Value("v.c.charging")     // Charging status
```

### JavaScript Engine Compatibility (CRITICAL)

```
⚠️ OVMS uses DukTape JavaScript engine with LIMITED features:
   - NO async/await support (will crash/stall)
   - Use setTimeout/callback patterns only
   - Always clear timers before setting new ones
   - Test thoroughly before deploying
```

---

## Change Control

Any changes to this specification MUST:
1. Be discussed and agreed upon
2. Be documented in SMART-CHARGING-CHANGELOG.md
3. Include version bump (v1.0 → v1.1 → v1.2)
4. Be reflected in code comments

**This document is the source of truth for implementation.**

---

*End of Design Specification v1.1*
