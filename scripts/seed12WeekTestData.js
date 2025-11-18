/**
 * COMPREHENSIVE 12-WEEK TEST DATA GENERATOR
 * ========================================================================
 *
 * This script creates extensive test data covering:
 * - 12 weeks of rehabilitation program
 * - 3 sessions per week (36 sessions total per user)
 * - Multiple user archetypes (Best, Good, Moderate, Poor, Declining)
 * - Data completeness variations (100%, 90%, 75%, 50%, <50%)
 * - Realistic progression patterns
 * - Edge cases and boundary conditions
 *
 * Total: 10 users × 36 sessions = 360 sessions
 */

import sequelize from '../database/db.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import BaselineThreshold from '../models/BaselineThreshold.js';
import HistoricalHRData from '../models/HistoricalHRData.js';

// ========================================
// TEST USER ARCHETYPES
// ========================================

const TEST_USERS = [
  // ========== PERFORMANCE ARCHETYPES ==========
  {
    // 1. BEST CASE - Young, healthy, consistent improvement
    patientId: 'TEST_BEST_PERFORMER',
    name: 'Alex Champion',
    age: 32,
    betaBlockers: false,
    lowEF: false,
    archetype: 'best',
    dataCompleteness: 1.0, // 100%
    description: 'Best case: Young, healthy, excellent adherence and improvement'
  },
  {
    // 2. GOOD CASE - Middle-aged, steady improvement
    patientId: 'TEST_GOOD_PERFORMER',
    name: 'Maria Progressive',
    age: 48,
    betaBlockers: false,
    lowEF: false,
    archetype: 'good',
    dataCompleteness: 1.0, // 100%
    description: 'Good case: Steady improvement, occasional plateaus'
  },
  {
    // 3. MODERATE CASE - Beta blockers, slow improvement
    patientId: 'TEST_MODERATE_PERFORMER',
    name: 'Robert Steady',
    age: 56,
    betaBlockers: true,
    lowEF: false,
    archetype: 'moderate',
    dataCompleteness: 1.0, // 100%
    description: 'Moderate case: Beta blockers, slow but steady progress'
  },
  {
    // 4. POOR CASE - Multiple risk factors, minimal improvement
    patientId: 'TEST_POOR_PERFORMER',
    name: 'Linda Struggling',
    age: 62,
    betaBlockers: true,
    lowEF: true,
    archetype: 'poor',
    dataCompleteness: 1.0, // 100%
    description: 'Poor case: Multiple risk factors, minimal improvement'
  },
  {
    // 5. DECLINING CASE - Gets worse over time
    patientId: 'TEST_DECLINING_PERFORMER',
    name: 'Patricia Declining',
    age: 67,
    betaBlockers: true,
    lowEF: true,
    archetype: 'declining',
    dataCompleteness: 1.0, // 100%
    description: 'Declining case: Performance worsens, needs intervention'
  },

  // ========== DATA COMPLETENESS VARIATIONS ==========
  {
    // 6. HIGH COMPLETENESS (90%)
    patientId: 'TEST_DATA_90PCT',
    name: 'Sarah AlmostComplete',
    age: 45,
    betaBlockers: false,
    lowEF: false,
    archetype: 'good',
    dataCompleteness: 0.90,
    description: 'Good performer with 90% data completeness'
  },
  {
    // 7. MODERATE COMPLETENESS (75%)
    patientId: 'TEST_DATA_75PCT',
    name: 'John MostlyThere',
    age: 52,
    betaBlockers: false,
    lowEF: false,
    archetype: 'moderate',
    dataCompleteness: 0.75,
    description: 'Moderate performer with 75% data completeness'
  },
  {
    // 8. LOW COMPLETENESS (50%)
    patientId: 'TEST_DATA_50PCT',
    name: 'Mike HalfData',
    age: 58,
    betaBlockers: true,
    lowEF: false,
    archetype: 'moderate',
    dataCompleteness: 0.50,
    description: 'Moderate performer with 50% data completeness'
  },
  {
    // 9. VERY LOW COMPLETENESS (30%)
    patientId: 'TEST_DATA_30PCT',
    name: 'Emma SparseData',
    age: 60,
    betaBlockers: true,
    lowEF: false,
    archetype: 'poor',
    dataCompleteness: 0.30,
    description: 'Poor performer with 30% data completeness'
  },
  {
    // 10. MIXED CASE - Completeness improves over time
    patientId: 'TEST_IMPROVING_DATA',
    name: 'Tom ImprovingData',
    age: 50,
    betaBlockers: false,
    lowEF: false,
    archetype: 'good',
    dataCompleteness: 'progressive', // Starts at 40%, improves to 100%
    description: 'Good performer with improving data quality over time'
  }
];

