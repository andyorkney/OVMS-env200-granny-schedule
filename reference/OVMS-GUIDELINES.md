# OVMS + Duktape Development Guidelines

## Critical Rules

### JavaScript Compatibility (Duktape ES5.1)
- Use `var` only (no `let`/`const`)
- No arrow functions (`=>`)
- No template literals (`` `${var}` ``)
- No modern array methods (`.includes()`, `.find()`, etc.)
- No spread operator (`...`)
- No destructuring
- No `class` keyword (use function constructors)
- No `async`/`await` or Promises

### OVMS CLI Command Syntax

**PRIMARY FORMAT (Recommended for all documentation):**
Use app-friendly format without quotes and no spaces after commas:
```
script eval charging.checkSchedule()
script eval charging.setSchedule(23,30,5,30)
```

**Why this format:**
- Works in OVMS Connect app dashboard actions
- Works in OVMS web console and SSH
- Avoids smart quote issues on mobile keyboards (mobile keyboards insert " " which break commands)
- Simpler and more consistent

**ALTERNATIVE FORMAT (Web console only):**
Quoted format with spaces is acceptable for web console/SSH:
```
script eval "charging.checkSchedule()"
script eval "charging.setSchedule(23, 30, 5, 30)"
```

**However:** Use the app-friendly format as primary in all documentation to ensure compatibility everywhere.

---

## IN-CODE DOCUMENTATION RULES (CRITICAL!)

### All function usage examples in comments MUST include the full OVMS command:

**WRONG:**
```javascript
/**
 * Check current schedule status
 * Usage: charging.checkSchedule()
 */
```

**CORRECT (app-friendly format):**
```javascript
/**
 * Check current schedule status
 * Usage: script eval charging.checkSchedule()
 */
```

**WRONG:**
```javascript
// Set schedule: setSchedule(startHour,startMin,endHour,endMin)
```

**CORRECT:**
```javascript
// Set schedule: script eval charging.setSchedule(startHour,startMin,endHour,endMin)
```

### Why this matters:
Users copy/paste examples from code comments into OVMS CLI and OVMS Connect app. Using app-friendly format (no quotes, no spaces after commas) ensures commands work everywhere and avoids smart quote issues on mobile.

### Every function comment must show:
1. The full command: `script eval`
2. App-friendly format: no outer quotes, no spaces after commas
3. Realistic example values

**Template for all function documentation:**
```javascript
/**
 * Function description
 *
 * @param paramName - description
 * @returns description
 *
 * Usage: script eval moduleName.functionName(arg1,arg2)
 * Example: script eval charging.setSchedule(23,30,5,30)
 */
```

---

## README Documentation Rules

All command examples in README.md must:
- Include `script eval` prefix
- Use app-friendly format (no quotes, no spaces after commas)
- Show realistic parameter values
- Be formatted consistently
- Include note about format compatibility at the beginning

**Example section format:**
```markdown
### Check Schedule Status
```
script eval charging.checkSchedule()
```

Returns current schedule and charging status.
```

**Always include format note at top of README:**
```markdown
## 📱 Command Format - IMPORTANT!

Commands in this guide use **app-friendly format** (works everywhere):
- No outer quotes
- No spaces after commas
- Example: `script eval charging.setSchedule(23,30,5,30)`

Why? Mobile keyboards insert "smart quotes" which break commands.
```

---

## Event File Format

Event files stored in `/store/events/clock.HHMM/` directories should be **JavaScript files** with `.js` extension.

**Correct format:**
```javascript
// File: /store/events/clock.2330/010-start-charge.js
charging.start();
```

**Incorrect format (old shell approach - NO LONGER USED):**
```bash
# File: /store/events/clock.2330/010-start-charge (no .js)
script eval charging.start()
```

**Why use .js files:**
- Direct JavaScript execution (no shell layer)
- No quoting concerns whatsoever
- Cleaner, more efficient code
- Per OVMS docs: "If the event script is written in Javascript, be sure to add the suffix `.js` to the name"

**Requirements:**
- Files MUST have `.js` extension
- Content is pure JavaScript (no `script eval` wrapper)
- Assumes `charging` is loaded globally in `ovmsmain.js`
- Use direct function calls: `charging.start();` not `script eval charging.start()`

---

## Testing Before Commit (REQUIRED!)

### Automated Validation

**ALWAYS run the validation script before committing:**

```bash
./validate-ovms-syntax.sh
```

This script checks for:
- ✅ JavaScript syntax errors (via Node.js)
- ✅ Unquoted `script eval` commands in documentation
- ✅ Escaped double quotes in double-quoted strings (Duktape incompatibility)
- ✅ Function examples without proper OVMS CLI wrapper

**The script will exit with an error if issues are found.**

### Automated Pre-Commit Hook

A git pre-commit hook is installed that automatically runs validation:

```bash
# Normal commit - runs validation automatically
git commit -m "your message"

# Skip validation (NOT recommended)
git commit --no-verify -m "your message"
```

If the validation fails, fix the issues before committing!

### Manual Testing (Optional)

If you have Duktape installed locally:

```bash
cd /path/to/project
duk script-name.js
```

All code must pass Duktape validation without syntax errors.

**Common Duktape errors to watch for:**
- `SyntaxError: invalid object literal` → arrow functions or template literals
- `SyntaxError: parse error (line X, end of input)` → escaped quotes in double-quoted strings
- `ReferenceError: identifier 'let' undefined` → using let/const
- `TypeError: undefined not callable` → modern methods that don't exist in ES5

**Duktape String Escaping Issue:**
Duktape has issues with escaped double quotes in double-quoted strings:
```javascript
// ❌ WRONG - Fails in Duktape
print("Use: script eval \"function()\"");

// ✅ CORRECT - Use single quotes for outer string
print('Use: script eval "function()"');

// ✅ CORRECT - If you need both quote types
print('Use: script eval "require(\'module\').function()"');
```

---

## For AI Assistants / Claude Code

**READ THIS FILE FIRST** before making any changes to:
- JavaScript source files
- README.md
- Code comments

**On every change, verify:**
1. ✅ All JavaScript is ES5 compliant
2. ✅ All function comments include `script eval "..."` syntax
3. ✅ All README examples use quoted syntax
4. ✅ No modern JavaScript features introduced

**When in doubt:** Test with `duk` command locally.
