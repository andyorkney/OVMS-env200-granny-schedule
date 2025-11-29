# OVMS Smart Charging Scheduler - Requirements

## System Requirements

### Hardware
- OVMS v3 module (Open Vehicle Monitoring System)
- Compatible vehicle (e.g., Nissan Leaf, Tesla, BMW i3, etc.)
- Reliable internet/cellular connection for remote commands

### Software
- OVMS firmware v3.2.0 or later
- JavaScript scripting support enabled
- OVMS web interface or SSH access for configuration

## Functional Requirements

### FR-1: Smart Charging Control
- **FR-1.1**: System SHALL automatically start charging during configured cheap rate window
- **FR-1.2**: System SHALL automatically stop charging when target SOC is reached
- **FR-1.3**: System SHALL automatically stop charging when cheap rate window ends
- **FR-1.4**: System SHALL persist configuration across reboots
- **FR-1.5**: System SHALL provide manual start/stop override commands

### FR-2: SOC Monitoring
- **FR-2.1**: System SHALL monitor SOC every 60 seconds when charging
- **FR-2.2**: System SHALL use standard OVMS SOC metric (v.b.soc)
- **FR-2.3**: System SHALL display SOC with 0.1% precision
- **FR-2.4**: System SHALL notify when target SOC is reached

### FR-3: Configuration Management
- **FR-3.1**: System SHALL allow setting cheap rate window (start/end times)
- **FR-3.2**: System SHALL allow setting target SOC (20-100%)
- **FR-3.3**: System SHALL validate configuration inputs
- **FR-3.4**: System SHALL save configuration to OVMS config store

### FR-4: Climate Control with Wake Retry
- **FR-4.1**: System SHALL support climate on/off/heat/cool commands
- **FR-4.2**: System SHALL retry climate command if initial attempt fails
- **FR-4.3**: System SHALL wake vehicle before retry attempt
- **FR-4.4**: System SHALL wait configurable delay after wake (default 5000ms)
- **FR-4.5**: System SHALL limit retries to single attempt (avoid infinite loops)
- **FR-4.6**: System SHALL notify user of retry status
- **FR-4.7**: System SHALL allow enabling/disabling wake retry feature

### FR-5: Vehicle Lock/Unlock with Pre-Wake
- **FR-5.1**: System SHALL provide lock command with automatic wake
- **FR-5.2**: System SHALL provide unlock command with automatic wake
- **FR-5.3**: System SHALL check vehicle awake state before sending command
- **FR-5.4**: System SHALL wake sleeping vehicle before lock/unlock
- **FR-5.5**: System SHALL wait configurable delay after wake (default 3000ms)
- **FR-5.6**: System SHALL notify user of command status
- **FR-5.7**: System SHALL execute command immediately if vehicle already awake

### FR-6: Vehicle Wake Detection
- **FR-6.1**: System SHALL detect vehicle awake state via v.e.awake metric
- **FR-6.2**: System SHALL detect activity via 12V battery current
- **FR-6.3**: System SHALL send vehicle wakeup command when needed
- **FR-6.4**: System SHALL track wake operation status

### FR-7: Status Reporting
- **FR-7.1**: System SHALL display current configuration
- **FR-7.2**: System SHALL display vehicle state (SOC, charging, plugged)
- **FR-7.3**: System SHALL display battery metrics (voltage, temp, SOH)
- **FR-7.4**: System SHALL display range in miles and kilometers
- **FR-7.5**: System SHALL display climate control status
- **FR-7.6**: System SHALL display security command status

### FR-8: Logging and Notifications
- **FR-8.1**: System SHALL log all significant events with timestamps
- **FR-8.2**: System SHALL provide INFO, WARN, ERROR log levels
- **FR-8.3**: System SHALL send persistent notifications for important events
- **FR-8.4**: System SHALL notify on charging start/stop
- **FR-8.5**: System SHALL notify on climate command success/failure
- **FR-8.6**: System SHALL notify on lock/unlock command status

## Non-Functional Requirements

