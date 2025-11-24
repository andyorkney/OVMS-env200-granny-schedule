# Smart Charging System - Installation Guide

**Version:** 3.1.0
**Date:** 2025-01-15
**For:** Nissan ENV200 + OVMS v3

**NEW in v3.1.0:** Automatic charge interruption recovery with climate wake cycle

---

## Prerequisites

✅ OVMS v3 module installed and working
✅ ENV200 vehicle connection established
✅ OVMS Connect app installed (iOS/Android)
✅ Basic familiarity with OVMS console

---

## Installation Steps

### Step 1: Upload Scripts to OVMS

You need to upload **two files**:
- `charging.js` - Main smart charging script
- `setup-events.js` - Event installer helper

**Via SSH/Web Console:**

1. Connect to OVMS web interface or SSH
2. Navigate to: `/store/scripts/lib/` for charging.js
3. Navigate to: `/store/scripts/` for setup-events.js
4. Upload both files

**Via USB Console:**

```bash
# Connect via USB terminal
# Upload charging.js
cd /store/scripts/lib
vfs edit charging.js
# Paste the entire charging.js contents
# Save and exit

# Upload setup-events.js
cd /store/scripts
vfs edit setup-events.js
# Paste the entire setup-events.js contents
# Save and exit
```

---

### Step 2: Load the Main Charging Script

**Option A: Manual Load (for testing)**

```bash
# In OVMS console
script run /store/scripts/lib/charging.js
```

**Option B: Auto-load on Boot (recommended)**

```bash
# Add to /store/scripts/ovmsmain.js
echo 'require("/store/scripts/lib/charging.js");' >> /store/scripts/ovmsmain.js

# Or create ovmsmain.js if it doesn't exist
vfs edit /store/scripts/ovmsmain.js
# Add: require("/store/scripts/lib/charging.js");
```

---

### Step 3: Install Clock Events

The setup-events.js script creates 48 clock event files that check your charging schedule every 30 minutes (00:00, 00:30, 01:00, ..., 23:30).

**Install the Events:**

```bash
# In OVMS shell:
script eval require('setup-events').install()

# Wait for output - creates max 5 files per run to avoid system strain
# Run the command multiple times until all 48 files are created
```

**Important:** The installer is batched to prevent system overload. You may need to run `install()` multiple times until you see "Installation complete!"

**Verify Installation:**

```bash
# Check all events are created
script eval require('setup-events').listEvents()

# Should show 48 events from 00:00 to 23:30
# You can also check: vfs ls /store/events/
# Should see directories: clock.0000, clock.0030, clock.0100, ..., clock.2330
```

**Other Event Commands:**

```bash
# Show help
script eval require('setup-events').help()

# Remove all events (if needed)
script eval require('setup-events').uninstall()
```

---

### Step 4: Configure Your Settings

**Quick Setup (Your Configuration):**

```javascript
// In OVMS console, run:
charging.setTarget(80)              // 80% normal target
charging.setReadyBy(7, 30)          // Ready by 07:30
charging.setWindow(23, 30, 5, 30)   // Octopus Go: 23:30-05:30
charging.setRates(0.07, 0.292)      // Octopus rates
charging.setCharger(1.8)            // Granny charger
```

**Verify Configuration:**

```javascript
charging.status()
// Should show your settings
```

---

### Step 5: Test Event Detection

**Critical: We need to find which event fires when you plug in!**

```bash
# Enable verbose logging
log monitor yes
log level verbose

# Watch for events when plugging in
# Plug in the vehicle now...
# Look for one of these:
# - vehicle.charge.prepare
# - vehicle.charge.start
# - vehicle.charge.pilot.on

# Report back which event you see!
```

If no events fire, we'll need to adjust the script to use a polling method instead.

---

### Step 6: Test Basic Functions

**Test Manual Start:**

```javascript
// With vehicle plugged in
charging.start()
// Should start charging immediately
// Watch OVMS Connect app - charging should begin

// After 30 seconds
charging.stop()
// Should stop charging
```

**Test Schedule Calculation:**

```javascript
// Plug in vehicle (outside cheap window)
// Should see notification: "[HH:MM] Scheduled for 23:30..."
// Check with: charging.status()
```

**Test Climate Wake (NEW v3.1.0):**

```javascript
// While connected to console, run:
climatecontrol on
// Wait 5 seconds - you should hear/feel climate activate

climatecontrol off
// Climate should stop

// This confirms the command works on your ENV200
```

