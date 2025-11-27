import { User, Session, WeeklyScore, RehabPlan } from '../models/index.js';
import { Op } from 'sequelize';
import { calculateHeartRateZones } from '../utils/calculations.js';
import {
  generateRetrySchedule,
  generateQuickRetrySchedule,
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
import { formatForSpectrum, } from '../utils/spectrumFormatter.js';
import axios from 'axios';

// ========================================
// CAPTURE PATIENT SESSION TIME (Start/Stop Actions)
// ========================================
export const capturePatientSessionTime = async (req, res) => {
  try {
    const { patientId, sessionStartTime, sessionEndTime, action } = req.body;

    // Validate action
    if (!action || !['start', 'stop'].includes(action)) {
      return res.status(400).json({
        status: 'failure',
        message: 'action is required and must be "start" or "stop"'
      });
    }

    // ==================== ACTION: START ====================
    if (action === 'start') {
      if (!patientId || !sessionStartTime) {
        return res.status(400).json({
          status: 'failure',
          message: 'patientId and sessionStartTime are required for start action'
        });
      }

      const user = await User.findByPk(patientId);
      if (!user) {
        return res.status(404).json({
          status: 'failure',
          message: 'Patient not found'
        });
      }

      // Check if there's already an active session for this patient
      const activeSession = await Session.findOne({
        where: {
          patientId,
          status: 'active'
        }
      });

      if (activeSession) {
        return res.status(400).json({
          status: 'failure',
          message: 'Patient already has an active session. Please stop the current session first.',
          activeSessionId: activeSession.id
        });
      }

      // Determine current week
      const totalSessions = await Session.count({ where: { patientId } });
      let weekNumber = Math.floor(totalSessions / 3) + 1;

      if (weekNumber > user.regime) {
        weekNumber = user.regime;
      }

      // Get rehab plan data for this week
      const rehabPlan = await RehabPlan.findOne({
        where: { patientId, weekNumber }
      });

      if (!rehabPlan) {
        return res.status(404).json({
          status: 'failure',
          message: `Rehab plan not found for patient ${patientId}, week ${weekNumber}`
        });
      }

      // Calculate sessionAttemptNumber (session number within current week)
      const weekSessions = await Session.count({
        where: { patientId, weekNumber }
      });
      const sessionAttemptNumber = weekSessions + 1;

      // Calculate estimated end time based on rehab plan duration
      const startTime = new Date(sessionStartTime);
      const estimatedEndTime = new Date(startTime.getTime() + rehabPlan.sessionDuration * 60 * 1000);
      const estimatedProcessingStartsAt = new Date(estimatedEndTime.getTime() + 5 * 60 * 1000); // 5 min buffer

      console.log(`[SessionStart] Start: ${startTime.toISOString()}, Estimated End: ${estimatedEndTime.toISOString()}, Planned Duration: ${rehabPlan.sessionDuration} min`);

      // Create session with status 'active'
      const session = await Session.create({
        patientId,
        weekNumber,
        sessionAttemptNumber,
        sessionType: 'start_stop',
        sessionDate: new Date(sessionStartTime).toISOString().split('T')[0],
        sessionStartTime: startTime.toTimeString().split(' ')[0],
        sessionEndTime: estimatedEndTime.toTimeString().split(' ')[0], // Pre-calculated from plan
        actualDuration: rehabPlan.sessionDuration, // Default to planned duration
        targetHR: rehabPlan.targetHR,
        maxPermissibleHR: rehabPlan.maxPermissibleHR,
        warmupZoneMin: rehabPlan.warmupZoneMin,
        warmupZoneMax: rehabPlan.warmupZoneMax,
        exerciseZoneMin: rehabPlan.exerciseZoneMin,
        exerciseZoneMax: rehabPlan.exerciseZoneMax,
        cooldownZoneMin: rehabPlan.cooldownZoneMin,
        cooldownZoneMax: rehabPlan.cooldownZoneMax,
        sessionDuration: rehabPlan.sessionDuration, // Planned duration from rehab plan
        status: 'active',
        processingStartsAt: estimatedProcessingStartsAt // Pre-calculated
      });

      console.log(`[SessionStart] Session ${session.id} created with status 'active'`);

      // POST to Spectrum - ONLY patientId and sessionDuration
      const SPECTRUM_URL = `https://sandbox.cardihab.healthkon.com/api/patients/cardiac-rehab-session/${patientId}`;

      const spectrumPayload = {
        patientId: patientId,
        sessionDuration: rehabPlan.sessionDuration
      };

      try {
        const spectrumResponse = await axios.post(SPECTRUM_URL, spectrumPayload, {
          headers: {
            'Content-Type': 'application/json'
          },
          timeout: 10000
        });

        console.log('[SessionStart] Successfully posted to Spectrum:', spectrumResponse.data);
      } catch (spectrumError) {
        console.error('[SessionStart] Error posting to Spectrum:', spectrumError.message);
        // Don't fail the whole request if Spectrum post fails
      }

      return res.status(200).json({
        status: 'success',
        message: 'Session started successfully',
        sessionId: session.id,
        weekNumber: weekNumber,
        sessionAttemptNumber: sessionAttemptNumber,
        plannedDuration: rehabPlan.sessionDuration
      });
    }

    // ==================== ACTION: STOP ====================
    if (action === 'stop') {
      if (!patientId || !sessionEndTime) {
        return res.status(400).json({
          status: 'failure',
          message: 'patientId and sessionEndTime are required for stop action'
        });
      }

      // Find active session for this patient
      const activeSession = await Session.findOne({
        where: {
          patientId,
          status: 'active'
        },
        order: [['createdAt', 'DESC']]
      });

      console.log(`[SessionStop] Looking for active session for patient ${patientId}...`);

      if (!activeSession) {
        console.log(`[SessionStop] No active session found for patient ${patientId}`);
        return res.status(404).json({
          status: 'failure',
          message: 'No active session found for this patient'
        });
      }

      console.log(`[SessionStop] Found active session ${activeSession.id} for patient ${patientId}`);

      // Calculate times
      const startTime = new Date(`${activeSession.sessionDate}T${activeSession.sessionStartTime}`);
      const userStopTime = new Date(sessionEndTime);
      const plannedEndTime = new Date(`${activeSession.sessionDate}T${activeSession.sessionEndTime}`); // This was set at START based on rehab plan

      console.log(`[SessionStop] Session ${activeSession.id} - Start: ${startTime.toISOString()}, User stop: ${userStopTime.toISOString()}, Planned end: ${plannedEndTime.toISOString()}`);

      // Check if user is stopping AFTER the planned end time
      if (userStopTime >= plannedEndTime) {
        console.log(`[SessionStop] Stop time is after planned end time. Ignoring stop request, using rehab plan times.`);

        // Return success but don't update anything - use times already set from rehab plan
        return res.status(200).json({
          status: 'success',
          message: 'Session already completed based on rehab plan duration',
          sessionId: activeSession.id,
          actualDuration: activeSession.actualDuration, // From rehab plan
          plannedDuration: activeSession.sessionDuration,
          note: 'Stop time was after planned end time, using rehab plan duration'
        });
      }

      // User stopped BEFORE planned end time - update with actual values
      const actualDurationMinutes = Math.round((userStopTime - startTime) / (1000 * 60));

      console.log(`[SessionStop] Session ${activeSession.id} stopped early - Actual duration: ${actualDurationMinutes} min (planned: ${activeSession.sessionDuration} min)`);

      if (actualDurationMinutes <= 0) {
        return res.status(400).json({
          status: 'failure',
          message: 'Session end time must be after start time',
          debug: {
            startTime: startTime.toISOString(),
            endTime: userStopTime.toISOString(),
            calculatedDuration: actualDurationMinutes
          }
        });
      }

      // Calculate when processing should start (5 minute buffer after session ends)
      const bufferMs = 5 * 60 * 1000; // 5 minute buffer
      const processingStartTime = new Date(userStopTime.getTime() + bufferMs);

      // Update session with ACTUAL end time and duration (user stopped early)
      await activeSession.update({
        sessionEndTime: userStopTime.toTimeString().split(' ')[0], // Override planned with actual
        actualDuration: actualDurationMinutes, // Override planned with actual
        status: 'in_progress',
        processingStartsAt: processingStartTime // Override planned with actual
      });

      console.log(`[SessionStop] ✓ Session ${activeSession.id} stopped early. Actual duration: ${actualDurationMinutes} min (planned: ${activeSession.sessionDuration} min), Processing starts at: ${processingStartTime.toISOString()}`);

      // NO POST to Spectrum on stop (as per user requirement)

      return res.status(200).json({
        status: 'success',
        message: 'Session stopped successfully',
        sessionId: activeSession.id,
        actualDuration: actualDurationMinutes,
        plannedDuration: activeSession.sessionDuration,
        processingStartsAt: processingStartTime.toISOString()
      });
    }

  } catch (error) {
    console.error('Error in capturePatientSessionTime:', error);
    return res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};



// ========================================
// INDEPENDENT EXERCISE SCORING (for Spectrum ad-hoc sessions)
// ========================================
export const scoreIndependentExercise = async (req, res) => {
  try {
    const { patientId, sessionStartTime, sessionEndTime } = req.body;

    // Validate inputs
    if (!patientId || !sessionStartTime || !sessionEndTime) {
      return res.status(400).json({
        status: 'failure',
        message: 'patientId, sessionStartTime, and sessionEndTime are required'
      });
    }

    console.log(`[IndependentExercise] Request for patient ${patientId}`);
    console.log(`[IndependentExercise] Time window: ${sessionStartTime} to ${sessionEndTime}`);

    // Get patient data
    const user = await User.findByPk(patientId);
    if (!user) {
      return res.status(404).json({
        status: 'failure',
        message: 'Patient not found'
      });
    }

    // Parse session times
    const startTime = new Date(sessionStartTime);
    const endTime = new Date(sessionEndTime);

    // Validate times
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) {
      return res.status(400).json({
        status: 'failure',
        message: 'Invalid date format for sessionStartTime or sessionEndTime'
      });
    }

    if (endTime <= startTime) {
      return res.status(400).json({
        status: 'failure',
        message: 'sessionEndTime must be after sessionStartTime'
      });
    }

    // Calculate session duration in minutes
    const durationMinutes = Math.round((endTime - startTime) / (1000 * 60));

    console.log(`[IndependentExercise] Session duration: ${durationMinutes} minutes`);

    // Determine current week (same logic as start action)
    const totalSessions = await Session.count({ where: { patientId } });
    let weekNumber = Math.floor(totalSessions / 3) + 1;

    if (weekNumber > user.regime) {
      weekNumber = user.regime;
    }

    console.log(`[IndependentExercise] Week number: ${weekNumber}`);

    // Get rehab plan data for this week
    const rehabPlan = await RehabPlan.findOne({
      where: { patientId, weekNumber }
    });

    if (!rehabPlan) {
      return res.status(404).json({
        status: 'failure',
        message: `Rehab plan not found for patient ${patientId}, week ${weekNumber}`
      });
    }

    // Calculate sessionAttemptNumber (session number within current week)
    const weekSessions = await Session.count({
      where: { patientId, weekNumber }
    });
    const sessionAttemptNumber = weekSessions + 1;

    console.log(`[IndependentExercise] Session attempt number: ${sessionAttemptNumber}`);

    // Detect if this is a past session or future/current session
    const now = new Date();
    const isPastSession = endTime < now;

    let processingStartTime;
    let retrySchedule;

    if (isPastSession) {
      // Past session: Process immediately with quick retry schedule
      processingStartTime = now; // Start processing NOW
      retrySchedule = generateQuickRetrySchedule(now); // Only 3 quick attempts

      const timeSinceEnd = Math.floor((now - endTime) / (1000 * 60)); // minutes
      console.log(`[IndependentExercise] Past session detected (ended ${timeSinceEnd} minutes ago), processing immediately with quick schedule`);
    } else {
      // Future/current session: Wait for session to end + buffer
      const bufferMs = 5 * 60 * 1000;
      processingStartTime = new Date(endTime.getTime() + bufferMs);
      retrySchedule = generateRetrySchedule(endTime); // Standard 11 attempts

      console.log(`[IndependentExercise] Future session, processing starts at ${processingStartTime.toISOString()}`);
    }

    // Create Session record with sessionType='complete'
    const session = await Session.create({
      patientId,
      weekNumber,
      sessionAttemptNumber,
      sessionType: 'complete',
      sessionDate: startTime.toISOString().split('T')[0],
      sessionStartTime: startTime.toTimeString().split(' ')[0],
      sessionEndTime: endTime.toTimeString().split(' ')[0],
      sessionDuration: durationMinutes,
      actualDuration: durationMinutes,
      targetHR: rehabPlan.targetHR,
      maxPermissibleHR: rehabPlan.maxPermissibleHR,
      warmupZoneMin: rehabPlan.warmupZoneMin,
      warmupZoneMax: rehabPlan.warmupZoneMax,
      exerciseZoneMin: rehabPlan.exerciseZoneMin,
      exerciseZoneMax: rehabPlan.exerciseZoneMax,
      cooldownZoneMin: rehabPlan.cooldownZoneMin,
      cooldownZoneMax: rehabPlan.cooldownZoneMax,
      status: 'processing',
      attemptCount: 0,
      retrySchedule: retrySchedule,
      processingStartsAt: processingStartTime,
      nextAttemptAt: processingStartTime
    });

    console.log(`[IndependentExercise] Created session ${session.id} (type: complete), processing starts at ${processingStartTime.toISOString()}`);

    // Return 202 Accepted - processing will happen asynchronously
    return res.status(202).json({
      status: 'accepted',
      message: 'Independent exercise session created and queued for processing',
      sessionId: session.id,
      estimatedCompletion: processingStartTime.toISOString(),
      pollingUrl: `/api/sessions/getIndependentExerciseResult/${session.id}`
    });

  } catch (error) {
    console.error('[IndependentExercise] Error:', error);
    return res.status(500).json({
      status: 'failure',
      message: 'Internal server error',
      error: error.message
    });
  }
};

// ========================================
// GET INDEPENDENT EXERCISE RESULT
// ========================================
export const getIndependentExerciseResult = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({
        status: 'failure',
        message: 'sessionId is required'
      });
    }

    const session = await Session.findByPk(sessionId);

    if (!session) {
      return res.status(404).json({
        status: 'failure',
        message: 'Session not found'
      });
    }

    // Check status
    if (session.status === 'processing') {
      return res.status(202).json({
        status: 'processing',
        message: 'Session data still being processed',
        estimatedCompletion: session.nextAttemptAt,
        attemptCount: session.attemptCount
      });
    }

    if (session.status === 'data_unavailable' || session.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        message: session.failureReason || 'Failed to process session data',
        sessionId: session.id
      });
    }

    if (session.status === 'completed') {
      // Return completed results
      return res.status(200).json({
        status: 'success',
        data: {
          patientId: parseInt(session.patientId),
          sessionType: session.sessionType,
          weekNumber: session.weekNumber,
          sessionAttemptNumber: session.sessionAttemptNumber,
          sessionStartTime: `${session.sessionDate}T${session.sessionStartTime}`,
          sessionEndTime: `${session.sessionDate}T${session.sessionEndTime}`,
          durationMinutes: session.actualDuration || session.sessionDuration,
          dataCompleteness: Math.round(session.dataCompleteness * 100),
          scores: {
            warmupScore: session.warmupScore,
            exerciseScore: session.exerciseScore,
            cooldownScore: session.cooldownScore,
            overallScore: session.overallScore,
            riskLevel: session.riskLevel
          },
          heartRate: {
            max: session.maxHR,
            min: session.minHR,
            avg: session.avgHR
          },
          zones: {
            warmup: {
              min: session.warmupZoneMin,
              max: session.warmupZoneMax
            },
            exercise: {
              min: session.exerciseZoneMin,
              max: session.exerciseZoneMax
            },
            cooldown: {
              min: session.cooldownZoneMin,
              max: session.cooldownZoneMax
            }
          },
          summary: session.summary
        }
      });
    }

    return res.status(400).json({
      status: 'failure',
      message: 'Invalid session status'
    });

  } catch (error) {
    console.error('[getIndependentExerciseResult] Error:', error);
    return res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};

