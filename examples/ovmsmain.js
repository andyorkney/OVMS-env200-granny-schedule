/**
 * Example OVMS main script file
 * Location: /store/scripts/ovmsmain.js
 *
 * This file is loaded automatically when the OVMS JavaScript engine starts.
 * Add your module requires and initialization code here.
 */

// Load the smart charging module
charging = require("lib/charging");

// Optional: Configure charging on startup
// Uncomment and modify these lines to set defaults:

// charging.setChargeRate(7.0);        // Set your charger's kW rating
// charging.setLimits(80, 75);         // Target SOC 80%, skip if above 75%
// charging.setReadyBy(7, 30);         // Ready by 7:30 AM

print("OVMS initialization complete\n");
