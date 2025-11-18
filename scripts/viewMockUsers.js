/**
 * VIEW MOCK USERS - VERIFICATION SCRIPT
 * ========================================================================
 * This script displays the mock user data in a formatted, readable way
 * to verify the seeding was successful.
 */

import sequelize from '../database/db.js';
import User from '../models/User.js';
import Session from '../models/Session.js';
import BaselineThreshold from '../models/BaselineThreshold.js';
import { Op } from 'sequelize';

// ========================================
// HELPER FUNCTIONS
// ========================================

function printSeparator(char = '=', length = 80) {
  console.log(char.repeat(length));
}

function printHeader(text) {
  printSeparator();
  console.log(text);
  printSeparator();
}

function formatScore(score) {
  return score ? parseFloat(score).toFixed(1) : '--';
}

// ========================================
// MAIN DISPLAY FUNCTION
// ========================================

async function viewMockUsers() {
  try {
    console.log('\n');
    printHeader('MOCK USER GROUPS - TEST DATA OVERVIEW');
    console.log('\n');

    // Get all mock users
    const mockUsers = await User.findAll({
      where: {
        patientId: {
          [Op.like]: 'MOCK_%'
        }
      },
      order: [['patientId', 'ASC']]
    });

    if (mockUsers.length === 0) {
      console.log('⚠️  No mock users found. Run seedMockUsers.js first.\n');
      return;
    }

    const groupLabels = {
      'MOCK_ALEX_JOHNSON': 'GROUP A - BEST CASE',
      'MOCK_MARIA_SANTOS': 'GROUP B - MODERATE+ CASE',
      'MOCK_ROBERT_CHEN': 'GROUP C - MODERATE- CASE',
      'MOCK_PATRICIA_WILLIAMS': 'GROUP D - WORST CASE'
    };

    const groupDescriptions = {
      'MOCK_ALEX_JOHNSON': 'Optimal progression, strong cardiovascular adaptation',
      'MOCK_MARIA_SANTOS': 'Good progression from moderate to low risk',
      'MOCK_ROBERT_CHEN': 'Stable but minimal adaptation due to beta blockers',
      'MOCK_PATRICIA_WILLIAMS': 'Declining performance, requires medical review'
    };

    // Process each user
    for (const user of mockUsers) {
      const groupLabel = groupLabels[user.patientId] || user.patientId;

      printSeparator('-');
      console.log(groupLabel);
      printSeparator('-');

      // Extract name from patient ID
      const nameParts = user.patientId.replace('MOCK_', '').split('_');
      const name = nameParts.map(part =>
        part.charAt(0) + part.slice(1).toLowerCase()
      ).join(' ');

      console.log(`Patient: ${name}, Age ${user.age}`);
      console.log(`Beta Blockers: ${user.betaBlockers ? 'Yes' : 'No'}`);
      console.log(`Low EF: ${user.lowEF ? 'Yes' : 'No'}`);
      console.log('');

      // Get all sessions
      const sessions = await Session.findAll({
        where: { patientId: user.patientId },
        order: [['weekNumber', 'ASC'], ['sessionAttemptNumber', 'ASC']]
      });

      // Get baselines
      const baselines = await BaselineThreshold.findAll({
        where: { patientId: user.patientId },
        order: [['calculatedAtSession', 'ASC']]
      });

      // Create baseline lookup
      const baselineMap = {};
      baselines.forEach(b => {
        baselineMap[b.calculatedAtSession] = b;
      });

      console.log('Session Progression:');
      sessions.forEach((session, index) => {
        const sessionNum = index + 1;
        const baseline = baselineMap[sessionNum];

        let line = `  Session ${sessionNum}: `;
        line += `Score ${formatScore(session.sessionRiskScore)}, `;
        line += `Risk ${session.riskLevel}, `;
        line += `HR ${session.avgHR} bpm`;

        if (baseline) {
          line += ` (Baseline: ${formatScore(baseline.baselineScore)}) [BASELINE ESTABLISHED]`;
        }

        console.log(line);
      });

      console.log('');

      // Score Summary
      console.log('Score Summary:');

      // Session scores
      const sessionScores = sessions.map(s => formatScore(s.sessionRiskScore));
      console.log(`  Session Scores:  [${sessionScores.join(', ')}]`);

      // Baseline scores
      const baselineScores = sessions.map((s, i) => {
        const sessionNum = i + 1;
        if (sessionNum >= 3 && baselines.length > 0) {
          // Find the most recent baseline at or before this session
          const relevantBaseline = baselines
            .filter(b => b.calculatedAtSession <= sessionNum)
            .sort((a, b) => b.calculatedAtSession - a.calculatedAtSession)[0];
          return relevantBaseline ? formatScore(relevantBaseline.baselineScore) : '--';
        }
        return '--';
      });
      console.log(`  Baseline Scores: [${baselineScores.join(', ')}]`);

      // Combined scores
      const combinedScores = sessions.map((s, i) => {
        const sessionNum = i + 1;
        if (sessionNum >= 3) {
          const relevantBaseline = baselines
            .filter(b => b.calculatedAtSession <= sessionNum)
            .sort((a, b) => b.calculatedAtSession - a.calculatedAtSession)[0];

          if (relevantBaseline) {
            const sessionScore = parseFloat(s.sessionRiskScore);
            const baselineScore = parseFloat(relevantBaseline.baselineScore);
            const combined = (sessionScore + baselineScore) / 2;
            return formatScore(combined);
          }
        }
        return formatScore(s.sessionRiskScore);
      });
      console.log(`  Combined Scores: [${combinedScores.join(', ')}]`);

      // Resting HR
      const restingHRs = baselines.map(b =>
        b.restingHeartRate ? `${formatScore(b.restingHeartRate)}` : null
      ).filter(Boolean);

      if (restingHRs.length > 0) {
        // For display, show resting HR for all sessions (using the most recent baseline value)
        const allRestingHRs = sessions.map((s, i) => {
          const sessionNum = i + 1;
          const relevantBaseline = baselines
            .filter(b => b.calculatedAtSession <= sessionNum)
            .sort((a, b) => b.calculatedAtSession - a.calculatedAtSession)[0];
          return relevantBaseline && relevantBaseline.restingHeartRate
            ? formatScore(relevantBaseline.restingHeartRate)
            : sessions[i].avgHR;
        });
        console.log(`  Resting HR:      [${allRestingHRs.join(', ')}] bpm`);
      }

      console.log('');

      // Overall Summary
      console.log('Overall Summary:');

      const firstScore = parseFloat(sessions[0].sessionRiskScore);
      const lastScore = parseFloat(sessions[sessions.length - 1].sessionRiskScore);
      const improvement = ((lastScore - firstScore) / firstScore * 100).toFixed(1);

      console.log(`  Improvement: ${improvement > 0 ? '+' : ''}${improvement}%`);

      // Adherence
      let adherence = 'Good';
      let adherenceDetail = 'mostly above baseline';
      if (parseFloat(improvement) > 8) {
        adherence = 'Excellent';
        adherenceDetail = 'consistently above baseline';
      } else if (parseFloat(improvement) < 0) {
        adherence = 'Poor';
        adherenceDetail = 'consistently below baseline';
      } else if (parseFloat(improvement) < 5) {
        adherence = 'Fair';
        adherenceDetail = 'hovering near baseline';
      }
      console.log(`  Adherence: ${adherence} - ${adherenceDetail}`);

      // Health Status
      const healthStatusLabel = groupDescriptions[user.patientId] || 'Unknown';
      console.log(`  Health Status: ${healthStatusLabel}`);

      // Risk Trend
      const firstRisk = sessions[0].riskLevel;
      const lastRisk = sessions[sessions.length - 1].riskLevel;
      let riskTrend = `${firstRisk}`;
      if (firstRisk !== lastRisk) {
        riskTrend = `Improving from ${firstRisk} to ${lastRisk}`;
      } else {
        riskTrend = `${firstRisk} and ${parseFloat(improvement) >= 0 ? 'stable' : 'worsening'}`;
        if (firstRisk === 'High' && parseFloat(improvement) < 0) {
          riskTrend += ' - requires medical review';
        }
      }
      console.log(`  Risk Trend: ${riskTrend}`);

      console.log('');
    }

    printSeparator();
    console.log(`\n✅ Displayed ${mockUsers.length} mock user group(s)\n`);

  } catch (error) {
    console.error('❌ Error viewing mock users:', error);
    throw error;
  } finally {
    await sequelize.close();
  }
}

// ========================================
// RUN SCRIPT
// ========================================

if (process.argv[1] === new URL(import.meta.url).pathname) {
  viewMockUsers()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      console.error('Script failed:', error);
      process.exit(1);
    });
}

export default viewMockUsers;
