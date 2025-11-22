import { Session } from "../models/index.js";
import { Op } from "sequelize";
import { shouldAttemptNow } from "../utils/scheduleHelper.js";
import {
  formatForSpectrum,
  sendToSpectrum,
} from "../utils/spectrumFormatter.js";
import { generateRetrySchedule } from "../utils/scheduleHelper.js";
import {
  User,
  GoogleToken,
  HistoricalHRData,
  WeeklyScore,
  BaselineThreshold,
} from "../models/index.js";
import { calculateHeartRateZones } from "../utils/calculations.js";
import {
  updateRetryScheduleItem,
  getNextPendingAttempt,
  calculateNextAttemptTime,
  shouldAcceptPartialData,
} from "../utils/scheduleHelper.js";
import {
  acquireTokenLock,
  releaseTokenLock,
  getValidToken,
} from "../utils/tokenManager.js";
import {
  fetchGoogleFitData,
  validateDataQuality,
  calculateSessionScore,
  determineRiskLevel,
  calculateHRStats,
  formatHRDataForStorage,
  extractHRValues,
  imputeMissingHRData,
} from "../utils/googleFit.js";
import { generateSessionSummary } from "../utils/calculations.js";
import {
  calculateVitalsRiskScore,
  determineVitalRiskLevel,
} from "../utils/vitalsRiskCalculator.js";
import { PatientVital } from "../models/index.js";
import { notifySpectrumTokenExpired } from '../utils/spectrumFormatter.js';
import { calculateRestingHR } from '../utils/restingHRCalculator.js';
// ========================================
// RETRY WORKER - Main Function
// ========================================

export const runRetryWorker = async () => {
  try {
    console.log("[RetryWorker] Starting retry check...");
    const now = new Date();

    // TYPE 1: Find sessions already in 'processing' or 'pending_sync' status
    const processingSessions = await Session.findAll({
      where: {
        status: {
          [Op.in]: ["processing", "pending_sync"], // NEW: Added pending_sync
        },
        nextAttemptAt: {
          [Op.lte]: now,
        },
      },
      order: [["nextAttemptAt", "ASC"]],
    });

    // TYPE 2: Find sessions that should start processing now (both in_progress and active)
    const readyToProcessSessions = await Session.findAll({
      where: {
        status: {
          [Op.in]: ["in_progress", "active"], // Include active sessions that reached estimated processing time
        },
        processingStartsAt: {
          [Op.lte]: now,
        },
      },
      order: [["processingStartsAt", "ASC"]],
    });

    // Convert ready sessions to processing status
    for (const session of readyToProcessSessions) {
      console.log(
        `[RetryWorker] Session ${session.id} ready to process, initializing...`
      );

      try {
        const sessionStartDateTime = new Date(
          `${session.sessionDate}T${session.sessionStartTime}`
        );
        const retrySchedule = generateRetrySchedule(sessionStartDateTime);

        await session.update({
          status: "processing",
          attemptCount: 0,
          retrySchedule: retrySchedule,
          nextAttemptAt: new Date(), // Process immediately
        });

        console.log(
          `[RetryWorker] Session ${session.id} marked as 'processing'`
        );
      } catch (error) {
        console.error(
          `[RetryWorker] Error initializing session ${session.id}:`,
          error
        );
      }
    }

    // Combine both types
    const allSessions = [...processingSessions, ...readyToProcessSessions];

    if (allSessions.length === 0) {
      console.log("[RetryWorker] No sessions to process");
      return;
    }

    console.log(
      `[RetryWorker] Found ${allSessions.length} sessions to process`
    );

    // Process each session
    for (const session of allSessions) {
      if (shouldAttemptNow(session.nextAttemptAt)) {
        console.log(
          `[RetryWorker] Processing session ${session.id} (status: ${
            session.status
          }, attempt: ${session.attemptCount + 1})`
        );

        processSessionAttempt(session.id).catch((error) => {
          console.error(
            `[RetryWorker] Error processing session ${session.id}:`,
            error
          );
        });
      }
    }

    // All sessions (both start_stop and complete types) are now processed uniformly above

    console.log("[RetryWorker] Retry check completed");
  } catch (error) {
    console.error("[RetryWorker] Error in retry worker:", error);
  }
};

// ========================================
// PROCESS SESSION ATTEMPT
// ========================================

// const calculateBaselineScore = async (patientId) => {
//   try {
//     // Count total completed sessions for this patient
//     const totalSessions = await Session.count({
//       where: {
//         patientId,
//         status: 'completed',
//         sessionRiskScore: { [Op.not]: null }
//       }
//     });

//     // Only update baseline at session 1, 3, 7, and 14
//     if (![1, 3, 7, 14].includes(totalSessions)) {
//       return null; // Don't update baseline
//     }

//     // Get the required number of sessions for median calculation
//     let sessionsForBaseline;

//     if (totalSessions === 1) {
//       // First session: baseline = first session score
//       sessionsForBaseline = await Session.findAll({
//         where: {
//           patientId,
//           status: 'completed',
//           sessionRiskScore: { [Op.not]: null }
//         },
//         order: [['createdAt', 'DESC']],
//         limit: 1
//       });

//       const baselineScore = parseFloat(sessionsForBaseline[0].sessionRiskScore);

//       // Update all sessions with this baseline
//       await Session.update(
//         { baselineScore: baselineScore.toFixed(2) },
//         { where: { patientId, id: sessionsForBaseline[0].id } }
//       );

//       return baselineScore;

//     } else {
//       // For sessions 3, 7, and 14: get last 3 sessions and find median
//       sessionsForBaseline = await Session.findAll({
//         where: {
//           patientId,
//           status: 'completed',
//           sessionRiskScore: { [Op.not]: null }
//         },
//         order: [['createdAt', 'DESC']],
//         limit: 3
//       });

//       // Extract scores and sort for median calculation
//       const scores = sessionsForBaseline.map(s => parseFloat(s.sessionRiskScore)).sort((a, b) => a - b);

//       // Calculate median (middle value)
//       const median = scores[1]; // For 3 values, index 1 is the median

//       // Update all patient sessions with new baseline (applies to all sessions)
//       await Session.update(
//         { baselineScore: median.toFixed(2) },
//         { where: { patientId } }
//       );

//       console.log(`[BaselineScore] Updated baseline for patient ${patientId} at session ${totalSessions}: ${median.toFixed(2)}`);

