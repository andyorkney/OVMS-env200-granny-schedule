# CHANGELOG v2.0.5-20251107-1200

## Overview
v2.0.5 builds on the **proven stable base** of v2.0.4, adding ABRP-inspired enhancements while maintaining the core stability.

## Status
✅ **Syntax Validated** - Ready for deployment
⏳ **Awaiting Testing** - Deploy when back at vehicle

## Key Improvements from v2.0.4

### 1. Logger Utility with Timestamps (ABRP Pattern)
**v2.0.4:**
```javascript
print("[START] Charging started\n");
```

**v2.0.5:**
```javascript
console.info("Charging started: 76% → 80%");
// Output: (2025-11-07 12:00:00) INFO: Charging started: 76% → 80%
```

**Benefits:**
- Timestamps on all log messages
- Consistent log format (info/warn/error)
- Easier debugging from logs

### 2. Persistent Notifications (Now Saved in Message List)
**v2.0.4:**
```javascript
OvmsNotify.Raise("info", "charge.smart", "...")  // Transient
```

**v2.0.5:**
```javascript
OvmsNotify.Raise("alert", "charge.smart.started", "...")  // Persistent
OvmsNotify.Raise("alert", "charge.smart.stopped", "...")  // Persistent
```

**Benefits:**
- Notifications persist in OVMS Connect message list
- Separate subtypes for start/stop (clearer history)
- Can review notification history later

### 3. Nissan Leaf Specific Metrics
**v2.0.4:**
```javascript
var soc = getMetric("v.b.soc", 0);  // Generic SOC
```

**v2.0.5:**
```javascript
function getSOC() {
    if (vehicleType === 'NL') {
        return getMetric('xnl.v.b.soc.instrument', null) || getMetric('v.b.soc', 0);
    }
    return getMetric('v.b.soc', 0);
}
```

**Benefits:**
- Uses Leaf-specific instrument cluster SOC (more accurate)
- Falls back to standard metric if not available
- Same for SOH (State of Health)

### 4. Subscription State Tracking
**v2.0.4:**
```javascript
PubSub.subscribe("ticker.60", monitorSOC);  // No state tracking
```

**v2.0.5:**
```javascript
if (!session.subscribed) {
    PubSub.subscribe("ticker.60", monitorSOC);
    session.subscribed = true;
}
```

**Benefits:**
- Prevents accidental duplicate subscriptions
- Explicit state tracking
- Defensive programming from ABRP pattern

### 5. Performance Monitoring
**v2.0.4:**
```javascript
exports.checkSchedule = function() {
    try {
        // ... logic ...
    } catch (e) {}
};
```

**v2.0.5:**
```javascript
exports.checkSchedule = function() {
    var startTime = performance.now();
    try {
        // ... logic ...
    } catch (e) {
        console.error("checkSchedule failed", e);
    } finally {
        var duration = performance.now() - startTime;
        if (duration > 500) {
            console.warn("checkSchedule took " + duration.toFixed(0) + " ms");
        }
    }
};
```

**Benefits:**
- Warns if checkSchedule() takes >500ms
- Early detection of performance issues
- ABRP pattern for monitoring

### 6. Enhanced Status Display
**v2.0.4:**
```
Window: 23:30 to 05:30
Target: 80%
SOC: 80%, Charging: 0, Plugged: 1
```

**v2.0.5:**
```
Schedule:
  Cheap window: 23:30 to 05:30
  Target SOC: 80 %

Vehicle:
  State of Charge: 80.0 %
  Charging: No
  Plugged In: Yes
  Battery Voltage: 383.5 V
  Battery Temp: 15 °C
  Est. Range: 227 km
  State of Health: 86 %
  Vehicle Type: NL
```

**Benefits:**
- Proper units on all values
- More vehicle information
- Professional formatting
- Vehicle type detection

### 7. New Command: charging.info()
**New in v2.0.5** - ABRP-style metrics display:
```
OVMS Smart Charging Metrics v2.0.5-20251107-1200
==================================================
UTC Timestamp: 1762504945 s
State of Charge: 80.0 %
Battery Power: 0.00 kW
Charging: false
Plugged In: true
Battery Voltage: 383.5 V
Battery Current: 1.0 A
Battery Temp: 15 °C
State of Health: 86 %
Estimated Range: 227 km
Odometer: 96816.7 km
Vehicle Type: NL
```

**Benefits:**
- Raw metric values for debugging
- Matches ABRP.info() format
- Useful for troubleshooting

## Code Size Comparison
- **v2.0.4:** 279 lines
- **v2.0.5:** 440 lines (+161 lines)

**Increase due to:**
- Logger utility (+40 lines)
- Enhanced status/info displays (+80 lines)
- Vehicle-specific metric handling (+30 lines)
- Documentation and comments (+11 lines)

## What's NOT Changed (Stability Preserved)
✅ Static ticker.60 subscription (no dynamic subscribe/unsubscribe)
✅ Flag-based monitoring (session.monitoring)
✅ Same core charging logic
✅ Same checkSchedule() logic
✅ Same config persistence
✅ No SD logging (still disabled)

## Risk Assessment
**Low Risk** - All changes are additive enhancements:
- Logger wraps existing print() calls
- Notification type change (info→alert) is low impact
- Leaf metrics have fallback to standard metrics
- Performance monitoring is passive (doesn't affect logic)
- Status display is output-only

**Based on v2.0.4's proven 32+ hour stability.**

## Deployment Plan
1. Keep v2.0.4 running until back at vehicle
2. Upload v2.0.5 when local connection available
3. Test 1-2 charge cycles
4. Verify:
   - Notifications persist in message list
   - Logs show timestamps
   - Enhanced status display works
   - No new crashes
5. If stable for 3-5 days, declare v2.0.5 production-ready

## Rollback Plan
If any issues with v2.0.5:
- Revert to `charging-v2.0.4-backup.js`
- Known stable version preserved

## Files
- `charging.js` - v2.0.5 (ready to deploy)
- `charging-v2.0.4-backup.js` - v2.0.4 (rollback option)
- `charging-minimal.js` - Original v2.0.3/4 source
- `charging-v2.0.2-backup.js` - Pre-crash-fix version (archive)

## Next Steps After v2.0.5 Stable
Once v2.0.5 runs stable for 1+ week:
- Add back pricing display (£0.07 cheap, £0.29 standard)
- Add back ready-by mode with optimal start calculation
- Consider batched SD logging (if needed for debugging)
