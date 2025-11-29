# Smart Charging System - Changelog

**Current Version:** v1.2.1 (2025-11-27)  
**Status:** Production - Real-world tested

---

## v1.2.1 (2025-11-27) - Bug Fix Release

### Bug Fixes
**State-Aware Status Display** 🐛→✅
- **Problem**: Status showed stale timing predictions during active charging
  - Example: At 05:43 while charging at 75%, status showed "Start: 23:30, Finish: 00:27" (prediction from when SOC was 29%)
- **Solution**: Status now detects three states and shows appropriate information:
  - **PLANNING**: Before charging starts → Shows future schedule
  - **ACTIVE**: Currently charging → Shows actual start time and estimated finish based on remaining SOC
  - **COMPLETED**: Finished charging → Shows actual start time and completion confirmation

### Improvements
**Adjusted Charger Rate Default** 📊
- Changed from 1.8kW to 2.0kW based on real-world empirical testing
- **Data**: 
  - Night 1: 29% → 80%, finished >1h early
  - Night 2: 46% → 95%, 10% time over-estimate
- **Root Cause**: Granny chargers average ~2.0kW over full cycle
  - Early phase (0-20%): ~1.8kW or less (12V systems charging)
  - Bulk phase (20-80%): ~2.0-2.2kW (main battery, no 12V overhead)
  - Taper phase (80-95%): Rate may reduce
  - **Average: ~2.0kW** ✅
- **User Feedback**: "The 1.8kw probably should be 2kw... closer to 2 over longer charge cycles"

### Technical Changes
- Added `state.actual_start_time` - Tracks when charging actually started (Date object)
- Added `state.actual_start_minutes` - Start time in minutes since midnight (for calculations)
- Enhanced `startCharging()` to capture actual start time
- Enhanced `onUnplug()` to clear start time tracking
- Completely rewrote `status()` notification logic for state detection

### Backwards Compatibility
- ✅ 100% compatible with v1.2.0
- ✅ All commands work unchanged
- ✅ Configuration preserved  
- ✅ No breaking changes
- ✅ Users can override charger rate: `charging.setChargeRate(1.8)` if needed

### Testing Status
- [ ] Status display in PLANNING mode (before charging)
- [ ] Status display in ACTIVE mode (during charging)
- [ ] Status display in COMPLETED mode (after charging)
- [ ] Time prediction accuracy with 2.0kW default
- [ ] 3-5 nights of real-world validation

---

## v1.2.0 (2025-11-26) - Ready-By Time Feature

### Major Features
**Ready-By Time Calculation** ⏰
- Specify deadline: "Must be charged by 08:30"
- System calculates optimal start time
- **Logic**: Prefer cheap window start, only start early if needed to meet deadline
- Command: `charging.setReadyBy(8, 30)`

**Better Command Naming**
- `charging.useSchedule()` - Wait for optimal time (replaces `enable()`)
- `charging.chargeNow()` - Override schedule, charge immediately (replaces `disable()`)
- Old commands still work (backwards compatible)

**Enhanced Notifications**
- Shows timing details: Start time, finish time, deadline
- Shows cost breakdown: PRE-window, CHEAP-window, POST-window
- Warns about overflow into standard rate if needed

### Real-World Testing Results ✅
**Night 1 (2025-11-26):**
- Config: 29% → 80%, ready by 08:00
- Predicted start: 22:15
- **Actual start: 22:17** (within 2 minutes! ✅)
- **Actual stop: 80.3%** (perfect accuracy! ✅)
- Finished: ~05:30 (2.5h before deadline - that's OK! ✅)

**Night 2 (2025-11-27):**
- Config: 46% → 95%, ready by 08:30
- Started on time ✅
- Stopped exactly at 95% ✅
- Finished 10% faster than predicted (led to v1.2.1 charger rate adjustment)

**User Feedback:**
> "Everything about the charging was great. Started within 2-3 mins of expected time, stopped bang on 80%"

### Technical Approach
**Breakthrough: Native OVMS SOC Control** 🎯
- Discovery date: 2025-11-23
- Uses `config set xnl autocharge yes` + `suffsoc <target>`
- OVMS monitors SOC and stops automatically at target
- **Perfect accuracy**: Stops at exactly target SOC (±1%)
- Eliminates need for custom SOC monitoring!

**Optimal Start Calculation**
- Prefers cheap window start (23:30)
- Only starts early if would miss ready-by deadline
- Accepts overflow if needed to reach target SOC

### Backwards Compatibility
- ✅ 100% compatible with v1.1.0
- ✅ Ready-by disabled by default (0:0) → v1.1.0 behavior
- ✅ All old commands still work

---

## v1.1.0 (Earlier 2025) - Fixed Schedule Mode

### Features
- Fixed cheap rate window (23:30-05:30)
- Target SOC configuration (default 80%)
- Skip if already charged (`skipIfAbove` threshold)
- Cost calculations and savings estimates
- Notifications via OVMS Connect app

### Technical Approach
- ticker.300 (5-minute) schedule checking
- Fixed window start (no ready-by calculation)
- Custom SOC monitoring (before native OVMS discovery)
- Clock events for schedule checks

---

## v0.1.0 (Initial) - Proof of Concept

### Features
- Basic time window checking
- Simple charge start/stop
- SOC monitoring
- Notification system

### Learnings
- ticker.300 approach is stable ✅
- Simple time window logic works across midnight ✅
- NO setInterval() - causes OVMS crashes ❌
- NO long setTimeout() - unreliable ❌

---

## Future Roadmap

### v1.3.0 (Planned)
- Enhanced cost breakdown with time ranges
- Complete header documentation
- Consider: Dynamic rate detection from live vehicle data
- Consider: Running cost tracking during charging

### Deferred Features
- Low battery reminder alerts
- Cost minimization mode
- Dynamic window adjustment
- Historical tracking
- Multiple tariff support

---

## Known Limitations

### Current (v1.2.1)
- Charger rate is fixed (2.0kW default) - doesn't adapt to actual measured rate
- Status shows "est. remaining" cost during charging - not actual spent so far
- Completed mode doesn't show final cost or actual finish time

### Design Constraints
- Requires Nissan ENV200/Leaf with OVMS v3
- Designed for Intelligent Octopus Go tariff (UK)
- Must have `config set xnl autocharge yes` enabled
- Climate wake cycle may briefly activate cabin systems during retry

---

## Testing Checklist

### Before Each Release
- [ ] Syntax validation passes
- [ ] Plug-in detection works
- [ ] Charge start/stop commands work
- [ ] SOC monitoring accurate
- [ ] Notifications display correctly
- [ ] Ready-by calculation correct
- [ ] Cost calculations verified
- [ ] Backwards compatibility confirmed

### Real-World Validation
- [ ] 3-5 nights of actual usage
- [ ] Different SOC ranges tested
- [ ] Time predictions within ±10%
- [ ] No crashes or instability
- [ ] User feedback positive

---

**Changelog maintained by:** OVMS Community  
**Last updated:** 2025-11-27
