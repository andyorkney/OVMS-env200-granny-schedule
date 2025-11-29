# OVMS Smart Charging Scheduler - Design Document

## Overview

The OVMS Smart Charging Scheduler is a JavaScript module for Open Vehicle Monitoring System (OVMS) that provides intelligent charging control with time-based scheduling, SOC monitoring, climate control with wake retry, and vehicle security commands.

## Architecture

### Core Components

1. **Logger Utility** - Timestamped logging with multiple severity levels
2. **Configuration System** - Persistent storage using OVMS config store
3. **Vehicle Metrics Interface** - Abstraction for OVMS metrics with vehicle-specific handling
4. **Charging Control** - Start/stop charging with SOC monitoring
5. **Schedule Manager** - Time-window based charging automation
6. **Climate Control** - Climate commands with intelligent wake retry
7. **Security Commands** - Vehicle lock/unlock with pre-wake functionality

## Feature Designs

### Climate Wake Retry Feature

#### Problem Statement
When a vehicle is in deep sleep, climate control commands (e.g., `climatecontrol on`) may fail because the vehicle is not responsive. This results in silent failures and poor user experience.

#### Solution Design
Implement a retry mechanism that:
1. Attempts the climate command first
2. On failure, wakes the vehicle
3. Retries the climate command after wake
4. Reports success/failure status clearly

#### Implementation Details

```javascript
exports.climate = function(mode) {
    // mode: "on", "off", "heat", "cool"

    // Step 1: Direct attempt
    var result = attemptClimateCommand(mode);

    if (result.success) {
        return true;
    }

    // Step 2: Wake retry (single retry)
    console.info("Climate command failed, attempting vehicle wake");
    wakeVehicle();

    // Step 3: Wait and retry (use ticker for async)
    scheduleRetry(function() {
        attemptClimateCommand(mode);
    }, 5000); // 5 second delay for wake

    return true; // Async operation in progress
};
```

#### Configuration
- `config.climateWakeRetry` - Enable/disable wake retry (default: true)
- `config.climateWakeDelay` - Delay after wake before retry (default: 5000ms)

#### State Tracking
```javascript
session.climateRetryPending = false;
session.lastClimateCommand = null;
session.climateRetryCount = 0;
```

### Vehicle Wake for Lock/Unlock Commands

#### Problem Statement
Lock and unlock commands require the vehicle to be awake to process. Sending commands to a sleeping vehicle results in failures.

#### Solution Design
Automatically wake the vehicle before sending lock/unlock commands:
1. Check vehicle awake state
2. If sleeping, send wake command first
3. Wait for wake confirmation
4. Execute lock/unlock command
5. Confirm success

#### Implementation Details

```javascript
exports.lock = function() {
    return executeWithWake("lock", function() {
        OvmsCommand.Exec("lock");
    });
};

exports.unlock = function() {
    return executeWithWake("unlock", function() {
        OvmsCommand.Exec("unlock");
    });
};

function executeWithWake(commandName, commandFn) {
    var awake = isVehicleAwake();

    if (!awake) {
        console.info(commandName + ": Vehicle sleeping, initiating wake");
        wakeVehicle();
        scheduleAfterWake(commandFn);
        return "pending";
    }

    try {
        commandFn();
        console.info(commandName + ": Command sent successfully");
        return true;
    } catch (e) {
        console.error(commandName + " failed", e);
        return false;
    }
}
```

#### Vehicle Wake Detection
```javascript
function isVehicleAwake() {
    // Check multiple indicators:
    // - v.e.awake (primary indicator)
    // - v.b.12v.current (12V system draw)
    // - Recent metric updates

    var awake = getMetric("v.e.awake", false);
    var current12v = getMetric("v.b.12v.current", 0);

    return awake || current12v > 0.5;
}

function wakeVehicle() {
    try {
        OvmsCommand.Exec("vehicle wakeup");
        console.info("Vehicle wake command sent");
        return true;
    } catch (e) {
        console.error("Vehicle wake failed", e);
        return false;
    }
}
```

## Command Reference

### Core Charging Commands
- `charging.setSchedule(sh, sm, eh, em)` - Set cheap rate window
- `charging.setLimits(target)` - Set target SOC percentage
- `charging.start()` - Manually start charging
- `charging.stop()` - Manually stop charging
- `charging.status()` - Display detailed status
- `charging.info()` - Display raw metrics

### Climate Control Commands
- `charging.climate("on")` - Turn climate control on (with wake retry)
- `charging.climate("off")` - Turn climate control off
- `charging.climate("heat")` - Set to heating mode
- `charging.climate("cool")` - Set to cooling mode
- `charging.climateStatus()` - Show climate state

### Security Commands
- `charging.lock()` - Lock vehicle (with pre-wake)
- `charging.unlock()` - Unlock vehicle (with pre-wake)
- `charging.securityStatus()` - Show security state

### Configuration Commands
- `charging.setClimateRetry(enabled)` - Enable/disable climate wake retry
- `charging.setWakeDelay(ms)` - Set wake delay for retries

## State Management

### Session State
```javascript
var session = {
    monitoring: false,           // SOC monitoring active
    subscribed: false,           // ticker.60 subscription state
    climateRetryPending: false,  // Climate retry in progress
    lastClimateCommand: null,    // Last climate command for retry
    climateRetryCount: 0,        // Retry attempt counter
    wakeInProgress: false,       // Vehicle wake in progress
    pendingCommand: null         // Command waiting for wake
};
```

### Configuration State
```javascript
var config = {
    cheapWindowStart: { hour: 23, minute: 30 },
    cheapWindowEnd: { hour: 5, minute: 30 },
    targetSOC: 80,
    climateWakeRetry: true,      // Enable climate wake retry
    climateWakeDelay: 5000,      // Delay after wake (ms)
    lockWakeDelay: 3000          // Delay for lock/unlock wake (ms)
};
```

## Error Handling

### Retry Strategy
- **Climate commands**: Single retry after wake (avoids excessive retries)
- **Lock/Unlock**: Single wake attempt before command
- **All commands**: Clear error messages via logger

### Notifications
- Use `OvmsNotify.Raise("alert", ...)` for important events
- Categories:
  - `charge.smart.*` - Charging events
  - `climate.wake.*` - Climate wake retry events
  - `security.wake.*` - Lock/unlock wake events

## Performance Considerations

1. **Ticker Subscriptions**: Single static subscription to `ticker.60`
2. **Wake Delays**: Configurable to balance responsiveness vs reliability
3. **Retry Limits**: Single retry to prevent infinite loops
4. **Memory Management**: Clear pending state after completion

## Future Enhancements

1. **Adaptive Wake Delays** - Learn optimal wake times for specific vehicle
2. **Multi-Retry with Backoff** - Exponential backoff for persistent failures
3. **Wake Scheduling** - Pre-wake vehicle before scheduled events
4. **Battery Temperature Monitoring** - Adjust climate based on battery temp
5. **Remote Notification** - Push notifications for command results
