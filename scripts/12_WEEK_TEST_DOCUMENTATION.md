# 12-WEEK COMPREHENSIVE REHABILITATION TESTING FRAMEWORK

## Overview

This comprehensive testing framework generates and analyzes 12 weeks of cardiac rehabilitation program data covering multiple patient archetypes, data completeness scenarios, and performance patterns.

**Total Coverage:**
- **10 Test Users** with distinct profiles
- **12 Weeks** of rehabilitation per user
- **3 Sessions per week** = 36 sessions per user
- **360 Total Sessions** across all users
- **~9,000 Heart Rate Data Points** (varies by completeness)

---

## Quick Start

### 1. Generate Test Data
```bash
npm run seed:12week
```
This creates 10 test users with 36 sessions each (12 weeks × 3 sessions/week).

### 2. Run Analysis
```bash
npm run test:comprehensive
```
This analyzes all test data and generates reports.

### 3. Run Full Suite (Seed + Test)
```bash
npm run test:full
```
This runs both commands in sequence.

---

## Test User Archetypes

### Performance Archetypes

#### 1. **TEST_BEST_PERFORMER** - Alex Champion
- **Profile:** Age 32, No beta blockers, No low EF
- **Pattern:** Excellent improvement (24.7%)
- **Data Completeness:** 100%
- **Description:** Best case scenario - young, healthy, consistent improvement
- **Expected Outcome:**
  - Strong positive trend
  - All sessions in LOW risk
  - Baseline increases significantly
  - Resting HR improves

#### 2. **TEST_GOOD_PERFORMER** - Maria Progressive
- **Profile:** Age 48, No beta blockers, No low EF
- **Pattern:** Steady improvement (28.6%)
- **Data Completeness:** 100%
- **Description:** Good case with occasional plateaus
- **Expected Outcome:**
  - Strong positive trend
  - Mostly LOW risk sessions
  - Consistent improvement with minor dips

#### 3. **TEST_MODERATE_PERFORMER** - Robert Steady
- **Profile:** Age 56, Beta blockers, No low EF
- **Pattern:** Slow but steady improvement (21.2%)
- **Data Completeness:** 100%
- **Description:** Moderate case affected by beta blockers
- **Expected Outcome:**
  - Moderate positive trend
  - All sessions in MODERATE risk
  - Slower progression due to medication

#### 4. **TEST_POOR_PERFORMER** - Linda Struggling
- **Profile:** Age 62, Beta blockers, Low EF
- **Pattern:** Minimal improvement (15.4%)
- **Data Completeness:** 100%
- **Description:** Multiple risk factors, limited progress
- **Expected Outcome:**
  - Stable trend
  - All sessions in HIGH risk
  - Small but positive improvement

#### 5. **TEST_DECLINING_PERFORMER** - Patricia Declining
- **Profile:** Age 67, Beta blockers, Low EF
- **Pattern:** Performance worsens (-2.3%)
- **Data Completeness:** 100%
- **Description:** Declining case requiring intervention
- **Expected Outcome:**
  - Negative trend
  - All sessions in HIGH risk
  - Baseline decreases over time
  - Requires medical review

---

### Data Completeness Archetypes

#### 6. **TEST_DATA_90PCT** - Sarah AlmostComplete
- **Profile:** Age 45, No beta blockers, No low EF
- **Pattern:** Good performer (26.2%)
- **Data Completeness:** 90%
- **Description:** Tests near-complete data scenarios

#### 7. **TEST_DATA_75PCT** - John MostlyThere
- **Profile:** Age 52, No beta blockers, No low EF
- **Pattern:** Moderate performer (20.5%)
- **Data Completeness:** 75%
- **Description:** Tests moderately incomplete data

#### 8. **TEST_DATA_50PCT** - Mike HalfData
- **Profile:** Age 58, Beta blockers, No low EF
- **Pattern:** Moderate performer (16.5%)
- **Data Completeness:** 50%
- **Description:** Tests scenarios with half the data missing

