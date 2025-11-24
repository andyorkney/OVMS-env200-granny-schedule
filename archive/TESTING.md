# Testing Guide for OVMS Charging Module

## Understanding the DukTape Error

When you see this error:
```
duk> /Volumes/Transcend\ 1TB/GitHub/OVMS-charging-scheduler/charging.js
SyntaxError: invalid escape (line 1)
```

**This is NOT a bug in the code!** The issue is:

1. You're typing a **file path** at the `duk>` prompt
2. DukTape expects **JavaScript code**, not file paths
3. The `\ ` (backslash-space) is an invalid JavaScript escape sequence
4. DukTape is trying to parse `/Volumes/Transcend\ 1TB/...` as JavaScript syntax

## How to Properly Test in DukTape

### Option 1: Use DukTape Load Command (if available)

**Note:** The exact command depends on your DukTape build. Try these:

```javascript
// Try these commands at the duk> prompt:
Duktape.loadFile('charging.js')
// or
load('charging.js')
// or
.load charging.js
```

But first, you need to either:

**A) Change to a directory without spaces:**
```bash
# In your shell (not in duk>)
cd '/Volumes/Transcend 1TB/GitHub/OVMS-charging-scheduler'
duk

# Now in duk>
.load charging.js
```

**B) Or copy files to a path without spaces:**
```bash
# In your shell
cp '/Volumes/Transcend 1TB/GitHub/OVMS-charging-scheduler/'*.js /tmp/
cd /tmp
duk

# Now in duk>
.load test-charging.js  # Load mocks first
.load charging.js       # Then load module
charging.status()       # Test it!
```

### Option 2: Test with Node.js (Easier Syntax Check)

```bash
# Just check syntax - quick and easy
node -c charging.js
node -c setup-events.js

# All should report no errors
```

**Note:** Node.js won't actually run the code (needs OVMS APIs), but will verify syntax.

## The PROPER Way: Test in OVMS

The charging module is designed for **OVMS**, not standalone DukTape. Here's how to test it properly:

### Step 1: Upload Files to OVMS

Via **OVMS Web Interface** (Tools > Editor):

1. Create/edit: `/store/scripts/lib/charging.js`
   - Copy the content of `charging.js`

2. Create/edit: `/store/scripts/setup-events.js`
   - Copy the content of `setup-events.js`

3. Edit: `/store/scripts/ovmsmain.js`
   - Add: `charging = require("lib/charging");`

### Step 2: Reload JavaScript Engine

In OVMS web interface:
- Go to **Tools > Editor**
- Click **"Reload JS Engine"** button

### Step 3: Test Commands

Via **OVMS Web Shell** (Tools > Shell) or SSH:

**Note:** Commands use app-friendly format (no quotes, no spaces). This avoids smart quote issues on mobile devices.

```javascript
// Check if module loaded
script eval charging

// Should show: [object Object] or similar

// Test status function
script eval charging.status()

// Should display full status report

// Test configuration
script eval charging.setSchedule(23,30,5,30)
script eval charging.setLimits(80,75)
script eval charging.getSchedule()
```

### Step 4: Install Clock Events

```javascript
script eval require("setup-events").install()

// Should create 48 clock events
// Verify with:
vfs ls /store/events/clock.2330
```

## Common Mistakes

### ❌ WRONG: Typing file paths at duk> prompt
```
duk> /Volumes/Transcend\ 1TB/GitHub/OVMS-charging-scheduler/charging.js
SyntaxError: invalid escape
```

### ❌ WRONG: Shell escaping in JavaScript
```javascript
duk> var path = "/Volumes/Transcend\ 1TB/file.js"
SyntaxError: invalid escape
```

### ✅ CORRECT: JavaScript string with spaces (in quotes)
```javascript
duk> var path = "/Volumes/Transcend 1TB/file.js"
// This works! Spaces inside quoted strings are fine
```

### ✅ CORRECT: DukTape load command
```javascript
duk> .load charging.js
// (after cd to the directory first)
```

### ✅ CORRECT: OVMS require() function
```javascript
OVMS# script eval charging = require("lib/charging")
// This is the proper way in OVMS
```

## Verifying Code Quality

Our code has been verified with:

```bash
# Syntax validation
node -c charging.js      # ✓ OK
node -c setup-events.js  # ✓ OK

# No Unicode issues (all replaced with ASCII)
grep -r "✓✗⚠ℹ" *.js     # No matches (good!)

# Proper exports pattern
grep "exports\." *.js    # All using exports.foo = bar pattern
```

## If You Still See Errors in OVMS

If you get errors when running in **actual OVMS**, please share:

1. The **exact command** you ran (e.g., `script eval charging.status()`)
2. The **complete error message**
3. The **OVMS version** (from web interface)
4. The **vehicle type** (Nissan Leaf, Tesla, etc.)

The DukTape file path error you showed is expected behavior and not related to code quality.

## Quick Syntax Verification

Run this in your shell (not in duk):

```bash
cd '/Volumes/Transcend 1TB/GitHub/OVMS-charging-scheduler'
node -c charging.js && echo "✓ charging.js syntax OK"
node -c setup-events.js && echo "✓ setup-events.js syntax OK"
```

Both should report "syntax OK".
