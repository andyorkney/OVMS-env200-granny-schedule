# OVMS Smart Charging v1.3.5 Changelog

**Date:** 2025-12-06  
**Type:** Bug fixes  
**Breaking Changes:** None

---

## Summary

Fixed two bugs affecting time display and cost calculations when charging sessions cross midnight.

---

## Bug Fixes

### 1. Decimal Time Display in Notifications

**Problem:**
Notifications showed decimal times like "04:48.86800573888104" instead of "04:49"

**Root Cause:**
The `finish_minutes` calculation used `(charge_hours * 60)` which produces decimals. While `calculateOptimalStart()` had `Math.round()`, the notification code paths in `startCharging()` and `checkSchedule()` did not.

**Fixed:**
- Line 808: `startCharging()` now uses `Math.round(charge_hours * 60)`
- Line 1058: `checkSchedule()` now uses `Math.round(charge_hours * 60)`

**Affects:**
- Manual charge start notifications
- Scheduled charge start notifications

---

### 2. Midnight-Crossing Cost Calculation

**Problem:**
When charging crossed midnight (e.g., 23:33 -> 04:40), cost breakdown showed:
```
Pre-window (before 23:30): £2.67 (9.2 kWh)  ← WRONG - all energy
Cheap (23:30-05:30): £0.00 (0.0 kWh)        ← WRONG - should be here
```

**Root Cause:**
Line 676 used `start_minutes % (24 * 60)` which broke comparison logic when `end_minutes < start_minutes`. The function thought the entire charge happened before the window started.

**Example of broken logic:**
```javascript
start_minutes = 1413  (23:33 tonight)
end_minutes = 280     (04:40 tomorrow)
charge_start = 1413   (correct)
charge_duration = 280 - 1413 = -1133  (negative!)
charge_end = 1413 + (-1133) = 280  (correct time, but...)
win_start = 1410  (23:30)
win_end = 1770    (05:30 tomorrow = 330 + 1440)

Comparison: charge_end (280) < win_start (1410)
Result: "All charging before window!" ← WRONG
```

**Fixed:**
Rewrote lines 670-694 in `calculateCostForTimeRange()`:
- Properly detect negative charge_duration (midnight crossing)
- Add 1440 minutes to duration instead of to charge_end
- Correctly align window times when charge crosses midnight but window doesn't

**Affects:**
- Charge completion notifications (actual costs)
- `charging.status()` command output (estimated costs)
- All cost breakdowns when sessions cross midnight

---

## Testing

### Test Scenario 1: Decimal Time
**Before v1.3.5:**
```
Expected: 23:33 -> 04:48.86800573888104 (5h 16m)
```

**After v1.3.5:**
```
Expected: 23:33 -> 04:49 (5h 16m)
```

### Test Scenario 2: Midnight-Crossing Costs
**Session:** 23:33 -> 04:40 (5h 7m), 9.2 kWh  
**Window:** 23:30 - 05:30

**Before v1.3.5:**
```
Actual cost: £2.67
  Pre-window (before 23:30): £2.67 (9.2 kWh)
  Cheap (23:30-05:30): £0.00 (0.0 kWh)
```

**After v1.3.5:**
```
Actual cost: £0.64
  Cheap (23:30-05:30): £0.64 (9.2 kWh)
```

---

## Deployment

```bash
scp charging-v1_3_5.js root@192.168.7.204:/store/scripts/lib/charging.js
ssh root@192.168.7.204 "script reload"
```

Verify deployment:
```bash
script eval "charging.version()"
```
Should show: `v1.3.5 (2025-12-06)`

---

## Files Modified

- `charging.js` - Lines 808, 1058, 670-694
- Header updated to v1.3.5
- Build date updated to 2025-12-06

---

## Notes

Both bugs only affected display/logging - the actual charging behaviour was correct:
- Native OVMS `suffsoc` stopped charging at target SOC properly
- Scheduling logic started charging at correct times

The bugs made it **look** like something was wrong, but charging worked correctly.
