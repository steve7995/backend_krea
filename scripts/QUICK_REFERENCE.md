# 12-WEEK TESTING FRAMEWORK - QUICK REFERENCE

## Commands

```bash
# Generate test data (10 users × 36 sessions = 360 sessions)
npm run seed:12week

# Run analysis and generate reports
npm run test:comprehensive

# Full suite (seed + test)
npm run test:full
```

## Test Users Quick Reference

| Patient ID | Name | Age | Beta Blockers | Low EF | Expected Result | Data Completeness |
|------------|------|-----|---------------|--------|-----------------|-------------------|
| TEST_BEST_PERFORMER | Alex Champion | 32 | No | No | ~25% improvement, all LOW risk | 100% |
| TEST_GOOD_PERFORMER | Maria Progressive | 48 | No | No | ~28% improvement, mostly LOW | 100% |
| TEST_MODERATE_PERFORMER | Robert Steady | 56 | Yes | No | ~21% improvement, all MODERATE | 100% |
| TEST_POOR_PERFORMER | Linda Struggling | 62 | Yes | Yes | ~15% improvement, all HIGH | 100% |
| TEST_DECLINING_PERFORMER | Patricia Declining | 67 | Yes | Yes | -2% decline, all HIGH | 100% |
| TEST_DATA_90PCT | Sarah AlmostComplete | 45 | No | No | ~26% improvement | 90% |
| TEST_DATA_75PCT | John MostlyThere | 52 | No | No | ~20% improvement | 75% |
| TEST_DATA_50PCT | Mike HalfData | 58 | Yes | No | ~16% improvement | 50% |
| TEST_DATA_30PCT | Emma SparseData | 60 | Yes | No | ~11% improvement | 30% |
| TEST_IMPROVING_DATA | Tom ImprovingData | 50 | No | No | ~29% improvement | 40%→100% |

## Generated Reports

All reports saved to `test-reports/` directory:

### 1. summary_[timestamp].csv
**Use:** Quick comparison across users
**Columns:** Patient ID, Age, Risk Factors, Scores, Improvement %, Trend, Risk Distribution, Adherence, Baselines, Data Completeness

### 2. observations_[timestamp].csv
**Use:** Detailed qualitative insights
**Columns:** Patient ID, Category, Observation
**Categories:** Performance, Risk, Trend, Adherence, Health Status, Baseline, HR, Data Quality, Risk Factors, Concerns

### 3. weekly_progression_[timestamp].csv
**Use:** Time-series visualization
**Columns:** Patient ID, Week 1, Week 2, ..., Week 12
**Perfect for:** Line charts in Excel

### 4. session_details_[timestamp].csv
**Use:** Granular session-level analysis
**Columns:** Patient ID, Week, Session, Date, Score, Risk Level, Health Status, Baseline, HR metrics, Data Completeness
**Total:** 360 rows (10 users × 36 sessions)

### 5. EXECUTIVE_SUMMARY_[timestamp].txt
**Use:** Executive briefing, presentations
**Contents:** Overall stats, individual summaries, all key observations

## Excel Tips

### Import CSV
1. Data → Get Data → From Text/CSV
2. Select file → Load

### Create Line Chart (Weekly Progress)
1. Open `weekly_progression_[timestamp].csv`
2. Select all data
3. Insert → Line Chart

### Create Pivot Table (Risk Analysis)
1. Open `session_details_[timestamp].csv`
2. Insert → Pivot Table
3. Rows: Patient ID
4. Columns: Risk Level
5. Values: Count of Risk Level

### Create Bar Chart (Improvement Comparison)
1. Open `summary_[timestamp].csv`
2. Select "Patient ID" and "Improvement %" columns
3. Insert → Bar Chart

## Key Metrics

### Risk Levels
- **LOW:** Score ≥70 (good)
- **MODERATE:** Score 50-69 (acceptable)
- **HIGH:** Score <50 (concerning)

### Adherence Quality
- **Excellent:** 80%+ sessions above baseline
- **Good:** 60-80% above baseline
- **Fair:** 40-60% above baseline
- **Poor:** <40% above baseline

### Trend Types
- **Strong Positive:** Rapid improvement
- **Moderate Positive:** Steady improvement
- **Stable:** Maintaining level
- **Moderate Negative:** Declining
- **Strong Negative:** Rapid decline

## What to Look For

### ✅ Expected Results
- 9/10 users improve
- 1/10 user declines (TEST_DECLINING_PERFORMER)
- Risk levels match archetypes
- Data completeness affects improvement (lower completeness = lower improvement)
- Resting HR improves for improving users
- Baselines increase for improving users

### ⚠️ Red Flags
- All users improving (too optimistic)
- No declining users (missing failure scenarios)
- Risk levels don't match archetypes
- Uniform data completeness
- Poor adherence across all users

## Sample Queries

### Find all HIGH risk sessions
```sql
SELECT * FROM sessions WHERE riskLevel = 'High' AND patientId LIKE 'TEST_%';
```

### Get baseline progression for one user
```sql
SELECT * FROM baseline_thresholds WHERE patientId = 'TEST_BEST_PERFORMER' ORDER BY calculatedAtSession;
```

### Count sessions by risk level
```sql
SELECT riskLevel, COUNT(*) FROM sessions WHERE patientId LIKE 'TEST_%' GROUP BY riskLevel;
```

### Find sessions with low data completeness
```sql
SELECT * FROM sessions WHERE patientId LIKE 'TEST_%' AND dataCompleteness < 0.5;
```

## Troubleshooting

| Issue | Solution |
|-------|----------|
| No test users found | Run `npm run seed:12week` first |
| Reports not generated | Check `test-reports/` directory exists |
| Database errors | Verify .env credentials, check MySQL is running |
| Old data interfering | Seed script auto-clears TEST_ users |

## Test Coverage Summary

✅ **Performance:** Best, Good, Moderate, Poor, Declining
✅ **Risk Profiles:** LOW, MODERATE, HIGH, Mixed
✅ **Data Completeness:** 100%, 90%, 75%, 50%, 30%, Progressive
✅ **Baselines:** 12 updates per user (every 3 sessions)
✅ **Health Status:** All 5 types covered
✅ **Risk Factors:** Age, Beta Blockers, Low EF combinations
✅ **Weekly Patterns:** Plateaus, breakthroughs, within-week progression

**Total Test Cases:** 360 sessions across 10 archetypes

## Support

- Full documentation: [12_WEEK_TEST_DOCUMENTATION.md](./12_WEEK_TEST_DOCUMENTATION.md)
- Seed script: [seed12WeekTestData.js](./seed12WeekTestData.js)
- Test runner: [runComprehensiveTests.js](./runComprehensiveTests.js)
