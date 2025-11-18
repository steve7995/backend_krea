# KREA Cardiac Rehabilitation Backend - Architecture Summary

## System Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT APPLICATION                        │
│                    (Mobile/Web Frontend)                          │
└────────────┬────────────────────────────────────────────┬────────┘
             │                                            │
             │                                            │
    ┌────────▼────────────┐                    ┌─────────▼─────────┐
    │   GOOGLE OAuth      │                    │   REST API        │
    │   (GET tokens)      │                    │   (Express.js)    │
    └────────────────────┘                    └─────────┬─────────┘
                                                        │
                    ┌───────────────────────────────────┼───────────────────────────────────┐
                    │                                   │                                   │
                    │                                   │                                   │
         ┌──────────▼──────────┐           ┌───────────▼────────┐          ┌────────────────▼────────┐
         │   MYSQL DATABASE    │           │  GOOGLE FIT API    │          │   SPECTRUM API          │
         │   (Sequelize ORM)   │           │  (Heart Rate Data) │          │   (Session Submission)  │
         │                     │           │                    │          │                         │
         │  8 Models:          │           │  Aggregation:      │          │  Endpoints:             │
         │  • User             │           │  • 1-min buckets   │          │  • Session submission   │
         │  • Session          │           │  • 24h-30d range   │          │  • Token expiry notify  │
         │  • RehabPlan        │           │  • HR (bpm)        │          │  • Historical HR push   │
         │  • PatientVital     │           │                    │          │                         │
         │  • GoogleToken      │           │  Auth:             │          │ Frequency:              │
         │  • HistoricalHRData │           │  • OAuth 2.0       │          │ • Per session (on stop) │
         │  • WeeklyScore      │           │  • 5-min buffer    │          │ • Every 6h (history)    │
         │  • BaselineThreshold│           │  • Refresh flow    │          │ • On token expiry       │
         │                     │           │                    │          │                         │
         └─────────┬──────────┘           └────────────────────┘          └────────────────────────┘
                   │
                   │
    ┌──────────────┴───────────────┐
    │   BACKGROUND JOBS            │
    │   & WORKERS                  │
    │                              │
    │  ┌──────────────────────┐   │
    │  │  Retry Worker        │   │
    │  │  (Every 30 sec)      │   │
    │  │  • Check ready       │   │
    │  │    sessions          │   │
    │  │  • Process HR data   │   │
    │  │  • 11 retry attempts │   │
    │  │  • Send to Spectrum  │   │
    │  └──────────────────────┘   │
    │                              │
    │  ┌──────────────────────┐   │
    │  │  Historical Sync     │   │
    │  │  (Every 6 hours)     │   │
    │  │  • Fetch 24h HR      │   │
    │  │  • Store in DB       │   │
    │  │  • Skip processing   │   │
    │  │    sessions          │   │
    │  └──────────────────────┘   │
    │                              │
    │  ┌──────────────────────┐   │
    │  │  Token Health Check  │   │
    │  │  (NOT IMPLEMENTED)   │   │
    │  └──────────────────────┘   │
    │                              │
    └──────────────────────────────┘
```

## API Routes & Flow

### Session Lifecycle Flow

```
START SESSION                STOP SESSION              PROCESS SESSION
────────────────            ────────────             ────────────────

