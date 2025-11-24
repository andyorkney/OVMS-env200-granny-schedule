# OVMS Smart Charging - User Guide

**Version:** 1.0.0  
**Last Updated:** 2025-11-23

## Table of Contents
- [Quick Start](#quick-start)
- [Basic Operations](#basic-operations)
- [Configuration](#configuration)
- [Daily Use](#daily-use)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## Quick Start

### First Time Setup (5 minutes)

1. **Install the script** (see [Installation Guide](INSTALLATION-GUIDE.md))

2. **Configure your preferences:**
```bash
# SSH into your OVMS module
ssh root@your-ovms-ip

# Set target SOC (recommended: 80-90% for daily use)
script eval charging.setTarget(85)

# Set your cheap rate window (example: 23:30 to 05:30)
script eval charging.setWindow(23, 30, 5, 30)

# Enable scheduled charging
script eval charging.enable()

# Configure notifications
config set notify charge.smart "*"
```

3. **Test it:**
```bash
# Check status
script eval charging.status()

# You should see:
#   Target SOC: 85%
#   Cheap window: 23:30 - 05:30
#   Mode: Scheduled (wait for cheap window)
```

4. **Done!** Plug in your vehicle tonight and verify it charges at 23:30.

---

## Basic Operations

### Check Status
```bash
script eval charging.status()
```

**Shows:**
- Current SOC and target
- Battery health (SOH)
- Plugged in / charging status
- Schedule mode (enabled/disabled)
- Cheap rate window times
- Native OVMS control settings

**Example Output:**
```
=== Smart Charging v1.0.0 ===

Battery:
  SOC: 84% (target 85%)
  SOH: 86%
  Capacity: 34.4 kWh

Status:
  Plugged in: Yes
  Charging: No

Scheduling:
  Mode: Scheduled (wait for cheap window)
  Cheap window: 23:30 - 05:30
  In window now: No

Native OVMS Control:
  autocharge: yes
  suffsoc: 85%
```

### Enable Scheduled Charging
```bash
script eval charging.enable()
```

**What this does:**
- Charges only during cheap rate window
- Stops immediately if plugged in outside window
- Waits for 23:30 (or your configured time) to start

**Use when:**
- Normal daily charging at home
- You want to minimize electricity costs
- You don't need the vehicle immediately

### Disable Scheduled Charging (Immediate Mode)
```bash
script eval charging.disable()
```

**What this does:**
- Charges immediately when plugged in
- Ignores cheap rate window
- Still stops at target SOC

**Use when:**
- Going on a long journey
- Need full charge urgently
- At a public rapid charger

**Important:** Remember to re-enable scheduling when back home:
```bash
script eval charging.enable()
```

---

## Configuration

### Set Target SOC
```bash
script eval charging.setTarget(85)
```

**Recommended values:**
- **80-90%** - Daily use (best for battery health)
- **100%** - Before long journeys only
- **50-60%** - Long-term storage (if leaving vehicle unused)

**Note:** Changes take effect on next charge cycle.

### Set Cheap Rate Window
```bash
script eval charging.setWindow(startHour, startMinute, endHour, endMinute)
```

**Examples:**
```bash
# Octopus Intelligent Go: 23:30 - 05:30
script eval charging.setWindow(23, 30, 5, 30)

# Economy 7: 00:30 - 07:30
script eval charging.setWindow(0, 30, 7, 30)

# Custom: 22:00 - 06:00
script eval charging.setWindow(22, 0, 6, 0)
```

**Important:** 
- Uses 24-hour format
- Window can cross midnight (handled automatically)
- Verify times match your electricity tariff

### Set Electricity Rates (Optional - for future use)
```bash
script eval charging.setRates(cheapRate, standardRate)
```

**Example:**
```bash
# Octopus Intelligent Go rates (£/kWh)
script eval charging.setRates(0.07, 0.292)
```

**Note:** Currently stored but not used. Will enable cost calculations in v1.1.0.

### Set Charger Power (Optional - for future use)
```bash
script eval charging.setCharger(kw)
```

**Examples:**
```bash
# 1.8kW granny charger
script eval charging.setCharger(1.8)

# 7kW home wallbox
script eval charging.setCharger(7)

# 22kW three-phase
script eval charging.setCharger(22)
```

**Note:** Currently stored but not used. Will enable ready-by time calculations in v1.2.0.

---

## Daily Use

### Normal Weeknight Routine

**Evening (anytime):**
1. Arrive home with 40% SOC
2. Plug in vehicle
3. Vehicle starts charging briefly (vehicle firmware)
4. Script stops it within seconds
5. Get notification: "Plugged in at 40%. Will charge to 85% during 23:30-05:30"

**Night (23:30):**
1. Charging starts automatically
2. Get notification: "Charging started (scheduled). Target 85%"
3. Sleep peacefully

**Morning:**
1. Vehicle at exactly 85% SOC
2. Unplug and drive
3. No action needed!

### Long Journey Preparation

**Day before:**
```bash
# Disable scheduling and set to 100%
script eval charging.disable()
script eval charging.setTarget(100)

# Plug in vehicle
# It charges immediately to 100%
```

**After journey:**
```bash
# Re-enable scheduling and return to 85%
script eval charging.enable()
script eval charging.setTarget(85)
```

### Weekend / Not Using Vehicle

**Option 1: Normal charging**
- Leave scheduling enabled
- Charges to 85% as usual
- Good for regular weekend use

**Option 2: Reduce to storage level**
```bash
# If not using for 1+ weeks
script eval charging.setTarget(60)
```

Remember to set back to 85% before next use!

---

## Troubleshooting

### Vehicle Not Charging at Scheduled Time

**Check 1: Is scheduling enabled?**
```bash
script eval charging.status()
# Look for: "Mode: Scheduled (wait for cheap window)"
```

If shows "Mode: Immediate", run:
```bash
script eval charging.enable()
```

**Check 2: Are you in the cheap window?**
```bash
script eval charging.status()
# Look for: "In window now: Yes"
```

If window times are wrong, reconfigure:
```bash
script eval charging.setWindow(23, 30, 5, 30)
```

**Check 3: Is SOC already at target?**
If SOC is already 85% and target is 85%, it won't charge.

**Check 4: Is vehicle actually plugged in?**
```bash
script eval charging.status()
# Look for: "Plugged in: Yes"
```

### Charged to Wrong SOC

**Stopped too early:**
- Check what target is set: `script eval charging.status()`
- If correct, may be vehicle/OVMS calibration issue
- Try unplugging and replugging

**Charged past target:**
- This should NOT happen with v1.0.0
- If it does, please report as bug with:
  - Target SOC setting
  - Actual SOC reached
  - Vehicle model

### Notifications Not Appearing

**Enable notifications:**
```bash
config set notify charge.smart "*"
```

**Check OVMS Connect app:**
- Ensure app is updated
- Check app notification settings
- Try force-closing and reopening app

**Test notification:**
```bash
script eval charging.setTarget(85)
# Should get notification in app
```

### Script Not Loading

**Reload script:**
```bash
script reload
```

**Check for errors:**
```bash
# Look for error messages in output
# Common issues:
# - Syntax errors (shouldn't happen with released version)
# - File not in correct location
```

**Verify file location:**
```bash
ls -la /store/scripts/lib/charging.js
# Should show file exists
```

### Vehicle Starts Charging Immediately (Won't Stop)

**Check schedule mode:**
```bash
script eval charging.status()
```

If "Mode: Immediate", you need to enable scheduling:
```bash
script eval charging.enable()
```

Then unplug and replug vehicle.

---

## Advanced Usage

### Button Integration (OVMS App)

You can create custom buttons in OVMS Connect:

**Status Button:**
- Command: `script eval charging.status()`
- Shows current state in notification

**Quick Disable Button:**
- Command: `script eval charging.disable()`
- For rapid chargers / urgent charging

**Quick Enable Button:**
- Command: `script eval charging.enable()`
- Resume normal scheduling

### Multiple Tariffs

If you have different rates on different days:

**Weekday (23:30-05:30):**
```bash
script eval charging.setWindow(23, 30, 5, 30)
```

**Weekend (00:00-08:00):**
```bash
script eval charging.setWindow(0, 0, 8, 0)
```

Change manually when needed, or wait for v1.2 automation.

### Monitoring First Use

**First night checklist:**

1. Before bed:
   ```bash
   script eval charging.status()
   # Verify: "Mode: Scheduled", "In window now: No"
   ```

2. After 23:30:
   ```bash
   script eval charging.status()
   # Verify: "Charging: Yes"
   ```

3. Next morning:
   ```bash
   script eval charging.status()
   # Verify: SOC at target, "Charging: No"
   ```

### Emergency Manual Control

**Force start charging now:**
```bash
script eval charging.start()
```

**Force stop charging:**
```bash
script eval charging.stop()
```

**Note:** These are manual overrides. Schedule will resume next cycle.

---

## Tips & Best Practices

### Battery Health
- **Daily charging:** Set target to 80-85%
- **Long journey:** Charge to 100% only when needed
- **Extended storage:** Reduce to 50-60% if not using vehicle for weeks
- **Temperature:** Avoid charging in extreme cold/heat when possible

### Cost Optimization
- Set window to match your cheapest tariff period
- Check your energy bill for exact times
- Some tariffs change seasonally - update script accordingly

### Reliability
- Check status occasionally to ensure working correctly
- Note any unusual behavior and report issues
- Keep OVMS firmware updated
- Don't modify the script unless you understand JavaScript

### Safety
- Always maintain physical access to vehicle charging controls
- Don't rely solely on automation for critical charging needs
- If going on important journey, charge to 100% regardless of schedule
- Keep vehicle charging system properly maintained

---

## Getting Help

### Check Documentation First
1. This User Guide (you're here!)
2. [Installation Guide](INSTALLATION-GUIDE.md)
3. [Test Results](V1.0.0-TEST-RESULTS.md)
4. [Design Documentation](DESIGN.md)

### Still Need Help?
- **GitHub Issues:** Report bugs or ask questions
- **OVMS Forums:** General OVMS questions
- **Vehicle Communities:** Vehicle-specific issues

### Reporting Bugs

Please include:
1. Output of `script eval charging.status()`
2. What you expected to happen
3. What actually happened
4. Vehicle make/model
5. OVMS firmware version

---

## What's Coming Next?

### v1.1.0 (Planned)
- Cost calculations and estimates
- Overflow cost warnings
- Estimated completion times

### v1.2.0 (Planned)
- Ready-by time configuration
- Optimal start time calculation
- Pre-window charging when necessary

### v1.3.0 (Planned)
- Enhanced notifications
- Better status formatting
- Cost breakdowns in notifications

See [Roadmap](FUTURE-ROADMAP.md) for details.

---

**Questions? Feedback? Issues?**  
Open a GitHub issue or check the documentation!

**Version:** 1.0.0 | **Status:** Production Ready ✅
