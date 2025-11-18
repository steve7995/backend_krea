/**
 * MOCK USER GROUPS - TEST DATA SEED SCRIPT
 * ========================================================================
 *
 * This script creates 4 mock user groups to test the complete rehab program:
 * - Group A: Best Case (Alex Johnson, 35, no beta blockers, no low EF)
 * - Group B: Moderate+ Case (Maria Santos, 45, no beta blockers, no low EF)
 * - Group C: Moderate- Case (Robert Chen, 58, beta blockers, no low EF)
 * - Group D: Worst Case (Patricia Williams, 65, beta blockers, low EF)
 *
 * Each group has 6 sessions with realistic progression patterns.
 */

import sequelize from '../database/db.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import BaselineThreshold from '../models/BaselineThreshold.js';
import HistoricalHRData from '../models/HistoricalHRData.js';

// ========================================
// MOCK USER CONFIGURATIONS
// ========================================

const MOCK_USERS = [
  {
    // GROUP A - BEST CASE
    patientId: 'MOCK_ALEX_JOHNSON',
    name: 'Alex Johnson',
    age: 35,
    betaBlockers: false,
    lowEF: false,
    regime: 12,
    sessions: [
      { week: 1, score: 85, riskLevel: 'Low', restingHR: 72, avgHR: 115, minHR: 65, maxHR: 145 },
      { week: 2, score: 88, riskLevel: 'Low', restingHR: 71, avgHR: 114, minHR: 64, maxHR: 143 },
      { week: 3, score: 90, riskLevel: 'Low', restingHR: 70, avgHR: 113, minHR: 63, maxHR: 142, baseline: 87.7 },
      { week: 4, score: 91, riskLevel: 'Low', restingHR: 68, avgHR: 112, minHR: 62, maxHR: 140 },
      { week: 5, score: 92, riskLevel: 'Low', restingHR: 67, avgHR: 111, minHR: 61, maxHR: 138 },
      { week: 6, score: 94, riskLevel: 'Low', restingHR: 64, avgHR: 109, minHR: 59, maxHR: 135, baseline: 90.5 }
    ]
  },
  {
    // GROUP B - MODERATE+ CASE
    patientId: 'MOCK_MARIA_SANTOS',
    name: 'Maria Santos',
    age: 45,
    betaBlockers: false,
    lowEF: false,
    regime: 12,
    sessions: [
      { week: 1, score: 68, riskLevel: 'Moderate', restingHR: 76, avgHR: 120, minHR: 70, maxHR: 155 },
      { week: 2, score: 70, riskLevel: 'Moderate', restingHR: 75, avgHR: 119, minHR: 69, maxHR: 153 },
      { week: 3, score: 72, riskLevel: 'Low', restingHR: 75, avgHR: 118, minHR: 68, maxHR: 152, baseline: 70 },
      { week: 4, score: 73, riskLevel: 'Low', restingHR: 74, avgHR: 117, minHR: 67, maxHR: 150 },
      { week: 5, score: 74, riskLevel: 'Low', restingHR: 73, avgHR: 116, minHR: 66, maxHR: 148 },
      { week: 6, score: 76, riskLevel: 'Low', restingHR: 72, avgHR: 115, minHR: 65, maxHR: 145, baseline: 73.2 }
    ]
  },
  {
    // GROUP C - MODERATE- CASE
    patientId: 'MOCK_ROBERT_CHEN',
    name: 'Robert Chen',
    age: 58,
    betaBlockers: true,
    lowEF: false,
    regime: 12,
    sessions: [
      { week: 1, score: 55, riskLevel: 'Moderate', restingHR: 80, avgHR: 105, minHR: 75, maxHR: 125 },
      { week: 2, score: 56, riskLevel: 'Moderate', restingHR: 82, avgHR: 106, minHR: 76, maxHR: 126 },
      { week: 3, score: 58, riskLevel: 'Moderate', restingHR: 79, avgHR: 105, minHR: 74, maxHR: 124, baseline: 56.3 },
      { week: 4, score: 58, riskLevel: 'Moderate', restingHR: 78, avgHR: 104, minHR: 73, maxHR: 123 },
      { week: 5, score: 59, riskLevel: 'Moderate', restingHR: 80, avgHR: 105, minHR: 75, maxHR: 125 },
      { week: 6, score: 60, riskLevel: 'Moderate', restingHR: 81, avgHR: 106, minHR: 76, maxHR: 126, baseline: 58 }
    ]
  },
  {
    // GROUP D - WORST CASE
    patientId: 'MOCK_PATRICIA_WILLIAMS',
    name: 'Patricia Williams',
    age: 65,
    betaBlockers: true,
    lowEF: true,
    regime: 12,
    sessions: [
      { week: 1, score: 42, riskLevel: 'High', restingHR: 86, avgHR: 95, minHR: 80, maxHR: 110 },
      { week: 2, score: 40, riskLevel: 'High', restingHR: 87, avgHR: 96, minHR: 81, maxHR: 111 },
      { week: 3, score: 38, riskLevel: 'High', restingHR: 86, avgHR: 95, minHR: 80, maxHR: 110, baseline: 40 },
      { week: 4, score: 36, riskLevel: 'High', restingHR: 88, avgHR: 97, minHR: 82, maxHR: 112 },
      { week: 5, score: 35, riskLevel: 'High', restingHR: 89, avgHR: 98, minHR: 83, maxHR: 113 },
      { week: 6, score: 33, riskLevel: 'High', restingHR: 91, avgHR: 100, minHR: 85, maxHR: 115, baseline: 35.3 }
    ]
  }
];

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Calculate heart rate zones based on patient characteristics
 */