POST /capturePatientSessionTime        POST /capturePatientSessionTime
  action: 'start'                        action: 'stop'
       │                                      │
       ├─ Validate patient                    ├─ Find active session
       ├─ Check active session                ├─ Calculate actual duration
       ├─ Get week number                     ├─ Validate duration > 0
       ├─ Get rehab plan                      └─ Update to 'in_progress'
       ├─ Create session (active)
       ├─ Calculate processingStartsAt              │
       └─ POST to Spectrum                         │
                                                   │
            Status: 'active'                       │
            Status transitions:                    │
            active ──────────► in_progress ──────┐ │
                                                 │ │
                                    ┌────────────┘ │
                                    │              │
                           [Retry Worker Picks Up] 
                                    │
                 ┌──────────────────┴──────────────────┐
                 │                                     │
          Attempt 1: Immediate               Attempt 2-11: Scheduled
                 │                                     │
        ┌────────▼────────┐              ┌─────────────▼──────────┐
        │ Fetch Google Fit │              │ Retry if:              │
        │ (5 min after end)│              │ • No data yet          │
        │                 │              │ • Partial data         │
        └────────┬────────┘              │   (< threshold)        │
                 │                        │                        │
        ┌────────▼────────────┐          │ Next attempts:         │
        │ Validate Quality    │          │ • Every 5 min (2-6)    │
        │ (>80% complete)     │          │ • 15min, 30min, 1h,    │
        └────────┬────────────┘          │   3h, 6h (7-11)        │
                 │                        └─────────────┬──────────┘
        ┌────────▼──────────────┐                       │
        │ SUCCESS              │              ┌─────────▼──────────┐
        │ Calculate:           │              │ FINAL STATUS       │
        │ • Session score      │              │                    │
        │ • Risk level         │              ├─ completed (OK)    │
        │ • Weekly score       │              ├─ data_unavailable  │
        │ • Baseline (3,7,14)  │              ├─ failed            │
        │ • Vital risk         │              └────────────────────┘
        └────────┬──────────────┘
                 │
        ┌────────▼────────────────┐
        │ Send to Spectrum API    │
        │ • Format data           │
        │ • POST with all fields  │
        │ • Store response        │
        └────────┬────────────────┘
                 │
        ┌────────▼────────────┐
        │ Mark 'completed'    │
        │ Update all fields   │
        └─────────────────────┘

GET /submitRiskAnalysis
(Poll for results)
└─ Returns full analysis when completed
```

## Database Schema Relationships

```
┌─────────────────┐
│      USER       │  PK: patientId
│─────────────────┤
│ patientId (PK)  │
│ age             │
│ betaBlockers    │
│ lowEF           │
│ regime          │
│ createdAt       │
│ updatedAt       │
└─────┬───────────┘
      │
      │ 1 User : Many Sessions
      │ 1 User : Many RehabPlans
      │ 1 User : Many WeeklyScores
      │ 1 User : Many HistoricalHRData
      │ 1 User : Many BaselineThresholds
      │ 1 User : 1 PatientVital
      │ 1 User : 1 GoogleToken
      │
      ├──────────────┬──────────────┬──────────────┬──────────────┐
      │              │              │              │              │
      ▼              ▼              ▼              ▼              ▼
┌─────────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ ┌────────────┐
│   SESSION   │ │REHABPLAN │ │PATIENTVIT│ │GOOGLETOKEN │ │WEEKLYSCORE │
├─────────────┤ ├──────────┤ ├──────────┤ ├────────────┤ ├────────────┤
│ id (PK)     │ │ id (PK)  │ │ patientId│ │ patientId  │ │ id (PK)    │
│ patientId   │ │ patientId│ │ (PK,FK)  │ │ (PK,FK)    │ │ patientId  │
│ (FK)        │ │ (FK)     │ │          │ │            │ │ (FK)       │
│ weekNumber  │ │weekNumber│ │systolic  │ │accessToken │ │weekNumber  │
│ sessionAtpt │ │targetHR  │ │diastolic │ │refreshToken│ │weeklyScore │
│ sessionDate │ │maxPerm HR│ │bloodGluc │ │expiresAt   │ │cumScore    │
│ startTime   │ │warm/exer │ │spo2      │ │tokenStatus │ └────────────┘
│ endTime     │ │cooldown  │ │temp,h,w  │ │tokenInUse  │
│ duration    │ │zones     │ │cardiac   │ │tokenLockedB│      ┌─────────────┐
│ actualDurtn │ │sessionDur│ │condition │ │lastUsedAt  │      │HISTORICALHR │
│ maxHR       │ │          │ │          │ │            │      ├─────────────┤
│ minHR       │ │          │ │          │ │            │      │ id (PK)     │
│ avgHR       │ │          │ │          │ │            │      │ patientId   │
│ status      │ │          │ │          │ │            │      │ (FK)        │
│ attemptCount│ │          │ │          │ │            │      │ recordedDate│
│ nextAttempt │ │          │ │          │ │            │      │ recordedTime│
│ retrySchdul │ │          │ │          │ │            │      │ heartRate   │
│ scores,risk │ │          │ │          │ │            │      │ activityType│
│ sentToSpec  │ │          │ │          │ │            │      │ dataSource  │
│ specResponse│ │          │ │          │ │            │      │ isImputed   │
│ dataComplete│ │          │ │          │ │            │      └─────────────┘
└─────────────┘ └──────────┘ └──────────┘ └────────────┘

