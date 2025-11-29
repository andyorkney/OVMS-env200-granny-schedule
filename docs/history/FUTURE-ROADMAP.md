# OVMS Smart Charging - Future Roadmap

**Last Updated:** 2025-11-23  
**Current Version:** 1.0.0

## Vision

Build a comprehensive, intelligent charging system that:
1. Minimizes electricity costs
2. Maximizes battery health
3. Ensures vehicle is always ready when needed
4. Requires minimal user intervention

## Release Strategy

**Philosophy:** Ship working code frequently, iterate based on real usage

- **v1.0.0** ✅ - Core scheduling (DONE)
- **v1.1.0** - Cost awareness (Quick win)
- **v1.2.0** - Time awareness (Major feature)
- **v1.3.0** - User experience polish
- **v2.0.0** - Solar/battery integration (Future)

---

## v1.1.0 - Cost Calculations

**Target Release:** 2-3 weeks after v1.0.0  
**Effort Estimate:** ~30 minutes coding + testing  
**Risk:** Low (pure display logic, no control changes)

### Goals
- Show user estimated charging costs
- Warn about overflow into standard rate
- Help user make informed decisions

### Features

#### 1. Cost Estimation
```bash
script eval charging.status()

# Would show:
# Estimated charge cost: £1.05
#   13.5 kWh @ £0.07 = £0.95 (in cheap window)
#   1.2 kWh @ £0.292 = £0.10 (overflow)
# Total: £1.05
```

**Calculation:**
```javascript
function calculateCost() {
  var kwh_needed = battery.effective_capacity * (target - soc) / 100;
  var cheap_rate = parseFloat(getConfig("cheap_rate"));
  var standard_rate = parseFloat(getConfig("standard_rate"));
  
  // How long will it take?
  var charge_hours = kwh_needed / charger_rate;
  var window_hours = calculateWindowHours();
  
  if (charge_hours <= window_hours) {
    // All in cheap window
    return {
      cheap_kwh: kwh_needed,
      cheap_cost: kwh_needed * cheap_rate,
      overflow_kwh: 0,
      overflow_cost: 0,
      total: kwh_needed * cheap_rate
    };
  } else {
    // Overflow into standard rate
    var cheap_kwh = window_hours * charger_rate;
    var overflow_kwh = kwh_needed - cheap_kwh;
    
    return {
      cheap_kwh: cheap_kwh,
      cheap_cost: cheap_kwh * cheap_rate,
      overflow_kwh: overflow_kwh,
      overflow_cost: overflow_kwh * standard_rate,
      total: (cheap_kwh * cheap_rate) + (overflow_kwh * standard_rate)
    };
  }
}
```

#### 2. Overflow Warnings

**Notification when plugging in:**
```
[21:05] Plugged in at 40%. Will charge to 85% during 23:30-05:30.
Need 15.3 kWh (~8h at 1.8kW).
WARNING: Will extend 2h past window end.
Cost: £0.95 (cheap) + £0.58 (standard) = £1.53
```

#### 3. Cost History (Bonus Feature)

Track daily/weekly/monthly costs:
```bash
script eval charging.costs()

# Shows:
# This week: £7.35 (5 charges)
# This month: £28.40 (18 charges)
# Average per charge: £1.58
```

### Testing Requirements
- Test with various SOC levels
- Test with different charger rates
- Verify overflow calculations
- Test cost accuracy against actual bills

### Success Criteria
- ✅ Cost estimates within ±10% of actual
- ✅ Overflow warnings appear when needed
- ✅ No performance impact
- ✅ Works with incomplete rate configuration

---

## v1.2.0 - Ready-By Time

**Target Release:** 4-6 weeks after v1.1.0  
**Effort Estimate:** ~2 hours coding + extensive testing  
**Risk:** Medium (changes scheduling logic)

### Goals
- Vehicle always ready by departure time
- Still maximize cheap rate usage
- Handle long/slow charges that need pre-window start

### Features

#### 1. Set Ready-By Time
```bash
# I need vehicle ready by 07:30
script eval charging.setReadyBy(7, 30)

# Partner needs it ready by 08:30
script eval charging.setReadyBy(8, 30)
```

#### 2. Optimal Start Calculation

