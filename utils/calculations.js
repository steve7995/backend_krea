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