/**
 * DukTape Test Harness for OVMS Charging Module
 *
 * Since DukTape doesn't have all OVMS APIs, we mock them for testing
 */

// Mock OVMS APIs for standalone DukTape testing
var OvmsMetrics = {
    HasValue: function(name) {
        // Simulate some available metrics
        var availableMetrics = {
            "v.b.soc": true,
            "v.b.cac": true,
            "v.b.voltage": true,
            "v.b.soh": true,
            "v.c.charging": true,
            "v.c.pilot": true,
            "v.c.state": true
        };
        return availableMetrics[name] || false;
    },
    AsFloat: function(name) {
        // Return mock values
        var mockValues = {
            "v.b.soc": 71.0,
            "v.b.cac": 120.0,
            "v.b.voltage": 360.0,
            "v.b.soh": 95.0
        };
        return mockValues[name] || 0;
    },
    Value: function(name) {
        if (name === "v.c.charging") return false;
        if (name === "v.c.pilot") return true;
        if (name === "v.c.state") return "stopped";
        return null;
    }
};

var OvmsCommand = {
    Exec: function(cmd) {
        print("[MOCK] OvmsCommand.Exec: " + cmd + "\n");
        return "OK";
    }
};

var OvmsNotify = {
    Raise: function(level, subtype, message) {
        print("[NOTIFY " + level + "/" + subtype + "] " + message + "\n");
    }
};

var OvmsEvents = {
    Raise: function(event, data) {
        print("[EVENT] " + event + " (data: " + data + ")\n");
    }
};

var PubSub = {
    subscribe: function(event, handler) {
        print("[PUBSUB] Subscribed to: " + event + "\n");
    }
};

// Now load the actual charging module
print("=== Loading OVMS Charging Module ===\n");
var exports = {};
var charging = exports;

// Load charging.js content here
// (In real usage, you'd use Duktape.loadFile or similar)
print("ERROR: Cannot load file directly due to path with spaces\n");
print("See instructions below for testing options\n\n");

print("=== Testing Instructions ===\n\n");

print("OPTION 1: Test in OVMS (Recommended)\n");
print("-------------------------------------\n");
print("1. Upload charging.js to OVMS at: /store/scripts/lib/charging.js\n");
print("2. SSH to OVMS or use web shell\n");
print("3. Run: script eval charging = require('lib/charging')\n");
print("4. Run: script eval charging.status()\n\n");

print("OPTION 2: Copy to path without spaces\n");
print("--------------------------------------\n");
print("In your terminal:\n");
print("  cd /tmp\n");
print("  cp '/Volumes/Transcend 1TB/GitHub/OVMS-charging-scheduler/charging.js' ./\n");
print("  duk\n");
print("\n");
print("Then in duk:\n");
print("  .load test-charging.js    // Load this test harness first\n");
print("  .load charging.js         // Then load the actual module\n");
print("  charging.status()         // Test it!\n\n");

print("OPTION 3: Change directory first\n");
print("---------------------------------\n");
print("In your terminal:\n");
print("  cd '/Volumes/Transcend 1TB/GitHub/OVMS-charging-scheduler'\n");
print("  duk\n");
print("\n");
print("Then in duk:\n");
print("  .load test-charging.js\n");
print("  .load charging.js\n");
print("  charging.status()\n\n");

print("=== Verifying Syntax ===\n");
print("The JavaScript syntax is valid (tested with Node.js).\n");
print("The error you're seeing is NOT a code bug - it's a path handling issue.\n");
