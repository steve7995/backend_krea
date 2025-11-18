/**
 * COMPREHENSIVE TEST RUNNER & OBSERVATION GENERATOR
 * ========================================================================
 *
 * This script:
 * 1. Analyzes all test users and their 36 sessions
 * 2. Calculates key metrics and trends
 * 3. Generates detailed observations
 * 4. Exports results to CSV for Excel
 */

import sequelize from '../database/db.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import BaselineThreshold from '../models/BaselineThreshold.js';
import HistoricalHRData from '../models/HistoricalHRData.js';
import fs from 'fs';
import path from 'path';

// ========================================
// ANALYSIS FUNCTIONS
// ========================================

/**
 * Analyze a single user's 12-week program
 */
async function analyzeUser(patientId) {
  // Fetch user data
  const user = await User.findOne({ where: { patientId } });
  if (!user) {
    throw new Error(`User ${patientId} not found`);
  }

  // Fetch all sessions (ordered by week and session number)
  const sessions = await Session.findAll({
    where: { patientId },
    order: [['weekNumber', 'ASC'], ['sessionAttemptNumber', 'ASC']]
  });

  // Fetch baselines
  const baselines = await BaselineThreshold.findAll({
    where: { patientId },
    order: [['calculatedAtSession', 'ASC']]
  });

  // Fetch HR data count
  const hrDataCount = await HistoricalHRData.count({
    where: { patientId }
  });

  // Calculate metrics
  const analysis = {
    // User info
    patientId,
    age: user.age,
    betaBlockers: user.betaBlockers,
    lowEF: user.lowEF,

    // Session metrics
    totalSessions: sessions.length,
    completedSessions: sessions.filter(s => s.status === 'completed').length,
    weeksCompleted: Math.max(...sessions.map(s => s.weekNumber)),

    // Score metrics
    scores: sessions.map(s => parseFloat(s.sessionRiskScore)),
    firstScore: parseFloat(sessions[0]?.sessionRiskScore),
    lastScore: parseFloat(sessions[sessions.length - 1]?.sessionRiskScore),
    minScore: Math.min(...sessions.map(s => parseFloat(s.sessionRiskScore))),
    maxScore: Math.max(...sessions.map(s => parseFloat(s.sessionRiskScore))),
    avgScore: sessions.reduce((sum, s) => sum + parseFloat(s.sessionRiskScore), 0) / sessions.length,

    // Risk distribution
    highRiskSessions: sessions.filter(s => s.riskLevel === 'High').length,
    moderateRiskSessions: sessions.filter(s => s.riskLevel === 'Moderate').length,
    lowRiskSessions: sessions.filter(s => s.riskLevel === 'Low').length,

    // Health status distribution
    healthStatusDistribution: {
      at_risk: sessions.filter(s => s.healthStatus === 'at_risk').length,
      declining: sessions.filter(s => s.healthStatus === 'declining').length,
      consistent: sessions.filter(s => s.healthStatus === 'consistent').length,
      improving: sessions.filter(s => s.healthStatus === 'improving').length,
      strong_improvement: sessions.filter(s => s.healthStatus === 'strong_improvement').length
    },

    // HR metrics
    avgHeartRate: sessions.reduce((sum, s) => sum + parseFloat(s.avgHR), 0) / sessions.length,
    firstRestingHR: baselines[0] ? parseFloat(baselines[0].restingHeartRate) : null,
    lastRestingHR: baselines[baselines.length - 1] ? parseFloat(baselines[baselines.length - 1].restingHeartRate) : null,

    // Baseline metrics
    totalBaselines: baselines.length,
    firstBaseline: baselines[0] ? parseFloat(baselines[0].baselineScore) : null,
    lastBaseline: baselines[baselines.length - 1] ? parseFloat(baselines[baselines.length - 1].baselineScore) : null,

    // Data completeness
    avgDataCompleteness: sessions.reduce((sum, s) => sum + parseFloat(s.dataCompleteness || 1.0), 0) / sessions.length,
    minDataCompleteness: Math.min(...sessions.map(s => parseFloat(s.dataCompleteness || 1.0))),
    maxDataCompleteness: Math.max(...sessions.map(s => parseFloat(s.dataCompleteness || 1.0))),
    hrDataPoints: hrDataCount,

    // Weekly breakdown
    weeklyScores: {},
    weeklyRisk: {},

    // Raw data
    sessions,
    baselines
  };

  // Calculate weekly averages
  for (let week = 1; week <= 12; week++) {
    const weekSessions = sessions.filter(s => s.weekNumber === week);
    if (weekSessions.length > 0) {
      analysis.weeklyScores[week] = {
        avg: weekSessions.reduce((sum, s) => sum + parseFloat(s.sessionRiskScore), 0) / weekSessions.length,
        sessions: weekSessions.length,
        scores: weekSessions.map(s => s.sessionRiskScore)
      };

      // Dominant risk level for the week
      const riskCounts = {
        High: weekSessions.filter(s => s.riskLevel === 'High').length,
        Moderate: weekSessions.filter(s => s.riskLevel === 'Moderate').length,
        Low: weekSessions.filter(s => s.riskLevel === 'Low').length
      };
      analysis.weeklyRisk[week] = Object.keys(riskCounts).reduce((a, b) =>
        riskCounts[a] > riskCounts[b] ? a : b
      );
    }
  }

  // Calculate improvement
  analysis.absoluteImprovement = analysis.lastScore - analysis.firstScore;
  analysis.percentImprovement = ((analysis.lastScore - analysis.firstScore) / analysis.firstScore * 100);

  // Trend analysis (linear regression on scores)
  analysis.trend = calculateTrend(analysis.scores);

  // Consistency score (lower = more consistent)
  analysis.consistency = calculateConsistency(analysis.scores);

  // Adherence quality
  analysis.adherence = calculateAdherence(sessions, baselines);

  return analysis;
}

