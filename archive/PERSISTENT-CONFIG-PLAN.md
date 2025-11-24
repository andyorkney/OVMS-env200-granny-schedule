# Persistent Configuration Feature - Implementation Plan

**Branch:** `feature/persistent-config`
**Base:** `claude/recover-archived-session-011CUkjdCxM2QyiAsKmjqaYz`
**Status:** In Development
**Date:** 2025-11-03

---

## Final Design Decisions

### 1. Critical Mode Auto-Clear Behavior

**When to clear critical mode:**
- ✅ **When charge completes** (not time-based grace period)
- ✅ **When target met** (within 5% tolerance for 100% target)
- ✅ **Manual cancel** via `charging.cancelCritical()`

**Example:**
```
Set: Target 100%, Ready-by 05:00 [CRITICAL]
Charge completes at 95%+ → Critical mode clears automatically
Next charge → Uses main settings (80% target, 07:30 ready-by)
```

### 2. 100% Target Persistence

**100% target stays critical until:**
- Charge completes AND SOC ≥ 95%
- User manually cancels

**Not time-based** - Critical mode persists through multiple charge attempts if target not reached.

**Example:**
```
Night 1: Set 100%, charge to 96% → Critical clears (within 5% tolerance)
Night 1: Set 100%, charge to 90% → Critical PERSISTS (not within 5%)
Night 2: Continues charging to 100% → Critical clears when 95%+ reached
```

### 3. Cost Calculation for Temp Schedules

**Formula:**
```
Estimated kWh = (Target SOC - Current SOC) × Battery Capacity / 100
Estimated Hours = Estimated kWh / Charge Rate
Standard Cost = Estimated kWh × Standard Rate
Cheap Cost = Estimated kWh × Cheap Rate
Extra Cost = Standard Cost - Cheap Cost
```

**Warning Message:**
```
[TEMPORARY] Schedule: 14:00 to 17:00
[WARNING] Outside main cheap window (23:30-05:30)

Cost Comparison (estimated 2.5kWh charge):
  Standard rate (£0.28/kWh): £0.70
  Cheap rate (£0.07/kWh): £0.18
  Extra cost: £0.52

Will auto-revert to main schedule after session completes.
```

### 4. Function Names

**Final API:**
- `setTempSchedule(startHour, startMin, stopHour, stopMin)` ✅
- `setTempReadyBy(hour, minute)` ✅
- `cancelCritical()` ✅
- `setSchedule()` - enhanced to persist
- `setReadyBy()` - enhanced to persist

---

## Critical Journey Detection Rules

### Rule 1: 100% Target Requested
```javascript
if (config.targetSOC === 100) {
    activateCriticalMode("100% target requested");
}
```

### Rule 2: Earlier Ready-By
```javascript
if (tempReadyBy < mainReadyBy) {
    activateCriticalMode("Earlier ready-by: " + tempReadyBy + " (main: " + mainReadyBy + ")");
}
```

### Critical Mode Features
1. **Persist through reboot** - Settings saved to OvmsConfig
2. **Emergency warnings** - Alert if charge won't complete in time
3. **Auto-clear on completion** - Clears when charge meets target (within 5%)
4. **Manual cancel** - User can clear any time

---

## OvmsConfig Storage Keys

### Main Settings (Persistent)
```
usr.charging.schedule.start.hour
usr.charging.schedule.start.minute
usr.charging.schedule.end.hour
usr.charging.schedule.end.minute
usr.charging.readyby.hour (null = fixed schedule mode)
usr.charging.readyby.minute
usr.charging.target.soc
usr.charging.skip.threshold
usr.charging.rate.kw
usr.charging.pricing.cheap
usr.charging.pricing.standard
usr.charging.pricing.currency
```

### Critical Journey State
```
usr.charging.critical.active (true/false)
usr.charging.critical.readyby.hour
usr.charging.critical.readyby.minute
usr.charging.critical.target.soc
usr.charging.critical.reason (for diagnostics)
```

---

## Module Load Behavior

```javascript
function initializeConfig() {
    // 1. Start with hardcoded defaults
    var config = getHardcodedDefaults();

    // 2. Load persistent settings from OvmsConfig
    loadPersistedMainSettings(config);

    // 3. Check for active critical journey
    if (isCriticalModeActive()) {
        loadCriticalSettings(config);
        print("[CRITICAL JOURNEY] Restored from storage\n");
    }

    return config;
}
```

---

## Reboot Scenarios

### Scenario 1: Normal Persistent Settings
```
Before reboot:
- Main schedule: 00:30-06:30 (user changed from 23:30-05:30)
- Main ready-by: 06:00 (user changed from 07:30)

After reboot:
- Main schedule: 00:30-06:30 ✅ (loaded from OvmsConfig)
- Main ready-by: 06:00 ✅ (loaded from OvmsConfig)
```

### Scenario 2: Temp Schedule (Not Critical)
```
Before reboot:
- Main schedule: 23:30-05:30
- Temp schedule: 14:00-17:00 (Octopus free hours)
- Reboot at 15:00

After reboot:
- Active schedule: 23:30-05:30 ✅ (temp lost, reverted to main)
```

