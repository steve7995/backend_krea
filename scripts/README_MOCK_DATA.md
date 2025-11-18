# Mock User Groups - Test Data Scripts

This directory contains scripts for creating and managing mock user test data for the cardiac rehab program.

## Overview

Four mock user groups have been designed to test different patient scenarios:

### Group A - BEST CASE
- **Patient**: Alex Johnson, Age 35
- **Conditions**: No beta blockers, No low EF
- **Progression**: Strong improvement (+10.6%)
- **Risk Trend**: LOW and stable
- **Sessions**: Scores improve from 85 → 94
- **Use Case**: Test optimal patient progression and baseline updates

### Group B - MODERATE+ CASE
- **Patient**: Maria Santos, Age 45
- **Conditions**: No beta blockers, No low EF
- **Progression**: Good improvement (+11.8%)
- **Risk Trend**: MODERATE → LOW
- **Sessions**: Scores improve from 68 → 76
- **Use Case**: Test patients transitioning from moderate to low risk

### Group C - MODERATE- CASE
- **Patient**: Robert Chen, Age 58
- **Conditions**: Beta blockers, No low EF
- **Progression**: Minimal improvement (+9.1%)
- **Risk Trend**: MODERATE and fluctuating
- **Sessions**: Scores improve from 55 → 60
- **Use Case**: Test patients with limited cardiovascular adaptation

### Group D - WORST CASE
- **Patient**: Patricia Williams, Age 65
- **Conditions**: Beta blockers, Low EF
- **Progression**: Declining (-21.4%)
- **Risk Trend**: HIGH and worsening
- **Sessions**: Scores decline from 42 → 33
- **Use Case**: Test patients requiring medical review

## Scripts

### 1. seedMockUsers.js

Creates all four mock user groups with complete session data.

**Usage:**
```bash
node scripts/seedMockUsers.js
```

**What it creates:**
- 4 mock users in the `users` table
- 24 sessions (6 per user) in the `sessions` table
- 8 baseline threshold records in the `baseline_thresholds` table
- ~480 heart rate data points in the `historical_hr_data` table

**Features:**
- Realistic heart rate progression during sessions (warmup, exercise, cooldown)
- Automatic baseline calculation at sessions 3 and 6
- Health status determination based on performance
- Complete session metadata (zones, durations, risk levels)
- Transaction support (all-or-nothing seeding)

**Safety:**
- Automatically clears existing mock data before seeding
- Uses database transactions to ensure data consistency
- Only affects records with `MOCK_` prefix in patientId

### 2. viewMockUsers.js

Displays the seeded mock user data in a formatted, readable way.

**Usage:**
```bash
node scripts/viewMockUsers.js
```

**Output includes:**
- Patient demographics (age, beta blockers, low EF status)
- Session-by-session progression
- Score summaries (session scores, baseline scores, combined scores)
- Resting heart rate trends
- Overall improvement percentage
- Adherence assessment
- Health status and risk trend analysis

## Data Structure

### Session Progression Pattern

Each mock user has 6 sessions following this pattern:

```
Session 1-2: Initial sessions (no baseline yet)
Session 3:   BASELINE ESTABLISHED (based on sessions 1-3)
Session 4-5: Progression with baseline comparison
Session 6:   BASELINE UPDATED (based on sessions 4-6)
```

### Baseline Calculation

Baselines are calculated using:
- **Mean** of the previous 3 sessions
- **Standard Deviation** for threshold bands
- **Thresholds**: ±1 SD and ±2 SD from baseline
- **Resting HR**: Captured at baseline calculation

### Health Status Determination

Health status is calculated by comparing session score to baseline:
- `strong_improvement`: +10% or more above baseline
- `improving`: +5% to +10% above baseline
- `consistent`: Within ±5% of baseline
- `declining`: -5% to -10% below baseline
- `at_risk`: -10% or more below baseline

## Use Cases

### Testing Baseline Logic
```bash
# Seed the data
node scripts/seedMockUsers.js

# Verify baselines are created at sessions 3 and 6
node scripts/viewMockUsers.js
```

### Testing Risk Assessment
Each group represents a different risk profile:
- Group A: Consistently LOW risk
- Group B: Improving from MODERATE to LOW
- Group C: Stable MODERATE risk
- Group D: Persistent HIGH risk

### Testing Health Status Trends
- Group A: `improving` → `strong_improvement`
- Group B: `consistent` → `improving`
- Group C: `consistent` throughout
- Group D: `declining` → `at_risk`

### Testing Heart Rate Data
Each session includes realistic HR data:
- 1 reading per minute
- Warmup phase: gradual increase
- Exercise phase: fluctuation around target
- Cooldown phase: gradual decrease