//       return median;
//     }

//   } catch (error) {
//     console.error('[BaselineScore] Error calculating baseline:', error);
//     return null;
//   }
// };
const calculateBaselineScore = async (patientId) => {
  try {
    // Count total completed sessions for this patient
    const totalSessions = await Session.count({
      where: {
        patientId,
        status: "completed",
        sessionRiskScore: { [Op.not]: null },
      },
    });

    // Only update baseline at session 1, 3, 7, and 14
    if (![1, 3, 7, 14].includes(totalSessions)) {
      return null; // Don't update baseline
    }

    if (totalSessions === 1) {
      // First session: baseline = first session score
      const firstSession = await Session.findOne({
        where: {
          patientId,
          status: "completed",
          sessionRiskScore: { [Op.not]: null },
        },
        order: [["createdAt", "DESC"]],
      });

      const baselineScore = parseFloat(firstSession.sessionRiskScore);

      // Update session with baseline
      await Session.update(
        { baselineScore: baselineScore.toFixed(2) },
        { where: { patientId, id: firstSession.id } }
      );

      console.log(
        `[BaselineScore] Session 1 baseline for patient ${patientId}: ${baselineScore.toFixed(
          2
        )}`
      );
      return baselineScore;
    } else {
      // For sessions 3, 7, and 14: Calculate baseline and thresholds
      const last3Sessions = await Session.findAll({
        where: {
          patientId,
          status: "completed",
          sessionRiskScore: { [Op.not]: null },
        },
        order: [["createdAt", "DESC"]],
        limit: 3,
      });

      // Extract scores and sort for median
      const scores = last3Sessions
        .map((s) => parseFloat(s.sessionRiskScore))
        .sort((a, b) => a - b);
      const baseline = scores[1]; // Median of 3 values

      // Calculate Mean Absolute Deviations from baseline
      const absoluteDeviations = scores
        .map((score) => Math.abs(score - baseline))
        .sort((a, b) => a - b);
      const medianAbsoluteDeviation = absoluteDeviations[1]; // Median of 3 deviations

      // Calculate Standard Deviation using formula: 1.4826 × MAD
      const standardDeviation = 1.4826 * medianAbsoluteDeviation;

      // Calculate thresholds
      const thresholds = {
        minus2SD: baseline - 2 * standardDeviation,
        minus1SD: baseline - standardDeviation,
        plus1SD: baseline + standardDeviation,
        plus2SD: baseline + 2 * standardDeviation,
      };
      // Calculate resting heart rate
      const restingHR = await calculateRestingHeartRate(
        patientId,
        totalSessions
      );
      // Store baseline and thresholds
      await BaselineThreshold.create({
        patientId,
        calculatedAtSession: totalSessions,
        baselineScore: baseline.toFixed(2),
        standardDeviation: standardDeviation.toFixed(2),
        thresholdMinus2SD: thresholds.minus2SD.toFixed(2),
        thresholdMinus1SD: thresholds.minus1SD.toFixed(2),
        thresholdPlus1SD: thresholds.plus1SD.toFixed(2),
        thresholdPlus2SD: thresholds.plus2SD.toFixed(2),
        restingHeartRate: restingHR, // Add this line
      });
      console.log(
        `[BaselineScore] Session ${totalSessions} for patient ${patientId}:`
      );
      console.log(
        `  Baseline: ${baseline.toFixed(2)}, SD: ${standardDeviation.toFixed(
          2
        )}`
      );
      console.log(`  Resting HR: ${restingHR}`);
      // Update all patient sessions with new baseline
      await Session.update(
        { baselineScore: baseline.toFixed(2) },
        { where: { patientId } }
      );

      console.log(
        `[BaselineScore] Session ${totalSessions} baseline for patient ${patientId}:`
      );
      console.log(
        `  Baseline: ${baseline.toFixed(2)}, SD: ${standardDeviation.toFixed(
          2
        )}`
      );
      console.log(
        `  Thresholds: [${thresholds.minus2SD.toFixed(
          2
        )}, ${thresholds.minus1SD.toFixed(2)}, ${thresholds.plus1SD.toFixed(
          2
        )}, ${thresholds.plus2SD.toFixed(2)}]`
      );

      return baseline;
    }
  } catch (error) {
    console.error("[BaselineScore] Error calculating baseline:", error);
    return null;
  }
};
const determineHealthStatus = async (patientId, sessionScore) => {
  try {
    // Get the most recent baseline threshold for this patient
    const latestThreshold = await BaselineThreshold.findOne({
      where: { patientId },
      order: [["calculatedAtSession", "DESC"]],
    });

    if (!latestThreshold) {
      return null; // No baseline calculated yet
    }

    const score = parseFloat(sessionScore);
    const minus2SD = parseFloat(latestThreshold.thresholdMinus2SD);
    const minus1SD = parseFloat(latestThreshold.thresholdMinus1SD);
    const plus1SD = parseFloat(latestThreshold.thresholdPlus1SD);
    const plus2SD = parseFloat(latestThreshold.thresholdPlus2SD);

    // Determine health status based on thresholds
    if (score < minus2SD) {
      return "at_risk";
    } else if (score >= minus2SD && score < minus1SD) {
      return "declining";
    } else if (score >= minus1SD && score <= plus1SD) {
      return "consistent";
    } else if (score > plus1SD && score <= plus2SD) {
      return "improving";
    } else {
      // score > plus2SD
      return "strong_improvement";
    }
  } catch (error) {
    console.error("[HealthStatus] Error determining health status:", error);
    return null;
  }
};


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
    console.log(
      `[ProcessSession] Session ${sessionId} - Attempt #${attemptNumber}`
    );

    // NEW: Check if this is attempt 12 (historical sync fallback)
    if (attemptNumber === 12) {
      console.log(`[ProcessSession] Attempt 12 - Historical sync fallback`);
      return await processHistoricalFallbackAttempt(session);
    }

    // 2. Try to acquire token lock
    const lockedBy = `session_${sessionId}`;
    lockAcquired = await acquireTokenLock(session.patientId, lockedBy);

    if (!lockAcquired) {
      console.log(
        `[ProcessSession] Session ${sessionId} - Could not acquire token lock, will retry later`
      );
      return;
    }

    // 3. Get user and zones
    const user = await User.findByPk(session.patientId);
    const zones = calculateHeartRateZones(
      user.age,
      user.betaBlockers,
      user.lowEF,
      session.weekNumber
    );

    // 4. Get valid token (refreshes if needed)
    // const accessToken = await getValidToken(session.patientId);
    let accessToken;
    try {
      accessToken = await getValidToken(session.patientId);
    } catch (tokenError) {
      // Handle token errors
      if (
        tokenError.message === 'REFRESH_TOKEN_EXPIRED' ||
        tokenError.message === 'TOKEN_INVALID' ||
        tokenError.message === 'TOKEN_NOT_FOUND'
      ) {
        console.error(`[RetryWorker] ✗ Token expired for patient ${session.patientId}`);
        
        // Notify Spectrum
        await notifySpectrumTokenExpired(session.patientId, session.id);
        
        // Mark session as failed - stop retrying
        await session.update({
          status: 'failed',
          failureReason: 'Google Fit disconnected. Patient needs to reconnect.',
          nextAttemptAt: null,
          retrySchedule: [
            ...session.retrySchedule,
            {
              attempt: session.attemptCount + 1,
              scheduledFor: null,
              status: 'failed',
              result: 'token_expired',
              dataPoints: 0,
              executedAt: new Date().toISOString(),
              errorMessage: 'Google Fit access expired'
            }
          ]
        });
        
        return { 
          success: false, 
          reason: 'token_expired'
        };
      }
      
      throw tokenError;
    }
    // 5. Calculate time range for data fetch WITH BUFFER
    const sessionStartTime = new Date(
      `${session.sessionDate}T${session.sessionStartTime}`
    );

    // Session always has end time now (set at START, optionally updated at STOP)
    const sessionEndTime = new Date(`${session.sessionDate}T${session.sessionEndTime}`);
    console.log(`[ProcessSession] Session window: ${sessionStartTime.toISOString()} to ${sessionEndTime.toISOString()}`);

    // Check if this is an old/past session (logged with past timestamp)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const isOldSession = sessionEndTime < oneHourAgo;

    console.log(`[ProcessSession] Current time: ${now.toISOString()}`);
    console.log(`[ProcessSession] Session end time: ${sessionEndTime.toISOString()}`);
    console.log(`[ProcessSession] Is old session (>1 hour ago): ${isOldSession}`);

    let filteredHrData = [];

    // 6. Fetch HR data from Google Fit
    if (isOldSession) {
      // OLD/PAST SESSION: Use progressive 3-cycle buffers (10min, 20min, 30min)
      console.log(
        `[ProcessSession] Session ${sessionId} - OLD SESSION detected, using progressive buffers...`
      );

      const bufferCycles = [
        { name: '10min', ms: 10 * 60 * 1000 },
        { name: '20min', ms: 20 * 60 * 1000 },
        { name: '30min', ms: 30 * 60 * 1000 }
      ];

      let allFetchedData = [];
      const seenTimestamps = new Set();

      for (const buffer of bufferCycles) {
        const fetchStartTime = new Date(sessionStartTime.getTime() - buffer.ms);
        const fetchEndTime = new Date(sessionEndTime.getTime() + buffer.ms);

        console.log(
          `[ProcessSession] Cycle ${buffer.name}: Fetching ${fetchStartTime.toISOString()} to ${fetchEndTime.toISOString()}`
        );

        try {
          const cycleData = await fetchGoogleFitData(
            accessToken,
            fetchStartTime,
            fetchEndTime
          );

          let newPoints = 0;
          cycleData.forEach(point => {
            if (!seenTimestamps.has(point.timestamp)) {
              seenTimestamps.add(point.timestamp);
              allFetchedData.push(point);
              newPoints++;
            }
          });

          console.log(
            `[ProcessSession] Cycle ${buffer.name}: Found ${cycleData.length} points, ${newPoints} new`
          );
        } catch (cycleError) {
          console.error(
            `[ProcessSession] Error in ${buffer.name} cycle:`,
            cycleError.message
          );
        }
      }

      console.log(
        `[ProcessSession] Total fetched across all cycles: ${allFetchedData.length} unique points`
      );

      // Filter to session window
      filteredHrData = allFetchedData.filter((reading) => {
        return (
          reading.timestamp >= sessionStartTime.getTime() &&
          reading.timestamp <= sessionEndTime.getTime()
        );
      });

      console.log(
        `[ProcessSession] Session ${sessionId} - After filtering to session window: ${filteredHrData.length} points`
      );

    } else {
      // RECENT SESSION: Use simple 3-minute buffer
      console.log(
        `[ProcessSession] Session ${sessionId} - RECENT SESSION, using standard 3-minute buffer...`
      );

      const bufferMs = 3 * 60 * 1000;
      const fetchStartTime = new Date(sessionStartTime.getTime() - bufferMs);
      const fetchEndTime = new Date(sessionEndTime.getTime() + bufferMs);

      console.log(
        `[ProcessSession] Fetch window: ${fetchStartTime.toISOString()} to ${fetchEndTime.toISOString()}`
      );

      const hrData = await fetchGoogleFitData(
        accessToken,
        fetchStartTime,
        fetchEndTime
      );

      // Filter to session window
      filteredHrData = hrData.filter((reading) => {
        return (
          reading.timestamp >= sessionStartTime.getTime() &&
          reading.timestamp <= sessionEndTime.getTime()
        );
      });

      console.log(
        `[ProcessSession] Session ${sessionId} - Fetched ${hrData.length} total points, ${filteredHrData.length} within session window`
      );
    }

    // 7. Check if we have any data at all (before imputation)
    // If we have zero data points, we need to retry or check historical
    if (filteredHrData.length === 0) {
      console.log(
        `[ProcessSession] Session ${sessionId} - No data available from Google Fit`
      );

      // NEW: Check if this is attempt 11 (final regular attempt)
      if (attemptNumber >= 11) {
        console.log(
          `[ProcessSession] Attempt 11 reached. Checking historical data...`
        );

        // Try historical data
        const historicalData = await HistoricalHRData.findAll({
          where: {
            patientId: session.patientId,
            recordedDate: session.sessionDate,
          },
          order: [["recordedTime", "ASC"]],
        });

        if (historicalData.length > 0) {
          const historicalHrData = historicalData.map((record) => ({
            timestamp: new Date(
              `${record.recordedDate}T${record.recordedTime}`
            ).getTime(),
            value: record.heartRate,
            isImputed: record.isImputed || false,
          }));

          const filteredHistoricalData = historicalHrData.filter((reading) => {
            return (
              reading.timestamp >= sessionStartTime.getTime() &&
              reading.timestamp <= sessionEndTime.getTime()
            );
          });

          if (filteredHistoricalData.length > 0) {
            console.log(
              `[ProcessSession] ✓ Using ${filteredHistoricalData.length} points from historical data`
            );

            // Replace filteredHrData with historical data and continue to imputation
            filteredHrData = filteredHistoricalData;
            // Continue to imputation step below which will fill any gaps
          } else {
            // Schedule attempt 12 (wait for next historical sync)
            console.log(
              `[ProcessSession] Historical data also has no points. Scheduling final attempt after next sync.`
            );
            await scheduleHistoricalSyncFallback(
              session,
              attemptNumber,
              { actualDataPoints: 0, completeness: 0 }
            );
            return;
          }
        } else {
          // No historical data - schedule attempt 12
          console.log(
            `[ProcessSession] No historical data yet. Scheduling final attempt after next sync.`
          );
          await scheduleHistoricalSyncFallback(
            session,
            attemptNumber,
            { actualDataPoints: 0, completeness: 0 }
          );
          return;
        }
      } else {
        // Not final attempt yet - schedule next retry
        await scheduleNextAttempt(session, attemptNumber, {
          result: "insufficient_data",
          dataPoints: 0,
          errorMessage: `No data available from Google Fit`,
        });
        return;
      }
    }

    // 8. We have data! Apply median imputation to fill missing minute gaps
    console.log(`[ProcessSession] Session ${sessionId} - Applying median imputation...`);
    const imputationResult = imputeMissingHRData(
      filteredHrData,
      sessionStartTime,
      sessionEndTime
    );
    const imputedHrData = imputationResult.data;
    const dataCompleteness = imputationResult.completeness;

    console.log(`[ProcessSession] Data completeness: ${(dataCompleteness * 100).toFixed(1)}% (${dataCompleteness})`);

    // Check if data completeness meets the threshold for this attempt
    const completenessPercentage = dataCompleteness * 100;
    const isDataSufficient = shouldAcceptPartialData(attemptNumber, completenessPercentage);

    if (!isDataSufficient) {
      console.log(
        `[ProcessSession] Insufficient data completeness: ${completenessPercentage.toFixed(1)}% (attempt ${attemptNumber})`
      );

      // Check if this is attempt 11 (trigger historical fallback)
      if (attemptNumber >= 11) {
        console.log(
          `[ProcessSession] Attempt 11 reached with insufficient data. Scheduling historical fallback...`
        );
        await scheduleHistoricalSyncFallback(session, attemptNumber, {
          actualDataPoints: filteredHrData.length,
          completeness: completenessPercentage,
        });
        return;
      }

      // Schedule next retry
      await scheduleNextAttempt(session, attemptNumber, {
        result: "insufficient_data",
        dataPoints: filteredHrData.length,
        errorMessage: `Only ${completenessPercentage.toFixed(1)}% data available (need ${shouldAcceptPartialData(attemptNumber, 100) ? '80%' : attemptNumber <= 6 ? '60%' : attemptNumber <= 9 ? '50%' : '40%'})`,
      });
      return;
    }

    console.log(
      `[ProcessSession] ✓ Data completeness acceptable: ${completenessPercentage.toFixed(1)}% (attempt ${attemptNumber})`
    );

    // Save the imputed data (includes both real and imputed points)
    if (imputedHrData.length > 0) {
      try {
        const hrRecords = formatHRDataForStorage(
          imputedHrData,
          session.patientId,
          session.sessionDate
        );
        await HistoricalHRData.bulkCreate(hrRecords, {
          ignoreDuplicates: true,
        });
        console.log(
          `[ProcessSession] ✓ Saved ${imputedHrData.length} HR data points to database (including imputed values)`
        );
      } catch (saveError) {
        console.error(`[ProcessSession] Error saving HR data:`, saveError);
      }
    }

    // 9. Data is complete after imputation! Process it
    console.log(`[ProcessSession] Session ${sessionId} - Processing complete data...`);

    // Calculate actual duration from session data
    const actualDurationMinutes = session.actualDuration || zones.sessionDuration;
    const plannedDurationMinutes = zones.sessionDuration;

    // Calculate scores using IMPUTED data with dynamic phase allocation
    const scores = calculateSessionScore(
      imputedHrData,
      zones,
      actualDurationMinutes,
      plannedDurationMinutes
    );
    const sessionRiskScore = scores.overallScore;

    // Calculate session risk level (based on session score)
    const sessionRiskLevel = determineRiskLevel(sessionRiskScore);

    // Get weekly score for cumulative risk level
    const weeklyScore = await WeeklyScore.findOne({
      where: {
        patientId: session.patientId,
        weekNumber: session.weekNumber,
      },
    });

    // Calculate overall risk level (based on cumulative score)
    const cumulativeScore = weeklyScore?.cumulativeScore || sessionRiskScore;
    const overallRiskLevel = determineRiskLevel(parseFloat(cumulativeScore));

    // Calculate vital score (vitals + session combined)
    const patientVitals = await PatientVital.findOne({
      where: { patientId: session.patientId },
    });

    let vitalScore = sessionRiskScore;
    let vitalRiskLevel = sessionRiskLevel;

    if (patientVitals) {
      const vitalsRawScore = calculateVitalsRiskScore(
        { age: user.age },
        {
          height: patientVitals.height,
          weight: patientVitals.weight,
          systolic: patientVitals.systolic,
          diastolic: patientVitals.diastolic,
          spo2: patientVitals.spo2,
          bloodGlucose: patientVitals.bloodGlucose,
        }
      );

      // Normalize vitals score to 0-100 (max vitals score ~30)
      const normalizedVitalsScore = (vitalsRawScore / 30) * 100;

      // INVERT: Higher vitals risk = lower score (to match session score direction)
      const invertedVitalsScore = 100 - normalizedVitalsScore;

      // Combined: 50% inverted vitals + 50% session
      vitalScore = 0.5 * invertedVitalsScore + 0.5 * sessionRiskScore;
      vitalRiskLevel = determineVitalRiskLevel(vitalScore);

      console.log(`[VitalScore] Patient ${session.patientId}:`);
      console.log(`  Vitals Raw Score: ${vitalsRawScore}/30 (risk level)`);
      console.log(
        `  Inverted Vitals Score: ${invertedVitalsScore.toFixed(
          2
        )}/100 (health level)`
      );
      console.log(`  Session Score: ${sessionRiskScore}/100`);
      console.log(
        `  Combined Vital Score: ${vitalScore.toFixed(
          2
        )}/100 (${vitalRiskLevel})`
      );
    }

    // Calculate HR statistics using imputed data
    const hrValues = extractHRValues(imputedHrData);
    const hrStats = calculateHRStats(hrValues);

    // Generate summary
    const summary = generateSessionSummary(
      overallRiskLevel,
      sessionRiskScore,
      zones,
      hrStats
    );

    // Update retry schedule with success
    const updatedSchedule = updateRetryScheduleItem(
      session.retrySchedule,
      attemptNumber,
      {
        result: "success",
        dataPoints: imputedHrData.length,
      }
    );

    // 10. Update session as completed
    await session.update({
      sessionDuration: zones.sessionDuration, // Store as integer (minutes)
      sessionRiskScore,
      sessionRiskLevel,
      warmupScore: scores.warmupScore,
      exerciseScore: scores.exerciseScore,
      cooldownScore: scores.cooldownScore,
      overallScore: scores.overallScore,
      vitalScore: vitalScore.toFixed(2),
      vitalRiskLevel,
      riskLevel: overallRiskLevel,
      maxHR: hrStats.maxHR,
      minHR: hrStats.minHR,
      avgHR: hrStats.avgHR,
      dataCompleteness: dataCompleteness, // NEW: Store completeness as decimal 0-1
      status: "completed",
      summary,
      attemptCount: attemptNumber,
      retrySchedule: updatedSchedule,
      lastAttemptAt: new Date(),
    });

    // 11. Update weekly scores
    await updateWeeklyScores(session.patientId, session.weekNumber);

    // 12. Calculate and update baseline score (at sessions 1, 3, 7, 14)
    await calculateBaselineScore(session.patientId);

    // 13. Determine and update health status
    const healthStatus = await determineHealthStatus(
      session.patientId,
      sessionRiskScore
    );
    if (healthStatus) {
      await session.update({ healthStatus });
      console.log(
        `[ProcessSession] Session ${sessionId} - Health status: ${healthStatus}`
      );
    }

    // 14. Send results to Spectrum
    try {
      console.log(
        `[ProcessSession] Session ${sessionId} - Sending results to Spectrum`
      );

      // Reload session to ensure we have latest data
      const completedSession = await Session.findByPk(sessionId);

      // Get latest baseline threshold for resting HR
      const latestThreshold = await BaselineThreshold.findOne({
        where: { patientId: completedSession.patientId },
        order: [["calculatedAtSession", "DESC"]],
      });

      // Prepare HR data
      const hrDataForSpectrum = {
        maxHR: completedSession.maxHR,
        minHR: completedSession.minHR,
        avgHR: completedSession.avgHR,
      };

      // Prepare scores with all metrics
      const scoresForSpectrum = {
        sessionRiskScore: parseFloat(completedSession.sessionRiskScore) || 0,
        sessionRiskLevel: completedSession.sessionRiskLevel || "Low",
        cumulativeRiskScore:
          parseFloat(weeklyScore?.cumulativeScore) ||
          parseFloat(completedSession.sessionRiskScore) ||
          0,
        riskLevel: completedSession.riskLevel || "Low",
        vitalScore: parseFloat(completedSession.vitalScore) || 0,
        vitalRiskLevel: completedSession.vitalRiskLevel || "Low",
        baselineScore: parseFloat(completedSession.baselineScore) || 0,
        restingHeartRate: latestThreshold?.restingHeartRate || 0,
        summary: completedSession.healthStatus || "unknown",
      };

      // Format for Spectrum
      const spectrumData = formatForSpectrum(
        completedSession,
        hrDataForSpectrum,
        scoresForSpectrum,
        zones
      );

      // Send to Spectrum
      const result = await sendToSpectrum(sessionId, spectrumData);

      if (result.success) {
        // Update database to track successful send
        await completedSession.update({
          sentToSpectrum: true,
          spectrumSentAt: new Date(),
          spectrumResponseStatus: 'success'
        });
        console.log(
          `[ProcessSession] Session ${sessionId} - ✓ Successfully sent to Spectrum and updated DB`
        );
      } else {
        // Update database to track failed send
        await completedSession.update({
          sentToSpectrum: false,
          spectrumResponseStatus: 'failed'
        });
        console.error(
          `[ProcessSession] Session ${sessionId} - ✗ Failed to send to Spectrum:`,
          result.error
        );
      }
    } catch (error) {
      console.error(
        `[ProcessSession] Session ${sessionId} - Error sending to Spectrum:`,
        error
      );
      // Update database to track error
      try {
        const completedSession = await Session.findByPk(sessionId);
        if (completedSession) {
          await completedSession.update({
            sentToSpectrum: false,
            spectrumResponseStatus: 'failed'
          });
        }
      } catch (updateError) {
        console.error(
          `[ProcessSession] Session ${sessionId} - Error updating DB after Spectrum failure:`,
          updateError
        );
      }
    }

    console.log(
      `[ProcessSession] Session ${sessionId} - ✓ Completed successfully!`
    );
  } catch (error) {
    console.error(`[ProcessSession] Session ${sessionId} - Error:`, error);

    if (session) {
      const attemptNumber = session.attemptCount + 1;
      await scheduleNextAttempt(session, attemptNumber, {
        result: "error",
        dataPoints: 0,
        errorMessage: error.message,
      });
    }
  } finally {
    if (lockAcquired && session) {
      await releaseTokenLock(session.patientId);
    }
  }
};