Indexes:
SESSION:
  • (patientId, weekNumber)
  • (patientId, weekNumber, sessionAttemptNumber)
  • (status, nextAttemptAt)

WEEKLYSCORE:
  • (patientId, weekNumber) UNIQUE

HISTORICALHR:
  • (patientId, recordedDate)
  • (patientId, recordedDate, recordedTime)

GOOGLETOKEN:
  • (tokenInUse, tokenLockedAt)
```

## Core Features Matrix

| Feature | Status | Component | Frequency |
|---------|--------|-----------|-----------|
| Session Start/Stop | Implemented | SessionController | On demand |
| HR Data Fetch | Implemented | GoogleFit utils | Per session |
| Risk Assessment | Implemented | GoogleFit utils | Per session |
| Zone Calculation | Implemented | Calculations utils | Per patient |
| Retry Logic | Implemented | Retry Worker | Every 30s |
| Retry Scheduling | Implemented | Schedule Helper | 11 attempts |
| Token Management | Implemented | Token Manager | Per API call |
| Token Locking | Implemented | Token Manager | Per access |
| Historical Sync | Implemented | Historical Sync | Every 6h |
| Spectrum Integration | Implemented | Spectrum Formatter | Per session |
| Token Expiry Notify | Implemented | Spectrum Formatter | On expiry |
| Baseline Calculation | Implemented | Retry Worker | At sessions 3,7,14 |
| Data Bucketing | Implemented | Historical HR Proc | >200 points |
| Vital Risk Scoring | Implemented | Vitals Risk Calc | Per session |

## Request/Response Flow Examples

### Example 1: Start Session
```
Request:
POST /api/capturePatientSessionTime
{
  "patientId": "P123",
  "action": "start",
  "sessionStartTime": "2024-11-11T10:00:00Z"
}

Response (Success):
{
  "status": "success",
  "message": "Session started successfully",
  "sessionId": 456,
  "weekNumber": 2,
  "sessionAttemptNumber": 2,
  "plannedDuration": 22
}

Database State:
- Session 456 created with status='active'
- processingStartsAt = startTime + duration + 5min buffer
- External: POST to Spectrum with patientId & duration
```

### Example 2: Stop Session
```
Request:
POST /api/capturePatientSessionTime
{
  "patientId": "P123",
  "action": "stop",
  "sessionEndTime": "2024-11-11T10:25:00Z"
}

Response (Success):
{
  "status": "success",
  "message": "Session stopped successfully",
  "sessionId": 456,
  "actualDuration": 25,
  "plannedDuration": 22,
  "processingStartsAt": "2024-11-11T10:30:00Z"
}

Database State:
- Session 456 updated: status='in_progress', actualDuration=25
- processingStartsAt updated based on actual end time
- Retry worker will pick it up when time >= processingStartsAt
```

### Example 3: Submit Risk Analysis (Polling)
```
Request:
POST /api/submitRiskAnalysis
{
  "sessionId": 456
}

Response - While Processing (HTTP 202):
{
  "status": "processing",
  "message": "Session data still being processed",
  "estimatedCompletion": "2024-11-11T10:35:00Z",
  "attemptCount": 3
}

