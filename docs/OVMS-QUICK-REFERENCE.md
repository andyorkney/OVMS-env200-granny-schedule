# OVMS Quick Reference Card - Critical Gotchas

**Print this and keep it visible when coding!**

---

## 🔥 #0: NO SPACES IN FUNCTION ARGUMENTS (CLI)

```bash
# ❌ WRONG - Space after comma fails
script eval charging.setReadyBy(8, 30)

# ✅ CORRECT - No spaces in arguments
script eval charging.setReadyBy(8,30)
```

**Why:** OVMS CLI parser treats ALL spaces as separators, even inside parentheses

**Rule:** Remove ALL spaces after commas in function calls

---

## 🔥 #1: OvmsConfig.Get Returns STRING "undefined"

```javascript
// ❌ WRONG - Will never work
var value = OvmsConfig.Get("usr", "key");
if (value === undefined) { }

// ✅ CORRECT - Always check for string too
if (value === undefined || value === "undefined" || value === "" || value === null) { }
```

**Why:** `typeof value` is `"string"`, not `"undefined"`

---

## 🔥 #2: Metrics Return Multiple Types

```javascript
// ❌ WRONG - Only catches one type
if (charging === true) { }

// ✅ CORRECT - Check all possible types
if (charging === true || charging === "yes" || charging === "1" || charging === 1) { }
```

**Why:** Same metric, different vehicles = different types

---

## 🔥 #3: Config Keys Use Dots Not Underscores

```javascript
// ❌ WRONG
"charging_target_soc"

// ✅ CORRECT
"charging.target.soc"
```

---

## 🔥 #4: Always Parse Config Values

```javascript
// ❌ WRONG - String comparison
var target = getConfig("target_soc");
if (soc >= target) { }  // "85" >= "80" gives wrong result!

// ✅ CORRECT - Parse to number
var target = parseInt(getConfig("target_soc"));
if (soc >= target) { }
```

---

## 🔥 #5: Check for NaN After Parsing

```javascript
// ❌ WRONG - Assumes parsing works
var rate = parseFloat(getConfig("rate"));
var cost = kwh * rate;  // Might be NaN!

// ✅ CORRECT - Check and provide fallback
var rate = parseFloat(getConfig("rate"));
if (isNaN(rate)) rate = 0.07;
var cost = kwh * rate;
```

---

## 🔥 #6: Overnight Time Calculations

```javascript
// ❌ WRONG - Negative numbers when crossing midnight
var duration = end_minutes - start_minutes;  // Might be negative!

// ✅ CORRECT - Normalize to continuous scale
var win_start = 1410;  // 23:30
var win_end = 330;     // 05:30
if (win_end < win_start) {
  win_end += (24 * 60);  // Now 1770 - next day
}

// Simple overlap
var overlap_start = Math.max(charge_start, win_start);
var overlap_end = Math.min(charge_end, win_end);
```

---

## 🔥 #7: Notifications Have Character Limits

```javascript
// ❌ WRONG - Long text won't appear
var status = generateFullStatus();  // 500 chars
OvmsNotify.Raise("info", "app", status);  // Won't show up!

// ✅ CORRECT - Short summary for app
print(fullStatus + "\n");  // Console gets full version
var summary = "SOC: 80%, Cost: £1.07";  // < 200 chars
OvmsNotify.Raise("info", "app", summary);
```

---

## Standard Config Reading Pattern

```javascript
function getConfig(key) {
  var cfg = CONFIG_PARAMS[key];
  if (!cfg) return null;
  
  var value = OvmsConfig.Get(cfg.param, cfg.instance);
  
  // THE CRITICAL CHECK
  if (value === undefined || value === "undefined" || value === "" || value === null) {
    return cfg.default;
  }
  
  return value;
}

// Always wrap in type conversion
var intValue = parseInt(getConfig("some_int"));
var floatValue = parseFloat(getConfig("some_float"));

// Always check for NaN
if (isNaN(intValue)) intValue = defaultValue;
```

---

## Standard Metric Reading Pattern

```javascript
function isCharging() {
  var val = OvmsMetrics.Value("v.c.charging");
  return (val === true || val === "yes" || val === "1" || val === 1);
}

function isPluggedIn() {
  var val = OvmsMetrics.Value("v.c.pilot");
  return (val === true || val === "yes" || val === "1" || val === 1);
}
```

---

## Debugging Checklist

When a command doesn't work or returns NaN:

0. ✅ Check for spaces in function args: `setReadyBy(8,30)` NOT `setReadyBy(8, 30)`
1. ✅ Check if config key exists: `config list usr`
2. ✅ Test OvmsConfig.Get directly: `script eval 'print(OvmsConfig.Get("usr", "key"))'`
3. ✅ Check for string "undefined": `script eval 'print(typeof value)'`
4. ✅ Test parsing: `script eval 'print(parseInt(value))'`
5. ✅ Check for NaN: `script eval 'print(isNaN(result))'`

Test each step individually - don't assume any step works!

---

## Before Every Commit

- [ ] All function examples show NO SPACES in args: `func(8,30)` not `func(8, 30)`
- [ ] All config reads check for string "undefined"
- [ ] All metric reads check multiple types
- [ ] All config values are parsed to correct type
- [ ] All calculations check for NaN
- [ ] All overnight time logic is tested
- [ ] All notifications are < 200 chars
- [ ] All debug code removed
- [ ] Tested on actual OVMS module

---

## Emergency Rollback

If anything goes wrong:

```bash
# Always have v1.0.0 backup
scp charging-v1.0.0-TESTED-WORKING.js root@ovms:/store/scripts/lib/charging.js
ssh root@ovms
script reload
```

v1.0.0 is your safe baseline - it works!

---

**REMEMBER:** One bug at a time. Test immediately. Remove debug code. Document what works.

**Most common cause of bugs:** String "undefined" from OvmsConfig.Get - CHECK FOR IT FIRST!