#### 9. **TEST_DATA_30PCT** - Emma SparseData
- **Profile:** Age 60, Beta blockers, No low EF
- **Pattern:** Poor performer (11.0%)
- **Data Completeness:** 30%
- **Description:** Tests very sparse data scenarios

#### 10. **TEST_IMPROVING_DATA** - Tom ImprovingData
- **Profile:** Age 50, No beta blockers, No low EF
- **Pattern:** Good performer (29.4%)
- **Data Completeness:** Progressive (40% → 100%)
- **Description:** Tests improving data quality over time

---

## Test Scenarios Covered

### 1. **Performance Patterns**
- ✅ Strong improvement (20%+ gain)
- ✅ Moderate improvement (10-20% gain)
- ✅ Minimal improvement (<10% gain)
- ✅ Stable/plateau performance
- ✅ Declining performance (negative trend)

### 2. **Risk Profiles**
- ✅ Consistently LOW risk
- ✅ Consistently MODERATE risk
- ✅ Consistently HIGH risk
- ✅ Mixed risk (improvement from HIGH/MODERATE to LOW)

### 3. **Data Completeness**
- ✅ 100% complete data
- ✅ 90% complete data
- ✅ 75% complete data
- ✅ 50% complete data
- ✅ 30% complete data (sparse)
- ✅ Progressive improvement (40% → 100%)

### 4. **Baseline Behavior**
- ✅ Baseline establishment (every 3 sessions)
- ✅ Baseline progression (12 updates per user)
- ✅ Above-baseline performance
- ✅ Below-baseline performance
- ✅ Baseline increase over time
- ✅ Baseline decrease over time

### 5. **Health Status Variations**
- ✅ Strong improvement
- ✅ Improving
- ✅ Consistent
- ✅ Declining
- ✅ At risk

### 6. **Patient Risk Factors**
- ✅ No risk factors (young, healthy)
- ✅ Age 60+ only
- ✅ Beta blockers only
- ✅ Low EF only
- ✅ Multiple risk factors (age + beta blockers + low EF)

### 7. **Weekly Patterns**
- ✅ Consistent week-to-week
- ✅ Plateaus (weeks 4-5, 8-9)
- ✅ Breakthrough periods (week 10)
- ✅ Within-week progression (session 1 < 2 < 3)

---

## Generated Reports

After running `npm run test:comprehensive`, the following reports are generated in the `test-reports/` directory:

### 1. **summary_[timestamp].csv**
High-level metrics for each user:
- Demographics (age, risk factors)
- Score progression (first, last, improvement %)
- Risk distribution (high/moderate/low counts)
- Adherence quality
- Baseline progression
- Data completeness metrics

**Use Case:** Quick overview comparison across all test users

### 2. **observations_[timestamp].csv**
Detailed observations for each user organized by category:
- Overall Performance
- Risk Profile
- Trend Analysis
- Adherence Quality
- Health Status
- Baseline Progression
- Resting Heart Rate
- Data Quality
- Risk Factors
- Weekly Consistency
- Milestones
- Concerns (if any)

**Use Case:** Detailed qualitative analysis

### 3. **weekly_progression_[timestamp].csv**
Week-by-week average scores for each user (12 columns for 12 weeks).

**Use Case:** Visualizing trends over time, creating charts

### 4. **session_details_[timestamp].csv**
Complete session-level data (360 rows):
- Week and session numbers
- Scores and risk levels
- Heart rate metrics
- Baseline scores
- Health status
- Data completeness per session

**Use Case:** Granular analysis, debugging, detailed investigations

### 5. **EXECUTIVE_SUMMARY_[timestamp].txt**
Comprehensive text report including:
- Overall statistics
- Risk distribution
- Adherence distribution
- Individual user summaries with all key observations

**Use Case:** Executive briefing, documentation, presentations

---

## Key Metrics Explained

### Performance Metrics

| Metric | Description | Good Range | Concerning |
|--------|-------------|------------|------------|
| **Improvement %** | Change from first to last score | >15% | <5% or negative |
| **Trend** | Overall trajectory | Strong/Moderate Positive | Negative |
| **Adherence** | Performance vs baseline | Excellent/Good | Poor |
| **Consistency** | Score variation | Highly Consistent/Consistent | Variable/Highly Variable |