### NFR-1: Reliability
- **NFR-1.1**: System SHALL use static ticker subscription (no dynamic subscribe/unsubscribe)
- **NFR-1.2**: System SHALL handle metric read failures gracefully
- **NFR-1.3**: System SHALL recover from command execution failures
- **NFR-1.4**: System SHALL maintain state consistency after errors

### NFR-2: Performance
- **NFR-2.1**: System SHALL complete checkSchedule() within 500ms
- **NFR-2.2**: System SHALL warn if checkSchedule() exceeds 500ms
- **NFR-2.3**: System SHALL minimize memory usage
- **NFR-2.4**: System SHALL avoid infinite retry loops

### NFR-3: Usability
- **NFR-3.1**: System SHALL provide clear command syntax
- **NFR-3.2**: System SHALL provide helpful error messages
- **NFR-3.3**: System SHALL provide formatted status display
- **NFR-3.4**: System SHALL support UK units (miles)

### NFR-4: Security
- **NFR-4.1**: System SHALL validate all user inputs
- **NFR-4.2**: System SHALL not expose sensitive vehicle data
- **NFR-4.3**: System SHALL use OVMS secure command execution
- **NFR-4.4**: System SHALL handle notification failures gracefully

### NFR-5: Maintainability
- **NFR-5.1**: System SHALL use modular code structure
- **NFR-5.2**: System SHALL include comprehensive comments
- **NFR-5.3**: System SHALL follow ABRP.js patterns where appropriate
- **NFR-5.4**: System SHALL track version information

## Configuration Parameters

| Parameter | Type | Default | Range | Description |
|-----------|------|---------|-------|-------------|
| cheapWindowStart.hour | int | 23 | 0-23 | Start hour of cheap rate window |
| cheapWindowStart.minute | int | 30 | 0-59 | Start minute of cheap rate window |
| cheapWindowEnd.hour | int | 5 | 0-23 | End hour of cheap rate window |
| cheapWindowEnd.minute | int | 30 | 0-59 | End minute of cheap rate window |
| targetSOC | int | 80 | 20-100 | Target state of charge percentage |
| climateWakeRetry | bool | true | - | Enable climate wake retry feature |
| climateWakeDelay | int | 5000 | 1000-30000 | Delay after wake for climate retry (ms) |
| lockWakeDelay | int | 3000 | 1000-30000 | Delay after wake for lock/unlock (ms) |

## OVMS Metrics Used

### Standard Metrics
- `v.b.soc` - Battery state of charge
- `v.b.soh` - Battery state of health
- `v.b.voltage` - Battery voltage
- `v.b.temp` - Battery temperature
- `v.b.power` - Battery power
- `v.b.current` - Battery current
- `v.b.range.est` - Estimated range
- `v.b.12v.current` - 12V battery current
- `v.c.charging` - Charging active flag
- `v.c.pilot` - Charge pilot signal (plugged in)
- `v.c.power` - Charging power
- `v.e.awake` - Vehicle awake flag
- `v.p.odometer` - Vehicle odometer
- `v.type` - Vehicle type identifier

## OVMS Commands Used

- `charge start` - Start charging
- `charge stop` - Stop charging
- `climatecontrol on` - Turn on climate control
- `climatecontrol off` - Turn off climate control
- `climatecontrol heat` - Set climate to heat mode
- `climatecontrol cool` - Set climate to cool mode
- `vehicle wakeup` - Wake vehicle from sleep
- `lock` - Lock vehicle
- `unlock` - Unlock vehicle

## Testing Requirements

### Unit Tests
- Test SOC monitoring logic
- Test schedule window calculation (midnight crossing)
- Test configuration validation
- Test climate retry logic
- Test wake detection logic

### Integration Tests
- Test with actual OVMS module
- Test climate wake retry sequence
- Test lock/unlock with sleeping vehicle
- Test notification delivery
- Test configuration persistence

### Edge Cases
- Vehicle sleeping during command
- Network connectivity loss
- Multiple rapid commands
- Metric unavailability after sleep
- Timer execution edge cases
