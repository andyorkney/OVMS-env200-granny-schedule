# OVMS Syntax Validation

This directory includes automated validation tools to catch OVMS/Duktape compatibility issues before committing.

## Quick Start

**Before every commit, run:**

```bash
./validate-ovms-syntax.sh
```

This catches:
- JavaScript syntax errors
- Unquoted `script eval` commands in documentation
- Duktape incompatibilities (escaped quotes in strings)
- Missing OVMS CLI wrappers in examples

## Automated Pre-Commit Hook

A git pre-commit hook is installed at `.git/hooks/pre-commit` that automatically runs validation.

**Normal workflow:**
```bash
git add charging.js
git commit -m "Update charging logic"
# Validation runs automatically
# If it passes, commit succeeds
# If it fails, fix issues and try again
```

**To skip validation (NOT recommended):**
```bash
git commit --no-verify -m "your message"
```

## What Gets Checked

### 1. Node.js Syntax Validation
Ensures all JavaScript is valid ES5.1 syntax:
```bash
node -c charging.js
```

### 2. Unquoted Script Eval Commands
Catches examples like:
```
❌ script eval charging.status()
✅ script eval "charging.status()"
```

### 3. Escaped Quotes in Double-Quoted Strings
Duktape fails on:
```javascript
❌ print("Run: script eval \"function()\"")
✅ print('Run: script eval "function()"')
```

### 4. Function Examples Without OVMS Wrapper
Documentation should show:
```
❌ charging.status()
✅ script eval "charging.status()"
```

## Files Checked

- `charging.js` - Main charging module
- `setup-events.js` - Event installer

## Common Issues and Fixes

### Issue: "Found escaped double quotes in double-quoted string"

**Problem:**
```javascript
print("Use: script eval \"function()\"");
```

**Solution:**
```javascript
print('Use: script eval "function()"');
```

### Issue: "Found unquoted script eval"

**Problem:**
```javascript
// Usage: script eval charging.status()
```

**Solution:**
```javascript
// Usage: script eval "charging.status()"
```

### Issue: "Node.js syntax check failed"

**Problem:** ES6+ features used

**Solution:** Rewrite using ES5.1 syntax (see OVMS-GUIDELINES.md)

## Manual Testing

If you have Duktape installed:

```bash
duk charging.js
```

Should load without errors.

## Troubleshooting

**Pre-commit hook not running?**
```bash
# Check if executable
ls -la .git/hooks/pre-commit

# Make executable if needed
chmod +x .git/hooks/pre-commit
```

**Validation script not found?**
```bash
# Check if executable
ls -la validate-ovms-syntax.sh

# Make executable if needed
chmod +x validate-ovms-syntax.sh
```

## See Also

- `OVMS-GUIDELINES.md` - Complete development guidelines
- `TESTING.md` - Testing procedures for OVMS