### Risk Levels

| Level | Score Range | Interpretation |
|-------|-------------|----------------|
| **LOW** | ≥70 | Good cardiovascular response |
| **MODERATE** | 50-69 | Acceptable but needs monitoring |
| **HIGH** | <50 | Concerning, may need intervention |

### Health Status

| Status | Criteria | Action |
|--------|----------|--------|
| **Strong Improvement** | ≥10% above baseline | Celebrate! Program is working |
| **Improving** | 5-10% above baseline | Continue current approach |
| **Consistent** | ±5% of baseline | Monitor, maintain |
| **Declining** | 5-10% below baseline | Review and adjust |
| **At Risk** | >10% below baseline | Immediate intervention needed |

---

## Test Results Summary

Based on the latest test run:

### Overall Statistics
- **Average Improvement:** 19.1%
- **Users Improved:** 9 out of 10 (90%)
- **Users Declined:** 1 out of 10 (10%)

### Risk Distribution (360 sessions)
- **Low Risk:** 130 sessions (36.1%)
- **Moderate Risk:** 122 sessions (33.9%)
- **High Risk:** 108 sessions (30.0%)

### Adherence
- **Good:** 8 users
- **Fair:** 2 users
- **Poor:** 0 users

### Data Quality
- **Average Completeness:** 81.0%
- **Users with <70% completeness:** 2 (by design)

---

## Key Observations by Archetype

### Best Performer (TEST_BEST_PERFORMER)
✅ **24.7% improvement**
✅ All 36 sessions in LOW risk
✅ Baseline increased 21.2%
✅ Resting HR improved 4 bpm
✅ Achieved score ≥90
✅ 30+ low-risk sessions

### Good Performer (TEST_GOOD_PERFORMER)
✅ **28.6% improvement**
✅ 32 LOW, 4 MODERATE risk sessions
✅ Baseline increased 20.8%
✅ Resting HR improved 3 bpm
✅ Strong positive trend

### Moderate Performer (TEST_MODERATE_PERFORMER)
✅ **21.2% improvement**
✅ All 36 sessions in MODERATE risk
✅ Baseline increased 15.2%
⚠️ Beta blockers limiting improvement
✅ Consistent progress despite medication

### Poor Performer (TEST_POOR_PERFORMER)
⚠️ **15.4% improvement** (minimal)
⚠️ All 36 sessions in HIGH risk
⚠️ Multiple risk factors (age, beta blockers, low EF)
✅ Still showed positive improvement
✅ Maintained adherence

### Declining Performer (TEST_DECLINING_PERFORMER)
❌ **-2.3% decline**
❌ All 36 sessions in HIGH risk
❌ Baseline decreased 16.7%
❌ Resting HR increased (worse)
⚠️ **Requires immediate medical review**

### Data Completeness Cases
| User | Completeness | Improvement | Impact |
|------|--------------|-------------|---------|
| 90% | 90% | 26.2% | ✅ Minimal impact |
| 75% | 75% | 20.5% | ✅ Slight impact |
| 50% | 50% | 16.5% | ⚠️ Moderate impact |
| 30% | 30% | 11.0% | ⚠️ Significant impact |
| Progressive | 40%→100% | 29.4% | ✅ Quality improved with data |

---

## Using Reports in Excel

All CSV files can be imported into Excel:

### 1. Import CSV
1. Open Excel
2. Go to **Data** > **Get Data** > **From File** > **From Text/CSV**
3. Select the CSV file
4. Click **Load**

### 2. Create Visualizations

#### Weekly Progression Chart
1. Open `weekly_progression_[timestamp].csv`
2. Select all data
3. Insert > Line Chart
4. Shows trend over 12 weeks for each user

#### Risk Distribution Pie Chart
1. Open `summary_[timestamp].csv`
2. Select "High Risk", "Moderate Risk", "Low Risk" columns
3. Insert > Pie Chart
4. Shows distribution of risk levels

