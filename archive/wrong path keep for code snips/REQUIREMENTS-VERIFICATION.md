# OVMS Smart Charging - Requirements Verification Checklist

## Purpose
This document ensures all core features are implemented and tested before any code changes are merged.
Use this checklist to verify nothing is broken or missing.

---

## Priority Hierarchy (CRITICAL - Informs All Design Decisions)

When requirements conflict, this hierarchy determines which wins:

### 1. HIGHEST PRIORITY: Reach Target SOC
- **Must**: Charge to `config.targetSOC` (e.g., 80%)
- **May**: Charge outside cheap window if needed to reach target
- **May**: Continue after window end time if needed
- **Why**: Battery health and user's SOC expectation is paramount

### 2. SECOND PRIORITY: Ready By Time (if configured)
- **Must**: Be at target SOC by ready-by time
- **May**: Start earlier than cheap window if needed
- **May**: Charge outside cheap window if needed
- **Why**: User's departure time requirement

### 3. THIRD PRIORITY: Charge in Cheap Window (when possible)
- **Should**: Maximize charging during cheap rate window
- **Should**: Minimize overflow into expensive rate
- **Must**: Warn user about overflow costs
- **Why**: Cost optimization, but not at expense of SOC target or ready-by time

### 4. FOURTH PRIORITY: System Stability
- **Must**: Not crash or overburden OVMS
- **Must**: Not cause event queue delays
- **Should**: Minimize CPU load when possible
- **May**: Use ticker events if needed for accuracy, but keep minimal
- **Why**: Reliability is essential

### 5. FIFTH PRIORITY: User Configuration Flexibility
- **Must**: Preserve all existing user configuration options
- **Must**: Allow different charger speeds (1.8kW - 22kW+)
- **Must**: Work with any OVMS-supported vehicle
- **Why**: Universal compatibility

---

## Critical Requirements (MUST WORK)

### 1. Stop Charging at Target SOC ⚠️ CRITICAL (Priority #1)
**Requirement**: Charging must stop when SOC reaches `config.targetSOC` (e.g., 80%)
**Not**: Stop only at window end time (05:30)
**Hierarchy**: This is THE highest priority - overrides cheap window timing

**How to Verify**:
- [ ] Set target: `charging.setLimits(80, 75)`
- [ ] Start charging at low SOC (e.g., 60%)
- [ ] Monitor: Does it stop at 80%? Or continue to 95-100%?

**Expected Result**:
- Charging stops at target SOC
- Acceptable accuracy:
  - ± 2-3% for slow chargers (< 7kW) - achievable with 30-min checks
  - ± 5-8% for fast chargers (7-22kW) - may need ticker events
  - Goal: Stop as close as reasonably possible without overburdening OVMS

