# Changelog

All notable changes to the OVMS Smart Charging Scheduler will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [2.1.0] - 2025-11-16

### Added
- **Climate Control with Wake Retry**
  - New `charging.climate(mode)` command supporting on/off/heat/cool modes
  - Automatic vehicle wake when climate command fails
  - Configurable retry delay (default 5000ms)
  - Single retry attempt to avoid infinite loops
  - `charging.climateStatus()` to view climate control state
  - `charging.setClimateRetry(enabled)` to enable/disable wake retry
  - `charging.setWakeDelay(ms)` to configure wake delay
  - Notifications for retry attempts and results

- **Vehicle Lock/Unlock with Pre-Wake**
  - New `charging.lock()` command with automatic wake for sleeping vehicles
  - New `charging.unlock()` command with automatic wake for sleeping vehicles
  - Vehicle awake detection via v.e.awake metric and 12V current
  - Configurable lock wake delay (default 3000ms)
  - `charging.securityStatus()` to view security command state
  - Notifications for wake initiation and command results

- **Vehicle Wake Management**
  - `isVehicleAwake()` function checking multiple wake indicators
  - `wakeVehicle()` function to send wake command
  - Timer-based callback scheduling for async operations
  - Wake state tracking in session object
  - 12V battery current monitoring as secondary wake indicator

- **Project Documentation**
  - New DESIGN.md with architectural documentation
  - New REQUIREMENTS.md with functional and non-functional requirements
  - New CHANGELOG.md (this file) for tracking changes

### Changed
- Updated version to 2.1.0-20251116-1200
- Enhanced session state tracking with climate and wake fields
- Extended configuration with climate and lock wake delay settings
- monitorSOC() now processes pending timer callbacks
- Updated header documentation with new features and usage examples

### Technical Details
- Timer system uses array-based pending timer queue
- Callbacks scheduled via `scheduleAfterDelay()` function
- Timers processed during `monitorSOC()` ticker calls
- Single retry strategy for climate commands prevents retry storms
- Pre-wake for lock/unlock ensures command delivery to sleeping vehicles

## [2.0.5.1] - 2025-11-10

### Fixed
- Fixed unreliable Leaf instrument metrics after sleep/reboot
- Uses standard v.b.soc metric instead of xnl.v.b.soc.instrument
- SOH metric returns null when unavailable (instead of 0)

### Added
- UK miles conversion for range display
- Odometer display in miles and kilometers

## [2.0.5] - 2025-11-09

### Added
- Enhanced debug logging to diagnose monitoring failures
- Monitor logs SOC at every check for visibility
- Performance monitoring for checkSchedule() execution time

## [2.0.4] - 2025-11-08

### Added
- Logger utility with timestamps (borrowed from ABRP.js pattern)
- Persistent notifications using "alert" type
- Subscription state tracking to prevent duplicates
- Performance monitoring with timing warnings
- Enhanced status display with units and vehicle info
- Vehicle type detection
- Nissan Leaf specific SOC metric support (later deprecated in 2.0.5.1)

### Changed
- Static ticker.60 subscription (no dynamic subscribe/unsubscribe)
- Flag-based monitoring approach for stability

## [2.0.3] - 2025-11-07

### Added
- Persistent configuration storage
- Automatic config load on startup
- Manual start/stop charging commands

### Changed
- Improved schedule window calculation for midnight crossing

## [2.0.2] - 2025-11-06

### Added
- Schedule window configuration
- Target SOC validation
- Basic status reporting

## [2.0.1] - 2025-11-05

### Added
- SOC monitoring functionality
- Auto-stop when target reached
- Basic charging control

## [2.0.0] - 2025-11-04

### Added
- Initial stable release
- Time-based charging automation
- OVMS metrics integration
- Basic notification support

---

## Migration Guide

### From 2.0.x to 2.1.0

No breaking changes. New features are additive:

1. **Climate Control**: Use `charging.climate("on")` instead of direct OVMS commands to benefit from wake retry
2. **Lock/Unlock**: Use `charging.lock()` and `charging.unlock()` instead of direct OVMS commands for automatic wake handling
3. **New Status Commands**:
   - `charging.climateStatus()` for climate state
   - `charging.securityStatus()` for lock/unlock state

### Configuration Additions

New configuration parameters with sensible defaults:
- `config.climateWakeRetry` = true
- `config.climateWakeDelay` = 5000
- `config.lockWakeDelay` = 3000

No action required unless you want to customize these values.

---

## Known Issues

### v2.1.0
- Timer callbacks require ticker.60 to fire; commands with delays < 60s may wait longer
- Vehicle wake success not verified before retry (assumes wake command works)

### v2.0.5.1
- Leaf instrument SOC metrics remain unreliable after sleep (mitigated by using standard metric)

---

## Future Roadmap

- [ ] Adaptive wake delay learning
- [ ] Multiple retry attempts with exponential backoff
- [ ] Pre-scheduled vehicle wake
- [ ] Battery temperature-aware climate control
- [ ] Push notification integration
- [ ] Web dashboard for status monitoring
