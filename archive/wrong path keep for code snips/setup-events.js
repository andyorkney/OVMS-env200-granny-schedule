/**
 * OVMS Smart Charging - Event Installer
 *
 * This script creates 48 JavaScript event files (.js) that check the charging schedule.
 * Event files contain direct JavaScript code (no 'script eval' wrapper needed).
 *
 * COMMAND FORMAT NOTE:
 * Commands use app-friendly format (no quotes, no spaces after commas)
 * Works in OVMS Connect app and web console. Avoids smart quote issues on mobile.
 *
 * INSTALLATION VIA WEB EDITOR:
 * 1. Open OVMS web interface → Tools → Editor
 * 2. Create new file: /store/scripts/setup-events.js
 * 3. Copy this entire file content
 * 4. Save the file
 * 5. Go to Tools → Shell
 * 6. At the OVMS shell prompt, enter:
 *    script eval require('setup-events').install()
 * 7. Wait for "Installation complete!" message
 *
 * INSTALLATION VIA SSH:
 * 1. scp setup-events.js root@<your-ovms-ip>:/store/scripts/
 * 2. SSH to OVMS: ssh root@<your-ovms-ip>
 * 3. At the OVMS shell prompt, enter:
 *    script eval require('setup-events').install()
 *
 * VERIFICATION:
 * vfs ls /store/events/
 * You should see 48 directories: clock.0000, clock.0030, clock.0100, ..., clock.2330
 *
 * REMOVAL:
 * To uninstall, enter:
 * script eval require('setup-events').uninstall()
 */

// ============================================================================
// INSTALLATION FUNCTIONS
// ============================================================================

/**
 * Install clock events for automatic charging schedule checks
 * Creates up to 10 files per run to avoid overwhelming the system
 * Run multiple times until all 48 files are created
 */
function install() {
    print("\n=== OVMS Smart Charging Event Installer ===\n\n");

    var eventContent = 'charging.checkSchedule();';
    var created = 0;
    var skipped = 0;
    var errors = 0;
    var MAX_PER_RUN = 5;  // Limit to 5 files per run to avoid system strain
    var MAX_CHECKS = 10;  // Stop after checking this many files to prevent event queue blocking

    print("BATCHED MODE: Creating max " + MAX_PER_RUN + " files per run.\n");
    print("This prevents system overload. Run multiple times to complete.\n\n");

    var checked = 0;  // Track total files checked

    // Create events for every 30 minutes (00 and 30 minutes of each hour)
    for (var hour = 0; hour < 24; hour++) {
        var hours = [0, 30];

        for (var i = 0; i < hours.length; i++) {
            var minute = hours[i];

            // Stop after creating MAX_PER_RUN files OR checking MAX_CHECKS files
            if (created >= MAX_PER_RUN || checked >= MAX_CHECKS) {
                break;
            }

            checked++;  // Increment before checking to avoid infinite loops

            // Format: clock.HHMM (e.g., clock.0000, clock.0030, clock.0100)
            var hourStr = (hour < 10) ? "0" + hour : "" + hour;
            var minStr = (minute < 10) ? "0" + minute : "" + minute;
            var dirName = "clock." + hourStr + minStr;
            var dirPath = "/store/events/" + dirName;
            var filePath = dirPath + "/charging-check.js";

            try {
                // Check if file already exists using vfs stat (same method as listEvents)
                var statResult = OvmsCommand.Exec("vfs stat " + filePath);
                var exists = statResult &&
                            statResult.indexOf("Error") === -1 &&
                            statResult.indexOf("not found") === -1;

                if (exists) {
                    skipped++;
                    continue;
                }

                // Create directory first (mkdir will fail silently if it already exists)
                OvmsCommand.Exec("vfs mkdir " + dirPath);

                // Now create the file
                VFS.Save({
                    path: filePath,
                    data: eventContent
                });

                created++;
                print("[OK] Created: " + dirName + "/charging-check.js\n");

            } catch (e) {
                errors++;
                print("[ERROR] Error creating " + dirName + ": " + e.message + "\n");
            }
        }

        // Break outer loop too if we hit either limit
        if (created >= MAX_PER_RUN || checked >= MAX_CHECKS) {
            break;
        }
    }

    print("\n=== Installation Summary ===\n");
    print("Files checked: " + checked + " (max " + MAX_CHECKS + " per run to prevent blocking)\n");
    print("Events created: " + created + "\n");
    print("Already existed: " + skipped + "\n");
    print("Errors: " + errors + "\n\n");

    var total = created + skipped;
    if (total === 48 && errors === 0) {
        print("[OK] Installation complete!\n\n");
        print("Your charging module will now check the schedule every 30 minutes.\n");
        print("Next steps:\n");
        print("  1. Configure your schedule: charging.setSchedule(23,30,5,30)\n");
        print("  2. Set charge limits: charging.setLimits(80,75)\n");
        print("  3. Check status: charging.status()\n\n");
    } else if (total < 48) {
        print("[WARNING] Partial installation - " + total + " of 48 files verified.\n");
        print("Created " + created + " new files this run (checked " + checked + " total).\n");
        print("Run the install command again to continue installation.\n\n");
    } else if (errors > 0) {
        print("[WARNING] Installation completed with errors.\n");
        print("Some events may not have been created.\n");
        print("You can try running the install command again.\n\n");
    }

    return true;  // Explicit return to suppress "undefined" in REPL
}

/**
 * Uninstall clock events (cleanup)
 * Removes both old format (no .js) and new format (.js) files
 */
