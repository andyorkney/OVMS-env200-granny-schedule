# OVMS Smart Charging - Command Reference

**Version:** v1.2.1  
**Quick Reference for Common Commands**

---

## 🚀 Getting Started

### First Time Setup
```javascript
// 1. Set your target SOC
charging.setTarget(80)        // Charge to 80%

// 2. Set your cheap rate window
charging.setWindow(23,30,5,30)    // 23:30 to 05:30

// 3. Set your ready-by time (when you need the car)
charging.setReadyBy(8,30)    // Ready by 08:30

// 4. Enable scheduled charging
charging.useSchedule()
```

---

## 📋 All Available Commands

### Configuration Commands

| Command | Parameters | Example | What It Does |
|---------|-----------|---------|--------------|
| `setTarget(soc)` | SOC percentage (20-100) | `charging.setTarget(80)` | Set target SOC to 80% |
| `setWindow(h1,m1,h2,m2)` | Start hour, min / End hour, min | `charging.setWindow(23,30,5,30)` | Cheap rate: 23:30-05:30 |
| `setReadyBy(h,m)` | Hour, minute | `charging.setReadyBy(8,30)` | Must be ready by 08:30 |
| `clearReadyBy()` | None | `charging.clearReadyBy()` | Disable ready-by (use window start) |
| `setCharger(kw)` | Kilowatts | `charging.setCharger(2.0)` | Charger rate is 2.0kW |
| `setRates(cheap,std)` | £/kWh rates | `charging.setRates(0.07,0.292)` | Set electricity rates |

### Control Commands

| Command | What It Does |
|---------|--------------|
| `useSchedule()` | Enable scheduled charging (wait for optimal time) |
| `chargeNow()` | Disable schedule, charge immediately on plug-in |
| `start()` | Start charging now (manual override) |
| `stop()` | Stop charging now |

### Information Commands

| Command | What It Shows |
|---------|---------------|
| `status()` | Full status with SOC, schedule, costs |
| `version()` | Current version number |

---

## 💡 Common Usage Patterns

### Change Target SOC
```javascript
charging.setTarget(90)     // Charge to 90% instead of 80%
```

### Change Ready-By Time
```javascript
charging.setReadyBy(7,30)    // Earlier departure (07:30)
charging.setReadyBy(9,0)     // Later departure (09:00)
```

### Disable Ready-By (Use Fixed Window)
```javascript
charging.clearReadyBy()    // Just start at window start (23:30)
```

### One-Time Charge Now
```javascript
charging.start()           // Charge immediately, ignore schedule
```

### Check Current Settings
```javascript
charging.status()          // See everything
```

---

## 🎯 Real-World Examples

### Scenario 1: Daily Commute (80%, ready by 08:30)
```javascript
charging.setTarget(80)
charging.setReadyBy(8,30)
charging.useSchedule()
```

### Scenario 2: Weekend Trip (100%, ready by 07:00)
```javascript
charging.setTarget(100)
charging.setReadyBy(7,0)
charging.useSchedule()
```

### Scenario 3: Just Charge to 80% During Cheap Window
```javascript
charging.setTarget(80)
charging.clearReadyBy()       // No deadline, just use window
charging.useSchedule()
```

### Scenario 4: Emergency - Charge Now!
```javascript
charging.start()              // Overrides schedule, starts immediately
```

---

## 🔧 Default Settings

| Setting | Default Value |
|---------|---------------|
| Target SOC | 80% |
| Cheap Window | 23:30 - 05:30 |
| Ready-By | Disabled (0:0) |
| Charger Rate | 2.0kW |
| Cheap Rate | £0.07/kWh |
| Standard Rate | £0.292/kWh |

---

## 📱 OVMS Console Commands

If you need to use the OVMS console directly:

```bash
# Check version
script eval "charging.version()"

# Check status
script eval "charging.status()"

# Set target to 90%
script eval "charging.setTarget(90)"

# Set ready-by to 08:00
script eval "charging.setReadyBy(8,0)"
```

---

## ⚠️ Important Notes

### Critical Setup
```bash
# MUST have this enabled for SOC control to work!
config set xnl autocharge yes
```

### After Changing Target
The system automatically updates OVMS's `suffsoc` setting when you use `setTarget()`, so the vehicle will stop at the right SOC.

### Ready-By vs Fixed Window
- **With ready-by set** (e.g., 08:30): System calculates optimal start time, may start before cheap window if needed
- **Without ready-by** (cleared): System always starts at cheap window start (23:30)

---

## 🆘 Troubleshooting

**Charging not starting?**
```javascript
charging.status()             // Check current state
// Verify ready-by or window settings
```

**Not stopping at target?**
```bash
config list xnl autocharge    # Should be "yes"
config list xnl suffsoc       # Should match your target
```

**Want to override schedule temporarily?**
```javascript
charging.start()              // Start now
charging.stop()               // Stop now
```

---

## 📚 For More Information

- **Full Documentation:** README.md
- **Version History:** SMART-CHARGING-CHANGELOG.md
- **Deployment Guide:** DEPLOYMENT-CHECKLIST.md

---

**Quick Reference v1.2.1**  
**Last Updated:** 2025-11-27