// ========================================
// PROGRESSION PATTERNS
// ========================================

/**
 * Generate session scores based on archetype
 * Returns array of 36 scores (12 weeks × 3 sessions)
 */
function generateProgressionPattern(archetype, age, betaBlockers, lowEF) {
  const scores = [];
  let baseScore;
  let improvement;
  let volatility;

  switch (archetype) {
    case 'best':
      baseScore = 82;
      improvement = 0.8; // Points per session
      volatility = 2; // ±2 points variation
      break;
    case 'good':
      baseScore = 68;
      improvement = 0.5;
      volatility = 3;
      break;
    case 'moderate':
      baseScore = 55;
      improvement = 0.25;
      volatility = 2;
      break;
    case 'poor':
      baseScore = 42;
      improvement = 0.1;
      volatility = 3;
      break;
    case 'declining':
      baseScore = 45;
      improvement = -0.3; // Negative improvement
      volatility = 4;
      break;
  }

  // Generate 36 session scores
  for (let session = 0; session < 36; session++) {
    const weekNumber = Math.floor(session / 3) + 1;

    // Base trend
    let score = baseScore + (improvement * session);

    // Add weekly pattern (sessions 2 and 3 slightly better than session 1 within same week)
    const sessionInWeek = session % 3;
    if (sessionInWeek === 1) score += 1;
    if (sessionInWeek === 2) score += 2;

    // Add realistic volatility
    const variation = (Math.random() - 0.5) * volatility * 2;
    score += variation;

    // Add occasional plateaus (weeks 4-5, 8-9)
    if (weekNumber >= 4 && weekNumber <= 5) {
      score -= improvement * 3; // Plateau
    }
    if (weekNumber >= 8 && weekNumber <= 9) {
      score -= improvement * 2; // Another plateau
    }

    // Add breakthrough in week 10 for improving cases
    if (weekNumber === 10 && improvement > 0) {
      score += improvement * 4;
    }

    // Ensure score stays within bounds (0-100)
    score = Math.max(0, Math.min(100, score));

    scores.push(parseFloat(score.toFixed(2)));
  }

  return scores;
}

/**
 * Determine risk level based on score
 */
function getRiskLevel(score) {
  if (score >= 70) return 'Low';
  if (score >= 50) return 'Moderate';
  return 'High';
}

/**
 * Determine health status based on score vs baseline
 */
function getHealthStatus(sessionScore, baselineScore) {
  if (!baselineScore) return 'consistent';

  const diff = sessionScore - baselineScore;
  const percentDiff = (diff / baselineScore) * 100;

  if (percentDiff >= 10) return 'strong_improvement';
  if (percentDiff >= 5) return 'improving';
  if (percentDiff >= -5) return 'consistent';
  if (percentDiff >= -10) return 'declining';
  return 'at_risk';
}

/**
 * Calculate heart rate zones
 */
