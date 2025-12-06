# OVMS Smart Charging System

**Current Version:** v1.3.5 (2025-12-06)  
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

## 🆕 What's New in v1.3.5

### Bug Fix: Decimal Time Display
**Problem:** Notifications showed times like "04:48.86800573888104"  
**Solution:** Added Math.round() to finish_minutes calculations

**Result:**
```
Before: Expected: 23:33 -> 04:48.86800573888104
After:  Expected: 23:33 -> 04:49
```

### Bug Fix: Midnight-Crossing Cost Calculation
**Problem:** Charging from 23:33 -> 04:40 showed all kWh as "pre-window"  
**Solution:** Fixed overlap logic when charge sessions cross midnight

**Result:**
```
Before: Pre-window (before 23:30): £2.67 (9.2 kWh)
        Cheap (23:30-05:30): £0.00 (0.0 kWh)

After:  Cheap (23:30-05:30): £0.64 (9.2 kWh)
```

**Affects:** Both real-time notifications AND status() command output

---

## 📦 Installation

### Quick Install via Web Interface (Recommended)

1. **Access OVMS Web Interface**
   - Connect to your OVMS WiFi network (default: OVMS)
   - Navigate to: http://192.168.4.1 (or your configured IP)
   - Login with your credentials

2. **Upload Script**
   - Go to: Tools → Editor
   - Navigate to: /store/scripts/lib/
   - Upload charging-v1_3_5.js
   - Rename to: charging.js

3. **Enable Autocharge**
   - Go to: Config → Vehicle
   - Find: "autocharge" setting
   - Set to: "yes"
   - Save configuration

4. **Reload Scripts**
   - Go to: Tools → Shell
   - Run: `script reload`
   - Verify: `script eval "charging.version()"`
   - Should show: v1.3.5 (2025-12-06)

5. **Configure Auto-Load (Important!)**
   - Go to: Tools → Editor
   - Navigate to: /store/scripts/
   - Edit or create: ovmsmain.js
   - Add this code:
   
   ```javascript
   // Load the smart charging module
   charging = require("lib/charging");
   
   // Optional: Load ABRP telemetry (only if you have abrp.js installed)
   // abrp = require("lib/abrp");
   // abrp.send(1)
   
   // Optional: Configure charging on startup
   // Uncomment and modify these lines to set defaults:
   // charging.setChargerRate(2.0);     // Set your charger's kW rating
   // charging.setTarget(85);            // Target SOC 85%
   // charging.setReadyBy(8, 30);        // Ready by 8:30 AM
   
   print("OVMS initialization complete\n");
   ```
   
   - Save the file
   - This ensures the script loads automatically on every boot

### Alternative: SSH Install

```bash
# Upload to OVMS (replace with your OVMS IP)
scp charging-v1_3_5.js root@192.168.4.1:/store/scripts/lib/charging.js

# SSH to OVMS
ssh root@192.168.4.1

# Enable autocharge (CRITICAL!)
config set xnl autocharge yes

# Create/edit ovmsmain.js for auto-load
# Use 'vi /store/scripts/ovmsmain.js' or upload via web interface

# Reload scripts
script reload

# Verify
script eval "charging.version()"
# Should show: v1.3.5 (2025-12-06)
```

**ovmsmain.js contents:**
```javascript
// Load the smart charging module
charging = require("lib/charging");

// Optional: Load ABRP telemetry (only if you have abrp.js installed)
// abrp = require("lib/abrp");
// abrp.send(1)

// Optional: Configure charging on startup
// Uncomment and modify these lines to set defaults:
// charging.setChargerRate(2.0);     // Set your charger's kW rating
// charging.setTarget(85);            // Target SOC 85%
// charging.setReadyBy(8, 30);        // Ready by 8:30 AM

print("OVMS initialization complete\n");
```

### Configuration