**Test Clock Events:**

```bash
# The schedule will be checked automatically every 30 minutes
# At each half-hour, check logs for:
log monitor yes
# Wait for next :00 or :30 time
# Should see: "Checking charging schedule..."
```

---

## Configuration Reference

### All Available Settings

```javascript
// Target state of charge (20-100%)
charging.setTarget(80)

// Departure time (HH, MM)
charging.setReadyBy(7, 30)    // 07:30
charging.setReadyBy(8, 30)    // 08:30

// Cheap rate window (start_h, start_m, end_h, end_m)
charging.setWindow(23, 30, 5, 30)   // 23:30 - 05:30

// Electricity rates (cheap, standard) in £/kWh
charging.setRates(0.07, 0.292)      // Intelligent Octopus Go
charging.setRates(0.075, 0.245)     // Octopus Go (older tariff)

// Charger power in kW
charging.setCharger(1.8)   // Granny charger (10A)
charging.setCharger(2.3)   // Granny charger (13A)
charging.setCharger(7.0)   // Type 2 slow charger
```

### Persistent Configuration (Alternative Method)

**Via OVMS Config Commands:**

```bash
config set charging target_soc 80
config set charging ready_by 07:30
config set charging cheap_start 23:30
config set charging cheap_end 05:30
config set charging cheap_rate 0.07
config set charging standard_rate 0.292
config set charging charger_rate 1.8
```

---

## Usage

### Normal Daily Use

1. **Arrive home, plug in vehicle (any time)**
   - Vehicle will auto-start charging briefly
   - OVMS stops it within 60 seconds
   - Notification shows schedule and cost
   - Example: `[18:01] Scheduled for 23:30. Will reach 80% by 02:30. Est. cost £0.71`

2. **Scheduled start (e.g., 23:30)**
   - Charging starts automatically
   - Notification: `[23:30] Charging started. Target 80%.`

3. **Target reached (e.g., 02:30)**
   - Charging stops automatically
   - Notification: `[02:30] Charged to 80%`

4. **Morning departure (e.g., 07:30)**
   - Vehicle ready with 80% charge
   - Unplug and drive

### Charge Interruption Recovery (NEW v3.1.0)

**What Happens:**

If charging stops unexpectedly (power cut, pilot loss, etc.):

1. **First attempt (2 min delay):**
   - `[01:00] Charging interrupted at 65%. Retrying in 2 minutes... (attempt 1/3)`
   - Climate wake cycle activates (15 seconds)
   - `[01:02] Charging restarted. Target 80%.`

2. **If retry fails (5 min delay):**
   - `[01:02] Charging interrupted at 65%. Retrying in 5 minutes... (attempt 2/3)`
   - Climate wake cycle activates again
   - Retry charging

3. **If still failing (10 min delay):**
   - `[01:07] Charging interrupted at 65%. Retrying in 10 minutes... (attempt 3/3)`
   - Final climate wake attempt
   - Final retry

4. **After 3 failures:**
   - `[01:17] Charging failed multiple times at 65% (target 80%). Please check vehicle and charger.`
   - System stops trying
   - User intervention required

**What You Might Notice:**
- Cabin fan briefly activates during retry (climate wake cycle)
- Multiple notifications during retry sequence
- System automatically recovers from transient faults

### Emergency "Charge Now"

**Via OVMS Connect App:**

1. Open app
2. Find charging controls
3. Tap "Start Charge" button
4. Charges immediately, ignores schedule

**Via Console:**

```javascript
charging.start()
```

**Note:** Manual charging does NOT auto-retry on interruption (assumes user is present).

### Check Status

At any time:

```javascript
charging.status()
```

**Shows:**
- Current SOC, plugged in, charging state
- Battery capacity and health
- Your configuration
- Active schedule (if any)
- Retry count (NEW v3.1.0)

---

## Troubleshooting

### Vehicle Doesn't Stop Auto-Charging

**Problem:** Plugged in at 18:00, still charging at 18:05

**Solution:**
1. Check script is loaded: `script list`
2. Check event subscription: Enable logging, plug in, watch for events
3. Manually test: `charging.stop()` - does it work?

### No Notification When Plugged In

**Problem:** No schedule notification appears

**Solution:**
1. Check OVMS notifications enabled in app
2. Check console for errors: `log monitor yes`
3. Test manually: `charging.status()`