// NEW HELPER FUNCTIONS - Add these at the end of the file

// Helper: Schedule historical sync fallback
const scheduleHistoricalSyncFallback = async (
  session,
  attemptNumber,
  dataValidation
) => {
  try {
    const nextSyncTime = getNextHistoricalSyncTime();
    const fallbackAttemptTime = new Date(
      nextSyncTime.getTime() + 10 * 60 * 1000
    );

    console.log(
      `[HistoricalFallback] Next historical sync at ${nextSyncTime.toISOString()}`
    );
    console.log(
      `[HistoricalFallback] Scheduling attempt 12 for ${fallbackAttemptTime.toISOString()}`
    );

    const updatedSchedule = updateRetryScheduleItem(
      session.retrySchedule,
      attemptNumber,
      {
        result: "insufficient_data",
        dataPoints: dataValidation.actualDataPoints,
        errorMessage: `Only ${dataValidation.completeness}% data available`,
      }
    );

    updatedSchedule.push({
      attempt: 12,
      scheduledFor: fallbackAttemptTime.toISOString(),
      status: "pending",
      result: null,
      dataPoints: null,
      executedAt: null,
      errorMessage: null,
    });

    await session.update({
      status: "pending_sync",
      attemptCount: attemptNumber,
      retrySchedule: updatedSchedule,
      nextAttemptAt: fallbackAttemptTime,
      lastAttemptAt: new Date(),
    });

    console.log(
      `[HistoricalFallback] Session ${session.id} will retry after historical sync completes`
    );
  } catch (error) {
    console.error(`[HistoricalFallback] Error:`, error);
  }
};

