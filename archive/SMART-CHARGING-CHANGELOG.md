# Smart Charging System - Change Log

**Purpose:** Track all changes to design and implementation
**Rule:** No code changes without documenting here first

---

## Version 1.2 - 2025-11-17 (PASSIVE MONITORING FIX)

**Status:** Implemented in v3.5.0

### What Changed:

**Critical Bug Fix: Removed Destructive Event Subscriptions**
- REMOVED subscription to `vehicle.charge.start` event
- This event was triggering `charge stop` on every charge attempt, causing start/stop loop
- Replaced with passive ticker-based plug-in detection (polling `v.c.pilot` state)
- Script now monitors plug state changes without interfering with charging

**Documentation Fix: Removed Incorrect xnl Commands**
- Changed `xnl charge start/stop` to generic `charge start/stop`
- xnl prefix is Nissan-specific; generic commands work for all OVMS vehicles

**Implementation Simplification**
- Reduced from 1129 lines (broken v3.4.0) to 678 lines
- Single ticker.60 subscription (like stable v2.0.7)
- No custom timer system - simpler and more reliable
- Uses legacy config keys matching existing OVMS config

### Why:

**Root Cause Identified:** The previous v3.x subscribed to `vehicle.charge.start` and immediately called `charge stop`. This meant every time charging began (manual or auto), our script stopped it - creating the "Timer On" start/stop loop.

**User Impact:** Vehicle could not charge at all. Every charge attempt was immediately stopped.

### Who Agreed:

- User (andyorkney) - 2025-11-17
- After extensive debugging of start/stop loop caused by event subscriptions

### Impact:

**Code Changes:**
- Removed all PubSub.subscribe calls except ticker.60
- Added `checkPlugInState()` to detect plug state changes via polling
- Added `state.lastPluggedIn` to track state transitions
- No auto-stop on plug-in (must be added separately with one-shot logic)
- Uses `charge start/stop` (not `xnl charge start/stop`)

**Testing Required:**
- ✅ Verify script loads without errors
- ✅ Verify manual `charge start` is not stopped by script
- ✅ Verify plug-in detection works via ticker
- ✅ Verify schedule calculation on plug-in
- ✅ Verify scheduled charge starts at correct time
- ✅ Verify target SOC monitoring stops charge at target

**User-Visible Changes:**
- Charging now works (no more start/stop loop)
- Auto-stop on plug-in removed (will be re-added with one-shot logic)
- Schedule calculated on plug-in detection (up to 60 second delay)

**Missing Features (to be added):**
- One-shot auto-stop on plug-in (ENV200 auto-starts)
- Persistent schedule (survive reboots/power cuts)
- Charge recovery after power cut

### Rollback Plan:

Revert to v2.0.7.3 if issues arise (working but lacks ready-by scheduling).

---

## Version 1.1 - 2025-01-15 (CLIMATE WAKE RETRY)

**Status:** Design updated - ready for implementation

### What Changed:

**Major Feature: Automatic Charge Interruption Recovery**
- Added intelligent retry mechanism for charge interruptions
- Implements climate wake cycle to restore pilot signal
- Uses callback-based approach (safe for DukTape engine)
- Maximum 3 retry attempts with exponential backoff (2, 5, 10 minutes)
- Timestamps added to all notifications

**Climate Wake Cycle:**
- Command: `climatecontrol on` → wait 10s → `climatecontrol off` → wait 5s
- Purpose: Restore pilot signal after OVMS reboot or connection loss
- Executes before each retry attempt

**Retry Logic:**
- Attempt 1: Wait 2 minutes → Climate wake → Retry
- Attempt 2: Wait 5 minutes → Climate wake → Retry
- Attempt 3: Wait 10 minutes → Climate wake → Retry
- After 3 failures: Notify user and stop trying

**Notification Changes:**
- All notifications now include timestamp: `[HH:MM] message`
- New interrupt notifications show attempt count: `(attempt 1/3)`
- Failure notification includes clear action: "Please check vehicle and charger"

### Why:

**User Requirement:** "If I have journey to make I'd prefer to get there than wake up to car without energy"
- Power cuts, pilot signal loss, loose connections can interrupt charging
- Without retry, user wakes up with insufficient charge
- Violates Priority #1: Reach target SOC

