# OVMS Smart Charging System

**Current Version:** v1.2.1 (2025-11-27)  
**Status:** Production - Real-world tested ✅  
**Vehicle:** Nissan ENV200 / Leaf  
**OVMS:** v3 Module  
**Tariff:** Intelligent Octopus Go (UK)

---

## 🎯 What This System Does

Automatically schedules EV charging to:
- ✅ Charge during cheap electricity rate window (£0.07/kWh vs £0.292/kWh)
- ✅ Stop exactly at target SOC (80%) using native OVMS control
- ✅ Be ready by your departure time (e.g., 08:30)
- ✅ Optimize start time to prefer cheap window, finish before deadline
- ✅ Warn about overflow costs if needed

---

## 🆕 What's New in v1.2.1

### Bug Fix: State-Aware Status Display
**Problem:** Status showed stale predictions during active charging  
**Solution:** Now detects PLANNING / ACTIVE / COMPLETED states and shows appropriate info

**Example:**
```
Before charging (PLANNING):
  Start: 22:15, Finish: 08:00

While charging (ACTIVE):
  Started: 22:17, Est. finish: 06:30

After charging (COMPLETED):
  Completed! Started: 22:17
```

### Improvement: Adjusted Charger Rate
- Changed default from 1.8kW to 2.0kW based on real-world data
- Fixes 10% over-estimation of charge time
- User feedback: "closer to 2 over longer charge cycles" ✅

---

## 📦 Installation

### Quick Install

```bash
# Upload to OVMS
scp charging-v1_2_1-WIP.js root@<your-ovms-ip>:/store/scripts/lib/charging.js

# Enable autocharge (CRITICAL!)
ssh root@<your-ovms-ip>
config set xnl autocharge yes

# Reload script
script reload

# Verify
script eval "charging.version()"
# Should show: v1.2.1 (2025-11-27)
```

### Configuration

```javascript
// Set target SOC (default: 80%)
charging.setTarget(80)  // or 90, 95, 100 - whatever you prefer

// Set cheap rate window (default: 23:30-05:30)
charging.setWindow(23,30,5,30)

// Set ready-by time (NEW in v1.2.0!)
charging.setReadyBy(8,30)  // Must be charged by 08:30

// Set charger rate (default: 2.0kW in v1.2.1)
charging.setCharger(2.0)

// Set electricity rates (default: £0.07 cheap, £0.292 standard)
charging.setRates(0.07,0.292)

// Enable scheduled charging
charging.useSchedule()
```

---

## 🚀 Usage

### Daily Use
1. **Plug in vehicle** → System detects and shows schedule
2. **Charging starts automatically** at optimal time
3. **Stops at target SOC** using native OVMS control
4. **Notifications** keep you informed

### Manual Override
```javascript
// Charge now (ignore schedule)
charging.start()

// Stop charging
charging.stop()

// Check status
charging.status()
```

---

## 📊 Real-World Results

### Night 1 (2025-11-26)
- **Config:** 29% → 80%, ready by 08:00
- **Predicted:** Start 22:15, finish 05:30
- **Actual:** Started 22:17, stopped at 80.3% ✅
- **User:** "Everything about the charging was great"

### Night 2 (2025-11-27)
- **Config:** 46% → 95%, ready by 08:30
- **Result:** Started on time, stopped exactly at 95% ✅
- **Observation:** Finished 10% faster than predicted → Led to v1.2.1 charger rate adjustment

---

## 💡 Key Features

### 🎯 Native OVMS SOC Control (v1.2.0 Breakthrough!)
- Uses `config set xnl autocharge yes` + `suffsoc <target>`
- OVMS monitors SOC and stops automatically
- **Perfect accuracy:** ±1% of target SOC
- No custom monitoring needed!

### ⏰ Ready-By Time Optimization (v1.2.0)
- Specify deadline: "Must be charged by 08:30"
- **Logic:** Prefer cheap window start, only start early if needed
- Shows cost breakdown: PRE + CHEAP + POST window

### 💰 Cost Calculations
- Estimates total cost based on tariff rates
- Warns if charging extends beyond cheap window
- Shows potential savings

### 📱 Notifications
- Plug-in detection with schedule
- Charge start/stop confirmations
- State-aware status (v1.2.1!)
- Cost estimates

---

## 🔧 Configuration Reference

### Available Commands