export const submitRiskAnalysis = async (req, res) => {
  try {
    const { patientId, sessionId } = req.body; // or req.query

    let session;
    
    if (sessionId) {
      // Find specific session by ID
      session = await Session.findByPk(sessionId);
    } else if (patientId) {
      // Find latest session for patient
      session = await Session.findOne({
        where: { patientId },
        order: [['createdAt', 'DESC']]
      });
    } else {
      return res.status(400).json({
        status: 'failure',
        message: 'patientId or sessionId required'
      });
    }
    
    if (!session) {
      return res.status(404).json({
        status: 'failure',
        message: 'Session not found'
      });
    }
    
    // Check status
    if (session.status === 'processing') {
      return res.status(202).json({ // 202 = Accepted but not ready
        status: 'processing',
        message: 'Session data still being processed',
        estimatedCompletion: session.nextAttemptAt,
        attemptCount: session.attemptCount
      });
    }
    
    if (session.status === 'data_unavailable' || session.status === 'failed') {
      return res.status(200).json({
        status: 'failed',
        message: session.failureReason || 'Failed to process session data',
        sessionId: session.id
      });
    }
    
    if (session.status === 'completed') {
      // Get weekly score
      const weeklyScore = await WeeklyScore.findOne({
        where: {
          patientId: session.patientId,
          weekNumber: session.weekNumber
        }
      });

      // Prepare data
      const hrData = {
        maxHR: session.maxHR,
        minHR: session.minHR,
        avgHR: session.avgHR
      };

      const scores = {
        sessionRiskScore: parseFloat(session.sessionRiskScore) || 0,
        sessionRiskLevel: session.sessionRiskLevel || 'Low',
        cumulativeRiskScore: weeklyScore?.weeklyScore || parseFloat(session.sessionRiskScore) || 0,
        riskLevel: session.riskLevel || 'Low',
        baselineScore: parseFloat(session.baselineScore) || 0,
        summary: session.summary || 'Session completed successfully'
      };

      const zones = {
        targetHR: session.targetHR,
        maxPermissibleHR: session.maxPermissibleHR,
        warmupZoneMin: session.warmupZoneMin,
        warmupZoneMax: session.warmupZoneMax,
        exerciseZoneMin: session.exerciseZoneMin,
        exerciseZoneMax: session.exerciseZoneMax,
        cooldownZoneMin: session.cooldownZoneMin,
        cooldownZoneMax: session.cooldownZoneMax,
        sessionDuration: session.sessionDuration
      };

      // Format for Spectrum (includes dataCompleteness)
      const result = formatForSpectrum(session, hrData, scores, zones);

      return res.status(200).json({
        status: 'success',
        data: result
      });
    }
    
    return res.status(400).json({
      status: 'failure',
      message: 'Invalid session status'
    });
    
  } catch (error) {
    console.error('[submitRiskAnalysis] Error:', error);
    return res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};