Response - After Completion (HTTP 200):
{
  "status": "success",
  "data": {
    "patient_id": 123,
    "session_number": 2,
    "week_number": 2,
    "session_risk_score": 75.5,
    "cumulative_risk_score": 72.3,
    "risk_level": "Low",
    "baseline_score": 70,
    "summary": "Low risk level detected...",
    "session_data": {
      "sessionDate": "2024-11-11",
      "sessionStartTime": "10:00:00",
      "sessionDuration": 22,
      "MaxHR": 145,
      "MinHR": 85,
      "AvgHR": 115,
      "sessionRiskLevel": "Low",
      "dataCompleteness": 0.95
    },
    "session_zones": { ... }
  }
}
```

## Worker Execution Timeline

```
[Session Created at t=10:00]
  status='active'

[10:25] Session Stop Action
  status changed to 'in_progress'
  processingStartsAt set to 10:30

[10:30] Retry Worker Runs
  Checks: processingStartsAt <= now? YES
  Transitions: 'in_progress' → 'processing'
  Creates retrySchedule
  attemptCount = 0
  nextAttemptAt = now (attempt 1)

[10:30:XX] Process Attempt 1
  ├─ Acquire token lock
  ├─ Fetch Google Fit (10:00-10:25)
  ├─ Check completeness (25 data points expected)
  ├─ SUCCESS: 25+ points found
  ├─ Calculate scores
  ├─ Send to Spectrum
  └─ status → 'completed'

[Within 30 seconds] Retry Worker Detects Completion
  Session now has status='completed'
  User can call /submitRiskAnalysis to get results

[Failure Scenario - If no data]:
[10:30] Attempt 1: No data → nextAttemptAt = 10:35
[10:35] Attempt 2: Partial data → nextAttemptAt = 10:40
[10:40] Attempt 3: Still insufficient → nextAttemptAt = 10:45
...
[4 hours later] Attempt 6: 50% data → ACCEPT
→ status = 'completed' (with dataCompleteness = 0.50)

[If all 11 attempts fail]:
→ status = 'data_unavailable'
→ failureReason = "No data available after 11 attempts"
→ User must restart session
```

## Concurrency & Locking

```
Patient Token Access: Multiple Workers

Worker 1: Retry Worker for Session A
  ├─ acquireTokenLock(patientId, 'retry-worker') ✓
  ├─ fetchGoogleFit(token) ✓
  └─ releaseTokenLock(patientId) ✓

Worker 2: Historical Sync Job (wants same patient)
  └─ acquireTokenLock(patientId, 'historical-sync') ✗ BLOCKED
     (Waits or retries later)

Stale Lock Scenario:
  Worker 1 crashes/hangs with lock held for >5 minutes
  ├─ New worker detects stale lock
  ├─ Force acquireTokenLock (takes over)
  └─ Proceeds with operation

Lock Timeout: 5 minutes
Force Takeover: Automatic
Lock Tracking: GoogleToken.tokenInUse, tokenLockedBy, tokenLockedAt
```

## Error Handling Strategy

```
API Errors (Synchronous):
  ├─ Validation Error (400) → Missing fields, bad data
  ├─ Not Found (404) → Patient/Session not found
  ├─ Conflict (409) → Active session exists
  └─ Server Error (500) → Unexpected error

Async Processing Errors (Handled by Retry Worker):
  ├─ No Data Available
  │  └─ Retry on schedule (11 attempts, ~6 hours)
  ├─ Partial Data (<80%)
  │  ├─ Attempt 1-2: Reject
  │  ├─ Attempt 3-6: Progressive acceptance
  │  └─ Attempt 7+: Accept if >= 50%
  ├─ Token Expired
  │  ├─ Mark token as 'invalid'
  │  ├─ Notify Spectrum
  │  └─ Session status = 'failed'
  ├─ Network/Timeout
  │  └─ Retry on schedule
  └─ Spectrum API Failure
     └─ Retry on next worker run