### Charging Doesn't Start at Scheduled Time

**Problem:** 23:30 arrives, no charging starts

**Solution:**
1. Check vehicle is still plugged in
2. Verify clock events are installed: `script eval require('setup-events').listEvents()`
3. Check console logs around scheduled time
4. Check: `charging.status()` - is schedule set?

### Clock Events Not Firing

**Problem:** No schedule checks at :00 or :30 times

**Solution:**
1. Verify events exist: `vfs ls /store/events/clock.2330`
2. Should contain: `charging-check.js`
3. If missing, re-run: `script eval require('setup-events').install()`
4. Check OVMS time is correct: `time`

### Charge Keeps Interrupting (NEW v3.1.0)

**Problem:** Multiple retry attempts, keeps failing

**Solution:**
1. Check physical connections (plug seated properly?)
2. Test climate wake manually: `climatecontrol on` → wait → `climatecontrol off`
3. Check pilot signal: After climate wake, does `v.c.pilot` show "yes"?
4. May be real fault - check charger/vehicle

### Climate Wake Doesn't Work

**Problem:** Pilot signal doesn't restore after climate cycle

**Solution:**
1. Verify commands work: `climatecontrol on/off`
2. Check if different timing needed (currently 10s on, 5s off)
3. May need longer wake cycle - report to developers

### Cost Estimates Seem Wrong

**Problem:** Notifications show incorrect costs

**Solution:**
1. Verify rates: `charging.status()` - check cheap/standard rates
2. Verify charger rate: Is it 1.8 kW? Adjust if needed
3. Check battery SOH: May affect calculations

---

## Testing Checklist

Before relying on the system, test:

- ✅ Manual start works (`charging.start()`)
- ✅ Manual stop works (`charging.stop()`)
- ✅ Plug-in triggers schedule calculation
- ✅ Notification appears with schedule
- ✅ Auto-charge is stopped within 60 seconds
- ✅ Clock events installed (48 total)
- ✅ Schedule checks run every 30 minutes
- ✅ Scheduled start happens at correct time
- ✅ Charging stops at target SOC
- ✅ Unplug clears schedule
- ✅ Cost estimates are reasonable
- ✅ Climate wake commands work (NEW v3.1.0)
- ✅ Retry logic activates on interruption (NEW v3.1.0)
- ✅ Timestamps appear in notifications (NEW v3.1.0)

---

## What's New in v3.1.0

### Automatic Charge Interruption Recovery

**Problem Solved:**
- Power cuts, pilot signal loss, loose connections no longer leave you stranded
- System automatically recovers using climate wake cycle
- Up to 3 retry attempts before giving up

**How It Works:**
1. Detects when charging stops unexpectedly
2. Waits brief delay (allows transient faults to clear)
3. Activates climate control cycle (restores pilot signal)
4. Restarts charging
5. Repeats up to 3 times if needed

**User Benefits:**
- Wake up with charged vehicle even after power cuts
- No manual intervention needed for transient faults
- Clear notifications if real fault requires attention

### Timestamps on All Notifications

**What Changed:**
- All notifications now include time of event: `[HH:MM] message`
- Makes it easy to track when events occurred
- Helps diagnose issues from notification history

### Enhanced Status Display

```javascript
charging.status()
```

Now shows:
- Retry count: How many retry attempts have been made
- More detailed state information
- Version number (v3.1.0)

---

## Getting Help

If something doesn't work:

1. **Check logs:**
   ```bash
   log monitor yes
   log level verbose
   # Try the operation again
   # Copy/paste any error messages
   ```

2. **Check status:**
   ```javascript
   charging.status()
   // Screenshot or copy output
   ```

3. **Check events:**
   ```bash
   script eval require('setup-events').listEvents()
   // Should show 48 events
   ```

4. **Report:**
   - What you tried to do
   - What happened (expected vs actual)
   - Any error messages
   - Output of `charging.status()`
   - Whether climate wake commands work
   - Whether clock events are installed

---

## Next Steps

Once basic testing confirms it works:

1. ✅ Use for 1 week, monitor behaviour
2. ✅ Verify cost estimates match actual bills
3. ✅ Fine-tune settings (ready-by time, target SOC)
4. ✅ Test retry logic with real interruptions (if they occur)
5. ✅ Report any issues or unexpected behaviour

Future enhancements will be added based on real-world usage and feedback.

---

**End of Installation Guide v3.1.0**