**Algorithm:**
```javascript
function calculateOptimalStart() {
  // How much do we need to charge?
  var kwh_needed = battery.effective_capacity * (target - soc) / 100;
  
  // How long will it take?
  var charge_hours = kwh_needed / charger_rate;
  
  // When is ready-by deadline?
  var deadline = ready_by_time;
  
  // When does cheap window start?
  var window_start = cheap_window_start;
  
  // Ideal: Start at window start
  var finish_if_start_at_window = window_start + charge_hours;
  
  if (finish_if_start_at_window <= deadline) {
    // Perfect! Start at cheap window, finish before deadline
    return {
      start_time: window_start,
      finish_time: finish_if_start_at_window,
      pre_window_hours: 0,
      overflow_hours: 0,
      strategy: "optimal"
    };
  }
  
  // Must start earlier
  var required_start = deadline - charge_hours;
  var pre_window_hours = window_start - required_start;
  
  return {
    start_time: required_start,
    finish_time: deadline,
    pre_window_hours: pre_window_hours,
    overflow_hours: 0,
    strategy: "early_start"
  };
}
```

#### 3. Pre-Window Charging

**Example Scenario:**
- Plug in: 20:00
- SOC: 30%
- Target: 90%
- Need: 20 kWh
- Charger: 1.8 kW granny charger
- Time needed: 11 hours
- Cheap window: 23:30 - 05:30 (6 hours)
- Ready by: 08:00

**Calculation:**
- If start at 23:30 → finish at 10:30 (MISS DEADLINE ❌)
- Must start at: 08:00 - 11h = 21:00 ✅
- Pre-window: 21:00 - 23:30 = 2.5 hours
- In-window: 23:30 - 05:30 = 6 hours
- Post-window: 05:30 - 08:00 = 2.5 hours

**Notification:**
```
[20:00] Plugged in at 30%. Need 20 kWh to reach 90%.
Will start at 21:00 (2.5h before cheap window) to be ready by 08:00.
Cost estimate:
  4.5 kWh @ £0.292 = £1.31 (pre-window)
  10.8 kWh @ £0.07 = £0.76 (cheap window)
  4.7 kWh @ £0.292 = £1.37 (post-window)
  Total: £3.44
```

#### 4. Multiple Profiles (Stretch Goal)

```bash
# Set weekday/weekend schedules
script eval charging.setWeekdayReadyBy(7, 30)
script eval charging.setWeekendReadyBy(10, 0)

# Or profiles
script eval charging.setProfile("work", 7, 30)
script eval charging.setProfile("weekend", 10, 0)
script eval charging.useProfile("work")
```

### Testing Requirements
- Test all combinations:
  - Short charge (finishes in window)
  - Medium charge (extends past window)
  - Long charge (must start before window)
- Test with different charger rates
- Test midnight crossing scenarios
- Test same-day ready-by times

### Success Criteria
- ✅ Always ready by deadline (±5 minutes)
- ✅ Maximizes cheap rate usage
- ✅ Accurate cost predictions
- ✅ No negative impact on v1.0.0 basic functionality

---

## v1.3.0 - User Experience Polish

**Target Release:** 2-3 weeks after v1.2.0  
**Effort Estimate:** ~1 hour  
**Risk:** Low (cosmetic changes)

### Goals
- Better notifications
- Clearer status display
- Easier configuration

### Features

#### 1. Enhanced Notifications

**Better formatting:**
```
╔══════════════════════════════════════╗
║    OVMS Smart Charging v1.3.0        ║
╠══════════════════════════════════════╣
║ Plugged in at 40%                    ║
║ Target: 85% (ready by 07:30)         ║
║                                       ║
║ Schedule:                             ║
║   Start: 23:30 (cheap window)        ║
║   Finish: ~04:15                     ║
║   Cost: £1.05                        ║
╚══════════════════════════════════════╝
```

**Progress notifications:**
```
[23:30] Charging started - Target 85%
[01:00] Charging: 60% → 85% (1.5h remaining)
[02:30] Charging complete: 85% reached
Cost: £1.02 (saved £2.11 vs standard rate)
```

#### 2. Better Status Display

**More intuitive:**
```bash
script eval charging.status()

╔══════════════════════════════════════╗
║ Battery: 84% → 85% (4.4 kWh needed)  ║
║ Status: Waiting for 23:30            ║
║ Mode: Scheduled (Ready by 07:30)     ║
║                                       ║
║ Window: 23:30 - 05:30 (6h available) ║
║ Charge time: ~2.5h @ 1.8kW          ║
║ Est. cost: £0.62                     ║
║                                       ║
║ Next charge in: 2h 25min             ║
╚══════════════════════════════════════╝
```