/**
 * Calculate trend using simple linear regression
 */
function calculateTrend(scores) {
  const n = scores.length;
  const indices = Array.from({ length: n }, (_, i) => i);

  const sumX = indices.reduce((a, b) => a + b, 0);
  const sumY = scores.reduce((a, b) => a + b, 0);
  const sumXY = indices.reduce((sum, x, i) => sum + x * scores[i], 0);
  const sumXX = indices.reduce((sum, x) => sum + x * x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);

  if (slope > 0.5) return 'Strong Positive';
  if (slope > 0.2) return 'Moderate Positive';
  if (slope > -0.2) return 'Stable';
  if (slope > -0.5) return 'Moderate Negative';
  return 'Strong Negative';
}

/**
 * Calculate consistency (coefficient of variation)
 */
function calculateConsistency(scores) {
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  const variance = scores.reduce((sum, score) => sum + Math.pow(score - mean, 2), 0) / scores.length;
  const stdDev = Math.sqrt(variance);
  const cv = (stdDev / mean) * 100;

  if (cv < 5) return 'Highly Consistent';
  if (cv < 10) return 'Consistent';
  if (cv < 15) return 'Moderately Variable';
  if (cv < 20) return 'Variable';
  return 'Highly Variable';
}

/**
 * Calculate adherence quality
 */
function calculateAdherence(sessions, baselines) {
  const sessionsWithBaseline = sessions.filter(s => s.baselineScore !== null);
  if (sessionsWithBaseline.length === 0) return 'N/A';

  const aboveBaseline = sessionsWithBaseline.filter(s =>
    s.sessionRiskScore >= s.baselineScore
  ).length;

  const adherenceRate = (aboveBaseline / sessionsWithBaseline.length) * 100;

  if (adherenceRate >= 80) return 'Excellent';
  if (adherenceRate >= 60) return 'Good';
  if (adherenceRate >= 40) return 'Fair';
  return 'Poor';
}

/**
 * Generate observations for a user
 */