function calculateHeartRateZones(age, betaBlockers, lowEF, weekNumber) {
  const maxPermissibleHR = 220 - age;

  const weeklyPercentages = [70, 71, 71, 72, 73, 73, 74, 75, 75, 76, 77, 78];
  let mprPercentage = weeklyPercentages[weekNumber - 1];

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
 * Generate heart rate statistics based on score and zones
 */
function generateHRStats(score, zones, archetype) {
  const targetHR = zones.targetHR;

  // Better scores = closer to target HR
  const performanceFactor = score / 100;

  let avgHR = targetHR + (Math.random() - 0.5) * 10 * (1 - performanceFactor);
  let minHR = Math.round(avgHR - 25 - (Math.random() * 10));
  let maxHR = Math.round(avgHR + 20 + (Math.random() * 10));

  // Ensure HR stays within realistic bounds
  avgHR = Math.round(Math.max(60, Math.min(zones.maxPermissibleHR - 10, avgHR)));
  minHR = Math.max(50, minHR);
  maxHR = Math.min(zones.maxPermissibleHR + 5, maxHR);

  return { avgHR, minHR, maxHR };
}

/**
 * Generate resting HR based on age and progression
 */
function generateRestingHR(age, sessionNumber, archetype) {
  let baseRestingHR = 60 + (age - 30) * 0.3;

  // Resting HR improves over time for improving cases
  if (archetype === 'best' || archetype === 'good') {
    baseRestingHR -= sessionNumber * 0.15; // Gradual improvement
  } else if (archetype === 'declining') {
    baseRestingHR += sessionNumber * 0.1; // Gradual decline
  }

  // Add variation
  baseRestingHR += (Math.random() - 0.5) * 4;

  return Math.round(Math.max(50, Math.min(100, baseRestingHR)));
}

/**
 * Calculate baseline from last 3 sessions
 */
function calculateBaseline(scores) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const squareDiffs = scores.map(score => Math.pow(score - mean, 2));
  const variance = squareDiffs.reduce((a, b) => a + b, 0) / squareDiffs.length;
  const stdDev = Math.sqrt(variance);

  return {
    baseline: parseFloat(mean.toFixed(2)),
    stdDev: parseFloat(stdDev.toFixed(2))
  };
}

/**
 * Generate HR data points with data completeness variation
 */
function generateHRData(sessionDate, sessionTime, avgHR, minHR, maxHR, durationMinutes, completeness) {
  const hrData = [];
  const startDateTime = new Date(`${sessionDate}T${sessionTime}`);

  // Calculate how many data points to generate based on completeness
  const totalPoints = durationMinutes;
  const pointsToGenerate = Math.floor(totalPoints * completeness);

  // Determine which minutes have data (random gaps for incomplete data)
  const availableMinutes = [];
  if (completeness >= 1.0) {
    // Full data
    for (let i = 0; i < durationMinutes; i++) availableMinutes.push(i);
  } else {
    // Random gaps
    const allMinutes = Array.from({ length: durationMinutes }, (_, i) => i);
    // Always include first and last minutes
    availableMinutes.push(0, durationMinutes - 1);
    // Randomly select remaining minutes
    while (availableMinutes.length < pointsToGenerate) {
      const randomMinute = allMinutes[Math.floor(Math.random() * allMinutes.length)];
      if (!availableMinutes.includes(randomMinute)) {
        availableMinutes.push(randomMinute);
      }
    }
    availableMinutes.sort((a, b) => a - b);
  }

  // Generate HR readings for available minutes
  for (const i of availableMinutes) {
    const timestamp = new Date(startDateTime.getTime() + (i * 60 * 1000));

    let hr;
    if (i < 5) {
      // Warmup
      hr = minHR + Math.round((avgHR - minHR) * (i / 5));
    } else if (i >= durationMinutes - 5) {
      // Cooldown
      const cooldownProgress = (i - (durationMinutes - 5)) / 5;
      hr = avgHR - Math.round((avgHR - minHR) * cooldownProgress);
    } else {
      // Exercise
      const variation = Math.floor(Math.random() * 12) - 6;
      hr = avgHR + variation;
    }

    hr = Math.max(minHR, Math.min(maxHR, hr));

    hrData.push({
      recordedDate: sessionDate,
      recordedTime: timestamp.toTimeString().split(' ')[0],
      heartRate: hr,
      activityType: 'exercise',
      dataSource: completeness >= 1.0 ? 'google_fit' : 'google_fit_partial'
    });
  }

  return hrData;
}

/**
 * Get data completeness for session
 */
function getSessionCompleteness(userCompleteness, sessionNumber) {
  if (typeof userCompleteness === 'number') {
    // Fixed completeness with slight variation
    return Math.max(0.1, Math.min(1.0, userCompleteness + (Math.random() - 0.5) * 0.1));
  } else if (userCompleteness === 'progressive') {
    // Improving completeness: 40% → 100% over 36 sessions
    const progress = sessionNumber / 36;
    return Math.max(0.4, Math.min(1.0, 0.4 + (0.6 * progress)));
  }
  return 1.0;
}

// ========================================
// MAIN SEED FUNCTION
// ========================================

