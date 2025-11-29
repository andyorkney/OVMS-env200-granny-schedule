# Smart Charging Changelog - v1.0.0

## [1.0.0] - 2025-11-23 - TESTED & VERIFIED ✅

### Status
**PRODUCTION READY** for fixed-schedule charging

### Summary
Complete rewrite focusing on simplicity and reliability. Uses native OVMS `autocharge + suffsoc` for SOC control. Tested successfully with overnight charging cycle.

### ✅ What Works (Verified by Real-World Test)

#### Core Charging Logic
- **Exact SOC targeting**: Stops at precisely the target SOC (tested: 85%)
- **Schedule-based charging**: Waits for cheap window (23:30-05:30)
- **Plug-in detection**: Quickly stops charge when plugged in outside window
- **Automatic start**: Begins charging at window start time
- **Native OVMS control**: Uses `suffsoc` for accurate stopping

#### User Configuration
- `charging.setTarget(soc)` - Set target SOC (20-100%)
- `charging.enable()` - Enable scheduled charging
- `charging.disable()` - Disable scheduling (charge immediately)
- `charging.setWindow(sh, sm, eh, em)` - Set cheap rate window
- `charging.setRates(cheap, standard)` - Set electricity rates (for future use)
- `charging.setCharger(kw)` - Set charger power rating (for future use)
- `charging.status()` - Show current status

#### System Stability
- ticker.300 (5-minute interval) for schedule checks
- No crashes or event queue issues
- Minimal CPU load
- Clean event handling

#### Notifications
- All user commands send notifications to app
- Plug-in events notify user
- Charge start/stop events notify user
- **Configuration required:** `config set notify charge.smart "*"`
- **Note:** Notification approach works but may not be optimal

### ❌ What's NOT Implemented

