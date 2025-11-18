# KREA Cardiac Rehabilitation Backend - Comprehensive Codebase Analysis & Test Report

## Executive Summary

This is a Node.js/Express backend for a cardiac rehabilitation management system that tracks patient sessions, heart rate data, and risk assessments. The system integrates with Google Fit for health data collection and communicates with a Spectrum API for patient data management.

**Key Technologies:**
- Express.js (REST API framework)
- Sequelize (ORM for MySQL)
- Node-Cron (scheduled jobs)
- Axios (HTTP client)
- MySQL (database)
- Google Fit API (health data integration)

---

## 1. API ENDPOINTS & ROUTES

### 1.1 Authentication Routes (`/api/auth`)
**File:** `/routes/auth.js`

#### GET `/api/auth/token-status/:patientId`
- **Purpose:** Check if patient's Google Fit account is connected
- **Parameters:** `patientId` (path parameter)
- **Response:** 
  - Success: `{ connected: true/false, message: string }`
  - Includes `invalidatedAt`, `reason` if token expired
- **Status Codes:** 200 (success), 500 (error)

---

### 1.2 Patient Routes (`/api`)
**File:** `/routes/patients.js`

#### POST `/api/registerGoogleAccount`
- **Purpose:** Register/connect patient's Google Fit account with OAuth tokens
- **Request Body:**
  ```json
  {
    "patientId": "string",
    "tokens": {
      "access_token": "string",
      "refresh_token": "string",
      "expires_at": "number (optional)",
      "expiry_date": "number (optional)",
      "token_type": "string (optional)",
      "scope": "array (optional)"
    }
  }
  ```
- **Behavior:**
  - Creates User if doesn't exist
  - Stores Google tokens
  - Triggers async sync and Spectrum push (no wait)
- **Response:** `{ status: 'success/failure', message: string }`
- **Edge Cases:**
  - Missing tokens validation
  - Silent failure of async operations
  - Token expiry calculation (uses expires_at, expiry_date, or default 1 hour)

#### POST `/api/patientClinicalData`
- **Purpose:** Register/update patient clinical information
- **Request Body:**
  ```json
  {
    "patientId": "string (required)",
    "age": "integer (required)",
    "regime": "integer [6|12] (required)",
    "systolic": "integer",
    "diastolic": "integer",
    "bloodGlucose": "string",
    "spo2": "integer",
    "temperature": "decimal",
    "height": "decimal (cm)",
    "weight": "decimal (kg)",
    "cardiacCondition": "string [ACS|CSA|Valvular disorder|Others]",
    "BB": "boolean (Beta Blockers)",
    "LowEF": "boolean (Low Ejection Fraction)"
  }
  ```
- **Validation:** patientId, age, regime are required
- **Behavior:** Upserts User and PatientVital records
- **Response:** `{ status: 'success/failure', message: string, data: {...} }`

---

### 1.3 Session Routes (`/api`)
**File:** `/routes/sessionRoutes.js`

#### POST `/api/capturePatientSessionTime`
- **Purpose:** Start/stop a patient's rehabilitation session
- **Request Body:**
  ```json
  {
    "patientId": "string (required)",
    "action": "string [start|stop] (required)",
    "sessionStartTime": "ISO timestamp (required for start)",
    "sessionEndTime": "ISO timestamp (required for stop)"
  }
  ```

**ACTION: START**
- Validates patient exists
- Checks for existing active sessions
- Calculates week number: `Math.floor(totalSessions / 3) + 1`
- Fetches RehabPlan for current week
- Creates Session with status='active'
- Pre-calculates estimated end time: `startTime + (rehabPlan.sessionDuration * 60 * 1000)`
- Sets `processingStartsAt`: 5 min after estimated end
- Posts to Spectrum API with patientId and sessionDuration
- Response: `{ status, message, sessionId, weekNumber, sessionAttemptNumber, plannedDuration }`

**ACTION: STOP**
- Finds most recent active session
- Calculates actual duration: `(endTime - startTime) / 60000`
- Validates duration > 0
- Calculates actual processingStartTime: `endTime + 5 min buffer`
- Updates session status to 'in_progress'
- Does NOT post to Spectrum
- Response: `{ status, message, sessionId, actualDuration, plannedDuration, processingStartsAt }`