Final States:
  ├─ completed (✓ Success)
  ├─ data_unavailable (✗ No data after retries)
  ├─ failed (✗ Error - stored in failureReason)
  └─ abandoned (✗ Max attempts exceeded)
```

## Performance Characteristics

| Operation | Typical Time | Max Time | Notes |
|-----------|--------------|----------|-------|
| Start Session | <100ms | 500ms | Spectrum POST can timeout |
| Stop Session | <50ms | 200ms | Simple DB update |
| Risk Analysis Poll | <50ms | 200ms | DB query only |
| HR Data Fetch | 2-5s | 10s | Google Fit API call |
| Data Bucketing | <100ms | 500ms | 1000+ points → 200 buckets |
| Token Refresh | 1-2s | 5s | Google OAuth flow |
| Session Processing | 5-10s | 15s | Fetch + Spectrum + calc |
| Retry Worker Cycle | 30s | 60s | Check all sessions |
| Historical Sync | 10-30s | 60s | All patients per 6h |

## Timezone Handling

```
Current Implementation:
  ├─ IST Offset: +5.5 hours
  ├─ Hardcoded in code: (5.5 * 60 * 60 * 1000)
  ├─ Used for: Historical HR timestamp formatting
  └─ Issue: Not configurable per deployment

Database Timestamps:
  ├─ UTC (Sequelize default)
  ├─ Session times: TIME type (no timezone)
  └─ Dates: DATEONLY type

Recommendations:
  ├─ Use timezone parameter in config
  ├─ Store all times as UTC
  └─ Format on output based on region
```

## Data Flow: Complete Session Cycle

```
┌─ START ─────────────────────────────────────┐
│ POST /capturePatientSessionTime              │
│ {action: 'start', ...}                      │
└────────┬────────────────────────────────────┘
         │
         ├─ Create Session (status='active')
         ├─ Calculate processingStartsAt
         └─ POST to Spectrum

┌─ STOP ──────────────────────────────────────┐
│ POST /capturePatientSessionTime              │
│ {action: 'stop', sessionEndTime}             │
└────────┬────────────────────────────────────┘
         │
         ├─ Update Session (status='in_progress')
         ├─ Calculate actualDuration
         └─ [Async] Retry worker picks up

┌─ PROCESSING ────────────────────────────────┐
│ Retry Worker (every 30 seconds)             │
│                                              │
│ Attempt 1 (immediate):                      │
│  ├─ Acquire token lock                      │
│  ├─ Fetch 25 min HR data from Google Fit    │
│  ├─ Validate >80% completeness              │
│  ├─ Calculate zones/phases/scores           │
│  ├─ Determine risk levels                   │
│  ├─ Calculate baseline (if session 3/7/14)  │
│  ├─ Calculate vital risk                    │
│  ├─ POST to Spectrum API                    │
│  ├─ Release token lock                      │
│  └─ Update Session (status='completed')     │
│                                              │
│ [If no data]: Retry attempts 2-11           │
│ [If partial]: Progressive acceptance        │
│ [If failed]: status='data_unavailable'      │
└────────┬────────────────────────────────────┘
         │
┌─ RETRIEVE RESULTS ──────────────────────────┐
│ GET /submitRiskAnalysis                     │
│ Returns: Risk scores, HR stats, zones       │
└─────────────────────────────────────────────┘
```

## Deployment Checklist

- [ ] Database created and migrations run
- [ ] Environment variables configured (.env)
- [ ] Google OAuth credentials set up
- [ ] Spectrum API endpoint URL configured
- [ ] PM2/process manager configured
- [ ] Logs directory created with write permissions
- [ ] Database backup strategy in place
- [ ] Token encryption for production (currently plain text)
- [ ] API rate limiting added
- [ ] HTTPS configured for production
- [ ] CORS configured for trusted domains
- [ ] Health check endpoints added
- [ ] Monitoring/alerting configured