function uninstall() {
    print("\n=== OVMS Smart Charging Event Uninstaller ===\n\n");
    print("[WARNING] This will remove all charging-check event files!\n");
    print("Proceeding with removal...\n\n");

    var removed = 0;
    var notFound = 0;

    // Remove events for every 30 minutes
    for (var hour = 0; hour < 24; hour++) {
        var hours = [0, 30];

        for (var i = 0; i < hours.length; i++) {
            var minute = hours[i];

            var hourStr = (hour < 10) ? "0" + hour : "" + hour;
            var minStr = (minute < 10) ? "0" + minute : "" + minute;
            var dirName = "clock." + hourStr + minStr;

            // Try to remove both old format (no .js) and new format (.js)
            var filePaths = [
                "/store/events/" + dirName + "/charging-check.js",  // New format
                "/store/events/" + dirName + "/charging-check"      // Old format
            ];

            for (var j = 0; j < filePaths.length; j++) {
                var filePath = filePaths[j];

                try {
                    // Try to read the file to see if it exists
                    var content = VFS.Open(filePath);
                    if (content) {
                        // File exists, try to remove it
                        var rmResult = OvmsCommand.Exec("vfs rm " + filePath);

                        // If rm succeeded, count it
                        if (!rmResult || rmResult.indexOf("Error") === -1) {
                            removed++;
                            print("[OK] Removed: " + filePath + "\n");
                        }
                    }
                } catch (e) {
                    // File doesn't exist or can't be accessed - this is fine
                    notFound++;
                }
            }
        }
    }

    print("\n=== Uninstallation Summary ===\n");
    print("Events removed: " + removed + "\n");
    print("Not found: " + notFound + "\n\n");

    if (removed > 0) {
        print("[OK] Uninstallation complete!\n");
        print("Successfully removed " + removed + " event file(s).\n");
        print("Note: Empty clock.HHMM directories were left in place.\n\n");
    } else if (notFound === 96) {
        print("[OK] No event files found - uninstall not needed.\n");
        print("The event directories exist but are already empty.\n");
        print("You can proceed with installation.\n\n");
    } else {
        print("[INFO] No event files to remove.\n");
        print("Directories may be empty or files already cleaned up.\n\n");
    }
}

/**
 * List all installed charging events
 */
function listEvents() {
    print("\n=== Installed Charging Events ===\n\n");

    var found = 0;

    for (var hour = 0; hour < 24; hour++) {
        var hours = [0, 30];

        for (var i = 0; i < hours.length; i++) {
            var minute = hours[i];

            var hourStr = (hour < 10) ? "0" + hour : "" + hour;
            var minStr = (minute < 10) ? "0" + minute : "" + minute;
            var dirName = "clock." + hourStr + minStr;
            var filePath = "/store/events/" + dirName + "/charging-check.js";

            // Check if file exists using vfs stat command
            var result = OvmsCommand.Exec("vfs stat " + filePath);

            // If stat succeeds, the file exists (no "Error" in output)
            if (result && result.indexOf("Error") === -1 && result.indexOf("not found") === -1) {
                found++;

                // Format time nicely (e.g., 00:00, 01:30, 23:30)
                var timeStr = hourStr + ":" + minStr;
                print("[OK] " + timeStr + " - " + dirName + "/charging-check.js\n");
            }
        }
    }

    print("\nTotal events found: " + found + " / 48\n");

    if (found === 0) {
        print("\n[WARNING] No events installed. Run the install command to create them.\n");
    } else if (found < 48) {
        print("\n[WARNING] Some events are missing. Run the install command to create them.\n");
    } else {
        print("\n[OK] All events are installed correctly!\n");
    }

    print("\n");
}

/**
 * Show help information
 */
function help() {
    print("\n=== OVMS Smart Charging Event Setup ===\n\n");
    print("This module creates clock events that check your charging schedule\n");
    print("every 30 minutes (48 events total: 00:00, 00:30, 01:00, ..., 23:30)\n\n");

    print("Available commands:\n");
    print("  script eval require('setup-events').install()     - Create all clock events\n");
    print("  script eval require('setup-events').uninstall()   - Remove all clock events\n");
    print("  script eval require('setup-events').listEvents()  - Show installed events\n");
    print("  script eval require('setup-events').help()        - Show this help\n\n");

    print("Example workflow:\n");
    print("  1. script eval require('setup-events').install()        # Create events\n");
    print("  2. script eval charging.setSchedule(23,30,5,30)         # Configure schedule\n");
    print("  3. script eval charging.setLimits(80,75)                # Set SOC targets\n");
    print("  4. script eval charging.status()                        # Check status\n");
    print("  5. script eval require('setup-events').listEvents()     # Verify installation\n\n");

    print("Need to modify frequency?\n");
    print("  - Every 15 minutes: Modify this script (change hours array)\n");
    print("  - Every hour: Remove events for :30 minutes\n");
    print("  - Custom times: Create individual events manually\n\n");
}

// ============================================================================
// EXPORTS
// ============================================================================

// Ensure exports object exists (for OVMS compatibility)
if (typeof exports === 'undefined') {
    var exports = {};
}

exports.install = install;
exports.uninstall = uninstall;
exports.listEvents = listEvents;
exports.help = help;

print("OVMS Charging Event Installer loaded\n");
print("Run: script eval require('setup-events').install() to create 48 clock events\n");
print("Help: script eval require('setup-events').help() for more information\n");

exports;
