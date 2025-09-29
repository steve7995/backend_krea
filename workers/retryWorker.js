import { Session } from '../models/index.js';
import { Op } from 'sequelize';
import { shouldAttemptNow } from '../utils/scheduleHelper.js';

// Import the session processor from session controller
// We'll need to export processSessionAttempt separately, but for now we'll duplicate the logic

import { User, GoogleToken, HistoricalHRData, WeeklyScore } from '../models/index.js';
import { calculateHeartRateZones } from '../utils/calculations.js';
import { 
  updateRetryScheduleItem,
  getNextPendingAttempt,
  calculateNextAttemptTime 
} from '../utils/scheduleHelper.js';
import { acquireTokenLock, releaseTokenLock, getValidToken } from '../utils/tokenManager.js';
import { 
  fetchGoogleFitData, 
  validateDataQuality,
  calculateSessionScore,
  determineRiskLevel,
  calculateHRStats,
  formatHRDataForStorage,
  extractHRValues
} from '../utils/googleFit.js';
import { generateSessionSummary } from '../utils/calculations.js';

// ========================================
// RETRY WORKER - Main Function
// ========================================
export const runRetryWorker = async () => {
  try {
    console.log('[RetryWorker] Starting retry check...');
    
    // Find all sessions that need processing
    const now = new Date();
    const sessionsToProcess = await Session.findAll({
      where: {
        status: 'processing',
        nextAttemptAt: {
          [Op.lte]: now // Next attempt time is now or in the past
        }
      },
      order: [['nextAttemptAt', 'ASC']] // Process oldest first
    });
    
    if (sessionsToProcess.length === 0) {
      console.log('[RetryWorker] No sessions to process');
      return;
    }
    
    console.log(`[RetryWorker] Found ${sessionsToProcess.length} sessions to process`);
    
    // Process each session
    for (const session of sessionsToProcess) {
      // Double-check with grace period
      if (shouldAttemptNow(session.nextAttemptAt)) {
        console.log(`[RetryWorker] Processing session ${session.id}`);
        
        // Process in background (don't await to process multiple sessions in parallel)
        processSessionAttempt(session.id).catch(error => {
          console.error(`[RetryWorker] Error processing session ${session.id}:`, error);
        });
      }
    }
    
    console.log('[RetryWorker] Retry check completed');
    
  } catch (error) {
    console.error('[RetryWorker] Error in retry worker:', error);
  }
};

// ========================================
// PROCESS SESSION ATTEMPT
// ========================================
const processSessionAttempt = async (sessionId) => {
  let session = null;
  let lockAcquired = false;
  
  try {
    // 1. Get session
    session = await Session.findByPk(sessionId);
    if (!session) {
      console.error(`[ProcessSession] Session ${sessionId} not found`);
      return;
    }
    
    const attemptNumber = session.attemptCount + 1;
    console.log(`[ProcessSession] Session ${sessionId} - Attempt #${attemptNumber}`);
    
    // 2. Try to acquire token lock
    const lockedBy = `session_${sessionId}`;
    lockAcquired = await acquireTokenLock(session.patientId, lockedBy);
    
    if (!lockAcquired) {
      console.log(`[ProcessSession] Session ${sessionId} - Could not acquire token lock, will retry later`);
      // Don't update attempt count, just skip this cycle
      return;
    }
    
    // 3. Get user and zones
    const user = await User.findByPk(session.patientId);
    const zones = calculateHeartRateZones(user.age, user.betaBlockers, user.lowEF, session.weekNumber);
    
    // 4. Get valid token (refreshes if needed)
    const accessToken = await getValidToken(session.patientId);
    
    // 5. Calculate time range for data fetch
    const sessionStartTime = new Date(`${session.sessionDate}T${session.sessionStartTime}`);
    const sessionEndTime = new Date(sessionStartTime.getTime() + zones.sessionDuration * 60 * 1000);
    
    // 6. Fetch HR data from Google Fit
    console.log(`[ProcessSession] Session ${sessionId} - Fetching data from Google Fit...`);
    const hrData = await fetchGoogleFitData(accessToken, sessionStartTime, sessionEndTime);
    
    // 7. Validate data quality
    const dataValidation = validateDataQuality(hrData, zones.sessionDuration);
    console.log(`[ProcessSession] Session ${sessionId} - Data completeness: ${dataValidation.completeness}%`);
    
    // 8. Check if data is sufficient
    if (!dataValidation.isSufficient) {
      console.log(`[ProcessSession] Session ${sessionId} - Insufficient data (${dataValidation.actualDataPoints}/${dataValidation.expectedDataPoints})`);
      
      // Update retry schedule and schedule next attempt
      await scheduleNextAttempt(session, attemptNumber, {
        result: 'insufficient_data',
        dataPoints: dataValidation.actualDataPoints,
        errorMessage: `Only ${dataValidation.completeness}% data available`
      });
      
      return;
    }
    
    // 9. Data is sufficient! Process it
    console.log(`[ProcessSession] Session ${sessionId} - Processing data...`);
    
    // Store raw HR data in HistoricalHRData table
    const hrRecords = formatHRDataForStorage(hrData, session.patientId, session.sessionDate);
    await HistoricalHRData.bulkCreate(hrRecords, { ignoreDuplicates: true });
    
    // Calculate scores
    const scores = calculateSessionScore(hrData, zones, zones.sessionDuration);
    const sessionRiskScore = scores.overallScore;
    const riskLevel = determineRiskLevel(sessionRiskScore);
    
    // Calculate HR statistics
    const hrValues = extractHRValues(hrData);
    const hrStats = calculateHRStats(hrValues);
    
    // Generate summary
    const summary = generateSessionSummary(riskLevel, sessionRiskScore, zones, hrStats);
    
    // Update retry schedule with success
    const updatedSchedule = updateRetryScheduleItem(session.retrySchedule, attemptNumber, {
      result: 'success',
      dataPoints: dataValidation.actualDataPoints
    });
    
    // 10. Update session as completed
    await session.update({
      sessionDuration: `${zones.sessionDuration} mins`,
      sessionRiskScore,
      riskLevel,
      maxHR: hrStats.maxHR,
      minHR: hrStats.minHR,
      avgHR: hrStats.avgHR,
      status: 'completed',
      summary,
      attemptCount: attemptNumber,
      retrySchedule: updatedSchedule,
      lastAttemptAt: new Date()
    });
    
    // 11. Update weekly scores
    await updateWeeklyScores(session.patientId, session.weekNumber);
    
    console.log(`[ProcessSession] Session ${sessionId} - ✓ Completed successfully!`);
    
  } catch (error) {
    console.error(`[ProcessSession] Session ${sessionId} - Error:`, error);
    
    // Update retry schedule with error
    if (session) {
      const attemptNumber = session.attemptCount + 1;
      await scheduleNextAttempt(session, attemptNumber, {
        result: 'error',
        dataPoints: 0,
        errorMessage: error.message
      });
    }
    
  } finally {
    // Always release lock
    if (lockAcquired && session) {
      await releaseTokenLock(session.patientId);
    }
  }
};