// Helper: Get next historical sync time
// const getNextHistoricalSyncTime = () => {
//   const now = new Date();
//   const today2AM = new Date(now);
//   today2AM.setHours(2, 0, 0, 0);

//   const today2PM = new Date(now);
//   today2PM.setHours(14, 0, 0, 0);

//   if (now < today2AM) return today2AM;
//   if (now < today2PM) return today2PM;

//   const tomorrow2AM = new Date(now);
//   tomorrow2AM.setDate(now.getDate() + 1);
//   tomorrow2AM.setHours(2, 0, 0, 0);
//   return tomorrow2AM;
// };
// Helper: Get next historical sync time
const getNextHistoricalSyncTime = () => {
  const now = new Date();
  const syncHours = [0, 6, 12, 18]; // Midnight, 6 AM, Noon, 6 PM
  
  // Find next sync hour today
  for (const hour of syncHours) {
    const syncTime = new Date(now);
    syncTime.setHours(hour, 0, 0, 0);
    
    if (syncTime > now) {
      return syncTime;
    }
  }
  
  // If no more syncs today, return first sync tomorrow (midnight)
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return tomorrow;
};

// Helper: Process attempt 12 (historical fallback)
const processHistoricalFallbackAttempt = async (session) => {
  try {
    console.log(
      `[HistoricalFallback] Processing session ${session.id} using historical data`
    );

    const user = await User.findByPk(session.patientId);
    const zones = calculateHeartRateZones(
      user.age,
      user.betaBlockers,
      user.lowEF,
      session.weekNumber
    );
    const sessionStartTime = new Date(
      `${session.sessionDate}T${session.sessionStartTime}`
    );
    const sessionEndTime = new Date(
      sessionStartTime.getTime() + zones.sessionDuration * 60 * 1000
    );

    const historicalData = await HistoricalHRData.findAll({
      where: {
        patientId: session.patientId,
        recordedDate: session.sessionDate,
      },
      order: [["recordedTime", "ASC"]],
    });

    if (historicalData.length === 0) {
      console.log(`[HistoricalFallback] No historical data found`);
      await session.update({
        status: "data_unavailable",
        attemptCount: 12,
        failureReason: "No data available even after historical sync",
      });
      return;
    }

    const filteredHrData = historicalData
      .map((r) => ({
        timestamp: new Date(`${r.recordedDate}T${r.recordedTime}`).getTime(),
        value: r.heartRate,
      }))
      .filter(
        (r) =>
          r.timestamp >= sessionStartTime.getTime() &&
          r.timestamp <= sessionEndTime.getTime()
      );

    const dataValidation = validateDataQuality(
      filteredHrData,
      zones.sessionDuration
    );

    console.log(
      `[HistoricalFallback] Found ${filteredHrData.length} points (${dataValidation.completeness}%)`
    );

    if (dataValidation.completeness < 40) {
      await session.update({
        status: "data_unavailable",
        attemptCount: 12,
        failureReason: `Insufficient data even after historical sync (${dataValidation.completeness}%)`,
      });
      return;
    }

    // Process session (same as normal processing)
    console.log(
      `[HistoricalFallback] Processing session with ${filteredHrData.length} points...`
    );

    // Calculate actual duration from session data
    const actualDurationMinutes = session.actualDuration || zones.sessionDuration;
    const plannedDurationMinutes = zones.sessionDuration;

    const scores = calculateSessionScore(
      filteredHrData,
      zones,
      actualDurationMinutes,
      plannedDurationMinutes
    );
    const sessionRiskScore = scores.overallScore;
    const sessionRiskLevel = determineRiskLevel(sessionRiskScore);

    const weeklyScore = await WeeklyScore.findOne({
      where: { patientId: session.patientId, weekNumber: session.weekNumber },
    });

    const cumulativeScore = weeklyScore?.cumulativeScore || sessionRiskScore;
    const overallRiskLevel = determineRiskLevel(parseFloat(cumulativeScore));

    const hrValues = extractHRValues(filteredHrData);
    const hrStats = calculateHRStats(hrValues);

    const summary = generateSessionSummary(
      overallRiskLevel,
      sessionRiskScore,
      zones,
      hrStats
    );

    await session.update({
      sessionDuration: zones.sessionDuration, // Store as integer (minutes)
      sessionRiskScore,
      sessionRiskLevel,
      warmupScore: scores.warmupScore,
      exerciseScore: scores.exerciseScore,
      cooldownScore: scores.cooldownScore,
      overallScore: scores.overallScore,
      riskLevel: overallRiskLevel,
      maxHR: hrStats.maxHR,
      minHR: hrStats.minHR,
      avgHR: hrStats.avgHR,
      status: "completed",
      summary,
      attemptCount: 12,
      lastAttemptAt: new Date(),
    });

    await updateWeeklyScores(session.patientId, session.weekNumber);
    await calculateBaselineScore(session.patientId);

    console.log(
      `[HistoricalFallback] ✓ Session ${session.id} processed successfully`
    );
  } catch (error) {
    console.error(`[HistoricalFallback] Error:`, error);
    await session.update({
      status: "data_unavailable",
      failureReason: error.message,
    });
  }
};