#### 3. Configuration Wizard

```bash
script eval charging.setup()

# Interactive setup:
# 1. Vehicle/charger setup
# 2. Electricity tariff
# 3. Departure times
# 4. Preferences
# 5. Test configuration
```

---

## v2.0.0 - Solar/Battery Integration

**Target Release:** TBD (6+ months)  
**Effort Estimate:** Major rewrite  
**Risk:** High (new hardware integration)

### Goals
- Charge from solar when available
- Integrate with home battery storage
- Minimize grid usage
- Still guarantee vehicle ready

### Possible Features
- Solar production monitoring
- Home battery SOC tracking
- Dynamic charging speed adjustment
- Surplus solar charging mode
- Grid vs solar cost optimization

### Challenges
- Requires additional hardware integration
- Much more complex logic
- Weather dependency
- Need reliable forecasting

**Status:** Conceptual - needs research

---

## Community Requests

### Frequently Requested Features

#### 1. SMS/Email Notifications
**Status:** Under consideration  
**Complexity:** Medium  
**Blocker:** OVMS notification system capabilities

#### 2. Web Dashboard
**Status:** Possible future feature  
**Complexity:** High  
**Alternative:** Use OVMS Connect app

#### 3. Multi-Vehicle Support
**Status:** Planned for v1.4.0  
**Complexity:** Medium  
**Use case:** Household with multiple EVs

#### 4. Calendar Integration
**Status:** Interesting idea  
**Complexity:** High  
**Use case:** Charge to 100% when calendar shows long trip

#### 5. Dynamic Tariff Integration
**Status:** v1.5.0 consideration  
**Complexity:** High  
**Use case:** Agile Octopus with 30-minute pricing

---

## Development Priorities

### Must Have (v1.x)
1. ✅ Core scheduling (v1.0.0)
2. Cost awareness (v1.1.0)
3. Ready-by time (v1.2.0)
4. User experience (v1.3.0)

### Nice to Have (v1.x)
- Multi-vehicle support
- Profile system
- Cost history tracking
- Better error messages

### Future (v2.x)
- Solar integration
- Dynamic tariff support
- Calendar integration
- Predictive charging

### Won't Do
- Features that compromise reliability
- Features requiring cloud dependencies
- Features that violate user privacy
- Over-complicated scheduling logic

---

## How to Request Features

### Before Requesting
1. Check this roadmap
2. Check existing GitHub issues
3. Consider if it fits the project goals

### Feature Request Template
```
**Feature:** Brief description
**Use Case:** Why you need it
**Priority:** High/Medium/Low for you
**Willing to test?** Yes/No
**Vehicle:** Make/model
```

### Priority Factors
1. Number of users who need it
2. Alignment with project goals
3. Implementation complexity
4. Risk to existing functionality
5. Maintenance burden

---

## Version Timeline (Tentative)

```
v1.0.0 ✅ ────────────────────────── 2025-11-23
          │
          │ 2-3 weeks
          ▼
v1.1.0 ──────────────────────────── 2025-12-15 (target)
          │
          │ 4-6 weeks
          ▼
v1.2.0 ──────────────────────────── 2026-01-26 (target)
          │
          │ 2-3 weeks
          ▼
v1.3.0 ──────────────────────────── 2026-02-16 (target)
          │
          │ TBD
          ▼
v2.0.0 ──────────────────────────── 2026 (sometime)
```

**Note:** Dates are estimates and depend on:
- Testing results
- Community feedback
- Real-world usage
- Developer availability

---

## Contributing to Roadmap

### Feedback Welcome
- What features matter to you?
- What's working well?
- What's frustrating?
- What's missing?

### Testing Opportunities
- Beta test new features
- Report bugs
- Suggest improvements
- Share usage data

### Documentation Help
- Improve user guide
- Add vehicle-specific notes
- Translate to other languages
- Create video tutorials

---

## Commitment

**This project will:**
- ✅ Remain free and open source
- ✅ Prioritize reliability over features
- ✅ Maintain backward compatibility when possible
- ✅ Be responsive to community needs
- ✅ Document all changes clearly

**This project will NOT:**
- ❌ Add features that compromise safety
- ❌ Require cloud services or subscriptions
- ❌ Collect user data
- ❌ Break working functionality without good reason

---

**Questions about the roadmap?** Open a GitHub issue!

**Version:** 1.0.0 | **Last Updated:** 2025-11-23