```javascript
// Set target SOC (default: 80%)
charging.setTarget(80)  // or 90, 95, 100 - whatever you prefer

// Set cheap rate window (default: 23:30-05:30)
charging.setWindow(23,30,5,30)

// Set ready-by time
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

### 🎯 Native OVMS SOC Control (v1.2.0)
- Uses `config set xnl autocharge yes` + `suffsoc <target>`
- OVMS monitors SOC and stops automatically
- **Perfect accuracy:** ±1% of target SOC
- No custom monitoring needed

### ⏰ Ready-By Time Optimization (v1.2.0)
- Specify deadline: "Must be charged by 08:30"
- **Logic:** Prefer cheap window start, only start early if needed
- Shows cost breakdown: PRE + CHEAP + POST window

### 💰 Cost Calculations
- Estimates total cost based on tariff rates
- Warns if charging extends beyond cheap window
- Shows potential savings

### 📱 Notifications
- Plug-in detection with schedule sent to OVMS Connect app
- Charge start/stop confirmations
- State-aware status (v1.2.1)
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

### Current (v1.3.5)
- Charger rate adapts from measured sessions (v1.3.0+) but takes one session to learn
- Cost display during active charging shows estimate to completion, not actual spent
- Requires manual configuration of tariff rates (no automatic tariff updates)

### Design Constraints
- Requires Nissan ENV200/Leaf with OVMS v3 module
- Designed for time-of-use tariffs (tested with UK Intelligent Octopus Go)
- Must have `config set xnl autocharge yes` enabled
- Fixed cheap rate window (configure once, doesn't auto-adjust for DST)

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
- This was fixed in v1.2.1
- Upgrade if you're on v1.2.0 or earlier

---

## 🚦 Version History

- **v1.3.5** (2025-12-06) - Fixed decimal time display, fixed midnight-crossing cost calculation
- **v1.3.4** (2025-12-05) - Native energy tracking using v.c.kwh metric
- **v1.3.3** (2025-12-05) - Improved command naming (scheduleOn/Off, dynamicRateOn/Off)
- **v1.3.2** (2025-12-05) - Fixed corrupted UTF-8 characters
- **v1.3.1** (2024-11-30) - Enhanced notifications with cost breakdowns
- **v1.3.0** (2024-11-29) - Dynamic charge rate detection
- **v1.2.1** (2025-11-27) - State-aware status, adjusted charger rate
- **v1.2.0** (2025-11-26) - Ready-by time feature, native OVMS SOC control
- **v1.1.0** - Fixed schedule mode, cost calculations
- **v0.1.0** - Initial proof of concept

See `SMART-CHARGING-CHANGELOG.md` for detailed version history.

---

## 🔮 Future Roadmap

### Under Consideration
- Running cost estimator (show actual £ spent during active charge)
- Integration with solar generation data
- Weather-based charging adjustments
- Support for multiple tariffs/rate schedules

### Not Planned
The OVMS Connect app provides excellent historical tracking including:
- Charging session logs with energy and duration
- Trip data with energy used/regenerated
- Battery health monitoring over time
- Cell-level voltage and temperature graphs

These features are better suited to the OVMS Connect app rather than duplicate functionality in this script.

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

## 👥 Credits & Resources

### OVMS Project
This script leverages the excellent **Open Vehicle Monitoring System (OVMS)** project:

- **Official Website:** https://www.openvehicles.com
- **Documentation:** https://docs.openvehicles.com/en/latest/
- **Hardware:** https://shop.openenergymonitor.com/ovms/

The OVMS v3 module provides the hardware platform for vehicle monitoring, remote control, and the native `autocharge` + `suffsoc` functionality that makes accurate SOC-based stopping possible.

### pyOVMS & MQTT Infrastructure
This script sends notifications via the OVMS MQTT infrastructure. Two excellent free MQTT broker services are available:

**pyOVMS** (https://turboserv.0-c.de/dashboard)
- Free MQTT broker and web dashboard for OVMS
- Created by **schorle** (Carsten Schmiemann) & **Crash_Override**
- Provides account management, vehicle configuration, and MQTT connectivity
- Includes firmware repository and pyOVMS control panel
- Powers the OVMS Connect app notifications
- Community-funded via donations

**Dexter's Web OVMS Server** (https://ovms.dexters-web.de)
- Independent EU-based MQTT broker
- Maintained by Michael Balzer (OVMS core developer)
- Free to use, community-funded

### OVMS Connect App
The companion mobile app for viewing vehicle data and receiving notifications:
- **Developer:** Carsten Schmiemann (schorle)
- **Platform:** iOS & Android
- **Features:** Real-time telemetry, charging logs, trip tracking, console access
- **Notifications:** Requires connection to MQTT broker (pyOVMS or Dexter's server)

### Smart Charging Script
**Author:** andyorkney  
**Development Assistant:** Claude (Anthropic)  
**License:** MIT

Developed for Nissan ENV200/Leaf owners using time-of-use electricity tariffs (UK Intelligent Octopus Go).

**Development Motivation:**

This project served multiple purposes: adding missing smart charging functionality to the vehicle via the OVMS module, developing JavaScript knowledge and skills, and learning to work effectively in partnership with Claude AI. 

The collaborative development process has been a genuine learning experience - with frustrations, breakthroughs, debugging sessions, and the gradual development of effective communication patterns between human and AI. Working together requires patience, clear communication, and mutual understanding of each other's strengths and limitations. The technical skills gained in OVMS scripting are matched by insights into how to collaborate productively with AI tools.

**Special thanks to:**
- **OVMS core developers** - Creating the platform and native charge control features that make this possible
- **schorle & Crash_Override** - pyOVMS infrastructure and OVMS Connect app
- **Michael Balzer** - Dexter's OVMS server and vehicle support contributions
- **OVMS community** - Testing, feedback, and support

---

**Last updated:** 2025-12-06  
**Maintained by:** OVMS Community