const scheduleNextAttempt = async (session, attemptNumber, result) => {
  try {
    // Update retry schedule with this attempt's result
    const updatedSchedule = updateRetryScheduleItem(
      session.retrySchedule,
      attemptNumber,
      result
    );

    // Check if there are more attempts
    const nextPending = getNextPendingAttempt(updatedSchedule);

    if (!nextPending) {
      // No more attempts - mark as failed
      await session.update({
        status: "data_unavailable",
        attemptCount: attemptNumber,
        retrySchedule: updatedSchedule,
        lastAttemptAt: new Date(),
        failureReason: "All retry attempts exhausted without sufficient data",
      });
      console.log(
        `[ScheduleNext] Session ${session.id} - All attempts exhausted`
      );
      return;
    }

    // Calculate next attempt from NOW, not from session start
    const nextAttemptTime = calculateNextAttemptTime(
      new Date(),
      nextPending.attempt
    );

    await session.update({
      attemptCount: attemptNumber,
      retrySchedule: updatedSchedule,
      nextAttemptAt: nextAttemptTime,
      lastAttemptAt: new Date(),
    });

    console.log(
      `[ScheduleNext] Session ${session.id} - Next attempt #${nextPending.attempt} scheduled for ${nextAttemptTime}`
    );
  } catch (error) {
    console.error(`[ScheduleNext] Error scheduling next attempt:`, error);
  }
};
// ========================================
// UPDATE WEEKLY SCORES
// ========================================
// const updateWeeklyScores = async (patientId, weekNumber) => {
//   try {
//     // Get all completed sessions for this week
//     const sessions = await Session.findAll({
//       where: {
//         patientId,
//         weekNumber,
//         status: 'completed',
//         sessionRiskScore: { [Op.not]: null }
//       },
//       order: [['sessionRiskScore', 'DESC']]
//     });