function generateObservations(analysis) {
  const observations = [];

  // Overall performance
  observations.push({
    category: 'Overall Performance',
    observation: `${analysis.percentImprovement > 0 ? 'Improved' : 'Declined'} by ${Math.abs(analysis.percentImprovement).toFixed(1)}% over 12 weeks (${analysis.firstScore.toFixed(1)} → ${analysis.lastScore.toFixed(1)})`
  });

  // Risk profile
  const dominantRisk = analysis.lowRiskSessions > analysis.moderateRiskSessions && analysis.lowRiskSessions > analysis.highRiskSessions ? 'Low'
    : analysis.moderateRiskSessions > analysis.highRiskSessions ? 'Moderate' : 'High';
  observations.push({
    category: 'Risk Profile',
    observation: `Dominant risk level: ${dominantRisk}. Distribution: ${analysis.lowRiskSessions} Low, ${analysis.moderateRiskSessions} Moderate, ${analysis.highRiskSessions} High`
  });

  // Trend
  observations.push({
    category: 'Trend',
    observation: `${analysis.trend} trend observed. Consistency: ${analysis.consistency}`
  });

  // Adherence
  observations.push({
    category: 'Adherence',
    observation: `${analysis.adherence} adherence to baseline thresholds`
  });

  // Health status
  const dominantHealth = Object.entries(analysis.healthStatusDistribution)
    .reduce((a, b) => a[1] > b[1] ? a : b)[0];
  observations.push({
    category: 'Health Status',
    observation: `Dominant status: ${dominantHealth}. Strong improvement sessions: ${analysis.healthStatusDistribution.strong_improvement}`
  });

  // Baseline progression
  if (analysis.totalBaselines >= 2) {
    const baselineChange = ((analysis.lastBaseline - analysis.firstBaseline) / analysis.firstBaseline * 100).toFixed(1);
    observations.push({
      category: 'Baseline Progression',
      observation: `Baseline ${baselineChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(baselineChange)}% (${analysis.firstBaseline.toFixed(1)} → ${analysis.lastBaseline.toFixed(1)})`
    });
  }

  // Resting HR
  if (analysis.firstRestingHR && analysis.lastRestingHR) {
    const hrChange = analysis.lastRestingHR - analysis.firstRestingHR;
    observations.push({
      category: 'Resting Heart Rate',
      observation: `${hrChange < 0 ? 'Improved' : 'Increased'} by ${Math.abs(hrChange)} bpm (${analysis.firstRestingHR} → ${analysis.lastRestingHR})`
    });
  }

  // Data completeness
  observations.push({
    category: 'Data Quality',
    observation: `Average completeness: ${(analysis.avgDataCompleteness * 100).toFixed(1)}%. Range: ${(analysis.minDataCompleteness * 100).toFixed(0)}%-${(analysis.maxDataCompleteness * 100).toFixed(0)}%. Total HR points: ${analysis.hrDataPoints}`
  });

  // Risk factors
  const riskFactors = [];
  if (analysis.betaBlockers) riskFactors.push('Beta Blockers');
  if (analysis.lowEF) riskFactors.push('Low EF');
  if (analysis.age >= 60) riskFactors.push('Age 60+');
  observations.push({
    category: 'Risk Factors',
    observation: riskFactors.length > 0 ? riskFactors.join(', ') : 'None identified'
  });

  // Weekly consistency
  const weeklyAvgs = Object.values(analysis.weeklyScores).map(w => w.avg);
  const weeklyVariance = calculateConsistency(weeklyAvgs);
  observations.push({
    category: 'Weekly Consistency',
    observation: `${weeklyVariance} week-to-week performance`
  });

  // Key milestones
  const milestones = [];
  if (analysis.maxScore >= 90) milestones.push('Achieved score ≥90');
  if (analysis.percentImprovement >= 20) milestones.push('20%+ improvement');
  if (analysis.lowRiskSessions >= 30) milestones.push('30+ low-risk sessions');
  if (milestones.length > 0) {
    observations.push({
      category: 'Milestones',
      observation: milestones.join('; ')
    });
  }

  // Concerns
  const concerns = [];
  if (analysis.highRiskSessions >= 10) concerns.push(`${analysis.highRiskSessions} high-risk sessions`);
  if (analysis.percentImprovement < -10) concerns.push('Performance declined >10%');
  if (analysis.avgDataCompleteness < 0.7) concerns.push('Low data completeness (<70%)');
  if (concerns.length > 0) {
    observations.push({
      category: '⚠️ Concerns',
      observation: concerns.join('; ')
    });
  }

  return observations;
}