function calculateHeartRateZones(age, betaBlockers, lowEF, weekNumber) {
  const maxPermissibleHR = 220 - age;

  // Weekly % of MPR (70%, 71%, 71%, 72%, 73%, 73%, 74%, 75%, 75%, 76%, 77%, 78%)
  const weeklyPercentages = [70, 71, 71, 72, 73, 73, 74, 75, 75, 76, 77, 78];
  let mprPercentage = weeklyPercentages[weekNumber - 1];

  // Apply adjustments
  if (betaBlockers && lowEF) {
    mprPercentage -= 20;
  } else if (betaBlockers) {
    mprPercentage -= 15;
  } else if (lowEF) {
    mprPercentage -= 10;
  }

  const adjustedTargetHR = Math.round((maxPermissibleHR * mprPercentage) / 100);

  return {
    targetHR: adjustedTargetHR,
    maxPermissibleHR,
    warmupZoneMin: adjustedTargetHR - 15,
    warmupZoneMax: adjustedTargetHR - 5,
    exerciseZoneMin: adjustedTargetHR - 5,
    exerciseZoneMax: adjustedTargetHR + 5,
    cooldownZoneMin: adjustedTargetHR,
    cooldownZoneMax: adjustedTargetHR + 10,
    sessionDuration: 19 + weekNumber
  };
}

/**
 * Calculate baseline score from first 3 sessions
 */
function calculateBaseline(sessions) {
  const scores = sessions.map(s => s.score);
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;

  // Calculate standard deviation
  const squareDiffs = scores.map(score => Math.pow(score - mean, 2));
  const avgSquareDiff = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  const stdDev = Math.sqrt(avgSquareDiff);

  return {
    baseline: parseFloat(mean.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2))
  };
}

/**
 * Generate realistic heart rate data for a session
 */
function generateHRData(sessionDate, sessionTime, avgHR, minHR, maxHR, durationMinutes) {
  const hrData = [];
  const startDateTime = new Date(`${sessionDate}T${sessionTime}`);

  // Generate one reading per minute
  for (let i = 0; i < durationMinutes; i++) {
    const timestamp = new Date(startDateTime.getTime() + (i * 60 * 1000));

    // Generate HR with variation around avgHR
    let hr;
    if (i < 5) {
      // Warmup: gradually increase from minHR to avgHR
      hr = minHR + Math.round((avgHR - minHR) * (i / 5));
    } else if (i >= durationMinutes - 5) {
      // Cooldown: gradually decrease from avgHR to minHR
      const cooldownProgress = (i - (durationMinutes - 5)) / 5;
      hr = avgHR - Math.round((avgHR - minHR) * cooldownProgress);
    } else {
      // Exercise: fluctuate around avgHR
      const variation = Math.floor(Math.random() * 10) - 5;
      hr = avgHR + variation;
    }

    // Ensure HR stays within min/max bounds
    hr = Math.max(minHR, Math.min(maxHR, hr));

    hrData.push({
      recordedDate: sessionDate,
      recordedTime: timestamp.toTimeString().split(' ')[0],
      heartRate: hr,
      activityType: 'exercise',
      dataSource: 'mock_data'
    });
  }

  return hrData;
}