//     // Mark all as not counted first
//     await Session.update(
//       { isCountedInWeekly: false },
//       { where: { patientId, weekNumber } }
//     );

//     // Select top 3
//     const topThree = sessions.slice(0, 3);

//     if (topThree.length === 0) return;

//     // Mark top 3 as counted
//     await Session.update(
//       { isCountedInWeekly: true },
//       { where: { id: topThree.map(s => s.id) } }
//     );

//     // Calculate weekly score (average of top 3)
//     const weeklyScore = topThree.reduce((sum, s) => sum + parseFloat(s.sessionRiskScore), 0) / topThree.length;

//     // Upsert weekly score
//     await WeeklyScore.upsert({
//       patientId,
//       weekNumber,
//       weeklyScore: weeklyScore.toFixed(2),
//       cumulativeScore: weeklyScore.toFixed(2)
//     });

//     console.log(`[UpdateWeeklyScores] Updated weekly score for ${patientId}, week ${weekNumber}: ${weeklyScore.toFixed(2)}`);

//   } catch (error) {
//     console.error('[UpdateWeeklyScores] Error:', error);
//   }
// };
const updateWeeklyScores = async (patientId, weekNumber) => {
  try {
    // Get all completed sessions for this week
    const sessions = await Session.findAll({
      where: {
        patientId,
        weekNumber,
        status: "completed",
        sessionRiskScore: { [Op.not]: null },
      },
      order: [["sessionRiskScore", "DESC"]],
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
      { where: { id: topThree.map((s) => s.id) } }
    );

    // Calculate weekly score (average of top 3)
    const weeklyScore =
      topThree.reduce((sum, s) => sum + parseFloat(s.sessionRiskScore), 0) /
      topThree.length;

    // Calculate cumulative score (Weekly Score formula)
    let cumulativeScore;

    if (weekNumber === 1) {
      // For Week 1: Weekly Score_1 = FinalScore_1
      cumulativeScore = weeklyScore;
    } else {
      // For Week n (n >= 2): WeeklyScore_n = 0.6*(FinalScore_n) + 0.4*(FinalScore_(n-1))
      const previousWeek = await WeeklyScore.findOne({
        where: {
          patientId,
          weekNumber: weekNumber - 1,
        },
      });

      if (previousWeek) {
        // Formula: 0.6 * current weekly + 0.4 * previous weekly
        cumulativeScore =
          0.6 * weeklyScore + 0.4 * parseFloat(previousWeek.weeklyScore);
      } else {
        // Fallback if previous week not found
        cumulativeScore = weeklyScore;
      }
    }

    // Upsert weekly score
    await WeeklyScore.upsert({
      patientId,
      weekNumber,
      weeklyScore: weeklyScore.toFixed(2),
      cumulativeScore: cumulativeScore.toFixed(2),
    });

    console.log(
      `[UpdateWeeklyScores] Updated weekly score for ${patientId}, week ${weekNumber}: ${weeklyScore.toFixed(
        2
      )}, cumulative: ${cumulativeScore.toFixed(2)}`
    );
  } catch (error) {
    console.error("[UpdateWeeklyScores] Error:", error);
  }
};

const calculateRestingHeartRate = async (patientId, totalSessions) => {
  try {
    // Only calculate at sessions 3, 7, and 14
    if (![3, 7, 14].includes(totalSessions)) {
      return null;
    }

    // Get all session time windows to exclude
    const allSessions = await Session.findAll({
      where: {
        patientId,
        status: "completed",
      },
      attributes: ["sessionDate", "sessionStartTime", "sessionDuration"],
    });

    // Get all historical HR data
    const allHRData = await HistoricalHRData.findAll({
      where: { patientId },
      attributes: ["recordedDate", "recordedTime", "heartRate"],
    });

    // Filter out data that falls within session times
    const nonSessionData = allHRData.filter((hr) => {
      const hrTimestamp = new Date(`${hr.recordedDate}T${hr.recordedTime}`);

      // Check if this HR reading falls within any session window
      for (const session of allSessions) {
        const sessionStart = new Date(
          `${session.sessionDate}T${session.sessionStartTime}`
        );
        const durationMinutes = session.sessionDuration; // Already integer (minutes)
        const sessionEnd = new Date(
          sessionStart.getTime() + durationMinutes * 60 * 1000
        );

        if (hrTimestamp >= sessionStart && hrTimestamp <= sessionEnd) {
          return false; // Exclude this reading
        }
      }
      return true; // Include this reading
    });

    // Step 1: Filter to keep only 50-80 bpm
    const filteredData = nonSessionData
      .map((hr) => hr.heartRate)
      .filter((hr) => hr >= 50 && hr <= 80);

    if (filteredData.length === 0) {
      console.log(`[RestingHR] No valid data for patient ${patientId}`);
      return 0;
    }

    // Step 2: Calculate mean and standard deviation
    const mean =
      filteredData.reduce((sum, val) => sum + val, 0) / filteredData.length;
    const variance =
      filteredData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      filteredData.length;
    const stdDev = Math.sqrt(variance);

    // Step 3: Calculate bounds (mean ± 2×SD)
    const lowerBound = mean - 2 * stdDev;
    const upperBound = mean + 2 * stdDev;

    // Step 4: Remove outliers
    const cleanedData = filteredData.filter(
      (hr) => hr >= lowerBound && hr <= upperBound
    );

    if (cleanedData.length === 0) {
      console.log(
        `[RestingHR] No data after outlier removal for patient ${patientId}`
      );
      return 0;
    }

    // Step 5: Find median
    cleanedData.sort((a, b) => a - b);
    const median =
      cleanedData.length % 2 === 0
        ? (cleanedData[cleanedData.length / 2 - 1] +
            cleanedData[cleanedData.length / 2]) /
          2
        : cleanedData[Math.floor(cleanedData.length / 2)];

    console.log(
      `[RestingHR] Patient ${patientId} at session ${totalSessions}:`
    );
    console.log(
      `  Initial readings: ${nonSessionData.length}, After 50-80 filter: ${filteredData.length}`
    );
    console.log(`  Mean: ${mean.toFixed(2)}, SD: ${stdDev.toFixed(2)}`);
    console.log(
      `  After outlier removal: ${
        cleanedData.length
      }, Median (Resting HR): ${median.toFixed(2)}`
    );

    return parseFloat(median.toFixed(2));
  } catch (error) {
    console.error("[RestingHR] Error calculating resting heart rate:", error);
    return null;
  }
};

// Independent session processing removed - all sessions now processed uniformly above

// ========================================
// AUTO-STOP SESSIONS AT PLANNED END TIME
// ========================================
export const autoStopExpiredSessions = async () => {
  try {
    console.log("[AutoStop] Checking for sessions that reached their planned end time...");
    const now = new Date();

    // Find active sessions where current time >= estimated end time (from start + planned duration)
    const activeSessions = await Session.findAll({
      where: {
        status: 'active'
      }
    });

    if (activeSessions.length === 0) {
      console.log("[AutoStop] No active sessions found");
      return;
    }

    let stoppedCount = 0;

    for (const session of activeSessions) {
      // Use the planned end time that was already set at session START (based on rehab plan)
      const plannedEndTime = new Date(`${session.sessionDate}T${session.sessionEndTime}`);

      // If current time is past planned end time, auto-transition to in_progress
      if (now >= plannedEndTime) {
        // Session end time and actualDuration are already set from START (based on rehab plan)
        // Just transition status to 'in_progress' so retry worker can pick it up
        // processingStartsAt is already set from START

        await session.update({
          status: 'in_progress'
          // Don't update sessionEndTime, actualDuration, or processingStartsAt - they were already set correctly at START
        });

        stoppedCount++;
        console.log(`[AutoStop] Session ${session.id} (patient ${session.patientId}) auto-transitioned to in_progress at planned end time. Duration: ${session.actualDuration} min, Processing starts at: ${session.processingStartsAt}`);
      }
    }

    if (stoppedCount > 0) {
      console.log(`[AutoStop] Auto-stopped ${stoppedCount} session(s)`);
    } else {
      console.log("[AutoStop] No sessions needed auto-stop");
    }
  } catch (error) {
    console.error('[AutoStop] Error during auto-stop:', error);
  }
};

// ========================================
// CLEANUP ABANDONED SESSIONS
// ========================================
export const cleanupAbandonedSessions = async () => {
  try {
    console.log("[CleanupWorker] Checking for abandoned sessions...");
    const now = new Date();

    // Find sessions that have been 'active' for more than 2 hours
    const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);

    const abandonedSessions = await Session.findAll({
      where: {
        status: 'active',
        createdAt: {
          [Op.lt]: twoHoursAgo
        }
      }
    });

    if (abandonedSessions.length === 0) {
      console.log("[CleanupWorker] No abandoned sessions found");
      return;
    }

    console.log(`[CleanupWorker] Found ${abandonedSessions.length} abandoned sessions`);

    for (const session of abandonedSessions) {
      await session.update({
        status: 'abandoned',
        failureReason: 'Session was started but never stopped (abandoned after 2 hours)'
      });

      console.log(`[CleanupWorker] Marked session ${session.id} (patient ${session.patientId}) as abandoned`);
    }

    console.log(`[CleanupWorker] Cleanup complete - marked ${abandonedSessions.length} sessions as abandoned`);
  } catch (error) {
    console.error('[CleanupWorker] Error during cleanup:', error);
  }
};