// ========================================
// EXPORT FUNCTIONS
// ========================================

/**
 * Export summary to CSV
 */
function exportSummaryCSV(analyses, filename) {
  const headers = [
    'Patient ID',
    'Age',
    'Beta Blockers',
    'Low EF',
    'Sessions',
    'First Score',
    'Last Score',
    'Improvement %',
    'Trend',
    'Avg Score',
    'Min Score',
    'Max Score',
    'High Risk',
    'Moderate Risk',
    'Low Risk',
    'Adherence',
    'Consistency',
    'Baselines',
    'First Baseline',
    'Last Baseline',
    'Avg Data Completeness',
    'HR Data Points'
  ];

  const rows = analyses.map(a => [
    a.patientId,
    a.age,
    a.betaBlockers ? 'Yes' : 'No',
    a.lowEF ? 'Yes' : 'No',
    a.totalSessions,
    a.firstScore.toFixed(2),
    a.lastScore.toFixed(2),
    a.percentImprovement.toFixed(2),
    a.trend,
    a.avgScore.toFixed(2),
    a.minScore.toFixed(2),
    a.maxScore.toFixed(2),
    a.highRiskSessions,
    a.moderateRiskSessions,
    a.lowRiskSessions,
    a.adherence,
    a.consistency,
    a.totalBaselines,
    a.firstBaseline?.toFixed(2) || 'N/A',
    a.lastBaseline?.toFixed(2) || 'N/A',
    (a.avgDataCompleteness * 100).toFixed(1),
    a.hrDataPoints
  ]);

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(filename, csv);
  console.log(`   ✅ Exported summary to ${filename}`);
}

/**
 * Export detailed observations to CSV
 */
function exportObservationsCSV(allObservations, filename) {
  const headers = ['Patient ID', 'Category', 'Observation'];

  const rows = [];
  for (const [patientId, observations] of Object.entries(allObservations)) {
    for (const obs of observations) {
      rows.push([patientId, obs.category, obs.observation]);
    }
  }

  const csv = [
    headers.join(','),
    ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
  ].join('\n');

  fs.writeFileSync(filename, csv);
  console.log(`   ✅ Exported observations to ${filename}`);
}

/**
 * Export weekly progression to CSV
 */
function exportWeeklyProgressionCSV(analyses, filename) {
  const headers = ['Patient ID', 'Week 1', 'Week 2', 'Week 3', 'Week 4', 'Week 5', 'Week 6',
    'Week 7', 'Week 8', 'Week 9', 'Week 10', 'Week 11', 'Week 12'];

  const rows = analyses.map(a => {
    const row = [a.patientId];
    for (let week = 1; week <= 12; week++) {
      const weekData = a.weeklyScores[week];
      row.push(weekData ? weekData.avg.toFixed(2) : 'N/A');
    }
    return row;
  });

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(filename, csv);
  console.log(`   ✅ Exported weekly progression to ${filename}`);
}

/**
 * Export session-level detail to CSV
 */
function exportSessionDetailCSV(analyses, filename) {
  const headers = [
    'Patient ID',
    'Week',
    'Session',
    'Date',
    'Score',
    'Risk Level',
    'Health Status',
    'Baseline',
    'Avg HR',
    'Min HR',
    'Max HR',
    'Target HR',
    'Data Completeness'
  ];

  const rows = [];
  for (const analysis of analyses) {
    for (const session of analysis.sessions) {
      rows.push([
        analysis.patientId,
        session.weekNumber,
        session.sessionAttemptNumber,
        session.sessionDate,
        session.sessionRiskScore,
        session.riskLevel,
        session.healthStatus || 'N/A',
        session.baselineScore || 'N/A',
        session.avgHR,
        session.minHR,
        session.maxHR,
        session.targetHR,
        (session.dataCompleteness * 100).toFixed(1)
      ]);
    }
  }

  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  fs.writeFileSync(filename, csv);
  console.log(`   ✅ Exported session details to ${filename}`);
}

// ========================================
// MAIN TEST RUNNER
// ========================================