async function seed12WeekTestData() {
  console.log('🌱 Starting 12-Week Comprehensive Test Data Generation...\n');
  console.log('📊 Configuration:');
  console.log(`   - Users: ${TEST_USERS.length}`);
  console.log(`   - Weeks per user: 12`);
  console.log(`   - Sessions per week: 3`);
  console.log(`   - Total sessions: ${TEST_USERS.length * 36}`);
  console.log('');

  const transaction = await sequelize.transaction();

  try {
    // Clear existing test data
    console.log('🗑️  Clearing existing test data...');
    const testPatientIds = TEST_USERS.map(u => u.patientId);

    await HistoricalHRData.destroy({ where: { patientId: testPatientIds }, transaction });
    await BaselineThreshold.destroy({ where: { patientId: testPatientIds }, transaction });
    await Session.destroy({ where: { patientId: testPatientIds }, transaction });
    await User.destroy({ where: { patientId: testPatientIds }, transaction });

    console.log('✅ Cleared existing test data\n');

    // Process each test user
    for (const testUser of TEST_USERS) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`📊 Processing: ${testUser.name} (${testUser.patientId})`);
      console.log(`   ${testUser.description}`);
      console.log(`   Age: ${testUser.age} | Beta Blockers: ${testUser.betaBlockers} | Low EF: ${testUser.lowEF}`);
      console.log(`${'='.repeat(70)}\n`);

      // Create user
      await User.create({
        patientId: testUser.patientId,
        age: testUser.age,
        betaBlockers: testUser.betaBlockers,
        lowEF: testUser.lowEF,
        regime: 12
      }, { transaction });

      // Generate progression pattern (36 scores)
      const sessionScores = generateProgressionPattern(
        testUser.archetype,
        testUser.age,
        testUser.betaBlockers,
        testUser.lowEF
      );

      let currentBaseline = null;
      const baselineUpdates = [];

      // Create 36 sessions (12 weeks × 3 sessions)
      for (let sessionNum = 0; sessionNum < 36; sessionNum++) {
        const weekNumber = Math.floor(sessionNum / 3) + 1;
        const sessionInWeek = (sessionNum % 3) + 1;
        const sessionScore = sessionScores[sessionNum];

        // Calculate baseline at sessions 3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36
        if ((sessionNum + 1) % 3 === 0) {
          const recentScores = sessionScores.slice(Math.max(0, sessionNum - 2), sessionNum + 1);
          const { baseline, stdDev } = calculateBaseline(recentScores);
          currentBaseline = baseline;

          const restingHR = generateRestingHR(testUser.age, sessionNum + 1, testUser.archetype);

          await BaselineThreshold.create({
            patientId: testUser.patientId,
            calculatedAtSession: sessionNum + 1,
            baselineScore: baseline,
            standardDeviation: stdDev,
            thresholdMinus2SD: parseFloat((baseline - 2 * stdDev).toFixed(2)),
            thresholdMinus1SD: parseFloat((baseline - stdDev).toFixed(2)),
            thresholdPlus1SD: parseFloat((baseline + stdDev).toFixed(2)),
            thresholdPlus2SD: parseFloat((baseline + 2 * stdDev).toFixed(2)),
            restingHeartRate: restingHR
          }, { transaction });

          baselineUpdates.push(sessionNum + 1);
        }

        // Calculate zones
        const zones = calculateHeartRateZones(
          testUser.age,
          testUser.betaBlockers,
          testUser.lowEF,
          weekNumber
        );

        // Generate HR stats
        const hrStats = generateHRStats(sessionScore, zones, testUser.archetype);
        const restingHR = generateRestingHR(testUser.age, sessionNum + 1, testUser.archetype);

        // Calculate session date (3 sessions per week, 2-3 days apart)
        const sessionDate = new Date();
        sessionDate.setDate(sessionDate.getDate() - ((36 - sessionNum) * 2)); // ~2 days apart
        const sessionDateStr = sessionDate.toISOString().split('T')[0];

        // Session times vary slightly
        const sessionHour = 9 + (sessionInWeek - 1) * 2; // 9am, 11am, 1pm
        const sessionStartTime = `${sessionHour.toString().padStart(2, '0')}:00:00`;
        const sessionEndTime = new Date(
          new Date(`${sessionDateStr}T${sessionStartTime}`).getTime() + (zones.sessionDuration * 60 * 1000)
        ).toTimeString().split(' ')[0];

        // Get data completeness for this session
        const sessionCompleteness = getSessionCompleteness(testUser.dataCompleteness, sessionNum + 1);

        // Determine health status
        const healthStatus = getHealthStatus(sessionScore, currentBaseline);
        const riskLevel = getRiskLevel(sessionScore);

        // Create session
        const session = await Session.create({
          patientId: testUser.patientId,
          weekNumber: weekNumber,
          sessionAttemptNumber: sessionInWeek,
          sessionDate: sessionDateStr,
          sessionStartTime: sessionStartTime,
          sessionEndTime: sessionEndTime,
          sessionDuration: zones.sessionDuration,
          actualDuration: zones.sessionDuration,
          sessionRiskScore: sessionScore,
          baselineScore: currentBaseline,
          healthStatus: healthStatus,
          sessionRiskLevel: riskLevel,
          riskLevel: riskLevel,
          maxHR: hrStats.maxHR,
          minHR: hrStats.minHR,
          avgHR: hrStats.avgHR,
          targetHR: zones.targetHR,
          maxPermissibleHR: zones.maxPermissibleHR,
          warmupZoneMin: zones.warmupZoneMin,
          warmupZoneMax: zones.warmupZoneMax,
          exerciseZoneMin: zones.exerciseZoneMin,
          exerciseZoneMax: zones.exerciseZoneMax,
          cooldownZoneMin: zones.cooldownZoneMin,
          cooldownZoneMax: zones.cooldownZoneMax,
          isCountedInWeekly: true,
          summary: `Week ${weekNumber}, Session ${sessionInWeek}. Score: ${sessionScore.toFixed(1)}, Risk: ${riskLevel}`,
          status: 'completed',
          sentToSpectrum: false,
          dataCompleteness: parseFloat(sessionCompleteness.toFixed(3)),
          attemptCount: 0
        }, { transaction });

        // Generate HR data
        const hrDataPoints = generateHRData(
          sessionDateStr,
          sessionStartTime,
          hrStats.avgHR,
          hrStats.minHR,
          hrStats.maxHR,
          zones.sessionDuration,
          sessionCompleteness
        );

        for (const hrPoint of hrDataPoints) {
          await HistoricalHRData.create({
            patientId: testUser.patientId,
            sessionId: session.id,
            ...hrPoint
          }, { transaction });
        }

        // Progress indicator
        if ((sessionNum + 1) % 6 === 0) {
          const progress = Math.round(((sessionNum + 1) / 36) * 100);
          console.log(`   ✅ Week ${weekNumber} completed (${progress}% done)`);
        }
      }

      // Summary for this user
      console.log(`\n   📈 Summary:`);
      console.log(`      Sessions: 36 (12 weeks × 3 sessions)`);
      console.log(`      Baselines: ${baselineUpdates.length} updates`);
      console.log(`      Score Range: ${Math.min(...sessionScores).toFixed(1)} - ${Math.max(...sessionScores).toFixed(1)}`);
      console.log(`      Score Trend: ${sessionScores[0].toFixed(1)} → ${sessionScores[35].toFixed(1)}`);
      console.log(`      Improvement: ${((sessionScores[35] - sessionScores[0]) / sessionScores[0] * 100).toFixed(1)}%`);
    }

    await transaction.commit();

    console.log('\n\n' + '='.repeat(70));
    console.log('🎉 12-WEEK TEST DATA GENERATION COMPLETED SUCCESSFULLY!');
    console.log('='.repeat(70));
    console.log('\n📊 Summary:');
    console.log(`   ✓ Users created: ${TEST_USERS.length}`);
    console.log(`   ✓ Total sessions: ${TEST_USERS.length * 36}`);
    console.log(`   ✓ Total HR data points: ~${TEST_USERS.length * 36 * 25} (varies by completeness)`);
    console.log('\n🧪 Test Users:');
    TEST_USERS.forEach(user => {
      console.log(`   • ${user.name} (${user.patientId})`);
      console.log(`     ${user.description}`);
    });
    console.log('\n' + '='.repeat(70) + '\n');

  } catch (error) {
    await transaction.rollback();
    console.error('❌ Error generating test data:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// ========================================
// RUN SCRIPT
// ========================================

if (process.argv[1] === new URL(import.meta.url).pathname) {
  seed12WeekTestData()
    .then(() => {
      console.log('✅ Script completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Script failed:', error);
      process.exit(1);
    });
}

export default seed12WeekTestData;