#### Performance Comparison
1. Open `summary_[timestamp].csv`
2. Select "Patient ID" and "Improvement %" columns
3. Insert > Bar Chart
4. Shows which users improved most

### 3. Pivot Tables
Create pivot tables from `session_details_[timestamp].csv` to analyze:
- Risk level by week
- Health status distribution
- Score ranges by patient
- Data completeness impact

---

## Expected Test Outcomes

### ✅ What Should Pass

1. **All 10 users created** with correct demographics
2. **360 sessions total** (36 per user)
3. **12 baselines per user** (updated every 3 sessions)
4. **9 users show improvement**, 1 declines
5. **Risk levels match archetypes**:
   - Best/Good → LOW risk dominant
   - Moderate → MODERATE risk dominant
   - Poor/Declining → HIGH risk dominant
6. **Data completeness varies correctly**:
   - 5 users at ~100%
   - 1 at 90%, 1 at 75%, 1 at 50%, 1 at 30%
   - 1 improves from 40% to 100%
7. **Resting HR improves** for improving cases
8. **Baselines increase** for improving cases
9. **Adherence is good** for most users (8/10)

### ⚠️ What to Investigate

1. **If all users improve:** Progression algorithm may be too optimistic
2. **If no users decline:** Not testing failure scenarios properly
3. **If risk levels don't match archetypes:** Risk calculation may be incorrect
4. **If data completeness is uniform:** Completeness variation not working
5. **If adherence is poor across the board:** Baseline calculation may be off

---

## Troubleshooting

### No test users found
```bash
# Run the seed script first
npm run seed:12week
```

### Reports not generated
```bash
# Check if test-reports directory exists
mkdir -p test-reports
npm run test:comprehensive
```

### Database connection errors
```bash
# Check .env file has correct database credentials
# Ensure MySQL is running
```

### Old test data interfering
```bash
# The seed script automatically clears old TEST_ users
# Just run: npm run seed:12week
```

---

## Code Structure

### Seed Script ([seed12WeekTestData.js](./seed12WeekTestData.js))
- Defines 10 test user archetypes
- Generates 36-session progression patterns
- Creates realistic HR data with completeness variations
- Calculates baselines every 3 sessions
- Inserts data with transaction safety

### Test Runner ([runComprehensiveTests.js](./runComprehensiveTests.js))
- Analyzes all test users
- Calculates key metrics (improvement, trend, adherence)
- Generates observations
- Exports 5 different report formats
- Creates executive summary

---

## Next Steps

### For Analysis
1. ✅ Import CSVs into Excel
2. ✅ Create charts for weekly progression
3. ✅ Compare data completeness impact
4. ✅ Identify patterns in declining cases
5. ✅ Review baseline behavior

### For Validation
1. Verify risk calculations match clinical expectations
2. Validate baseline calculation logic
3. Check health status determination accuracy
4. Review adherence scoring
5. Confirm trend analysis algorithms

### For Extension
1. Add more edge cases (e.g., missed sessions)
2. Test retry logic with failed sessions
3. Simulate Spectrum API integration
4. Add vital sign risk scoring tests
5. Test notification triggers

---

## Summary

This comprehensive testing framework provides:

✅ **Complete Coverage** - 10 archetypes × 36 sessions = 360 test cases
✅ **Realistic Data** - Progression patterns match real-world scenarios
✅ **Multiple Scenarios** - Performance, risk, completeness variations
✅ **Detailed Reports** - 5 different formats for different use cases
✅ **Excel-Ready** - All outputs in CSV format
✅ **Observations** - Automated insight generation
✅ **Reproducible** - Run anytime with `npm run test:full`

Use these tests to validate:
- Score calculation algorithms
- Risk level determination
- Baseline behavior
- Health status classification
- Data completeness handling
- Adherence tracking
- Trend analysis
- Report generation

---

**Generated:** 2025-11-12
**Total Test Coverage:** 360 sessions across 10 user archetypes
**Report Formats:** 5 (CSV × 4, TXT × 1)
