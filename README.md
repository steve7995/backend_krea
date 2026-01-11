# Cardiac Rehabilitation Monitoring System

Backend system for monitoring cardiac rehab patients through Google Fit integration. Tracks heart rate data, processes exercise sessions, and calculates risk scores.

## What it does

This connects wearable fitness devices with healthcare EMR systems for real-time patient monitoring. It syncs heart rate data from Google Fit, processes exercise sessions, and gives risk assessments based on multiple health parameters.

## Features

**Google Fit Integration**
- OAuth 2.0 authentication with automatic token refresh
- Syncs heart rate data every 6 hours
- Stores historical patient data
- Integrates with Spectrum EMR

**Session Management**
- Track exercise sessions in real-time (start/stop)
- Score past sessions retroactively
- Timezone-aware session processing
- Smart retry system (up to 12 attempts) with progressive data completeness thresholds

**Risk Scoring**
- Combines heart rate zones with vitals (BP, SpO2, glucose)
- Dynamic warmup/exercise/cooldown phase detection
- Baseline calculations at key milestones (sessions 1, 3, 7, 14)
- 5-tier health status (at risk → strong improvement)
- Resting heart rate using MAD methodology

**Rehab Programs**
- 6-12 week customizable programs
- 3 sessions per week (top-3 scoring)
- Progress tracking with exponential moving average
- Age-adjusted heart rate zones (accounts for beta-blockers and low EF)

## Project Structure

```
backend_krea/
├── controllers/          # API handlers
│   ├── sessionController.js
│   └── patientController.js
├── models/              # Database (Sequelize)
│   ├── User.js
│   ├── Session.js
│   ├── WeeklyScore.js
│   └── ...
├── workers/             # Background jobs
│   └── retryWorker.js
├── jobs/
│   └── historicalSync.js    # 6-hour data sync
├── utils/               # Helper functions
│   ├── googleFit.js
│   ├── tokenManager.js
│   ├── calculations.js
│   └── ...
├── routes/
└── server.js
```



## API Endpoints

### Authentication

**Register Google Account**
```http
POST /api/auth/registerGoogleAccount
```
```json
{
  "patientId": "12345",
  "tokens": {
    "access_token": "ya29.a0...",
    "refresh_token": "1//0g...",
    "expires_at": 1234567890
  }
}
```

**Register Patient**
```http
POST /api/patients/registerPatientData
```
```json
{
  "patientId": "12345",
  "age": 55,
  "BB": false,
  "LowEF": false,
  "Regime": 6,
  "systolic": 120,
  "diastolic": 80,
  "bloodGlucose": 95,
  "spo2": 98,
  "height": 175,
  "weight": 75
}
```

### Sessions

**Start Session**
```http
POST /api/sessions/capturePatientSessionTime
```
```json
{
  "patientId": "12345",
  "sessionStartTime": "2025-01-11T10:00:00.000Z",
  "action": "start"
}
```

**Stop Session**
```json
{
  "patientId": "12345",
  "sessionEndTime": "2025-01-11T10:45:00.000Z",
  "action": "stop"
}
```

**Score Past Exercise**
```http
POST /api/sessions/scoreIndependentExercise
```
```json
{
  "patientId": "12345",
  "sessionStartTime": "2025-01-10T09:00:00.000Z",
  "sessionEndTime": "2025-01-10T09:45:00.000Z"
}
```

**Get Results**
```http
GET /api/sessions/getIndependentExerciseResult/:sessionId
```

**Risk Analysis**
```http
POST /api/sessions/submitRiskAnalysis
```
```json
{
  "patientId": "12345"
}
```

### Response Example

```json
{
  "status": "success",
  "data": {
    "patientId": 12345,
    "sessionType": "complete",
    "weekNumber": 2,
    "sessionAttemptNumber": 5,
    "durationMinutes": 45,
    "dataCompleteness": 92,
    "scores": {
      "warmupScore": 85.5,
      "exerciseScore": 78.2,
      "cooldownScore": 88.0,
      "overallScore": 82.1,
      "riskLevel": "Low"
    },
    "heartRate": {
      "max": 145,
      "min": 68,
      "avg": 110
    },
    "zones": {
      "warmup": { "min": 87, "max": 101 },
      "exercise": { "min": 101, "max": 123 },
      "cooldown": { "min": 87, "max": 101 }
    }
  }
}
```

## Background Workers

**Historical Sync** - Runs every 6 hours (0:00, 6:00, 12:00, 18:00)
- Fetches HR data from Google Fit
- Processes in 6-hour chunks
- Skips patients with active sessions

**Retry Worker** - Every 5 minutes
- Processes pending/retrying sessions
- 12 attempts with progressive thresholds
- Falls back to historical data on attempt 12
- Uses median imputation for gaps

**Auto-Stop** - Every minute
- Transitions active sessions at planned end time
- Timezone-aware

**Cleanup** - Every 30 minutes
- Marks sessions abandoned after 2 hours

## Scoring Logic

**Heart Rate Zones**
- Warmup: 53-61% max HR
- Exercise: 61-74% max HR
- Cooldown: 53-61% max HR

**Phase Allocation**
- Adjusts based on actual vs planned duration
- Proportional time distribution

**Zone Adherence**
- Points for time in target zones
- Penalties for exceeding max HR
- Bonus for consistency

**Vitals Integration**
- Blood pressure normalization
- SpO2 assessment
- Blood glucose consideration
- 50/50 weight with session score

**Risk Levels**
- 85-100: Low
- 70-84: Moderate
- 50-69: High
- <50: Very High

**Weekly Scores**
- Average of top 3 sessions per week
- Cumulative: 0.6 × current + 0.4 × previous

**Baseline Calculation** (at sessions 1, 3, 7, 14)
- Baseline = median of last 3 scores
- SD = 1.4826 × MAD
- Thresholds at ±1SD, ±2SD

**Health Status**
- At Risk: < Baseline - 2SD
- Declining: Baseline - 2SD to Baseline - 1SD
- Consistent: Baseline - 1SD to Baseline + 1SD
- Improving: Baseline + 1SD to Baseline + 2SD
- Strong Improvement: > Baseline + 2SD


## Data Quality

**Completeness Thresholds**
- Attempts 1-3: 80%
- Attempts 4-6: 60%
- Attempts 7-9: 50%
- Attempts 10-11: 40%
- Attempt 12: Historical fallback

**Median Imputation**
- Fills minute-by-minute gaps
- Uses surrounding actual readings
- Flags imputed values


## EMR Integration (Spectrum)

Syncs data at key points:
- Session start notification
- Complete session results
- 6-hour HR data batches
- Token expiration alerts

Data format: JSON with timezone normalization (IST)

