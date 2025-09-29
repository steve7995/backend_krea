import { User, Session, GoogleToken, HistoricalHRData, WeeklyScore } from '../models/index.js';
import { Op } from 'sequelize';
import { calculateHeartRateZones } from '../utils/calculations.js';
import { 
  generateRetrySchedule, 
  calculateNextAttemptTime,
  updateRetryScheduleItem,
  getNextPendingAttempt 
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
// START SESSION
// ========================================
export const startSession = async (req, res) => {
  try {
    const { patientId, weekNumber } = req.body;
    
    // 1. Validate patient exists
    const user = await User.findByPk(patientId);
    if (!user) {
      return res.status(404).json({
        status: 'failure',
        message: 'Patient not found'
      });
    }
    
    // 2. Validate week number
    if (weekNumber < 1 || weekNumber > user.regime) {
      return res.status(400).json({
        status: 'failure',
        message: `Invalid week number. Patient is on ${user.regime}-week regime.`
      });
    }
    
    // 3. Check 18-hour gap from last session
    const lastSession = await Session.findOne({
      where: { patientId },
      order: [['createdAt', 'DESC']]
    });
    
    if (lastSession) {
      const hoursSinceLastSession = (Date.now() - lastSession.createdAt) / (1000 * 60 * 60);
      if (hoursSinceLastSession < 18) {
        return res.status(400).json({
          status: 'failure',
          message: `Please wait ${Math.ceil(18 - hoursSinceLastSession)} more hours before starting next session`,
          nextSessionAvailable: new Date(lastSession.createdAt.getTime() + 18 * 60 * 60 * 1000)
        });
      }
    }
    
    // 4. Get session attempt number for this week
    const weekSessions = await Session.count({
      where: { patientId, weekNumber }
    });
    const sessionAttemptNumber = weekSessions + 1;
    
    // 5. Calculate zones for this week
    const zones = calculateHeartRateZones(user.age, user.betaBlockers, user.lowEF, weekNumber);
    
    // 6. Create session record
    const now = new Date();
    const session = await Session.create({
      patientId,
      weekNumber,
      sessionAttemptNumber,
      sessionDate: now.toISOString().split('T')[0],
      sessionStartTime: now.toTimeString().split(' ')[0],
      status: 'in_progress'
    });
    
    // 7. Return session details
    res.json({
      status: 'success',
      message: 'Session started successfully',
      data: {
        patientId,
        weekNumber,
        sessionNumber: sessionAttemptNumber,
        sessionId: session.id,
        sessionZones: zones,
        sessionData: {
          sessionDate: session.sessionDate,
          sessionStartTime: session.sessionStartTime,
          sessionDuration: `${zones.sessionDuration} mins`
        },
        instructions: {
          warmup: `5 minutes - Keep HR between ${zones.warmupZoneMin}-${zones.warmupZoneMax} bpm`,
          exercise: `${zones.sessionDuration - 10} minutes - Keep HR between ${zones.exerciseZoneMin}-${zones.exerciseZoneMax} bpm`,
          cooldown: `5 minutes - Keep HR between ${zones.cooldownZoneMin}-${zones.cooldownZoneMax} bpm`
        }
      }
    });
    
  } catch (error) {
    console.error('[SessionController] Error starting session:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};

// ========================================
// END SESSION
// ========================================
export const endSession = async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    // 1. Get session
    const session = await Session.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'failure',
        message: 'Session not found'
      });
    }
    
    if (session.status !== 'in_progress') {
      return res.status(400).json({
        status: 'failure',
        message: 'Session already ended or not started'
      });
    }
    
    // 2. Get user
    const user = await User.findByPk(session.patientId);
    
    // 3. Generate retry schedule
    const sessionStartDateTime = new Date(`${session.sessionDate}T${session.sessionStartTime}`);
    const retrySchedule = generateRetrySchedule(sessionStartDateTime);
    
    // 4. Update session to processing status
    await session.update({
      status: 'processing',
      attemptCount: 0,
      retrySchedule: retrySchedule,
      nextAttemptAt: calculateNextAttemptTime(sessionStartDateTime, 1) // Attempt 1 is immediate
    });
    
    // 5. Try immediate processing (Attempt #1)
    console.log(`[SessionController] Starting immediate processing for session ${sessionId}`);
    processSessionAttempt(sessionId).catch(error => {
      console.error(`[SessionController] Error in immediate processing:`, error);
    });
    
    // 6. Return immediate response
    res.json({
      status: 'success',
      message: 'Session ended. Processing heart rate data...',
      data: {
        sessionId,
        status: 'processing',
        estimatedTime: '2-5 minutes',
        checkStatusUrl: `/api/getSessionStatus/${sessionId}`
      }
    });
    
  } catch (error) {
    console.error('[SessionController] Error ending session:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};

// ========================================
// PROCESS SESSION ATTEMPT (Internal function)
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
      // Schedule next attempt
      await scheduleNextAttempt(session, attemptNumber, {
        result: 'token_busy',
        dataPoints: 0,
        errorMessage: 'Token in use by another process'
      });
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
// SCHEDULE NEXT ATTEMPT (Helper function)
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
// GET SESSION STATUS
// ========================================
export const getSessionStatus = async (req, res) => {
  try {
    const { sessionId } = req.params;
    
    const session = await Session.findByPk(sessionId);
    if (!session) {
      return res.status(404).json({
        status: 'failure',
        message: 'Session not found'
      });
    }
    
    // If still processing
    if (session.status === 'processing') {
      return res.json({
        status: 'processing',
        message: 'Still processing heart rate data...',
        data: {
          sessionId: session.id,
          attemptCount: session.attemptCount,
          nextAttemptAt: session.nextAttemptAt,
          retrySchedule: session.retrySchedule
        }
      });
    }
    
    // If failed or data unavailable
    if (session.status === 'failed' || session.status === 'data_unavailable') {
      return res.json({
        status: 'failed',
        message: session.failureReason || 'Session processing failed',
        data: {
          sessionId: session.id,
          attemptCount: session.attemptCount,
          retrySchedule: session.retrySchedule
        }
      });
    }
    
    // If completed
    if (session.status === 'completed') {
      const user = await User.findByPk(session.patientId);
      const zones = calculateHeartRateZones(user.age, user.betaBlockers, user.lowEF, session.weekNumber);
      
      const weeklyScore = await WeeklyScore.findOne({
        where: {
          patientId: session.patientId,
          weekNumber: session.weekNumber
        }
      });
      
      return res.json({
        status: 'success',
        message: 'Session completed successfully',
        data: {
          patientId: session.patientId,
          weekNumber: session.weekNumber,
          sessionNumber: session.sessionAttemptNumber,
          sessionRiskScore: parseFloat(session.sessionRiskScore),
          cumulativeRiskScore: weeklyScore?.weeklyScore || session.sessionRiskScore,
          riskLevel: session.riskLevel,
          summary: session.summary,
          sessionData: {
            sessionDate: session.sessionDate,
            sessionStartTime: session.sessionStartTime,
            sessionDuration: session.sessionDuration,
            MaxHR: session.maxHR,
            MinHR: session.minHR,
            AvgHR: session.avgHR
          },
          sessionZones: zones
        }
      });
    }
    
    // Unknown status
    return res.json({
      status: 'unknown',
      message: 'Session status unclear',
      sessionStatus: session.status
    });
    
  } catch (error) {
    console.error('[SessionController] Error getting session status:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};

// ========================================
// UPDATE WEEKLY SCORES (Helper function)
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
      cumulativeScore: weeklyScore.toFixed(2) // Simplified
    });
    
    console.log(`[UpdateWeeklyScores] Updated weekly score for ${patientId}, week ${weekNumber}: ${weeklyScore.toFixed(2)}`);
    
  } catch (error) {
    console.error('[UpdateWeeklyScores] Error:', error);
  }
};