// ========================================
// START RETRY WORKER (Call this from server.js)
// ========================================
export const startRetryWorker = () => {
  // Run workers immediately on startup
  runRetryWorker();
  autoStopExpiredSessions();
  cleanupAbandonedSessions();

  // Run retry worker every 5 minutes
  const retryIntervalMinutes = 5;
  const retryIntervalMs = retryIntervalMinutes * 60 * 1000;

  setInterval(() => {
    runRetryWorker();
  }, retryIntervalMs);

  // Run auto-stop worker every 1 minute (to catch sessions at their end time promptly)
  const autoStopIntervalMinutes = 1;
  const autoStopIntervalMs = autoStopIntervalMinutes * 60 * 1000;

  setInterval(() => {
    autoStopExpiredSessions();
  }, autoStopIntervalMs);

  // Run cleanup worker every 30 minutes
  const cleanupIntervalMinutes = 30;
  const cleanupIntervalMs = cleanupIntervalMinutes * 60 * 1000;

  setInterval(() => {
    cleanupAbandonedSessions();
  }, cleanupIntervalMs);

  console.log(
    `[RetryWorker] Started - Running every ${retryIntervalMinutes} minutes`
  );
  console.log(
    `[AutoStop] Started - Running every ${autoStopIntervalMinutes} minute(s)`
  );
  console.log(
    `[CleanupWorker] Started - Running every ${cleanupIntervalMinutes} minutes`
  );
};
