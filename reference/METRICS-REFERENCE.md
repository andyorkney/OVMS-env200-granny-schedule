# OVMS Metrics Reference - Nissan Leaf/e-NV200

**Vehicle Confirmed:** 40kWh Nissan Leaf/e-NV200 (VIN: VSKYAAME0U0601399)
**Last Updated:** 2025-11-03
**OVMS Version:** 3.3.005-203-g38371534

This document lists all confirmed available metrics from the actual vehicle, focusing on those useful for charging scheduling and monitoring.

---

## ✅ Priority Metrics for Charging Scheduler

These metrics are **confirmed available** and critical for enhanced charging monitoring:

### Battery State Metrics

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `v.b.soc` | 85% | State of charge (standard) | **HIGH** | ✅ YES |
| `v.b.soh` | 86% | State of health | **HIGH** | ✅ YES |
| `v.b.cac` | 99.3938Ah | Battery capacity (Ah) | **HIGH** | ✅ YES |
| `v.b.voltage` | 389.5V | Battery voltage | **MEDIUM** | ✅ YES |
| `v.b.current` | 0A | Battery current | **MEDIUM** | ✅ YES |
| `v.b.power` | 0kW | Battery power (instantaneous) | **MEDIUM** | ✅ YES |
| `v.b.temp` | 14°C | Battery temperature | **MEDIUM** | ✅ YES |

### Charging State Metrics

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `v.c.charging` | no | Charging active (boolean) | **HIGH** | ✅ YES |
| `v.c.pilot` | yes | Plug connected (boolean) | **HIGH** | ✅ YES |
| `v.c.state` | timerwait | Charge state | **HIGH** | ✅ YES |
| `v.c.power` | 0kW | **Charging power (real-time)** | **🔥 CRITICAL** | ❌ NO - **ADD THIS!** |
| `v.c.kwh` | 0.120534kWh | **Energy delivered this session** | **🔥 CRITICAL** | ❌ NO - **ADD THIS!** |
| `v.c.current` | 0A | Charging current | **HIGH** | ❌ NO |
| `v.c.voltage` | 0V | Charging voltage | **HIGH** | ❌ NO |
| `v.c.duration.full` | 205Min | Time to full charge estimate | **MEDIUM** | ❌ NO |
| `v.c.efficiency` | 100% | Charging efficiency | **MEDIUM** | ❌ NO |

### Range Metrics

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `v.b.range.est` | 119.122M | Estimated range | **MEDIUM** | ❌ NO |
| `v.b.range.full` | 140.144M | Range at 100% | **LOW** | ❌ NO |
| `v.b.range.ideal` | 149.999M | Ideal range | **LOW** | ❌ NO |

### Environment Metrics

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `v.e.temp` | 13.5°C | **Ambient temperature** | **HIGH** | ❌ NO - **ADD THIS!** |
| `v.e.cabintemp` | 17.2222°C | Cabin temperature | **LOW** | ❌ NO |

---

## 🍃 Nissan Leaf Specific Metrics (xnl.*)

These are **Leaf-native metrics** that may be more accurate than standard OVMS metrics:

### Battery Metrics

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `xnl.v.b.gids` | 366 | **Current GIDS value** | **HIGH** | ❌ NO - **CONSIDER!** |
| `xnl.v.b.max.gids` | 500 | Maximum GIDS when new | **HIGH** | ❌ NO |
| `xnl.v.b.hx` | 65.1367 | **Health/degradation metric** | **HIGH** | ❌ NO - **CONSIDER!** |
| `xnl.v.b.soc.instrument` | 85% | SOC from instrument cluster | **MEDIUM** | ❌ NO |
| `xnl.v.b.soc.newcar` | 85.9155% | SOC relative to new car capacity | **MEDIUM** | ❌ NO |
| `xnl.v.b.soc.nominal` | 85.1% | Nominal SOC | **MEDIUM** | ❌ NO |
| `xnl.v.b.soh.instrument` | 86% | SOH from instrument | **MEDIUM** | ❌ NO |
| `xnl.v.b.soh.newcar` | 86.4294% | SOH relative to new car | **MEDIUM** | ❌ NO |
| `xnl.v.b.e.available` | 29.28kWh | **Available energy (kWh)** | **HIGH** | ❌ NO - **CONSIDER!** |
| `xnl.v.b.e.capacity` | 40kWh | Total battery capacity | **HIGH** | ❌ NO |
| `xnl.v.b.capacitybars` | 9 | Capacity bars on dashboard | **LOW** | ❌ NO |

### Charging Metrics (Leaf-specific)

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `xnl.v.c.duration` | 60,150,195Min | **Charge time estimates (3kW,6kW,QC)** | **MEDIUM** | ❌ NO - **USEFUL!** |
| `xnl.v.c.chargebars` | 8 | Charge bars on dashboard | **LOW** | ❌ NO |
| `xnl.v.c.count.l0l1l2` | 3043 | L1/L2 charge count | **LOW** | ❌ NO |
| `xnl.v.c.count.qc` | 136 | Quick charge count | **LOW** | ❌ NO |