### Scenario 3: Critical Journey
```
Before reboot:
- Main ready-by: 07:30
- Temp ready-by: 05:00 [CRITICAL - earlier than main]
- Target: 100% [CRITICAL]
- Reboot at 02:00

After reboot:
- Ready-by: 05:00 ✅ (restored from critical storage)
- Target: 100% ✅ (restored from critical storage)
- [CRITICAL JOURNEY] banner shown
- Will clear when charge reaches 95%+
```

### Scenario 4: Expired Critical Journey
```
Before reboot:
- Critical ready-by: 05:00
- Critical target: 100%
- Charge completed at 96% at 04:30

After reboot at 08:00:
- Critical mode cleared ✅ (target was met)
- Reverted to main settings
```

---

## Implementation Phases

### Phase 1: Persistence Layer ✅ (First)
- Add OvmsConfig read/write functions
- Modify existing setSchedule(), setReadyBy(), setLimits() to persist
- Load persisted settings on module initialization
- Fix NaN/undefined handling in config loading

### Phase 2: Temp Functions ✅ (Second)
- Implement setTempSchedule()
- Implement setTempReadyBy()
- Add auto-revert logic in stop() function
- Add cost warnings

### Phase 3: Critical Detection ✅ (Third)
- Implement isCriticalCharge() detection
- Add critical mode activation/persistence
- Add emergency warnings
- Add auto-clear on completion (95%+ tolerance)

### Phase 4: Testing ✅ (Fourth)
- Test persistence across reboots
- Test temp schedule auto-revert
- Test critical journey survival
- Test 95%+ tolerance clearing

### Phase 5: UX Enhancements (Future)
- **Proactive overflow warnings**: Show overflow warning when setLimits() is called
- **Example output when setting 90% target:**
  ```
  [PERSISTENT] Target: 90%, skip above: 80%

  [WARNING] Charge time (7.3h) exceeds cheap window (6.0h)
  Cost: £1.24 (£0.76 cheap + £0.48 overflow)
  Overflow: 1.3h (2.3 kWh) @ £0.29/kWh after 05:30

  Tip: Run 'charging.nextCharge()' for full schedule details
  ```
- **Benefits**: User immediately knows if target will overflow, can adjust before charge starts
- **Implementation**: Call calculateOptimalStart() in setLimits() and show warning if overflow detected

---

## Test Cases

### Test 1: Main Schedule Persistence
```bash
script eval charging.setSchedule(0,30,6,30)
# Reboot
script eval charging.status()
# Expected: Shows 00:30-06:30
```

### Test 2: Temp Schedule Auto-Revert
```bash
script eval charging.setTempSchedule(14,0,17,0)
script eval charging.start()
# Wait for charge to complete
script eval charging.status()
# Expected: Shows main schedule (not temp)
```

### Test 3: Critical Journey - Earlier Ready-By
```bash
script eval charging.setTempReadyBy(5,0)  # Main is 07:30
# Expected: "[CRITICAL JOURNEY] Earlier ready-by detected"
# Reboot
script eval charging.status()
# Expected: Still shows ready-by 05:00 [CRITICAL]
```

### Test 4: Critical Journey - 100% Target
```bash
script eval charging.setLimits(100,80)
# Expected: "[CRITICAL JOURNEY] 100% target requested"
script eval charging.start()
# Charge to 96%
# Expected: Critical clears (within 5% tolerance)
```

### Test 5: Cost Warning Display
```bash
script eval charging.setTempSchedule(14,0,17,0)
# Expected output:
# [WARNING] Outside cheap window
# Cost comparison: Standard £X vs Cheap £Y
# Extra cost: £Z
```

---

## Edge Cases to Handle

### Edge 1: Set 100% But Already at 96%
```
Action: Set target 100%
Current: 96%
Result: Critical mode activates, but charge not needed
Clear: Immediately (already within tolerance)
```

### Edge 2: Set Earlier Ready-By But Charge Completes Late
```
Action: Set ready-by 05:00 [CRITICAL]
Actual: Charge completes at 05:30 (late)
Result: Critical clears on completion (target met)
Warning: Log that ready-by was missed
```

### Edge 3: Multiple Reboots During Critical
```
Set critical → Reboot → Restore → Reboot → Restore → Complete
Each reboot should restore critical settings until completion
```

### Edge 4: Manual Cancel During Charge
```
Critical charge in progress
User: charging.cancelCritical()
Result: Stop charging, revert to main settings immediately
```

---

## Code Size Estimate

**New Code:** ~250 lines
**Modified Code:** ~50 lines
**Total Impact:** ~300 lines

**Complexity:** Medium
- Uses built-in OvmsConfig (well-tested)
- Clear state machine (normal → temp → critical)
- Auto-cleanup logic (completion-based)

---

## Success Criteria

✅ User can change main schedule and it persists forever
✅ User can set temp schedule for one-time use
✅ Temp schedule auto-reverts after charge completes
✅ Earlier ready-by or 100% target triggers critical mode
✅ Critical mode persists through reboots
✅ Critical mode auto-clears when target met (95%+ tolerance)
✅ Cost warnings show for temp schedules
✅ All existing functionality continues to work

---

## Notes

- **Backwards Compatible:** Existing configs continue to work (just not persistent)
- **Migration Path:** First run loads defaults, then persists them
- **Safe Defaults:** If OvmsConfig fails, fall back to hardcoded defaults
- **User Control:** All settings can be changed, cleared, or reset
