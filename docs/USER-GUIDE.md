# OVMS Smart Charging - User Guide

**Version:** 1.3.5  
**Last Updated:** 2025-12-06

## Table of Contents
- [Quick Start](#quick-start)
- [Basic Operations](#basic-operations)
- [Configuration](#configuration)
- [Daily Use](#daily-use)
- [Ready-By Mode](#ready-by-mode)
- [Cost Information](#cost-information)
- [Troubleshooting](#troubleshooting)
- [Advanced Usage](#advanced-usage)

---

## Quick Start

### First Time Setup (5 minutes)

1. **Install the script** (see README.md for installation instructions)

2. **Configure your preferences:**
```bash
# SSH into your OVMS module (or use web interface)
ssh root@192.168.4.1

# Set target SOC and skip threshold (recommended: 80-90% for daily use)
script eval charging.setLimits(85, 75)

# Set your cheap rate window (example: Octopus Intelligent Go 23:30 to 05:30)
script eval charging.setSchedule(23, 30, 5, 30)

# Set charger power rating (important for ready-by calculations)
script eval charging.setChargeRate(7)  # 7kW home wallbox

# Set electricity rates (for cost calculations)
script eval charging.setRates(0.07, 0.292)  # Octopus Intelligent Go

# Enable scheduled charging
script eval charging.scheduleOn()

# Configure notifications (optional)
config set notify charge.smart "*"
```

3. **Test it:**
```bash
# Check status
script eval charging.status()

# You should see:
#   Target SOC: 85% (skip if above 75%)
#   Cheap window: 23:30 - 05:30
#   Schedule: ON (charges during cheap window)
#   Charger: 7.0 kW
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
- Battery health (SOH) and capacity
- Plugged in / charging status
- Schedule mode (ON/OFF)
- Cheap rate window times
- Ready-by time (if configured)
- Charger power rating
- Electricity rates
- Native OVMS control settings
- **Energy used this session** (native v.c.kwh tracking)

**Example Output:**
```
=== Smart Charging v1.3.5 ===

Battery:
  SOC: 84% (target 85%, skip if above 75%)
  SOH: 86%
  Capacity: 34.4 kWh (usable)
  Energy used this session: 9.2 kWh

Status:
  Plugged in: Yes
  Charging: No

Schedule:
  Mode: ON (charges during cheap window)
  Cheap window: 23:30 - 05:30
  In window now: No
  Ready-by time: Not configured

Charger:
  Power: 7.0 kW
  Rates: £0.07/kWh (cheap), £0.292/kWh (standard)

Native OVMS Control:
  autocharge: yes
  suffsoc: 85%
```

### Enable Scheduled Charging
```bash
script eval charging.scheduleOn()
```

**What this does:**
- Charges only during cheap rate window (or earlier if ready-by time requires)
- Stops immediately if plugged in outside window
- Waits for 23:30 (or your configured time) to start
- Stops at target SOC (85%)

**Use when:**
- Normal daily charging at home
- You want to minimise electricity costs
- You don't need the vehicle immediately

### Disable Scheduled Charging (Immediate Mode)
```bash
script eval charging.scheduleOff()
```

**What this does:**
- Charges immediately when plugged in
- Ignores cheap rate window
- Still stops at target SOC
- Useful for urgent charging

**Use when:**
- Going on a long journey
- Need full charge urgently
- At a public rapid charger

**Important:** Remember to re-enable scheduling when back home:
```bash
script eval charging.scheduleOn()
```

---

## Configuration

### Set Target SOC and Skip Threshold
```bash
script eval charging.setLimits(targetSOC, skipIfAbove)
```

**Examples:**
```bash
# Daily use: charge to 85%, skip if already above 75%
script eval charging.setLimits(85, 75)

# Before long journey: charge to 100%, skip if above 95%
script eval charging.setLimits(100, 95)

# Storage mode: charge to 60%, skip if above 55%
script eval charging.setLimits(60, 55)
```

**Recommended values:**
- **80-90%** - Daily use (best for battery health)
- **100%** - Before long journeys only
- **50-60%** - Long-term storage (if leaving vehicle unused)

**Skip threshold:**
- Prevents unnecessary charging if already charged enough
- Typical: 5-10% below target
- Saves wear on battery and charging equipment

### Set Cheap Rate Window
```bash
script eval charging.setSchedule(startHour, startMinute, endHour, endMinute)
```

**Examples:**
```bash
# Octopus Intelligent Go: 23:30 - 05:30
script eval charging.setSchedule(23, 30, 5, 30)

# Economy 7: 00:30 - 07:30
script eval charging.setSchedule(0, 30, 7, 30)

# Custom: 22:00 - 06:00
script eval charging.setSchedule(22, 0, 6, 0)
```

**Important:** 
- Uses 24-hour format
- Window can cross midnight (handled automatically)
- Verify times match your electricity tariff

### Set Charger Power Rating
```bash
script eval charging.setChargeRate(kw)
```

**Examples:**
```bash
# 1.8kW granny charger
script eval charging.setChargeRate(1.8)

# 7kW home wallbox (most common)
script eval charging.setChargeRate(7)

# 22kW three-phase
script eval charging.setChargeRate(22)

# 50kW rapid charger
script eval charging.setChargeRate(50)
```

**Important:** 
- Used for ready-by time calculations
- Should match your actual charger power
- System adapts to actual charging rate over time

### Set Electricity Rates
```bash
script eval charging.setRates(cheapRate, standardRate)
```

**Example:**
```bash
# Octopus Intelligent Go rates (£/kWh)
script eval charging.setRates(0.07, 0.292)

# Economy 7 (example rates)
script eval charging.setRates(0.09, 0.25)
```

**Used for:**
- Cost calculations in status display
- Overflow cost warnings
- Session cost estimates

---

## Daily Use

### Normal Weeknight Routine

**Evening (anytime before 23:30):**
1. Arrive home with 60% SOC
2. Plug in vehicle
3. Vehicle may start charging briefly (vehicle firmware)
4. Script stops it within seconds (if schedule ON)
5. Get notification: "Plugged in at 60%. Target 85% during 23:30-05:30. Est. 9.2 kWh, £0.64"

**Night (23:30):**
1. Charging starts automatically
2. Get notification: "Charging started (scheduled). Target 85%. Est. finish 04:00"
3. Sleep peacefully

**Morning (around 04:00):**
1. Charging stops at 85% SOC
2. Get notification: "Charge complete. 85% reached. Used 9.2 kWh, £0.64"
3. Unplug and drive
4. No action needed

### Long Journey Preparation

**Day before:**
```bash
# Disable scheduling and set to 100%
script eval charging.scheduleOff()
script eval charging.setLimits(100, 95)

# Plug in vehicle
# It charges immediately to 100%
```

**After journey:**
```bash
# Re-enable scheduling and return to 85%
script eval charging.scheduleOn()
script eval charging.setLimits(85, 75)
```

### Weekend / Not Using Vehicle

**Option 1: Normal charging**
- Leave scheduling enabled
- Charges to 85% as usual
- Good for regular weekend use

**Option 2: Reduce to storage level**
```bash
# If not using for 1+ weeks
script eval charging.setLimits(60, 55)
```

Remember to set back to 85% before next use.

---

## Ready-By Mode

**New in v1.3.0**: Ensure vehicle is charged by a specific time.

### Configure Ready-By Time
```bash
script eval charging.setReadyBy(hour, minute)
```

**Examples:**
```bash
# Need vehicle ready by 07:30
script eval charging.setReadyBy(7, 30)

# Need vehicle ready by 08:00
script eval charging.setReadyBy(8, 0)

# Partner needs vehicle ready by 08:30
script eval charging.setReadyBy(8, 30)
```

### How It Works

**Scenario 1: Finishes within cheap window**
- Cheap window: 23:30 - 05:30
- Need: 3 hours charging (60% → 85%)
- Starts: 23:30
- Finishes: 02:30 (within cheap window)
- Cost: All at cheap rate (£0.07/kWh)

**Scenario 2: Extends beyond cheap window**
- Cheap window: 23:30 - 05:30
- Need: 8 hours charging (20% → 85%)
- Starts: 23:30
- Finishes: 07:30 (2 hours after window ends)
- Cost: 6 hours cheap + 2 hours standard
- Warning: Shows overflow cost in notification

**Scenario 3: Must start before cheap window**
- Cheap window: 23:30 - 05:30
- Ready by: 07:30
- Need: 10 hours charging (10% → 85%)
- Starts: 21:30 (2 hours BEFORE cheap window)
- Finishes: 07:30
- Cost: 2 hours standard + 6 hours cheap + 2 hours standard
- Warning: Shows pre-window and overflow costs

### Disable Ready-By Mode
```bash
script eval charging.clearReadyBy()
```

Returns to simple scheduled charging (starts at cheap window start).

### Check Ready-By Status
```bash
script eval charging.status()
```

Look for "Ready-by time:" in output.

---

## Cost Information

### Session Cost Tracking

**During charging:**
- Status shows estimated kWh and cost
- Updates based on actual SOC changes
- Uses native v.c.kwh energy metric for accuracy

**After charging:**
- Final notification shows actual energy used
- Cost calculated based on when charging occurred
- Breaks down pre-window / cheap / overflow costs if applicable

**Example notification:**
```
Charge complete. 85% reached.
Used 9.2 kWh, £0.64 (all in cheap window)
```

**With overflow:**
```
Charge complete. 85% reached.
Used 15.4 kWh, £2.51 total
  Cheap (23:30-05:30): £0.98 (14.0 kWh)
  Overflow (05:30-07:30): £1.53 (5.4 kWh)
```

### Cost Estimates

Run `charging.status()` to see:
- Current session energy used
- Estimated cost based on configured rates
- Breakdown by rate period (if applicable)

**Note:** v1.3.5 fixes midnight-crossing cost calculation bug that previously showed incorrect cost breakdowns.

---

## Troubleshooting

### Vehicle Not Charging at Scheduled Time

**Check 1: Is scheduling enabled?**
```bash
script eval charging.status()
# Look for: "Mode: ON (charges during cheap window)"
```

If shows "Mode: OFF", run:
```bash
script eval charging.scheduleOn()
```

**Check 2: Are you in the cheap window?**
```bash
script eval charging.status()
# Look for: "In window now: Yes"
```

If window times are wrong, reconfigure:
```bash
script eval charging.setSchedule(23, 30, 5, 30)
```

**Check 3: Is SOC already above skip threshold?**
If SOC is 76% and skip threshold is 75%, it won't charge.

Check: `charging.status()` shows "skip if above X%"

**Check 4: Is vehicle actually plugged in?**
```bash
script eval charging.status()
# Look for: "Plugged in: Yes"
```

**Check 5: Is ready-by time causing early/late start?**
If ready-by time configured, may start before cheap window or extend after.

### Charged to Wrong SOC

**Stopped too early (e.g., 82% instead of 85%):**
- Check target: `charging.status()`
- May be vehicle/OVMS calibration issue
- Try unplugging and replugging
- SOC accuracy typically ±2-3%

**Charged past target (e.g., 90% instead of 85%):**
- Should not happen with v1.3.5
- If occurs, report as bug with:
  - Target SOC setting
  - Actual SOC reached
  - Charger power rating
  - Vehicle model

### Notifications Not Appearing

**Enable notifications:**
```bash
config set notify charge.smart "*"
```

**Check OVMS Connect app:**
- Ensure app is updated
- Check app notification settings
- Verify OVMS server connection
- Try force-closing and reopening app

**Test notification:**
```bash
script eval charging.setLimits(85, 75)
# Should get confirmation notification
```

**Known issue:** 
Notifications may occasionally duplicate. This is a known OVMS/pyOVMS interaction issue being investigated.

### Incorrect Cost Calculations

**v1.3.5 fixes:**
- Decimal time display bug (was showing "04:48.868" now shows "04:49")
- Midnight-crossing cost calculation (was showing all kWh in pre-window, now correctly shows cheap window)

**To verify fix:**
```bash
script eval charging.status()
```

Check that:
- Times displayed as HH:MM (no decimals)
- Cost breakdown makes sense for your charging session
- Midnight-crossing sessions show correct cheap window kWh

### Script Not Loading

**Reload script:**
```bash
script reload /store/scripts/lib/charging.js
```

**Check for errors:**
Look for error messages in SSH output

**Verify file location:**
```bash
ls -la /store/scripts/lib/charging.js
# Should show file exists
```

**Check ovmsmain.js loads it:**
```bash
cat /store/scripts/ovmsmain.js
# Should contain: . /store/scripts/lib/charging.js
```

---

## Advanced Usage

### Web Interface Configuration

**Instead of SSH, use OVMS web interface:**

1. Navigate to: Tools → Editor → `/store/scripts/lib/charging.js`
2. Browse to line you want to check
3. Or use SSH for commands (easier for configuration)

**Configuration commands work from:**
- SSH terminal
- OVMS web interface (Tools → Shell)
- OVMS Android app (custom buttons)

### Button Integration (OVMS Connect App)

You can create custom buttons:

**Status Button:**
- Command: `script eval charging.status()`
- Shows current state in notification

**Schedule ON Button:**
- Command: `script eval charging.scheduleOn()`
- Enable scheduled charging

**Schedule OFF Button:**
- Command: `script eval charging.scheduleOff()`
- For rapid chargers / urgent charging

**Quick 100% Button:**
```
script eval charging.scheduleOff()
script eval charging.setLimits(100, 95)
```

**Restore 85% Button:**
```
script eval charging.scheduleOn()
script eval charging.setLimits(85, 75)
```

### Different Chargers

**Home (7kW wallbox):**
```bash
script eval charging.setChargeRate(7)
script eval charging.scheduleOn()
```

**Public rapid (50kW):**
```bash
script eval charging.setChargeRate(50)
script eval charging.scheduleOff()  # Charge immediately
```

**Granny cable (1.8kW):**
```bash
script eval charging.setChargeRate(1.8)
# May need earlier start for ready-by time
```

### Monitoring First Use

**First night checklist:**

1. Before bed (22:00):
   ```bash
   script eval charging.status()
   # Verify: Schedule ON, In window: No
   ```

2. After window start (23:40):
   ```bash
   script eval charging.status()
   # Verify: Charging: Yes, Energy used: X.X kWh
   ```

3. Next morning:
   ```bash
   script eval charging.status()
   # Verify: SOC at target, Charging: No
   # Check notification for actual kWh used and cost
   ```

### Manual Control

**Force start charging now (ignores schedule):**
```bash
script eval charging.start()
```

**Force stop charging:**
```bash
script eval charging.stop()
```

**Note:** Manual commands are one-time. Schedule resumes on next plug-in.

### Viewing Configuration

**See all current settings:**
```bash
script eval charging.status()
```

**Individual settings:**
```bash
# Just the schedule
script eval charging.scheduleInfo()

# Just the limits
# (shown in status output)
```

---

## Tips & Best Practices

### Battery Health
- **Daily charging:** Set target to 80-85%
- **Long journey:** Charge to 100% only when needed
- **Extended storage:** Reduce to 50-60% if not using vehicle for weeks
- **Temperature:** Avoid charging in extreme cold/heat when possible
- **Skip threshold:** Use 5-10% below target to avoid frequent top-ups

### Cost Optimisation
- Set window to match your cheapest tariff period
- Check your energy bill for exact times
- Use ready-by mode only when necessary
- Review cost breakdown in notifications
- Some tariffs change seasonally - update script accordingly

### Ready-By Mode Best Practices
- Set ready-by time 30 minutes before actual departure
- Allows margin for unexpected delays
- Don't set if you don't need it (wastes cheap rate optimisation)
- System prefers cheap window start over exact ready-by finish

### Reliability
- Check status occasionally to ensure working correctly
- Note any unusual behaviour and check troubleshooting
- Keep OVMS firmware updated
- Review notifications for warnings about overflow costs

### Safety
- Always maintain physical access to vehicle charging controls
- Don't rely solely on automation for critical charging needs
- If going on important journey, charge to 100% regardless of schedule
- Keep vehicle charging system properly maintained
- Manual stop button on charger always works

---

## Recent Changes

### v1.3.5 (2025-12-06)
**Bug Fixes:**
- Fixed decimal time display in notifications (was "04:48.868", now "04:49")
- Fixed midnight-crossing cost calculation (was showing all kWh in pre-window, now correctly shows cheap window kWh)

### v1.3.4 (2025-12-05)
**Features:**
- Native energy tracking using OVMS v.c.kwh metric
- Improved accuracy of kWh measurements
- Fallback to SOC-based calculation if metric unavailable

### v1.3.3 (2025-12-04)
**Improvements:**
- Command naming clarity: `scheduleOn()` / `scheduleOff()` replace confusing `useSchedule()` / `chargeNow()`
- Fixed UTF-8 character corruption in notifications

### v1.3.0 (2025-11-26)
**Major Features:**
- Ready-by mode with intelligent start time calculation
- Cost calculations with overflow warnings
- Enhanced notifications with cost breakdowns
- Pre-window charging when necessary

---

## Getting Help

### Check Documentation First
1. This User Guide (you're here)
2. [README.md](README.md) - Installation and overview
3. [Changelog](V1_3_5-CHANGELOG.md) - Recent changes
4. Design documentation in repository

### Still Need Help?
- **GitHub Issues:** Report bugs or ask questions
- **OVMS Forums:** General OVMS questions at https://www.openvehicles.com
- **Vehicle Communities:** Vehicle-specific issues

### Reporting Bugs

Please include:
1. Output of `script eval charging.status()`
2. What you expected to happen
3. What actually happened
4. Vehicle make/model
5. OVMS firmware version
6. Charger power rating

---

**Questions? Feedback? Issues?**  
Open a GitHub issue or check the documentation.

**Version:** 1.3.5 | **Last Updated:** 2025-12-06