### Range Metrics (Leaf-specific)

| Metric | Current Value | Description | Priority | Currently Used? |
|--------|---------------|-------------|----------|-----------------|
| `xnl.v.b.range.instrument` | 113M | Range from instrument cluster | **MEDIUM** | ❌ NO |

### Charging Limits

| Metric | Current Value | Description | Priority |
|--------|---------------|-------------|----------|
| `xnl.v.b.charge.limit` | 102.3kW | Max charge power | **MEDIUM** |
| `xnl.v.b.output.limit` | 110kW | Max discharge power | **LOW** |
| `xnl.v.b.regen.limit` | 3kW | Max regen power | **LOW** |

---

## 🔥 Recommended Additions to charging.js

Based on confirmed availability, these metrics should be added to enhance the scheduler:

### 1. Real-time Charging Power Monitoring
```javascript
var power = getSafeMetric("v.c.power", 0); // kW
```
**Why:** Detect charging stalls, calculate accurate time-to-target, verify charging is actually happening

### 2. Session Energy Tracking
```javascript
var kwh = getSafeMetric("v.c.kwh", 0); // kWh delivered this session
```
**Why:** Track actual energy vs. planned, verify SOC accuracy, log session statistics

### 3. Ambient Temperature
```javascript
var ambient = getSafeMetric("v.e.temp", null); // °C
```
**Why:** Cold weather = slower charging. Adjust estimates and detect charging issues.

### 4. Available Energy (Leaf-specific)
```javascript
var availableKwh = getSafeMetric("xnl.v.b.e.available", null); // kWh
```
**Why:** More accurate than SOC × capacity for degraded batteries

### 5. GIDS Monitoring (Leaf-specific alternative to SOC)
```javascript
var gids = getSafeMetric("xnl.v.b.gids", 0);
var maxGids = getSafeMetric("xnl.v.b.max.gids", 500);
var socFromGids = (gids / maxGids) * 100;
```
**Why:** Native Leaf metric, may be more accurate than calculated SOC

### 6. Charging Current/Voltage
```javascript
var chargeCurrent = getSafeMetric("v.c.current", 0); // A
var chargeVoltage = getSafeMetric("v.c.voltage", 0); // V
```
**Why:** Calculate actual power if `v.c.power` not updating, detect charging issues

---

## 📊 Cell-Level Monitoring (Advanced)

For detailed battery health monitoring:

| Metric | Description |
|--------|-------------|
| `v.b.p.voltage.avg` | 4.06411V - Average cell voltage |
| `v.b.p.voltage.max` | 4.071V - Highest cell voltage |
| `v.b.p.voltage.min` | 4.057V - Lowest cell voltage |
| `v.b.p.voltage.stddev` | 0.00367V - Cell voltage standard deviation |
| `v.b.p.temp.stddev.max` | 0°C - Cell temperature deviation |
| `xnl.bms.balancing` | Active cells being balanced |

**Note:** These are useful for health monitoring but not critical for charging scheduling.

---

## 🔍 Usage in Code

### Current Pattern (getSafeMetric helper)
```javascript
function getSafeMetric(name, defaultValue) {
    if (!OvmsMetrics.HasValue(name)) return defaultValue;
    if (typeof defaultValue === "boolean") {
        return OvmsMetrics.AsFloat(name) !== 0;
    } else if (typeof defaultValue === "number") {
        return OvmsMetrics.AsFloat(name);
    } else {
        var val = OvmsMetrics.Value(name);
        return (val === undefined || val === null) ? defaultValue : val;
    }
}
```

### Example Usage
```javascript
// Current metrics
var soc = getSafeMetric("v.b.soc", 0);
var charging = getSafeMetric("v.c.charging", false);
var plugged = getSafeMetric("v.c.pilot", false);

// NEW - Enhanced monitoring metrics
var power = getSafeMetric("v.c.power", 0);           // kW
var kwh = getSafeMetric("v.c.kwh", 0);               // kWh
var ambient = getSafeMetric("v.e.temp", null);       // °C
var gids = getSafeMetric("xnl.v.b.gids", 0);         // GIDS
var availKwh = getSafeMetric("xnl.v.b.e.available", null); // kWh
```

---

## 📝 Notes

- All metrics confirmed available on 40kWh Nissan Leaf (2018+ gen)
- Metrics marked with 🔥 are **high priority** for implementation
- Current value snapshot taken: 2025-11-03 08:26:40 UTC
- Vehicle was at 85% SOC, plugged in (v.c.pilot=yes), in timer wait mode
- Metrics prefixed with `xnl.*` are Nissan Leaf vehicle-specific
- Standard `v.*` metrics work across all OVMS-supported vehicles

---

## 🎯 Next Steps

1. ✅ **Implement v.c.power monitoring** - Critical for stall detection
2. ✅ **Implement v.c.kwh tracking** - Verify energy delivery
3. ✅ **Add v.e.temp monitoring** - Temperature-aware charging
4. 🤔 **Consider xnl.v.b.gids** as alternative to SOC for Leaf
5. 🤔 **Consider xnl.v.b.e.available** for degraded battery accuracy
