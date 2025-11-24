# OVMS Smart Charging System

[![Version](https://img.shields.io/badge/version-1.0.0-green)](https://github.com/andyorkney/ovms-smart-charging/releases/tag/v1.0.0)
[![Status](https://img.shields.io/badge/status-tested%20working-brightgreen)]()
[![OVMS](https://img.shields.io/badge/OVMS-v3.3.x-blue)]()

Intelligent charging scheduler for electric vehicles using OVMS v3. Automatically charges during cheap electricity rate windows while maintaining exact target state of charge.

## 🎯 What It Does

- **Waits for cheap rate window** - Charges during off-peak hours (e.g., 23:30-05:30 on Octopus Intelligent Go)
- **Stops at exact target SOC** - Precise battery health management (e.g., 80% for longevity)
- **One-touch control** - Enable/disable scheduling for long journeys
- **Stable and tested** - Ready on Nissan ENV200

## ✅ Status: v1.0.0 - Production Ready

**Tested and verified working** on 2025-11-23:
- ✅ Exact SOC targeting (stops at precisely 80%, no overshoot)
- ✅ Scheduled charging (waited for 23:30, started automatically)
- ✅ Stable overnight operation 
- ✅ User notifications (just) working in OVMS Connect app

> *"Plug vehicle in, charge starts (reassures user that power is on) then quickly stops; waits for cheap rate window before charging; starts charging at 23:30; charges to user set SoC and then stops at that % charge."*

See [V1.0.0 Test Results](docs/V1.0.0-TEST-RESULTS.md) 

## 🚀 Quick Start

### Prerequisites
- OVMS v3 module (tested on v3.3.x)
- Vehicle with OVMS charge control support
- SSH or web interface access to your OVMS module

### Installation (5 minutes)

1. **Copy the script to your OVMS module:**
```bash
scp src/charging-v1.0.0.js root@your-ovms-ip:/store/scripts/lib/charging.js
```

2. **SSH into OVMS and configure:**
```bash
ssh root@your-ovms-ip

# Set your target SOC (20-100%)
script eval charging.setTarget(80)

# Set your cheap rate window (24-hour format: hour, minute, hour, minute)
script eval charging.setWindow(23, 30, 5, 30)

# Enable scheduled charging
script eval charging.enable()

# Configure notifications
config set notify charge.smart "*"

# Reload the script
script reload
```

3. **Done!** Plug in your vehicle and it will charge during the cheap window.

Full installation guide: [docs/INSTALLATION-GUIDE.md](docs/INSTALLATION-GUIDE.md)

### Basic Usage

```bash
# Check current status
script eval charging.status()

# For long journeys (charge immediately when plugged in)
script eval charging.disable()

# Resume scheduled charging
script eval charging.enable()

# Change target SOC
script eval charging.setTarget(90)
```

Full user guide: [docs/USER-GUIDE.md](docs/USER-GUIDE.md)

## 📊 Features

### ✅ Working Now (v1.0.0)

| Feature | Status | Description |
|---------|--------|-------------|
| Fixed Schedule Charging | ✅ Verified | Waits for cheap rate window |
| Exact SOC Targeting | ✅ Verified | Stops at precise target (±0%) |
| Enable/Disable Control | ✅ Verified | One command to toggle scheduling |
| Auto Battery Detection | ✅ Working | Reads capacity and SOH from vehicle |
| User Notifications | ✅ Working | Sends alerts to OVMS Connect app |
| System Stability | ✅ Verified | No crashes, minimal CPU load |

### 🚧 Planned Features

| Feature | Version | Status |
|---------|---------|--------|
| Cost Calculations | v1.1.0 | Planned |
| Overflow Warnings | v1.1.0 | Planned |
| Ready-By Time Logic | v1.2.0 | Planned |
| Optimal Start Time | v1.2.0 | Planned |
| Enhanced Notifications | v1.3.0 | Planned |

See [Roadmap](docs/FUTURE-ROADMAP.md) for details.

## 🔧 Requirements

### Hardware
- OVMS v3 module (any variant)
- Vehicle with OVMS support
- Vehicle must support: `charge start`, `charge stop`, `autocharge`, `suffsoc`

### Tested Vehicles
- ✅ Nissan ENV200 (fully tested and verified)
- ⚠️ Other vehicles should work but are untested

### Firmware
- OVMS firmware v3.3.x (tested)
- Likely works on v3.2.x but untested

## 📖 Documentation

### Getting Started
- [Installation Guide](docs/INSTALLATION-GUIDE.md) - Step-by-step setup instructions
- [User Guide](docs/USER-GUIDE.md) - How to use all features
- [OVMS Guidelines](reference/OVMS-GUIDELINES.md) - Best practices for OVMS scripting

### Technical Documentation
- [Design Documentation](docs/DESIGN.md) - Architecture and how it works
- [Test Results](docs/V1.0.0-TEST-RESULTS.md) - Verification and test data
- [Requirements Verification](docs/REQUIREMENTS-VERIFICATION-v1.0.0.md) - What works vs what doesn't
- [Changelog](docs/CHANGELOG.md) - Version history and changes

### Reference
- [OVMS Scripting Reference](reference/OVMS-Scripting-Reference.md) - Complete OVMS API reference
- [OVMS User Manual](reference/OVMS-User-Manual.pdf) - Official OVMS documentation

## 🏗️ Architecture

### Simple Design

```
User plugs in vehicle
    ↓
Vehicle starts charging (vehicle firmware)
    ↓
Script detects plug-in event
    ↓
Outside cheap window? → Stop charging immediately
    ↓
Wait for cheap window (ticker checks every 5 min)
    ↓
At 23:30 → Start charging + set suffsoc
    ↓
Native OVMS monitors SOC
    ↓
At target SOC → OVMS stops automatically
```

**Uses native OVMS** `suffsoc` (sufficient SOC) for precise stopping instead of custom monitoring.

See [Design Documentation](docs/DESIGN.md) for details.

## ❓ FAQ

### Will this work with my vehicle?
If your vehicle is supported by OVMS and can respond to `charge start/stop` commands, it should work. Tested on Nissan ENV200.

### What if I need to charge immediately?
Run `script eval charging.disable()` before plugging in. The vehicle will charge immediately. Use `charging.enable()` to resume scheduled charging.

### Does this replace my vehicle's built-in timer?
Yes, disable your vehicle's timer. This system provides more intelligent scheduling.

### What happens if I unplug during the cheap window?
The system detects unplug and clears its schedule. Next plug-in starts fresh.

### Can I change settings while charging?
Yes, but some changes may not take effect until next charge cycle. Best to make changes when not charging.

### Will this work with solar/battery storage systems?
v1.0.0 is designed for time-based tariffs only. Solar integration planned for future versions.

## 🤝 Contributing

This is a personal project built for my Nissan ENV200, but feedback and suggestions are welcome:

- **Found a bug?** Open an issue with details
- **Have a feature request?** Check the roadmap first, then open an issue
- **Want to contribute code?** Contact me first to discuss

Please note: I can only test on my ENV200, so contributions for other vehicles are especially valuable.

## 📝 License

[Choose appropriate license - MIT, GPL, etc.]

Copyright (c) 2025 Andy Orkney

## 🙏 Credits

- **OVMS Project** - For creating an excellent open vehicle monitoring platform
- **OVMS Community** - For documentation and support
- **Octopus Energy** - For Intelligent Go tariff that inspired this project

## ⚠️ Important Disclaimers

### Use at Your Own Risk
This software controls vehicle charging. While tested and verified working, I provide no warranty. Always:
- Monitor first few charge cycles
- Verify your vehicle's behavior
- Keep vehicle charging systems maintained
- Follow manufacturer's charging guidelines

### Battery Health
This system is designed to IMPROVE battery health by limiting SOC. However:
- Always follow your vehicle manufacturer's recommendations
- Target SOC of 80-90% is generally recommended for daily use
- Charge to 100% only before long journeys
- Consult your vehicle's manual for specific guidance

### Electricity Rates
- Verify your tariff times before use
- Changes to your tariff may require updating the script
- This system doesn't automatically sync with tariff changes
- Always verify costs with your energy provider

### OVMS Module
- Ensure your OVMS module is properly installed
- Keep OVMS firmware updated
- This script doesn't replace OVMS safety features
- Always maintain physical access to vehicle charging controls

## 📞 Support

- **Documentation Issues:** Open a GitHub issue
- **OVMS Questions:** Visit [OVMS Forums](https://www.openvehicles.com/)
- **Vehicle-Specific:** Consult your vehicle's community

## 🌟 Star This Project

If this project saves you money on electricity, please star the repo! ⭐

---

**Version:** 1.0.0 | **Last Updated:** 2025-11-23 | **Status:** Production Ready ✅