// ========================================
// SCHEDULE NEXT ATTEMPT
// ========================================
const scheduleNextAttempt = async (session, attemptNumber, result) => {
  try {
    // Update retry schedule with this attempt's result
    const updatedSchedule = updateRetryScheduleItem(session.retrySchedule, attemptNumber, result);
    
    // Check if there are more attempts
    const nextPending = getNextPendingAttempt(updatedSchedule);
    
    if (!nextPending) {
      // No more attempts - mark as failed
      await session.update({
        status: 'data_unavailable',
        attemptCount: attemptNumber,
        retrySchedule: updatedSchedule,
        lastAttemptAt: new Date(),
        failureReason: 'All retry attempts exhausted without sufficient data'
      });
      console.log(`[ScheduleNext] Session ${session.id} - All attempts exhausted`);
      return;
    }
    
    // Schedule next attempt
    const sessionStartDateTime = new Date(`${session.sessionDate}T${session.sessionStartTime}`);
    const nextAttemptTime = calculateNextAttemptTime(sessionStartDateTime, nextPending.attempt);
    
    await session.update({
      attemptCount: attemptNumber,
      retrySchedule: updatedSchedule,
      nextAttemptAt: nextAttemptTime,
      lastAttemptAt: new Date()
    });
    
    console.log(`[ScheduleNext] Session ${session.id} - Next attempt #${nextPending.attempt} scheduled for ${nextAttemptTime}`);
    
  } catch (error) {
    console.error(`[ScheduleNext] Error scheduling next attempt:`, error);
  }
};

// ========================================
// UPDATE WEEKLY SCORES
// ========================================
const updateWeeklyScores = async (patientId, weekNumber) => {
  try {
    // Get all completed sessions for this week
    const sessions = await Session.findAll({
      where: {
        patientId,
        weekNumber,
        status: 'completed',
        sessionRiskScore: { [Op.not]: null }
      },
      order: [['sessionRiskScore', 'DESC']]
    });
    
    // Mark all as not counted first
    await Session.update(
      { isCountedInWeekly: false },
      { where: { patientId, weekNumber } }
    );
    
    // Select top 3
    const topThree = sessions.slice(0, 3);
    
    if (topThree.length === 0) return;
    
    // Mark top 3 as counted
    await Session.update(
      { isCountedInWeekly: true },
      { where: { id: topThree.map(s => s.id) } }
    );
    
    // Calculate weekly score (average of top 3)
    const weeklyScore = topThree.reduce((sum, s) => sum + parseFloat(s.sessionRiskScore), 0) / topThree.length;
    
    // Upsert weekly score
    await WeeklyScore.upsert({
      patientId,
      weekNumber,
      weeklyScore: weeklyScore.toFixed(2),
      cumulativeScore: weeklyScore.toFixed(2)
    });
    
    console.log(`[UpdateWeeklyScores] Updated weekly score for ${patientId}, week ${weekNumber}: ${weeklyScore.toFixed(2)}`);
    
  } catch (error) {
    console.error('[UpdateWeeklyScores] Error:', error);
  }
};

// ========================================
// START RETRY WORKER (Call this from server.js)
// ========================================
export const startRetryWorker = () => {
  // Run immediately on startup
  runRetryWorker();
  
  // Then run every 5 minutes
  const intervalMinutes = 5;
  const intervalMs = intervalMinutes * 60 * 1000;
  
  setInterval(() => {
    runRetryWorker();
  }, intervalMs);
  
  console.log(`[RetryWorker] Started - Running every ${intervalMinutes} minutes`);
};