```javascript
// Scheduling
charging.useSchedule()       // Enable scheduled charging
charging.chargeNow()          // Disable schedule, charge immediately

// Timing
charging.setWindow(h1,m1,h2,m2)  // Cheap rate window
charging.setReadyBy(h,m)           // Ready-by deadline
charging.clearReadyBy()             // Disable ready-by

// Charging target
charging.setTarget(soc)             // Set target SOC (20-100%)

// Charger
charging.setCharger(kw)             // Set charger rate in kW

// Pricing
charging.setRates(cheap,standard)  // Set rates in £/kWh

// Control
charging.start()              // Manual start
charging.stop()               // Manual stop
charging.status()             // Show current status

// Info
charging.version()            // Show version
```

### Default Values
- Target SOC: 80%
- Cheap window: 23:30 - 05:30
- Cheap rate: £0.07/kWh
- Standard rate: £0.292/kWh
- Charger rate: **2.0kW** (v1.2.1)
- Ready-by: Disabled (0:0)

---

## 📁 Project Files

### Core Implementation
- `charging-v1_2_1-WIP.js` - Main script (1,300+ lines)
- `charging-v1_2_0-WIP.js` - Previous version (stable baseline)

### Documentation
- `README.md` - This file
- `SMART-CHARGING-CHANGELOG.md` - Version history with detailed changes
- `SMART-CHARGING-DESIGN.md` - Design specification
- `PROJECT-KNOWLEDGE-CAPTURE.md` - Development learnings
- `FUTURE-SESSION-QUICKSTART.md` - Quick reference for resuming development

### Reference
- `OVMS-GUIDELINES.md` - OVMS scripting best practices
- `OVMS-QUICK-REFERENCE.md` - Quick command reference
- `OVMS-Scripting-Reference.md` - Full scripting documentation

### Testing
- `validate-ovms-syntax.sh` - Syntax validation script
- `test-duk.sh` - DukTape engine testing

---

## ⚠️ Known Limitations

### Current (v1.2.1)
- Charger rate is fixed (2.0kW default) - doesn't adapt to actual measured rate
- Status shows "est. remaining" cost during charging - not actual spent so far
- Completed mode doesn't show final cost or actual finish time

### Design Constraints
- Requires Nissan ENV200/Leaf with OVMS v3
- Designed for Intelligent Octopus Go tariff (UK)
- Must have `config set xnl autocharge yes` enabled
- Fixed cheap rate window (no dynamic adjustment)

---

## 🛠️ Troubleshooting

### Charging not starting automatically
- Check: `config list xnl autocharge` - Should be "yes"
- Check: `charging.status()` - See current state
- Verify you're in cheap rate window or before ready-by time

### Charging not stopping at target
- Verify: `config list xnl suffsoc` - Should match your target
- Check: `config list xnl autocharge` - Must be "yes"
- If issue persists, try: `charging.stop()` then `charging.start()`

### Status shows wrong times
- This was fixed in v1.2.1!
- Upgrade if you're on v1.2.0 or earlier

---

## 🚦 Version History

- **v1.2.1** (2025-11-27) - State-aware status, adjusted charger rate
- **v1.2.0** (2025-11-26) - Ready-by time feature, native OVMS SOC control
- **v1.1.0** - Fixed schedule mode, cost calculations
- **v0.1.0** - Initial proof of concept

See `SMART-CHARGING-CHANGELOG.md` for detailed version history.

---

## 🔮 Future Roadmap

### v1.3.0 (Planned)
- Enhanced cost breakdown with time ranges
- Complete header documentation
- Consider: Dynamic rate detection from vehicle data
- Consider: Running cost tracking during charging

### Deferred
- Low battery reminder alerts
- Cost minimization mode
- Dynamic window adjustment
- Historical tracking
- Multiple tariff support

---

## 📝 Contributing

If you find bugs or have suggestions:
1. Test thoroughly with your vehicle
2. Document the issue/suggestion
3. Check `SMART-CHARGING-CHANGELOG.md` for similar issues
4. Provide real-world data if possible

---

## 📄 License

MIT License - Use freely, modify as needed

---

## 👥 Credits

Developed by the OVMS Community for Nissan ENV200/Leaf owners using Intelligent Octopus Go tariff.

Special thanks to andyorkney for extensive real-world testing and feedback.

---

**Last updated:** 2025-11-27  
**Maintained by:** OVMS Community