## Database Tables Affected

| Table | Records Created | Description |
|-------|----------------|-------------|
| `users` | 4 | Mock patient records |
| `sessions` | 24 | 6 sessions per user |
| `baseline_thresholds` | 8 | 2 baselines per user (at sessions 3 & 6) |
| `historical_hr_data` | ~480 | ~20-25 HR readings per session |

## Cleanup

To remove all mock data:

```bash
# Run the seed script again - it auto-cleans before seeding
node scripts/seedMockUsers.js
```

Or manually delete:

```sql
DELETE FROM historical_hr_data WHERE patient_id LIKE 'MOCK_%';
DELETE FROM baseline_thresholds WHERE patient_id LIKE 'MOCK_%';
DELETE FROM sessions WHERE patient_id LIKE 'MOCK_%';
DELETE FROM users WHERE patient_id LIKE 'MOCK_%';
```

## Integration Testing

### API Endpoints to Test

1. **Get Patient Sessions**
   ```bash
   GET /api/patient/MOCK_ALEX_JOHNSON/sessions
   ```

2. **Get Session Details**
   ```bash
   GET /api/sessions/{sessionId}
   ```

3. **Get Baseline History**
   ```bash
   GET /api/patient/MOCK_ALEX_JOHNSON/baselines
   ```

4. **Get Heart Rate Data**
   ```bash
   GET /api/sessions/{sessionId}/heart-rate
   ```

### Testing Scenarios

**Scenario 1: Baseline Establishment**
- Use MOCK_ALEX_JOHNSON
- Verify baseline created after session 3
- Verify baseline updated after session 6

**Scenario 2: Risk Level Changes**
- Use MOCK_MARIA_SANTOS
- Verify risk transitions from MODERATE to LOW
- Verify health status improves

**Scenario 3: Minimal Adaptation**
- Use MOCK_ROBERT_CHEN
- Verify scores increase but risk stays MODERATE
- Verify beta blocker effects on progression

**Scenario 4: Declining Performance**
- Use MOCK_PATRICIA_WILLIAMS
- Verify declining scores trigger `at_risk` status
- Verify medical review alerts

## Expected Output

When running `viewMockUsers.js`, you should see output like:

```
================================================================================
MOCK USER GROUPS - TEST DATA OVERVIEW
================================================================================

--------------------------------------------------------------------------------
GROUP A - BEST CASE
--------------------------------------------------------------------------------
Patient: Alex Johnson, Age 35
Beta Blockers: No
Low EF: No

Session Progression:
  Session 1: Score 85.0, Risk Low, HR 115 bpm
  Session 2: Score 88.0, Risk Low, HR 114 bpm
  Session 3: Score 90.0, Risk Low, HR 113 bpm (Baseline: 87.7) [BASELINE ESTABLISHED]
  Session 4: Score 91.0, Risk Low, HR 112 bpm
  Session 5: Score 92.0, Risk Low, HR 111 bpm
  Session 6: Score 94.0, Risk Low, HR 109 bpm (Baseline: 90.5) [BASELINE UPDATED]

Score Summary:
  Session Scores:  [85.0, 88.0, 90.0, 91.0, 92.0, 94.0]
  Baseline Scores: [--, --, 87.7, 87.7, 87.7, 90.5]
  Combined Scores: [85.0, 88.0, 88.9, 89.4, 89.9, 92.3]
  Resting HR:      [70.0, 70.0, 70.0, 68.0, 68.0, 64.0] bpm

Overall Summary:
  Improvement: +10.6%
  Adherence: Excellent - consistently above baseline
  Health Status: Optimal progression, strong cardiovascular adaptation
  Risk Trend: Low and stable
```

## Troubleshooting

### No mock users found
```bash
# Run the seed script first
node scripts/seedMockUsers.js
```

### Database connection errors
```bash
# Check your database configuration in database/db.js
# Ensure database is running and accessible
```

### Transaction failures
```bash
# Check database logs
# Ensure all required tables exist
# Verify Sequelize models are properly configured
```

## Notes

- All mock users have a `MOCK_` prefix in their `patientId` to easily identify test data
- Heart rate data is generated algorithmically but follows realistic patterns
- Session dates are backdated (1 week intervals) to simulate historical data
- All data uses IST timezone assumptions
- The script is idempotent - running it multiple times will clear and recreate the same data

## Future Enhancements

Potential additions to this test data suite:
- [ ] Mock users for 12-week regime (currently only 6 weeks)
- [ ] Users with missed sessions
- [ ] Users with multiple session attempts per week
- [ ] Edge cases (data gaps, extreme HR values)
- [ ] Integration with Spectrum API mock responses