/**
 * Determine health status based on session performance
 */
function determineHealthStatus(sessionScore, baselineScore) {
  if (!baselineScore) return 'consistent';

  const diff = sessionScore - baselineScore;
  const percentDiff = (diff / baselineScore) * 100;

  if (percentDiff >= 10) return 'strong_improvement';
  if (percentDiff >= 5) return 'improving';
  if (percentDiff >= -5) return 'consistent';
  if (percentDiff >= -10) return 'declining';
  return 'at_risk';
}

// ========================================
// MAIN SEED FUNCTION
// ========================================

async function seedMockUsers() {
  try {
    console.log('🌱 Starting Mock User Seeding Process...\n');

    // Start transaction
    const transaction = await sequelize.transaction();

    try {
      // Clear existing mock data
      console.log('🗑️  Clearing existing mock data...');
      await HistoricalHRData.destroy({
        where: {
          patientId: MOCK_USERS.map(u => u.patientId)
        },
        transaction
      });
      await BaselineThreshold.destroy({
        where: {
          patientId: MOCK_USERS.map(u => u.patientId)
        },
        transaction
      });
      await Session.destroy({
        where: {
          patientId: MOCK_USERS.map(u => u.patientId)
        },
        transaction
      });
      await User.destroy({
        where: {
          patientId: MOCK_USERS.map(u => u.patientId)
        },
        transaction
      });
      console.log('✅ Cleared existing mock data\n');

      // Process each mock user
      for (const mockUser of MOCK_USERS) {
        console.log(`\n📊 Processing ${mockUser.name} (${mockUser.patientId})`);
        console.log(`   Age: ${mockUser.age}, Beta Blockers: ${mockUser.betaBlockers}, Low EF: ${mockUser.lowEF}`);

        // Create user
        const user = await User.create({
          patientId: mockUser.patientId,
          age: mockUser.age,
          betaBlockers: mockUser.betaBlockers,
          lowEF: mockUser.lowEF,
          regime: mockUser.regime
        }, { transaction });
        console.log(`   ✅ Created user`);

        // Track baselines
        let currentBaseline = null;
        let baselineSessionNumbers = [];

        // Process each session
        for (let i = 0; i < mockUser.sessions.length; i++) {
          const sessionData = mockUser.sessions[i];
          const sessionNumber = i + 1;

          // Calculate heart rate zones for this week
          const zones = calculateHeartRateZones(
            mockUser.age,
            mockUser.betaBlockers,
            mockUser.lowEF,
            sessionData.week
          );

          // Determine session date (each session 1 week apart)
          const sessionDate = new Date();
          sessionDate.setDate(sessionDate.getDate() - (mockUser.sessions.length - sessionNumber) * 7);
          const sessionDateStr = sessionDate.toISOString().split('T')[0];
          const sessionStartTime = '10:00:00';
          const sessionEndTime = new Date(new Date(`${sessionDateStr}T${sessionStartTime}`) .getTime() + (zones.sessionDuration * 60 * 1000))
            .toTimeString().split(' ')[0];

          // Calculate baseline if this is session 3 or 6
          if (sessionData.baseline !== undefined) {
            const sessionsForBaseline = mockUser.sessions.slice(Math.max(0, i - 2), i + 1);
            const { baseline, stdDev } = calculateBaseline(sessionsForBaseline);
            currentBaseline = baseline;

            // Create baseline threshold record
            await BaselineThreshold.create({
              patientId: mockUser.patientId,
              calculatedAtSession: sessionNumber,
              baselineScore: baseline,
              standardDeviation: stdDev,
              thresholdMinus2SD: parseFloat((baseline - 2 * stdDev).toFixed(2)),
              thresholdMinus1SD: parseFloat((baseline - stdDev).toFixed(2)),
              thresholdPlus1SD: parseFloat((baseline + stdDev).toFixed(2)),
              thresholdPlus2SD: parseFloat((baseline + 2 * stdDev).toFixed(2)),
              restingHeartRate: sessionData.restingHR
            }, { transaction });

            baselineSessionNumbers.push(sessionNumber);
            console.log(`   📈 Session ${sessionNumber}: Baseline calculated = ${baseline}`);
          }

          // Determine health status
          const healthStatus = determineHealthStatus(sessionData.score, currentBaseline);

          // Create session
          const session = await Session.create({
            patientId: mockUser.patientId,
            weekNumber: sessionData.week,
            sessionAttemptNumber: 1,
            sessionDate: sessionDateStr,
            sessionStartTime: sessionStartTime,
            sessionEndTime: sessionEndTime,
            sessionDuration: zones.sessionDuration,
            actualDuration: zones.sessionDuration,
            sessionRiskScore: sessionData.score,
            baselineScore: currentBaseline,
            healthStatus: healthStatus,
            sessionRiskLevel: sessionData.riskLevel,
            riskLevel: sessionData.riskLevel,
            maxHR: sessionData.maxHR,
            minHR: sessionData.minHR,
            avgHR: sessionData.avgHR,
            targetHR: zones.targetHR,
            maxPermissibleHR: zones.maxPermissibleHR,
            warmupZoneMin: zones.warmupZoneMin,
            warmupZoneMax: zones.warmupZoneMax,
            exerciseZoneMin: zones.exerciseZoneMin,
            exerciseZoneMax: zones.exerciseZoneMax,
            cooldownZoneMin: zones.cooldownZoneMin,
            cooldownZoneMax: zones.cooldownZoneMax,
            isCountedInWeekly: true,
            summary: `Week ${sessionData.week} session completed. Risk: ${sessionData.riskLevel}. Score: ${sessionData.score}`,
            status: 'completed',
            sentToSpectrum: false,
            vitalScore: null,
            vitalRiskLevel: null,
            dataCompleteness: 1.0,
            attemptCount: 0
          }, { transaction });

          console.log(`   ✅ Session ${sessionNumber}: Week ${sessionData.week}, Score ${sessionData.score}, Risk ${sessionData.riskLevel}`);

          // Generate and insert heart rate data
          const hrDataPoints = generateHRData(
            sessionDateStr,
            sessionStartTime,
            sessionData.avgHR,
            sessionData.minHR,
            sessionData.maxHR,
            zones.sessionDuration
          );

          for (const hrPoint of hrDataPoints) {
            await HistoricalHRData.create({
              patientId: mockUser.patientId,
              ...hrPoint
            }, { transaction });
          }

          console.log(`   💓 Generated ${hrDataPoints.length} HR data points`);
        }

        // Print summary for this user
        const firstScore = mockUser.sessions[0].score;
        const lastScore = mockUser.sessions[mockUser.sessions.length - 1].score;
        const improvement = ((lastScore - firstScore) / firstScore * 100).toFixed(1);

        console.log(`\n   📊 Summary for ${mockUser.name}:`);
        console.log(`      Sessions Created: ${mockUser.sessions.length}`);
        console.log(`      Baselines Established: Session ${baselineSessionNumbers.join(', ')}`);
        console.log(`      Score Progression: ${firstScore} → ${lastScore} (${improvement > 0 ? '+' : ''}${improvement}%)`);
        console.log(`      Risk Trend: ${mockUser.sessions[0].riskLevel} → ${mockUser.sessions[mockUser.sessions.length - 1].riskLevel}`);
      }

      // Commit transaction
      await transaction.commit();

      console.log('\n\n🎉 Mock User Seeding Completed Successfully!\n');
      console.log('========================================');
      console.log('MOCK USERS CREATED:');
      console.log('========================================');
      for (const user of MOCK_USERS) {
        console.log(`✓ ${user.name} (${user.patientId})`);
        console.log(`  Age: ${user.age} | Beta Blockers: ${user.betaBlockers ? 'Yes' : 'No'} | Low EF: ${user.lowEF ? 'Yes' : 'No'}`);
        console.log(`  Sessions: ${user.sessions.length} | Scores: ${user.sessions[0].score}-${user.sessions[user.sessions.length - 1].score}\n`);
      }
      console.log('========================================\n');

    } catch (error) {
      // Rollback on error
      await transaction.rollback();
      throw error;
    }

  } catch (error) {
    console.error('❌ Error seeding mock users:', error);
    throw error;
  } finally {
    // Close database connection
    await sequelize.close();
  }
}

// ========================================
// RUN SCRIPT
// ========================================

// Execute if run directly
if (process.argv[1] === new URL(import.meta.url).pathname) {
  seedMockUsers()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default seedMockUsers;