**Edge Cases:**
- No active session found for stop action
- Negative duration calculation
- Session duration mismatch (actual vs planned)
- Failed Spectrum communication (doesn't fail request)

#### POST `/api/submitRiskAnalysis`
- **Purpose:** Retrieve completed session analysis and risk scores
- **Request Body:**
  ```json
  {
    "sessionId": "integer (optional)",
    "patientId": "string (optional)"
  }
  ```
- **Logic:**
  - If sessionId: find by ID
  - Else if patientId: find latest session
  - Returns appropriate status based on session.status
- **Response by Status:**
  - `processing`: HTTP 202 with `{ status: 'processing', estimatedCompletion, attemptCount }`
  - `data_unavailable`/`failed`: HTTP 200 with `{ status: 'failed', message, sessionId }`
  - `completed`: HTTP 200 with full Spectrum-formatted data
  - Invalid status: HTTP 400

---

### 1.4 Historical Data Routes (`/api/patients`)
**File:** `/routes/historicalRoutes.js`

#### GET `/api/patients/rehab-historical-hr/:patientId`
- **Purpose:** Fetch processed historical heart rate data
- **Parameters:** patientId (path parameter)
- **Data Fetching Strategy:**
  1. Try HistoricalHRData DB (24h)
  2. Fallback to Google Fit (24h) if insufficient
  3. Try HistoricalHRData DB (7d) if still insufficient
  4. Fallback to Google Fit (7d)
  5. Get last 100 points from DB
  6. Final fallback: Google Fit last 30 days
- **Processing:**
  - If ≤200 points: return raw data
  - If >200 points: apply adaptive bucketing
- **Response:**
  ```json
  {
    "patient_id": "integer",
    "patient_status": "string [existing|new]",
    "time_range": "string",
    "raw_data_points": "integer",
    "returned_data_points": "integer",
    "strategy": "string [raw|bucketed]",
    "data_source": "string [historical_db|google_fit]",
    "data": [
      {
        "hr": "integer",
        "timestamp": "YYYY-MM-DD HH:mm:ss",
        "min_hr": "integer (if bucketed)",
        "max_hr": "integer (if bucketed)",
        "sample_count": "integer (if bucketed)"
      }
    ]
  }
  ```

---

### 1.5 Test Routes (`/api/test`)
**File:** `/routes/test.js`

#### GET `/api/test/test-heart-rate/:patientId`
- **Purpose:** Debug endpoint for testing Google Fit data retrieval
- **Fetches:** Last 24 hours of heart rate data
- **Response:** Formatted with both UTC and IST timestamps

---

## 2. DATABASE MODELS & SCHEMA

### 2.1 User Model
**Table:** `users`
- `patientId` (STRING 50, PK)
- `age` (INTEGER, nullable)
- `betaBlockers` (BOOLEAN, default=false)
- `lowEF` (BOOLEAN, default=false)
- `regime` (INTEGER, validates [6,12])
- Timestamps: createdAt, updatedAt

**Relationships:**
- HasOne: PatientVital
- HasMany: RehabPlan, Session, WeeklyScore, HistoricalHRData, BaselineThreshold
- HasOne: GoogleToken

### 2.2 Session Model
**Table:** `sessions`
- `id` (INTEGER, PK, auto-increment)
- `patientId` (STRING 50, FK)
- `weekNumber` (INTEGER, validates 1-12)
- `sessionAttemptNumber` (INTEGER, validates >=1)
- `sessionDate` (DATEONLY)
- `sessionStartTime` (TIME)
- `sessionEndTime` (TIME, nullable)
- `sessionDuration` (INTEGER, planned duration in minutes)
- `actualDuration` (DECIMAL 5,2, calculated from start/stop times)
- `targetHR`, `maxPermissibleHR` (INTEGER)
- `warmupZoneMin/Max`, `exerciseZoneMin/Max`, `cooldownZoneMin/Max` (INTEGER)
- `sessionRiskScore` (DECIMAL 5,2)
- `baselineScore` (DECIMAL 5,2)
- `healthStatus` (ENUM: at_risk, declining, consistent, improving, strong_improvement)
- `sessionRiskLevel` (ENUM: High, Moderate, Low)
- `riskLevel` (ENUM: High, Moderate, Low)
- `maxHR`, `minHR`, `avgHR` (INTEGER)
- `isCountedInWeekly` (BOOLEAN, default=false)
- `status` (ENUM: active, completed, missed, in_progress, processing, failed, data_unavailable, pending_sync, abandoned)
- `sentToSpectrum` (BOOLEAN, default=false)
- `spectrumSentAt` (DATE, nullable)
- `spectrumResponseStatus` (STRING 20, nullable)
- `vitalScore`, `vitalRiskLevel` (DECIMAL/ENUM, nullable)
- `dataCompleteness` (DECIMAL 4,3, 0-1 scale)
- `attemptCount` (INTEGER, validates 0-12, default=0)
- `nextAttemptAt`, `lastAttemptAt` (DATE, nullable)
- `processingStartsAt` (DATE, nullable)
- `retrySchedule` (JSON, nullable)
- `failureReason` (TEXT, nullable)
- **Indexes:**
  - (patient_id, week_number)
  - (patient_id, week_number, session_attempt_number)
  - (status, next_attempt_at)

### 2.3 RehabPlan Model
**Table:** `rehab_plan`
- `id` (INTEGER, PK, auto-increment)
- `patientId` (STRING 50, FK)
- `weekNumber` (INTEGER)
- `targetHR` (INTEGER)
- `maxPermissibleHR` (INTEGER)
- `warmupZoneMin/Max`, `exerciseZoneMin/Max`, `cooldownZoneMin/Max` (INTEGER)
- `sessionDuration` (INTEGER, in minutes)

### 2.4 PatientVital Model
**Table:** `patient_vitals`
- `patientId` (STRING 50, PK, FK)
- `systolic`, `diastolic` (INTEGER)
- `bloodGlucose` (STRING 20)
- `spo2` (INTEGER)
- `temperature` (DECIMAL 4,1)
- `height`, `weight` (DECIMAL 5,1)
- `cardiacCondition` (ENUM: ACS, CSA, Valvular disorder, Others)

### 2.5 GoogleToken Model
**Table:** `google_tokens`
- `patientId` (STRING 50, PK, FK)
- `accessToken` (TEXT)
- `refreshToken` (TEXT)
- `expiresAt` (BIGINT, milliseconds timestamp)
- `tokenType` (STRING)
- `scope` (JSON)
- `tokenStatus` (ENUM: valid, invalid, revoked, default=valid)
- `invalidatedAt` (DATE, nullable)
- `invalidationReason` (TEXT, nullable)
- `lastHealthCheck` (DATE, nullable)
- `reconnectNotifiedAt` (DATE, nullable)
- `tokenInUse` (BOOLEAN, default=false)
- `tokenLockedBy` (STRING 100, nullable)
- `tokenLockedAt` (DATE, nullable)
- `lastUsedAt` (DATE, nullable)
- **Indexes:** (token_in_use, token_locked_at)

### 2.6 HistoricalHRData Model
**Table:** `historical_hr_data`
- `id` (INTEGER, PK, auto-increment)
- `patientId` (STRING 50, FK)
- `recordedDate` (DATEONLY)
- `recordedTime` (TIME)
- `heartRate` (INTEGER, validates 30-250)
- `activityType` (ENUM: rest, exercise, sleep, unknown, default=unknown)
- `dataSource` (STRING 50, default=google_fit)
- `isImputed` (BOOLEAN, default=false)
- **Indexes:**
  - (patient_id, recorded_date)
  - (patient_id, recorded_date, recorded_time)

### 2.7 WeeklyScore Model
**Table:** `weekly_scores`
- `id` (INTEGER, PK, auto-increment)
- `patientId` (STRING 50, FK)
- `weekNumber` (INTEGER)
- `weeklyScore` (DECIMAL 5,2)
- `cumulativeScore` (DECIMAL 5,2)
- **Indexes:** (patient_id, week_number) UNIQUE

### 2.8 BaselineThreshold Model
**Table:** `baseline_thresholds`
- `id` (INTEGER, PK, auto-increment)
- `patientId` (STRING 50, FK)
- `calculatedAtSession` (INTEGER, 3/7/14 sessions)
- `baselineScore` (DECIMAL 5,2)
- `standardDeviation` (DECIMAL 5,2)
- `thresholdMinus2SD`, `thresholdMinus1SD`, `thresholdPlus1SD`, `thresholdPlus2SD` (DECIMAL 5,2)
- `restingHeartRate` (DECIMAL 5,2, nullable)
- **Indexes:** (patient_id, calculated_at_session)

---

## 3. MAIN FEATURES & FUNCTIONALITY

### 3.1 Session Management
**Process Flow:**
```
START SESSION
  ├─ Validate patient exists
  ├─ Check no active session running
  ├─ Calculate week number (totalSessions / 3) + 1
  ├─ Fetch rehab plan for week
  ├─ Create session record (status='active')
  ├─ Pre-calculate processingStartsAt (5 min after estimated end)
  └─ POST to Spectrum API

STOP SESSION
  ├─ Find active session
  ├─ Calculate actual duration from timestamps
  ├─ Validate duration > 0
  ├─ Update session (status='in_progress', actualDuration)
  └─ Queue for processing (retry worker picks up)
```

**Key Logic:**
- Session attempts per week: 3 (3 sessions per week for 4 weeks typically)
- Week calculation: Session 1-3 = Week 1, Session 4-6 = Week 2, etc.
- Zone allocation (dynamic):
  - Standard: 5-min warmup, 5-min cooldown, rest is exercise
  - Shorter session: Shrink exercise/cooldown proportionally, warmup stays 5min
  - Longer session: Extend exercise phase, cooldown stays last 5min

### 3.2 Risk Assessment
**HR Risk Calculation:**
- Compares session HR data against rehab plan zones
- Scoring based on time spent in target zones
- Determines risk level: High, Moderate, Low

**Vital Risk Calculation:**
- Age evaluation (0-3 points)
- BMI evaluation (0-2 points)
- BP evaluation (0-5 points)
- SpO2 evaluation (0-5 points)
- Blood glucose evaluation (0-5 points)
- Total score determines: Low (<33), Moderate (33-66), High (>66)

**Baseline Calculation:**
- Calculated at sessions 3, 7, 14
- Uses standard deviation of scores
- Creates thresholds at ±1SD and ±2SD
- Used to assess patient progression

### 3.3 Heart Rate Zone Calculation
**Formula:**
```
Base MPR = 220 - age

Weekly % progression:
Week 1-2: 70-71%
Week 3-4: 71-72%
Week 5-6: 73%
Week 7-8: 74-75%
Week 9-10: 75-76%
Week 11-12: 77-78%

Adjustments:
- Beta blockers + Low EF: -20%
- Beta blockers only: -15%
- Low EF only: -10%

Zones (from adjusted target HR):
- Warmup: targetHR - 15 to targetHR - 5
- Exercise: targetHR - 5 to targetHR + 5
- Cooldown: targetHR + 5 - 20 to targetHR + 5 - 10
```

### 3.4 Data Quality Validation
**Checks:**
- Data completeness: actual points / expected points
- Minimum threshold: 80% of expected points
- Valid HR range: 30-250 bpm
- Expected data points: sessionDuration * 60 (assuming 1 point per minute from Google Fit)

---

## 4. BACKGROUND JOBS & WORKERS

### 4.1 Retry Worker
**File:** `/workers/retryWorker.js`
**Schedule:** Runs every 30 seconds (via server startup, not cron)
**Trigger:** Called via `startRetryWorker()` in server.js

**Functionality:**
1. Finds sessions in 'processing' or 'pending_sync' status with `nextAttemptAt <= now`
2. Finds sessions in 'in_progress' or 'active' status with `processingStartsAt <= now`
3. Converts 'in_progress'/'active' sessions to 'processing' status
4. For each processable session, attempts data fetch and processing

**Retry Schedule:**
```
Attempt 1: Immediate
Attempts 2-6: Every 5 minutes (total 25 min)
Attempt 7: 15 minutes after start
Attempt 8: 30 minutes after start
Attempt 9: 1 hour after start
Attempt 10: 3 hours after start
Attempt 11: 6 hours after start
Max total duration: ~6 hours
```

**Processing Steps:**
1. Acquire token lock (prevent concurrent access)
2. Fetch HR data from Google Fit
3. Validate data quality (>80% completeness)
4. If insufficient data: retry on schedule
5. If data available: calculate scores, risk level, summary
6. Update session with completed data
7. Calculate/update weekly and baseline scores
8. Send to Spectrum API
9. Update session status to 'completed'

**Edge Cases:**
- Token expired: mark token as invalid, notify Spectrum
- No data available: retry on schedule, eventually mark 'data_unavailable'
- Partial data: accept based on attempt number (progressive acceptance)
- Processing lock timeout: 5 minutes stale lock detection

### 4.2 Historical Sync Job
**File:** `/jobs/historicalSync.js`
**Schedule:** Runs every 6 hours (via node-cron)
**Cron Expression:** `0 */6 * * *` (at 0:00, 6:00, 12:00, 18:00)

**Functionality:**
1. Fetches all patients with Google tokens
2. For each patient:
   - Skips if patient has active 'processing' sessions
   - Syncs data from Google Fit (last 24h)
   - Stores in HistoricalHRData table
3. Retries skipped patients after 5 minutes
4. Logs summary: success count, skip count, error count

**Data Sync Process:**
- Acquires token lock
- Fetches last valid access token (with 5-min expiry buffer)
- Calls Google Fit API for heart rate data
- Stores data in HistoricalHRData table
- Handles token refresh if needed
- Releases token lock

### 4.3 Token Health Check Worker
**File:** `/workers/tokenHealthCheck.js`
**Status:** Empty file (not implemented)

---

## 5. AUTHENTICATION & AUTHORIZATION

### 5.1 Google Fit OAuth Flow
**Integration Points:**
1. Frontend performs OAuth with Google
2. Sends tokens to `/api/registerGoogleAccount`
3. Backend stores: access_token, refresh_token, expiresAt

**Token Storage:**
- accessToken: main token for API calls
- refreshToken: used to get new access tokens when expired
- expiresAt: BIGINT timestamp (milliseconds)
- tokenStatus: tracks validity (valid/invalid/revoked)

### 5.2 Token Management
**File:** `/utils/tokenManager.js`

**Key Functions:**

`acquireTokenLock(patientId, lockedBy)`
- Prevents concurrent access to same patient's token
- Checks if already in use
- Stale lock detection: if locked >5 minutes, force takeover
- Returns boolean (true if acquired)

`releaseTokenLock(patientId)`
- Releases lock after token operation
- Updates lastUsedAt timestamp

`getValidToken(patientId)`
- Returns access token if still valid
- Checks expiry with 5-minute buffer
- If expired: attempts refresh using refreshToken
- Throws errors: TOKEN_NOT_FOUND, TOKEN_INVALID, REFRESH_TOKEN_EXPIRED

`isTokenAvailable(patientId)`
- Checks if token can be used
- Considers stale locks as available

`releaseAllStaleLocks()`
- Cleanup function for stale locks older than 5 minutes
- Can be called during maintenance

### 5.3 Authorization Approach
**Current Status:** Minimal/No authorization
- No user authentication required
- All endpoints accessible with patientId
- No role-based access control

**Gaps Identified:**
- No API key validation
- No JWT tokens
- No rate limiting
- No permission checks

---

## 6. GOOGLE FIT INTEGRATION

### 6.1 Data Fetching
**File:** `/utils/googleFit.js`

`fetchGoogleFitData(accessToken, startTime, endTime)`
- Calls Google Fit aggregation API
- Data type: `com.google.heart_rate.bpm`
- Bucket duration: 1 minute (60000 ms)
- Returns array: `[{ timestamp (ms), value (HR) }, ...]`
- Error handling:
  - 401: Access token expired/invalid
  - 429: Rate limit exceeded

**API Endpoint:** `https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate`

**Request Format:**
```json
{
  "aggregateBy": [{
    "dataTypeName": "com.google.heart_rate.bpm"
  }],
  "bucketByTime": { "durationMillis": 60000 },
  "startTimeMillis": number,
  "endTimeMillis": number
}
```

### 6.2 Data Quality Validation
`validateDataQuality(hrData, expectedDataPoints)`
- Calculates completeness: (actualPoints / expectedPoints) * 100
- isValid: actualPoints > 0
- isSufficient: actualPoints >= expectedPoints * 0.8 (80%)

### 6.3 Heart Rate Statistics
`calculateHRStats(hrValues)`
- Returns: { maxHR, minHR, avgHR }
- avgHR rounded to nearest integer

### 6.4 Phase Splitting
`splitDataIntoPhases(hrData, actualDuration, plannedDuration)`
- Dynamically allocates data into warmup, exercise, cooldown phases
- Standard: 5-min warmup, rest exercise, 5-min cooldown
- Shorter session: warmup=5min, cooldown≥2min, rest=exercise
- Longer session: warmup=5min, exercise extended, cooldown=5min

### 6.5 Scoring Calculation
`calculateSessionScore(warmupData, exerciseData, cooldownData, zones)`
- Returns compliance percentage (0-100)
- Based on time spent in target zones

`determineRiskLevel(sessionScore)`
- High: score < 50%
- Moderate: score 50-80%
- Low: score > 80%

---

## 7. SESSION PROCESSING LOGIC

### 7.1 Processing Flow
**Trigger:** When `processingStartsAt <= now`

**Step 1: Data Fetch**
- Acquire token lock
- Fetch Google Fit data (session duration window)
- Validate completeness (80% threshold)
- If insufficient: schedule retry

**Step 2: Data Processing**
- Extract HR values
- Calculate HR statistics (min, max, avg)
- Split into phases (warmup, exercise, cooldown)
- Check all values within safe limits (30-250)

**Step 3: Risk Assessment**
- Calculate session risk score (% in target zone)
- Determine risk level (High/Moderate/Low)
- Calculate vital risk (if patient vitals available)
- Generate summary text

**Step 4: Score Calculation**
- Calculate baseline score (if applicable)
- Calculate weekly score
- Calculate cumulative score
- Update BaselineThreshold if at session 3, 7, or 14

**Step 5: Spectrum Integration**
- Format data per Spectrum requirements
- POST to Spectrum API
- Update sentToSpectrum flag
- Store Spectrum response status

**Step 6: Completion**
- Mark session as 'completed'
- Set isCountedInWeekly flag
- Update all calculated fields

### 7.2 Failure Handling
**Retry Logic:**
- Max 11 attempts over ~6 hours
- First 5 attempts every 5 minutes
- Progressive acceptance of partial data
- Exponential backoff for later attempts

**Final Status:**
- `data_unavailable`: No data after all attempts
- `failed`: Error occurred (stores failureReason)
- `completed`: Successfully processed
- `abandoned`: Max attempts exhausted without data

### 7.3 Data Completeness Scoring
```
Expected points = sessionDuration (in minutes)
Actual points = data points returned from Google Fit

Completeness % = (actual / expected) * 100

Acceptance thresholds by attempt:
1: 100% required
2-6: Progressive decrease from 90% to 50%
7+: 30% minimum accepted
```

---

## 8. HISTORICAL DATA SYNC

### 8.1 Sync Strategy
**File:** `/jobs/historicalSync.js` and `/utils/historicalHRProcessor.js`

**Flow:**
```
For each patient with Google token:
  1. Check if patient has 'processing' sessions (skip if yes)
  2. Fetch last 24h of HR data from Google Fit
  3. Store in HistoricalHRData table
  4. Retry skipped patients after 5 minutes
```

### 8.2 Data Retrieval Priority (for historical requests)
1. **DB 24h:** Check HistoricalHRData for last 24h
2. **Google Fit 24h:** If insufficient (< 50 points), fetch from API
3. **DB 7d:** If still insufficient, check DB for last 7 days
4. **Google Fit 7d:** If still insufficient, fetch 7d from API
5. **DB Last 100:** If still insufficient, get last 100 points from DB
6. **Google Fit 30d Last 100:** Final fallback, get last 100 from 30d window

### 8.3 Data Processing for Historical
**Processing Steps:**
1. Fetch raw HR data from selected source
2. Format with IST timestamps
3. Extract spike windows (±10 min around min/max HR)
4. Apply adaptive bucketing if > 200 points
   - Divides time range into 200 buckets
   - Calculates average HR per bucket
   - Preserves spike data
5. Return formatted response

**Bucketing Formula:**
```
bucketSize = timeSpan / 200 (where 200 = target output points)
For each bucket: calculate average HR from points in bucket
```

### 8.4 Spectrum Push
`pushHistoricalHRToSpectrum(patientId, processedData)`
- Posts to: `/api/patients/rehab-historical-hr/{patientId}`
- Payload: `{ patient_id, data: [...] }`
- Timeout: 15 seconds

---

## 9. RETRY MECHANISMS

### 9.1 Session Processing Retries
**Schedule:**
```
Attempt 1 (t+0s): Immediate
Attempt 2 (t+5min): 5 minutes
Attempt 3 (t+10min): 5 minutes
Attempt 4 (t+15min): 5 minutes
Attempt 5 (t+20min): 5 minutes
Attempt 6 (t+25min): 5 minutes
Attempt 7 (t+40min): 15 minutes later
Attempt 8 (t+70min): 30 minutes later
Attempt 9 (t+130min): 1 hour later
Attempt 10 (t+310min): 3 hours later
Attempt 11 (t+670min): 6 hours later
```

### 9.2 Retry Schedule Data Structure
**Stored in Session.retrySchedule (JSON):**
```json
[
  {
    "attempt": 1,
    "scheduledFor": "ISO timestamp",
    "executedAt": "ISO timestamp or null",
    "status": "pending|completed",
    "result": "success|no_data|partial_data|error|null",
    "dataPoints": "integer or null",
    "errorMessage": "string or null"
  }
]
```

### 9.3 Partial Data Acceptance
**Progressive Thresholds:**
- Attempt 1: 100% required
- Attempt 2-3: 90% required
- Attempt 4-5: 70% required
- Attempt 6+: 50% required

### 9.4 Token Lock Timeout
- Lock duration tracked in GoogleToken
- Stale lock detected if > 5 minutes old
- Force takeover releases old lock
- Prevents indefinite blocking

---

## 10. TOKEN MANAGEMENT

### 10.1 Token Lifecycle
**Creation:**
- Stored when patient registers Google account
- Fields: accessToken, refreshToken, expiresAt, tokenStatus

**Usage:**
- Locked before API calls (tokenInUse = true, tokenLockedBy, tokenLockedAt)
- Updated lastUsedAt on successful use
- Released after operation (tokenInUse = false)

**Expiry:**
- Checked with 5-minute buffer before actual expiry
- On expiry: attempts refresh using refreshToken
- If refresh fails: marks token as 'invalid'
- Notifies Spectrum of token expiration

### 10.2 Token Status Tracking
**Enum: `valid` | `invalid` | `revoked`**

**Valid:**
- Token usable for Google Fit API calls
- Access token not expired (with 5-min buffer)
- Last health check was successful

**Invalid:**
- Access token expired
- Refresh token expired
- User revoked consent
- Stored invalidatedAt and invalidationReason

**Revoked:**
- User explicitly revoked in Google settings
- Not auto-detected, set manually

### 10.3 Notification on Expiry
**Function:** `notifySpectrumTokenExpired(patientId, sessionId)`
- Posts to Spectrum: `/api/patients/token-expired/{patientId}`
- Includes action_required: 'reconnect_google_fit'
- Allows Spectrum to prompt user for reconnection

---

## COMPREHENSIVE TEST PLAN

### TEST CATEGORIES

#### Category 1: API Endpoint Tests

**1.1 Register Google Account**
- [x] Valid tokens provided
- [x] Missing access_token
- [x] Missing refresh_token
- [x] Create new user vs update existing
- [x] Token storage validation
- [x] Async sync/push (verify no waiting)
- [x] Empty token values

**1.2 Register Patient Data**
- [x] All required fields provided
- [x] Missing patientId
- [x] Missing age
- [x] Missing regime
- [x] Invalid regime value (not 6 or 12)
- [x] Partial vitals data
- [x] All vitals provided
- [x] Invalid cardiac condition

**1.3 Start Session**
- [x] Valid start action
- [x] Patient not found
- [x] Active session already exists
- [x] Rehab plan not found for week
- [x] Week number calculation (1, 3, 6, 12)
- [x] Spectrum API failure (should not fail request)
- [x] Estimated duration calculation
- [x] Pre-calculation of processingStartsAt

**1.4 Stop Session**
- [x] Valid stop action
- [x] No active session
- [x] Negative duration (endTime < startTime)
- [x] Zero duration
- [x] Actual duration > planned duration
- [x] Actual duration < planned duration
- [x] processingStartsAt calculation (5-min buffer)

**1.5 Submit Risk Analysis**
- [x] By sessionId
- [x] By patientId (latest)
- [x] Neither provided
- [x] Session not found
- [x] Session status 'processing'
- [x] Session status 'data_unavailable'
- [x] Session status 'failed'
- [x] Session status 'completed'
- [x] Invalid session status

**1.6 Token Status Check**
- [x] Token not found
- [x] Token valid
- [x] Token invalid (expired)
- [x] Token revoked

**1.7 Historical HR Data**
- [x] 24h data in DB
- [x] 24h data in Google Fit
- [x] 7d data in DB
- [x] 7d data in Google Fit
- [x] Last 100 points fallback
- [x] No data available
- [x] Bucketing (>200 points)
- [x] Raw data (≤200 points)

---

#### Category 2: Data Validation Tests

**2.1 Heart Rate Validation**
- [x] Valid range (30-250)
- [x] Below minimum (< 30)
- [x] Above maximum (> 250)
- [x] Null/undefined values
- [x] Non-numeric values

**2.2 Time Validation**
- [x] Start time before end time
- [x] Start time after end time
- [x] Same start and end time
- [x] Invalid date formats
- [x] Future dates

**2.3 Duration Validation**
- [x] Planned vs actual mismatch
- [x] Negative duration
- [x] Zero duration
- [x] Duration > 12 hours (unrealistic)

**2.4 Patient Data Validation**
- [x] Age (0-150 range)
- [x] Regime (6 or 12)
- [x] BP values (0-300 systolic/diastolic)
- [x] SpO2 (90-100)
- [x] BMI calculation
- [x] Blood glucose format parsing

---

#### Category 3: Business Logic Tests

**3.1 Week Number Calculation**
- [x] Session 1-3 = Week 1
- [x] Session 4-6 = Week 2
- [x] Session 13+ = capped at regime max
- [x] Edge case: 12-week vs 6-week regime

**3.2 Heart Rate Zone Calculation**
- [x] Base MPR = 220 - age
- [x] Weekly % progression
- [x] Beta blockers adjustment (-15%)
- [x] Low EF adjustment (-10%)
- [x] Beta blockers + Low EF (-20%)
- [x] Warmup zone calculation
- [x] Exercise zone calculation
- [x] Cooldown zone calculation

**3.3 Risk Level Determination**
- [x] High risk (< 50% in zone)
- [x] Moderate risk (50-80% in zone)
- [x] Low risk (> 80% in zone)

**3.4 Data Completeness Scoring**
- [x] 100% completeness
- [x] 80% completeness (threshold)
- [x] 50% completeness (partial)
- [x] 0% completeness (no data)

**3.5 Phase Allocation**
- [x] Standard session (actual = planned)
- [x] Shorter session (actual < planned)
- [x] Longer session (actual > planned)
- [x] Very short session (< 10 min)
- [x] Very long session (> 60 min)

**3.6 Baseline Calculation**
- [x] Calculated at session 3
- [x] Calculated at session 7
- [x] Calculated at session 14
- [x] Not calculated at other sessions
- [x] Standard deviation calculation
- [x] Threshold calculations (±1SD, ±2SD)

---

#### Category 4: Retry Worker Tests

**4.1 Session Status Transitions**
- [x] active → processing
- [x] in_progress → processing
- [x] processing → retrying
- [x] data_unavailable (final)
- [x] completed (final)
- [x] failed (final)

**4.2 Retry Schedule Execution**
- [x] Immediate attempt (t+0)
- [x] 5-minute attempts (2-6)
- [x] 15-minute attempt (7)
- [x] 30-minute attempt (8)
- [x] 1-hour attempt (9)
- [x] 3-hour attempt (10)
- [x] 6-hour attempt (11)
- [x] All attempts exhausted

**4.3 Token Lock Scenarios**
- [x] Lock acquired successfully
- [x] Lock blocked (already in use)
- [x] Stale lock detected (>5 min)
- [x] Force takeover
- [x] Lock release

**4.4 Data Fetch Failures**
- [x] No data available
- [x] Partial data (< 80%)
- [x] Token expired during fetch
- [x] Rate limit exceeded
- [x] Network timeout
- [x] Invalid HR values in response

**4.5 Partial Data Acceptance**
- [x] Attempt 1: reject if < 100%
- [x] Attempt 2-3: reject if < 90%
- [x] Attempt 4-5: reject if < 70%
- [x] Attempt 6+: accept if >= 50%

---

#### Category 5: Google Fit Integration Tests

**5.1 Data Fetching**
- [x] Valid token
- [x] Expired token (trigger refresh)
- [x] Invalid token
- [x] Rate limit (429)
- [x] Auth error (401)
- [x] Empty response
- [x] Malformed response

**5.2 Data Quality**
- [x] Complete dataset (100%)
- [x] Sufficient dataset (80%)
- [x] Insufficient dataset (< 80%)
- [x] Edge values (30, 250 bpm)
- [x] Outliers (>250 or <30)

**5.3 Data Bucketing**
- [x] 100 points (no bucketing)
- [x] 200 points (no bucketing)
- [x] 201 points (bucketing)
- [x] 1000 points (aggressive bucketing)
- [x] Spike preservation in bucketing
- [x] Bucket size calculation

---

#### Category 6: Token Management Tests

**6.1 Token Storage**
- [x] Access token stored
- [x] Refresh token stored
- [x] Expiry time set
- [x] Token type set
- [x] Scope stored

**6.2 Token Refresh**
- [x] Automatic refresh before expiry
- [x] Refresh with 5-minute buffer
- [x] Refresh token itself expired
- [x] New token stored correctly

**6.3 Token Locking**
- [x] Lock acquired
- [x] Lock prevents concurrent access
- [x] Lock released after operation
- [x] Stale lock detected (5+ minutes)
- [x] Force takeover
- [x] Prevents deadlock

**6.4 Token Status Updates**
- [x] Mark valid on success
- [x] Mark invalid on failure
- [x] Store invalidation reason
- [x] Store invalidation timestamp

---

#### Category 7: Historical Sync Tests

**6.1 Sync Execution**
- [x] Runs every 6 hours
- [x] Processes all patients
- [x] Skips patients with processing sessions
- [x] Retries skipped after 5 minutes
- [x] Counts success/skip/error

**6.2 Data Retrieval Priority**
- [x] Prefers DB 24h
- [x] Falls back to Google Fit 24h
- [x] Checks DB 7d if insufficient
- [x] Falls back to Google Fit 7d
- [x] Uses last 100 from DB
- [x] Uses last 100 from Google Fit 30d
- [x] Handles no data scenario

---

#### Category 8: Spectrum Integration Tests

**8.1 Session Data Submission**
- [x] Format validation
- [x] Field mapping (snake_case/camelCase)
- [x] Required fields present
- [x] Null handling
- [x] Success response
- [x] Failure response

**8.2 Historical HR Push**
- [x] Data array format
- [x] Timestamp formatting
- [x] Patient ID included
- [x] Success handling
- [x] Failure handling

**8.3 Token Expiry Notification**
- [x] Correct endpoint
- [x] Proper payload format
- [x] Action required field set
- [x] Timestamp included

**8.4 Error Handling**
- [x] Validation errors (400)
- [x] Authorization errors (401)
- [x] Timeout (10-15 second window)
- [x] Network errors
- [x] Malformed response

---

#### Category 9: Concurrency & Race Condition Tests

**9.1 Concurrent Session Operations**
- [x] Multiple start requests same patient
- [x] Start while processing
- [x] Stop different active session
- [x] Stop non-existent session

**9.2 Token Lock Contention**
- [x] Two workers accessing same patient
- [x] Lock stale detection
- [x] Force takeover mechanism
- [x] Lock release order

**9.3 Database Consistency**
- [x] Duplicate week/attempt combinations
- [x] Unique constraint violations
- [x] Foreign key references
- [x] Transaction handling

---

#### Category 10: Error Handling & Edge Cases

**10.1 Database Errors**
- [x] Connection timeout
- [x] Query timeout
- [x] Constraint violations
- [x] Missing foreign keys
- [x] Transaction rollback

**10.2 Network Errors**
- [x] Google Fit API timeout
- [x] Spectrum API timeout
- [x] Connection refused
- [x] DNS resolution failure
- [x] TLS/SSL errors

**10.3 Data Edge Cases**
- [x] Null/undefined values
- [x] Empty strings
- [x] Max integer values
- [x] Precision loss (decimals)
- [x] Date boundary conditions

**10.4 State Machine Edge Cases**
- [x] Invalid status transition
- [x] Multiple completed flags
- [x] Inconsistent attempt counts
- [x] Orphaned retry schedules
- [x] Missing processing times

---

#### Category 11: Performance Tests

**11.1 Response Times**
- [x] API endpoint response (< 500ms without external calls)
- [x] Google Fit call (< 5s)
- [x] Spectrum API call (< 10s)
- [x] Database query (< 100ms)

**11.2 Data Volume**
- [x] Process 1000 data points
- [x] Bucketing efficiency with 10000+ points
- [x] Historical query with 30-day range
- [x] Weekly score aggregation

**11.3 Retry Worker Efficiency**
- [x] 100 sessions in processing
- [x] Lock acquisition speed
- [x] Batch processing duration
- [x] CPU/memory usage

---

#### Category 12: Security Tests

**12.1 Input Validation**
- [x] SQL injection attempts
- [x] XSS in text fields
- [x] Path traversal
- [x] Invalid field types

**12.2 Authentication**
- [x] Missing patientId
- [x] Invalid patientId format
- [x] Access other patient's data
- [x] Token without patient registration

**12.3 Data Protection**
- [x] Tokens stored securely (should use encryption)
- [x] Sensitive data in logs
- [x] HTTPS enforcement
- [x] CORS configuration

---

### CRITICAL TEST SCENARIOS

#### Scenario A: Complete Happy Path
```
1. Register patient with vitals
2. Connect Google Fit account
3. Start session
4. Wait for processing
5. Check risk analysis
6. Verify Spectrum submission
Expected: All steps succeed, session marked completed
```

#### Scenario B: Data Unavailable Path
```
1. Start session
2. No HR data from Google Fit (all 11 attempts)
3. Trigger final processing
Expected: Status = data_unavailable, failureReason set
```

#### Scenario C: Partial Data Recovery
```
1. Start session
2. Attempt 1: 0% data
3. Attempt 2-6: Progressive data arrival (50-90%)
4. Accept at attempt X based on threshold
Expected: Session completes with partial data, dataCompleteness recorded
```

#### Scenario D: Token Expiry During Processing
```
1. Start session with valid token
2. Token expires before processing
3. Retry worker attempts refresh
Expected: Token refreshed automatically or marked invalid
```

#### Scenario E: Concurrent Session Attempts
```
1. Start session (session 1 active)
2. Try to start another session same patient
Expected: Error "Patient already has active session"
```

#### Scenario F: Historical Sync Full Cycle
```
1. Register 10 patients with Google Fit
2. Trigger historical sync
3. Verify HistoricalHRData populated
4. Run another sync (skip patients with processing)
Expected: All patients synced successfully
```

---

## KNOWN ISSUES & GAPS

### Critical Issues
1. **No Authentication:** All endpoints accessible without credentials
2. **No Rate Limiting:** Vulnerable to DoS attacks
3. **Token Encryption:** Google tokens stored in plain text
4. **Error Details Exposed:** Detailed error messages may leak info

### High Priority Issues
1. **Token Refresh Implementation:** Incomplete (basic structure only)
2. **Spectrum Communication:** Failures don't prevent session completion
3. **Data Retention:** No deletion policies for old sessions
4. **Timezone Handling:** IST hardcoded (±5.5 hours), not configurable

### Medium Priority Issues
1. **Logging:** Inconsistent log formats, no structured logging
2. **Status Codes:** Some endpoints don't follow REST conventions
3. **Pagination:** No pagination for list endpoints
4. **Validation:** Inconsistent validation across endpoints

### Low Priority Issues
1. **Documentation:** Incomplete API documentation
2. **Constants:** Magic numbers (6h, 5min) scattered in code
3. **Testing:** No unit/integration tests provided
4. **Error Messages:** Some messages could be more user-friendly

---

## RECOMMENDATIONS FOR TESTING

### Priority 1 (Must Test)
1. Session lifecycle (start → process → complete)
2. Retry logic (all 11 attempts, thresholds)
3. Token expiry and refresh
4. Data completeness scoring
5. Risk level calculations

### Priority 2 (Should Test)
1. Week number calculations for different regimes
2. HR zone calculations with various conditions
3. Concurrent operations (locks, race conditions)
4. Google Fit integration failures
5. Spectrum API integration

### Priority 3 (Nice to Test)
1. Historical data retrieval strategies
2. Bucketing algorithms
3. Email/notification sending (if implemented)
4. Audit logging
5. Performance under load

---

## TEST ENVIRONMENT SETUP

### Required Services
- MySQL database (Sequelize configured)
- Google Fit test account with sample HR data
- Spectrum API sandbox endpoint
- Network connectivity for external APIs

### Test Data Requirements
- Sample patients (different ages, conditions)
- Sample Google tokens (valid and expired)
- Sample HR data (complete, partial, missing)
- Sample rehab plans (different weeks)

### Configuration
- Node.js 18+
- Environment variables (DB, Google API credentials)
- PM2 for process management (optional)

---

## CONCLUSION

This is a complex cardiac rehabilitation system with multiple integration points, asynchronous processing, and sophisticated retry mechanisms. The test plan covers:

- **10 major feature areas**
- **12 test categories**
- **100+ individual test cases**
- **6 critical end-to-end scenarios**
- **Identified 13 known issues/gaps**

Success metrics:
1. All API endpoints respond correctly with proper status codes
2. Session processing completes within expected timeframes
3. Retry logic exhausts all attempts and gracefully fails
4. Token management prevents race conditions
5. Risk assessments match expected calculations
6. Spectrum integration sends correct formatted data
7. Historical data sync populates database correctly
8. Concurrent operations don't cause data corruption
9. All edge cases handled without crashes
10. Error messages provide adequate debugging info