async function runComprehensiveTests() {
  console.log('🧪 Starting Comprehensive Test Analysis...\n');

  try {
    // Get all test users
    const testUsers = await User.findAll({
      where: {
        patientId: {
          [sequelize.Sequelize.Op.like]: 'TEST_%'
        }
      }
    });

    if (testUsers.length === 0) {
      console.log('⚠️  No test users found. Please run seed12WeekTestData.js first.');
      return;
    }

    console.log(`📊 Found ${testUsers.length} test users\n`);

    // Analyze each user
    const analyses = [];
    const allObservations = {};

    for (const user of testUsers) {
      console.log(`\n${'='.repeat(70)}`);
      console.log(`🔍 Analyzing: ${user.patientId}`);
      console.log('='.repeat(70));

      const analysis = await analyzeUser(user.patientId);
      analyses.push(analysis);

      const observations = generateObservations(analysis);
      allObservations[user.patientId] = observations;

      // Print key findings
      console.log('\n📈 Key Findings:');
      console.log(`   Score: ${analysis.firstScore.toFixed(1)} → ${analysis.lastScore.toFixed(1)} (${analysis.percentImprovement >= 0 ? '+' : ''}${analysis.percentImprovement.toFixed(1)}%)`);
      console.log(`   Trend: ${analysis.trend}`);
      console.log(`   Risk: ${analysis.lowRiskSessions}L / ${analysis.moderateRiskSessions}M / ${analysis.highRiskSessions}H`);
      console.log(`   Adherence: ${analysis.adherence}`);
      console.log(`   Data Completeness: ${(analysis.avgDataCompleteness * 100).toFixed(1)}%`);

      console.log('\n🔎 Observations:');
      observations.forEach(obs => {
        console.log(`   • ${obs.category}: ${obs.observation}`);
      });
    }

    // Generate reports
    console.log('\n\n' + '='.repeat(70));
    console.log('📄 Generating Reports...');
    console.log('='.repeat(70) + '\n');

    const outputDir = path.join(process.cwd(), 'test-reports');
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    exportSummaryCSV(analyses, path.join(outputDir, `summary_${timestamp}.csv`));
    exportObservationsCSV(allObservations, path.join(outputDir, `observations_${timestamp}.csv`));
    exportWeeklyProgressionCSV(analyses, path.join(outputDir, `weekly_progression_${timestamp}.csv`));
    exportSessionDetailCSV(analyses, path.join(outputDir, `session_details_${timestamp}.csv`));

    // Generate executive summary
    const summaryFile = path.join(outputDir, `EXECUTIVE_SUMMARY_${timestamp}.txt`);
    const summary = generateExecutiveSummary(analyses, allObservations);
    fs.writeFileSync(summaryFile, summary);
    console.log(`   ✅ Exported executive summary to ${summaryFile}`);

    console.log('\n' + '='.repeat(70));
    console.log('✅ COMPREHENSIVE TEST ANALYSIS COMPLETED!');
    console.log('='.repeat(70));
    console.log(`\n📁 All reports saved to: ${outputDir}\n`);

  } catch (error) {
    console.error('❌ Error running tests:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

/**
 * Generate executive summary document
 */
function generateExecutiveSummary(analyses, allObservations) {
  let summary = '';
  summary += '='.repeat(80) + '\n';
  summary += 'EXECUTIVE SUMMARY - 12-WEEK REHABILITATION PROGRAM TEST RESULTS\n';
  summary += '='.repeat(80) + '\n\n';

  summary += `Generated: ${new Date().toISOString()}\n`;
  summary += `Total Users Analyzed: ${analyses.length}\n`;
  summary += `Total Sessions Analyzed: ${analyses.reduce((sum, a) => sum + a.totalSessions, 0)}\n\n`;

  summary += '='.repeat(80) + '\n';
  summary += 'OVERALL STATISTICS\n';
  summary += '='.repeat(80) + '\n\n';

  const avgImprovement = analyses.reduce((sum, a) => sum + a.percentImprovement, 0) / analyses.length;
  const usersImproved = analyses.filter(a => a.percentImprovement > 0).length;
  const usersDeclined = analyses.filter(a => a.percentImprovement < 0).length;

  summary += `Average Improvement: ${avgImprovement.toFixed(2)}%\n`;
  summary += `Users Improved: ${usersImproved} (${(usersImproved / analyses.length * 100).toFixed(1)}%)\n`;
  summary += `Users Declined: ${usersDeclined} (${(usersDeclined / analyses.length * 100).toFixed(1)}%)\n`;
  summary += `Users Stable: ${analyses.length - usersImproved - usersDeclined}\n\n`;

  summary += 'Risk Distribution (Total Sessions):\n';
  const totalLow = analyses.reduce((sum, a) => sum + a.lowRiskSessions, 0);
  const totalMod = analyses.reduce((sum, a) => sum + a.moderateRiskSessions, 0);
  const totalHigh = analyses.reduce((sum, a) => sum + a.highRiskSessions, 0);
  const totalSessions = totalLow + totalMod + totalHigh;
  summary += `  Low Risk: ${totalLow} (${(totalLow / totalSessions * 100).toFixed(1)}%)\n`;
  summary += `  Moderate Risk: ${totalMod} (${(totalMod / totalSessions * 100).toFixed(1)}%)\n`;
  summary += `  High Risk: ${totalHigh} (${(totalHigh / totalSessions * 100).toFixed(1)}%)\n\n`;

  summary += 'Adherence Distribution:\n';
  const adherenceCounts = {};
  analyses.forEach(a => {
    adherenceCounts[a.adherence] = (adherenceCounts[a.adherence] || 0) + 1;
  });
  Object.entries(adherenceCounts).forEach(([level, count]) => {
    summary += `  ${level}: ${count} users\n`;
  });
  summary += '\n';

  summary += 'Data Completeness:\n';
  const avgCompleteness = analyses.reduce((sum, a) => sum + a.avgDataCompleteness, 0) / analyses.length;
  summary += `  Average: ${(avgCompleteness * 100).toFixed(1)}%\n`;
  summary += `  Users with 100% completeness: ${analyses.filter(a => a.avgDataCompleteness === 1.0).length}\n`;
  summary += `  Users with <70% completeness: ${analyses.filter(a => a.avgDataCompleteness < 0.7).length}\n\n`;

  summary += '='.repeat(80) + '\n';
  summary += 'INDIVIDUAL USER SUMMARIES\n';
  summary += '='.repeat(80) + '\n\n';

  for (const analysis of analyses) {
    summary += '-'.repeat(80) + '\n';
    summary += `${analysis.patientId}\n`;
    summary += '-'.repeat(80) + '\n';
    summary += `Age: ${analysis.age} | Beta Blockers: ${analysis.betaBlockers ? 'Yes' : 'No'} | Low EF: ${analysis.lowEF ? 'Yes' : 'No'}\n\n`;

    summary += 'Performance:\n';
    summary += `  First Score: ${analysis.firstScore.toFixed(2)}\n`;
    summary += `  Last Score: ${analysis.lastScore.toFixed(2)}\n`;
    summary += `  Improvement: ${analysis.percentImprovement >= 0 ? '+' : ''}${analysis.percentImprovement.toFixed(2)}%\n`;
    summary += `  Trend: ${analysis.trend}\n`;
    summary += `  Adherence: ${analysis.adherence}\n`;
    summary += `  Consistency: ${analysis.consistency}\n\n`;

    summary += 'Risk Profile:\n';
    summary += `  Low: ${analysis.lowRiskSessions} sessions\n`;
    summary += `  Moderate: ${analysis.moderateRiskSessions} sessions\n`;
    summary += `  High: ${analysis.highRiskSessions} sessions\n\n`;

    summary += 'Key Observations:\n';
    const observations = allObservations[analysis.patientId];
    observations.forEach(obs => {
      summary += `  • ${obs.category}: ${obs.observation}\n`;
    });
    summary += '\n';
  }

  summary += '='.repeat(80) + '\n';
  summary += 'END OF REPORT\n';
  summary += '='.repeat(80) + '\n';

  return summary;
}

// ========================================
// RUN SCRIPT
// ========================================

if (process.argv[1] === new URL(import.meta.url).pathname) {
  runComprehensiveTests()
    .then(() => {
      console.log('✅ Test analysis completed successfully');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Test analysis failed:', error);
      process.exit(1);
    });
}

export default runComprehensiveTests;