**ENV200-Specific Issue:**
- After OVMS reboot, pilot signal can fail
- Climate control cycle reliably restores pilot
- Must use this workaround for reliable charging

### Who Agreed:

- User (andyorkney) - 2025-01-15
- Specified: Option A (always climate wake) + Option 2 (simple notifications) + timestamps

### Impact:

**Code Changes Required:**
- Add `getTimestamp()` helper function
- Add `performClimateWake(callback)` function
- Add `handleChargeInterruption(current_soc, target_soc)` function
- Modify `monitorSOC()` to call interruption handler
- Add `state.retry_count` tracking
- Update all `notify()` calls to include timestamps

**Testing Required:**
- ✅ Test climate wake commands work (`climatecontrol on/off`)
- ✅ Test retry logic with simulated interruptions
- ✅ Verify timestamps display correctly in notifications
- ✅ Confirm no async/await used (DukTape compatibility)
- ✅ Test timer cleanup (no memory leaks)
- ✅ Verify 3-attempt limit works
- ✅ Test manual override does NOT retry

**User-Visible Changes:**
- Notifications now show time of event
- Charge interruptions auto-recover (up to 3 attempts)
- Climate briefly activates during retry (user may notice cabin fan)
- More notifications during retry sequence

**Design Document Changes:**
- Updated SMART-CHARGING-DESIGN.md to v1.1
- Added Scenario 6 (charge interruption recovery)
- Added "On Charge Interruption" decision logic
- Updated notification formats with timestamps
- Added climate wake commands to technical notes
- Added DukTape compatibility warning

### Rollback Plan:

If retry logic causes issues:
1. Revert to v1.0 design spec
2. Remove retry functions from code
3. Keep timestamp feature (harmless improvement)
4. Fall back to simple "interrupted" notification only

---

## Version 1.0 - 2025-01-15 (BASELINE)

**Status:** Initial design specification - LOCKED

### Design Decisions Made:

✅ SOH-aware battery capacity calculations
✅ Hybrid charger rate detection (config + live)
✅ Fixed ready-by time (user configurable, default 07:30)
✅ Alert if scheduled start missed (not plugged in)
✅ Prefer cheap window start, accept overspill to reach target
✅ Always charge to exact target SOC (no skipIfAbove threshold)
✅ Manual override via app button
✅ Electricity rates: £0.07 cheap, £0.292 standard (Intelligent Octopus Go)
✅ Granny charger default: 1.8 kW

### Features Deferred:

⏸️ Low battery reminder alerts (at home, not plugged in)
⏸️ Cost minimization mode (retired couple scenario)
⏸️ Dynamic window adjustment
⏸️ Historical tracking

### Implementation:

**File:** `/store/scripts/lib/charging.js`
**Version:** v3.0.0
**Lines:** ~550
**Based on:** v2.0.7.3 structure

### Testing Required:

- ✅ Plug-in event detection (which event fires on ENV200?)
- ✅ Charge start/stop commands work
- ✅ SOC monitoring accuracy
- ✅ Cost calculations verified
- ✅ Notifications display correctly

---

## Change Template (For Future Updates)

### Version X.X - YYYY-MM-DD

**What Changed:**
- Description of change

**Why:**
- Reason for change

**Who Agreed:**
- Name/Date

**Impact:**
- Code changes required
- Testing required
- User-visible changes

**Rollback Plan:**
- How to revert if needed

---

## Pending Changes (Under Discussion)

None currently

---

## Known Issues

### Issue #1: Event Subscription Causes Charge Interference (RESOLVED)

**Problem:** Subscribing to `vehicle.charge.start` and calling `charge stop` in handler causes start/stop loop
**Root Cause:** `vehicle.charge.start` fires when charging begins (not on plug-in), so stopping charge there prevents all charging
**Solution:** Use passive ticker-based polling instead of event subscriptions
**Status:** FIXED in v3.5.0 (v1.2 design)
**Impact:** Cannot use event subscriptions for plug-in detection; must poll state

### Issue #2: Climate Wake Timing Unknown (Testing Required)

**Problem:** Don't know optimal timing for climate on/off cycle
**Current:** 10 seconds on, 5 seconds off
**Status:** Needs testing with real vehicle
**Impact:** May need to adjust timing if pilot doesn't restore
**Workaround:** User can report if timing needs adjustment

---

**End of Change Log**
