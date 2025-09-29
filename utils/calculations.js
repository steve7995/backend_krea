// ========================================
// EXISTING FUNCTION (Keep as is - used by patientController)
// ========================================

// Heart rate calculation logic
export function calculateHeartRateZones(age, betaBlockers, lowEF, weekNumber) {
  // Max Permissible Heart Rate
  const maxPermissibleHR = 220 - age;
  
  // Weekly % of MPR (70%, 71%, 71%, 72%, 73%, 73%, 74%, 75%, 75%, 76%, 77%, 78%)
  const weeklyPercentages = [70, 71, 71, 72, 73, 73, 74, 75, 75, 76, 77, 78];
  let mprPercentage = weeklyPercentages[weekNumber - 1];
  
  // Apply adjustments
  if (betaBlockers && lowEF) {
    mprPercentage -= 20; // Both conditions
  } else if (betaBlockers) {
    mprPercentage -= 15; // Beta blockers only
  } else if (lowEF) {
    mprPercentage -= 10; // Low EF only
  }
  
  // Calculate adjusted target HR
  const adjustedTargetHR = Math.round((maxPermissibleHR * mprPercentage) / 100);
  
  // Calculate zones
  const warmupZoneMin = adjustedTargetHR - 15;
  const warmupZoneMax = adjustedTargetHR - 5;
  const exerciseZoneMin = adjustedTargetHR - 5;
  const exerciseZoneMax = adjustedTargetHR + 5;
  const cooldownZoneMin = exerciseZoneMax - 20;
  const cooldownZoneMax = exerciseZoneMax - 10;
  
  // Session duration (20 + week number - 1)
  const sessionDuration = 19 + weekNumber;
  
  return {
    targetHR: adjustedTargetHR,
    maxPermissibleHR,
    warmupZoneMin,
    warmupZoneMax,
    exerciseZoneMin,
    exerciseZoneMax,
    cooldownZoneMin,
    cooldownZoneMax,
    sessionDuration
  };
}

// ========================================
// NEW HELPER FUNCTIONS (Add below)
// ========================================

// Calculate adjusted MPR with weekly progression
export const calculateAdjustedMPR = (age, betaBlockers, lowEF, weekNumber) => {
  const baseMPR = 220 - age;
  
  // Weekly % of MPR
  const weeklyPercentages = [70, 71, 71, 72, 73, 73, 74, 75, 75, 76, 77, 78];
  let mprPercentage = weeklyPercentages[weekNumber - 1] || 70;
  
  // Apply adjustments
  let reduction = 0;
  if (betaBlockers && lowEF) {
    reduction = 20;
  } else if (betaBlockers) {
    reduction = 15;
  } else if (lowEF) {
    reduction = 10;
  }
  
  const adjustedPercentage = mprPercentage - reduction;
  const adjustedMPR = Math.round((baseMPR * adjustedPercentage) / 100);
  
  return {
    baseMPR,
    adjustedMPR,
    reductionPercentage: reduction,
    weeklyPercentage: mprPercentage,
    finalPercentage: adjustedPercentage
  };
};

// Get session duration for a specific week
export const getSessionDuration = (weekNumber) => {
  return 19 + weekNumber; // Week 1: 20, Week 2: 21, etc.
};

// Get exercise duration (excluding warmup and cooldown)
export const getExerciseDuration = (weekNumber) => {
  const totalDuration = getSessionDuration(weekNumber);
  return totalDuration - 10; // Subtract 5 min warmup + 5 min cooldown
};

// Validate if heart rate is within safe limits
export const isHRWithinSafeLimits = (heartRate, maxPermissibleHR) => {
  const minSafeHR = 30; // Minimum valid HR
  const maxSafeHR = 250; // Maximum valid HR
  
  return heartRate >= minSafeHR && heartRate <= maxSafeHR && heartRate <= maxPermissibleHR;
};

// Calculate percentage of time in target zone
export const calculateTimeInZone = (hrReadings, zoneMin, zoneMax) => {
  if (!hrReadings || hrReadings.length === 0) {
    return 0;
  }
  
  const readingsInZone = hrReadings.filter(hr => hr >= zoneMin && hr <= zoneMax).length;
  return (readingsInZone / hrReadings.length) * 100;
};

// Generate summary text based on session performance
export const generateSessionSummary = (riskLevel, sessionScore, zones, hrStats) => {
  const scorePercentage = Math.round(sessionScore * 100);
  
  let summary = `${riskLevel} risk level detected. Session compliance: ${scorePercentage}%.`;
  
  // Add specific feedback
  if (hrStats.maxHR > zones.maxPermissibleHR) {
    summary += ` Warning: Maximum heart rate (${hrStats.maxHR} bpm) exceeded safe limit.`;
  }
  
  if (sessionScore < 0.5) {
    summary += ` Significant time spent outside target zones. Consider adjusting exercise intensity.`;
  } else if (sessionScore >= 0.8) {
    summary += ` Excellent adherence to target heart rate zones!`;
  }
  
  return summary;
};

// Calculate weekly progress (compare current week to previous week)
export const calculateWeeklyProgress = (currentWeekScore, previousWeekScore) => {
  if (!previousWeekScore) {
    return {
      improvement: 0,
      trend: 'baseline',
      message: 'First week completed'
    };
  }
  
  const improvement = ((currentWeekScore - previousWeekScore) / previousWeekScore) * 100;
  
  let trend = 'stable';
  let message = 'Performance maintained';
  
  if (improvement > 5) {
    trend = 'improving';
    message = `Performance improved by ${Math.round(improvement)}%`;
  } else if (improvement < -5) {
    trend = 'declining';
    message = `Performance declined by ${Math.round(Math.abs(improvement))}%`;
  }
  
  return {
    improvement: Math.round(improvement),
    trend,
    message
  };
};