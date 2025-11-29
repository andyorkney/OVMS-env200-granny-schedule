# Project Files Updated - v1.1.0 Lessons Learned

**Date:** 2025-11-24  
**Purpose:** Capture all lessons from v1.1.0 development to avoid repeating same issues

---

## Files Updated

### 1. `/mnt/project/OVMS-GUIDELINES.md`

**Added new section:** "OVMS-Specific Quirks and Gotchas"

**7 Critical Issues Documented:**

1. **OvmsConfig.Get Returns String "undefined"** 🔥 MOST CRITICAL
   - Not actual undefined - it's the STRING "undefined"
   - Causes cascading NaN errors
   - Must check for both: `value === undefined || value === "undefined"`

2. **Metric Values Can Be Multiple Types**
   - Same metric returns bool/string/number depending on vehicle
   - Must check all formats: `val === true || val === "yes" || val === "1" || val === 1`

3. **Config Keys Must Use Dot Notation**
   - Use `charging.target.soc` not `charging_target_soc`
   - Underscore notation causes issues

4. **Notification Character Limits**
   - ~200-300 chars max
   - Long messages just don't appear (no error)
   - Solution: Print full to console, send summary to app

5. **Overnight Time Calculations Are Complex**
   - Midnight crossing requires normalization
   - Allow values > 1440 for next day
   - Use Math.max/min for overlap calculation

6. **Cellular Notification Delays**
   - Can take 10-60+ seconds
   - Don't assume failure immediately
   - Wait 1-2 minutes before debugging

7. **Always Validate Input Types**
   - Config values are always strings
   - Must parseInt() / parseFloat()
   - Check for NaN after parsing

### 2. `/mnt/project/PROJECT-KNOWLEDGE-CAPTURE.md`

**Added comprehensive v1.0.0 & v1.1.0 section with:**

#### Native OVMS Discovery
- `autocharge` and `suffsoc` handle SOC-based stopping
- No custom monitoring needed
- Exact ±0% accuracy

#### v1.0.0 Success
- First truly working version
- Tested and verified overnight
- All core functionality working

#### v1.1.0 Development Journey
- 4 critical bugs found and fixed
- Detailed debugging methodology
- What worked vs what didn't

#### Bug Documentation

**Bug #1: String "undefined"**
- The root cause of everything
- How we found it
- How we fixed it

**Bug #2: Config Key Mismatch**
- Expected vs actual config structure
- Solution: Update CONFIG_PARAMS

**Bug #3: Overnight Window Calculation**
- Midnight crossing complexity
- Failed approaches documented
- Working solution with code

**Bug #4: Undefined Variable**
- `total_minutes` removed but still referenced
- Lesson: Search for all uses when refactoring

#### Best Practices Established

**Configuration:**
- Always provide defaults
- Handle string "undefined"
- Parse to correct types
- Check for NaN

**Time Calculations:**
- Normalize to continuous scale
- Use simple Math.max/min
- Test all edge cases

**Development Workflow:**
- Create baseline before adding features
- Test one thing at a time
- Remove debug code immediately
- Document what works

**Notifications:**
- Full output to console
- Short summary to app
- Keep under 200 chars

---

## Why This Documentation Matters

### For Future Development
- Avoid repeating same bugs
- Know OVMS quirks before coding
- Have working patterns to copy
- Understand what's been tried and failed

### For Future Claude Sessions
- Read OVMS-GUIDELINES.md FIRST
- Check PROJECT-KNOWLEDGE-CAPTURE.md for context
- Don't make assumptions - verify with docs
- Learn from our debugging methodology

### For Real-World Issues
- Quick reference for gotchas
- Solutions that actually work
- Evidence-based not theoretical
- Tested in production

---

## Key Takeaways

**Most Critical Lesson:**
OvmsConfig.Get returns STRING "undefined" - this single quirk caused HOURS of debugging. Check for it ALWAYS.

**Second Most Critical:**
Overnight time calculations are complex. Use the normalized approach documented - don't try to be clever with boolean logic.

**Third Most Critical:**
Test assumptions immediately. Don't add more code until current code works. One bug at a time.

**Development Philosophy:**
- Working code > perfect code
- Simple solutions > complex solutions
- Evidence > assumptions
- Clean code > debug bloat

---

## Files Location

**In project:**
- `/mnt/project/OVMS-GUIDELINES.md` - Updated with quirks
- `/mnt/project/PROJECT-KNOWLEDGE-CAPTURE.md` - Updated with v1.1.0 journey

**In outputs (ready for GitHub):**
- `/mnt/user-data/outputs/charging-v1.1.0-WIP.js` - Rename to charging-v1.1.0.js
- `/mnt/user-data/outputs/V1.1.0-CHANGES-AND-TESTING.md`
- `/mnt/user-data/outputs/V1.1.0-READY-FOR-TESTING.md`

**Baseline (always safe):**
- `/mnt/user-data/outputs/charging-v1.0.0-TESTED-WORKING.js`

---

## Next Steps

1. **Tonight:** Real-world test with low SOC
2. **Tomorrow:** If test passes, rename -WIP.js to v1.1.0.js
3. **Then:** Commit to GitHub following workflow in V1.1.0-CHANGES-AND-TESTING.md
4. **Finally:** Start planning v1.2.0 (ready-by time)

---

**Remember:** These docs exist to help future you (and future Claude sessions) avoid the pain we went through today. USE THEM!
