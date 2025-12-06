# v1.3.5 Ready for Deployment

## Files Created

1. **[charging-v1_3_5.js](computer:///mnt/user-data/outputs/charging-v1_3_5.js)** (61 KB)
   - Fixed decimal time display bug
   - Fixed midnight-crossing cost calculation
   
2. **[V1_3_5-CHANGELOG.md](computer:///mnt/user-data/outputs/V1_3_5-CHANGELOG.md)**
   - Complete technical explanation
   - Before/after examples
   - Deployment instructions

---

## What Was Fixed

### Bug #1: Decimal Times
**Before:** `Expected: 23:33 -> 04:48.86800573888104`  
**After:** `Expected: 23:33 -> 04:49`

### Bug #2: Midnight-Crossing Costs
**Before:** All 9.2 kWh shown as "pre-window" (£2.67)  
**After:** All 9.2 kWh shown as "cheap window" (£0.64)

---

## Validation

✅ Syntax validated with OVMS validator  
✅ Built on correct v1.3.4 base  
✅ Native energy tracking preserved  
✅ All previous fixes intact

---

## Deployment

```bash
scp charging-v1_3_5.js root@192.168.7.204:/store/scripts/lib/charging.js
ssh root@192.168.7.204
script reload
script eval "charging.version()"
```

Expected output: `v1.3.5 (2025-12-06)`

---

## What to Test Next Time

1. **Decimal time:** Check notification shows `HH:MM` not `HH:MM.decimal`
2. **Cost calculation:** When charging 23:33 -> 04:40, should show all kWh in cheap window
3. **Status command:** Run `charging.status()` at 01:00 during charge - should show correct breakdown

---

## Code Changes Summary

**3 locations modified:**

1. **Line 808** (`startCharging`): Added `Math.round()` to finish_minutes
2. **Line 1058** (`checkSchedule`): Added `Math.round()` to finish_minutes  
3. **Lines 670-694** (`calculateCostForTimeRange`): Rewrote midnight-crossing logic

All changes have inline comments with `// v1.3.5:` marker for traceability.