#### Missing Features (Deferred to Future Versions)
- **Ready-by time logic** (Priority #2) - v1.2.0
  - No optimal start time calculation
  - No pre-window charging
  - Must plug in early enough manually
  
- **Cost calculations** - v1.1.0
  - No cost estimates
  - No overflow warnings
  - No "must start early" notifications

- **Enhanced user feedback** - v1.3.0
  - Basic notifications work
  - Could include more detail

### Technical Details

#### Architecture Changes from v0.1.0
1. **Removed custom SOC monitoring**
   - Was: ticker.60 with custom stop logic
   - Now: Native OVMS `suffsoc` handles stopping
   - Benefit: More accurate, less code, less CPU

2. **Simplified schedule checking**
   - Was: Complex ready-by calculations
   - Now: Simple time-window check
   - Benefit: Reliable, easy to understand

3. **Native OVMS Integration**
   ```javascript
   // Set once when starting charge:
   OvmsCommand.Exec("config set xnl autocharge yes");
   OvmsCommand.Exec("config set xnl suffsoc 85");
   OvmsCommand.Exec("charge start");
   // OVMS stops automatically at 85%
   ```

#### Configuration Storage
- Uses `usr` config parameter (recommended for user scripts)
- All settings persist across reboots
- Dot notation: `charging.target_soc`, `charging.enabled`, etc

#### Event Handling
- `vehicle.charge.prepare` - Plug-in detection (works on ENV200)
- `vehicle.charge.stop` - Charge stop cleanup
- `vehicle.charge.pilot.off` - Unplug detection
- ticker.300 - Schedule monitoring (every 5 minutes)

#### Metric Reading (Critical Discovery)
```javascript
// Must handle multiple formats:
function isPluggedIn() {
  var pilot = OvmsMetrics.Value("v.c.pilot");
  return (pilot === "yes" || pilot === true || pilot === "1" || pilot === 1);
}
```
Metrics can be: string ("yes"), boolean (true), or number (1)

### Test Results

#### Successful Overnight Test (2025-11-23)
- **Starting SOC:** 84%
- **Target SOC:** 85%
- **Plug-in time:** 21:05 (outside window)
- **Charge start:** 23:30 (on schedule) ✅
- **Charge stop:** 85% exactly ✅
- **Duration:** 2.5+ hours monitoring
- **Stability:** No crashes, no issues ✅

#### User Feedback
> "With schedule enabled, plug vehicle in, charge starts (reassures user that power is on car recognises plugged in) then quickly stops - exactly as we want; waits for cheap rate window before charging; started charging at 23:30; charged to user set SoC and then stopped exactly at that % charge, perfect."

### Known Issues & Limitations

#### ENV200-Specific Behavior
- Vehicle always starts charging when plugged in (vehicle firmware)
- Script must stop it quickly if outside window
- Works perfectly - stops within seconds

#### Notification Configuration
- Requires: `config set notify charge.smart "*"`
- Subtype: `charge.smart` (arbitrary choice)
- Channel: `"*"` means all channels
- **Open question:** Is this the best approach?

#### Not Tested
- Long journey mode (scheduling disabled)
- Multiple charge cycles per night
- Edge cases (unplug during charge, etc)

### Upgrade Notes

#### From v0.1.0 or Earlier
1. **Remove old monitoring code** - No longer needed
2. **Configure notifications:** `config set notify charge.smart "*"`
3. **Set target SOC:** `script eval charging.setTarget(80)`
4. **Enable scheduling:** `script eval charging.enable()`

#### Configuration Migration
Old config params may still exist but are ignored. Clean up with:
```bash
config rm charging target_soc  # Old format
# New format automatically created by setTarget()
```

### Files Changed
- `/store/scripts/lib/charging.js` - Complete rewrite (v1.0.0)
- Configuration keys moved from `charging.*` to `usr.charging.*`

### Dependencies
- OVMS firmware: Tested on 3.3.x
- Vehicle support: ENV200 tested, should work on any OVMS-supported EV
- Native commands required: `charge start`, `charge stop`, `autocharge`, `suffsoc`

### Migration Path for Future Versions

#### v1.1.0 (Next Release)
**Goal:** Add cost calculations  
**Effort:** ~30 minutes  
**Risk:** Low - just display math  
**Changes:**
- Calculate: `cost = kwh_needed * rate`
- Show overflow warnings
- Estimate completion time

#### v1.2.0 (Major Update)
**Goal:** Add ready-by time logic  
**Effort:** ~2 hours  
**Risk:** Medium - adds complexity  
**Changes:**
- `setReadyBy(hour, minute)` function
- Calculate optimal start time
- Pre-window charging support
- Overflow time warnings

#### v1.3.0 (Polish)
**Goal:** Enhanced notifications and UI  
**Effort:** ~1 hour  
**Risk:** Low  
**Changes:**
- More detailed notifications
- Better status formatting
- Cost breakdowns in notifications

### Credits
- Original concept: v0.1.0 implementation
- Native OVMS discovery: Testing session 2025-11-23
- ENV200 testing: andyorkney

### License
Same as parent project

---

## Version Comparison

| Feature | v0.1.0 | v1.0.0 |
|---------|--------|--------|
| SOC Monitoring | Custom ticker.60 | Native suffsoc ✅ |
| Schedule Checking | ticker.300 | ticker.300 ✅ |
| Ready-By Logic | Yes | No ❌ |
| Cost Calculations | Yes | No ❌ |
| System Stability | Good | Excellent ✅ |
| Code Complexity | Medium | Low ✅ |
| Test Status | Untested | Verified ✅ |

### Decision Rationale
**Why ship v1.0.0 without ready-by and costs?**
- Core functionality works perfectly ✅
- System is stable and tested ✅
- Users can deploy NOW for fixed-schedule charging ✅
- Can iterate from working baseline ✅
- Avoids feature creep delaying release ✅

**Philosophy:** "Working code ships, perfect code never does."

---

## Next Steps

### Before Next Development Session
1. ✅ Tag in git: `v1.0.0-tested-working`
2. ✅ Update all documentation
3. ✅ Create backup of working code
4. ✅ Celebrate! 🎉

### For v1.1.0 Development
1. Read V1.0.0-TEST-RESULTS.md
2. Read REQUIREMENTS-VERIFICATION-v1.0.0.md
3. Copy charging-v1.0.0.js to charging-v1.1.0.js
4. Implement cost calculations only
5. Test thoroughly before touching anything else

---

**REMEMBER:** v1.0.0 WORKS. Don't break it trying to make it "better"!