**Design Constraint**:
- Must balance accuracy vs OVMS load (Priority #4)
- May use ticker events if needed, but keep minimal (e.g., 60-second interval only while charging)
- OVMS does NOT support `charge limit soc` command, so must monitor SOC ourselves

**Code Locations**:
- `start()` function: Subscribe to SOC monitoring if needed
- `checkSchedule()`: Monitor SOC and stop if >= target
- Consider: Ticker event subscription while charging for fast chargers

**Current Status**: ❌ was working we broke it - FAILING - Charges to 98% instead of 80-90%

---

### 2. Charge in Cheap Window When Possible (Priority #3)
**Requirement**: Maximize charging during cheap rate window
**Hierarchy**: Preference only - yield to Priority #1 (target SOC) and Priority #2 (ready-by time)

**How to Verify**:
- [ ] Set schedule: `charging.setSchedule(23,30,5,30)`
- [ ] Plug in vehicle at 22:00 with SOC < skipIfAbove
- [ ] Monitor: Does charging start at 23:30?

**Expected Result**:
- In fixed schedule mode: Starts within 30 minutes of window start
- In ready-by mode: Starts at optimal time (may be before/during/after window)

**Important**: May start BEFORE cheap window if needed to reach target by ready-by time

**Code Locations**:
- `checkSchedule()`: Lines 658-667
- `calculateOptimalStart()`: Determines start time for ready-by mode
- Clock events: Every 30 minutes

**Current Status**: ✅ WORKING - Confirmed by user (fixed schedule mode)

---

### 3. Skip If SOC Already Sufficient
**Requirement**: Don't start charging if `current SOC >= config.skipIfAbove`

**How to Verify**:
- [ ] Set limits: `charging.setLimits(80, 75)`
- [ ] Plug in at 23:30 with SOC = 76%
- [ ] Monitor: Should skip charging

**Expected Result**: Log shows "Skip: SOC 76% >= 75% (already charged enough)"

**Code Locations**:
- `checkSchedule()`: Lines 660-667
- `canCharge()`: Lines 631-639

**Current Status**: ⚠️ UNVERIFIED - real world tests required

---

### 4. Auto-Detect Battery Parameters
**Requirement**: Automatically detect battery capacity and SOH from vehicle metrics

**How to Verify**:
- [ ] Run: `charging.status()`
- [ ] Check "Battery" section shows:
  - Capacity: Reasonable value (20-100 kWh typical)
  - Health: Reasonable SOH (70-100%)
  - Values match vehicle's actual specs

**Expected Result**: Correct capacity and SOH displayed

**Code Locations**:
- `getBatteryParams()`: Lines 129-183

**Current Status**: ⚠️ UNVERIFIED? - I think this is Verified working

---

### 5. Intelligent "Ready By" Scheduling (Priority #2)
**Requirement**: Be at target SOC BY ready-by time, preferring cheap window start
**Hierarchy**: Second highest - overrides cheap window timing when necessary

**Logic:**
1. **Default**: Always start at cheap window start (23:30)
2. **Only start earlier**: If starting at 23:30 would finish AFTER ready-by deadline
3. **Prefer finishing early**: Better to start at 23:30 and finish at 05:00 than start at 01:00 to finish exactly at 07:30

**How to Verify**:
- [ ] Set charger rate: `charging.setChargeRate(1.8)`
- [ ] Set ready-by: `charging.setReadyBy(7,30)`
- [ ] Set target: `charging.setLimits(80,75)`
- [ ] Test Scenario A: Need 4h to charge
  - Should start: 23:30 (cheap window start)
  - Should finish: 03:30 (4h before ready-by - that's OK!)
  - Cost: All in cheap window
- [ ] Test Scenario B: Need 8h to charge
  - Should start: 23:30 (cheap window start)
  - Should finish: 07:30 (exactly at ready-by)
  - Cost: Cheap + overflow warning
- [ ] Test Scenario C: Need 10h to charge
  - Should start: 21:30 (MUST start 2h before cheap window)
  - Should finish: 07:30 (at ready-by)
  - Cost: Pre-window + cheap + overflow warning

**Expected Result**:
- Vehicle reaches target SOC BY ready-by time (may finish early ✓)
- Starts at cheap window start UNLESS would miss deadline
- Shows pre-window cost if must start early
- Shows overflow cost if extends beyond cheap window
- Warns user about non-cheap charging

**Important**: Ready-by is a deadline, not exact finish time. Prefer cheap window start over "perfect" timing.

**Code Locations**:
- `calculateOptimalStart()`: Must prefer cheap window start
- `checkSchedule()`: Starts at calculated time

**Current Status**: ⚠️ UNVERIFIED - Logic needs correction

---

### 6. Notifications for All Actions
**Requirement**: Every charge start/stop sends OVMS notification

**How to Verify**:
- [ ] Manual start: `charging.start()`
- [ ] Check OVMS Connect app for notification
- [ ] Manual stop: `charging.stop()`
- [ ] Check for notification

**Expected Result**: Notifications appear in OVMS Connect app

**Code Locations**:
- All `safeNotify()` calls throughout code

**Current Status**: testing so far actually has 2x notification in OVMS COnnect 

---

### 7. System Stability - Minimize OVMS Load (Priority #4)
**Requirement**: Don't crash or overburden OVMS
**Hierarchy**: Balance with accuracy needs - ticker events allowed if needed for Priority #1

**How to Verify**:
- [ ] Monitor event queue: No excessive delays
- [ ] Check CPU load reasonable
- [ ] Verify no crashes during charging cycles

**Expected Result**:
- No event queue warnings
- No system instability
- If ticker events used: Only while charging, minimal interval (60 seconds or more)

**Design Approach**:
- **Preferred**: Clock events every 30 minutes (adequate for slow chargers < 7kW)
- **Acceptable**: Ticker events if needed for fast chargers (≥ 7kW)
  - Subscribe only when charging starts
  - Unsubscribe when charging stops
  - Use 60-second interval minimum (not 1-second)
  - Ensures Priority #1 (target SOC) can be met

**Code Locations**:
- Clock events: `/store/events/clock.HHMM/`
- Potential ticker subscription: In `start()` function
- Ticker unsubscription: In `stop()` function

**Current Status**: ⚠️ Clock events working, ticker approach not yet implemented

---

### 8. Cost/Time Warnings for Overflow (Priority #3)
**Requirement**: Warn when charging must extend beyond cheap window
**Hierarchy**: Informational - helps user understand costs

**How to Verify**:
- [ ] Set small cheap window (e.g., 2 hours)
- [ ] Set target that requires 6 hours charge time
- [ ] Run: `charging.status()`
- [ ] Check: Shows overflow warning with costs

**Expected Result**:
- Shows finish time (even if after window end)
- Shows cost breakdown: £X in cheap rate + £Y in standard rate
- Total cost displayed
- Notification includes this information

**Code Locations**:
- `checkSchedule()`: Lines 672-675

**Current Status**: UNVERIFIED was WORKING (time-based stop exists and works but not as originally specified)

---

### 9. Pre-Charge Safety Checks
**Requirement**: Verify vehicle is plugged in, not already charging, SOC in valid range

**How to Verify**:
- [ ] Try to start when not plugged in: Should fail with message
- [ ] Try to start when already charging: Should skip
- [ ] Try to start when SOC >= skipIfAbove: Should skip

**Expected Result**: Appropriate error/skip messages

**Code Locations**:
- `canCharge()`: Lines 631-639
- `getChargeBlockReason()`: Lines 644-653

**Current Status**: ⚠️ UNVERIFIED

---

## Nice-to-Have Features (SHOULD WORK)

### 10. Cost Calculations with Overflow Warning
**Requirement**: Show estimated cost, warn if charging extends beyond cheap window and when estimated to finish

**How to Verify**:
- [ ] Run: `charging.status()` with ready-by mode
- [ ] Check: Shows overflow cost if charge duration > window duration

**Expected Result**: Warning shown when overflow detected

**Code Locations**:
- `calculateOptimalStart()`: Lines 744-770

**Current Status**: ✅ IMPLEMENTED (recently added to notifications)

---

### 11. Multiple Charge Rate Support
**Requirement**: Works with 1.8kW granny chargers up to 350kW rapid chargers

**How to Verify**:
- [ ] Set different rates: `charging.setChargeRate(1.8)`, `charging.setChargeRate(50)`
- [ ] Check time estimates adjust correctly

**Expected Result**: Charge time = kWh needed ÷ charge rate

**Code Locations**:
- `setChargeRate()`: Lines 409-423

**Current Status**: ⚠️ UNVERIFIED

---

## Verification Log

| Date | Tester | Requirement # | Result | Notes |
|------|--------|---------------|--------|-------|
| 2025-10-31 | User | 1 | ❌ FAIL | Charged to 98% instead of 80-90% |
| 2025-10-31 | User | 2 | ✅ PASS | Started at 23:30 as expected |
|  |  |  |  |  |

---

## Before Merging ANY Code Change

1. [ ] Review which requirements might be affected
2. [ ] Re-test those requirements
3. [ ] Update verification log
4. [ ] Confirm no regressions

---

## Critical Gaps Identified

### Gap #1: No SOC-Based Stopping ⚠️ CRITICAL (Priority #1 Violation)
**Issue**: Original code only stops at window end time, not at target SOC
**Impact**: Vehicle overcharges to 98% instead of 80-90%
**Root Cause**: OVMS does NOT support `charge limit soc` command

**Previous Fix Attempt (df82a2b)**: ❌ WILL NOT WORK
- Tried to use `charge limit soc` command (doesn't exist)
- 30-min SOC checks inadequate for fast chargers

**Proposed Solution**:
1. **For slow chargers (< 7kW)**: 30-minute clock events sufficient (±2-3% accuracy)
2. **For fast chargers (≥ 7kW)**: Use ticker.60 (60-second) events while charging
   - Subscribe in `start()` function
   - Check SOC every 60 seconds
   - Stop when `soc >= targetSOC`
   - Unsubscribe in `stop()` function
   - Estimated load: 6-12 checks per hour while charging (minimal impact)

**Decision Needed**: Is ticker.60 subscription acceptable during charging?

### Gap #2: Event Queue Blocking ✅ FIXED
**Issue**: setup-events.install() blocked event thread for 10 seconds
**Impact**: Ticker events delayed in queue
**Fix Status**: Fixed in commit 2e0aefd
**Fix Approach**: Limit file checks to 10 per run instead of all 48

---

## Test Scenarios

### Scenario 1: Normal Overnight Charge
1. SOC at 22:00: 65%
2. Target: 80%
3. Window: 23:30 - 05:30
4. Expected: Start 23:30, stop at 80% (~02:00 for 7kW charger)

### Scenario 2: Already Charged Enough
1. SOC at 23:30: 76%
2. Skip threshold: 75%
3. Expected: Skip charging, log message

### Scenario 3: Ready-By Mode
1. SOC at 22:00: 50%
2. Target: 80%
3. Ready by: 07:30
4. Charge rate: 7kW
5. Expected: Calculate start time, to ensue SOC is 80% +/-2%

---

## Regression Prevention

Before ANY commit:
1. Run through critical requirements 1-9
2. Document which ones you tested
3. Document any that broke
4. Fix before merging

This prevents the "declare success without verification" problem.
