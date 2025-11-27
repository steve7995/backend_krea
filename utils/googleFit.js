import axios from 'axios';

// Fetch heart rate data from Google Fit for a specific time range
export const fetchGoogleFitData = async (accessToken, startTime, endTime) => {
  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{
          dataTypeName: 'com.google.heart_rate.bpm',
          // dataSourceId: 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm'
        }],
        bucketByTime: { durationMillis: 60000 }, // 1-minute buckets
        startTimeMillis: startTime.getTime(),
        endTimeMillis: endTime.getTime()
      },
      {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Parse response and extract heart rate data
    const hrData = [];
    
    if (response.data.bucket) {
      for (const bucket of response.data.bucket) {
        if (bucket.dataset && bucket.dataset[0]?.point) {
          for (const point of bucket.dataset[0].point) {
            if (point.value && point.value[0]?.fpVal) {
              hrData.push({
                timestamp: parseInt(point.startTimeNanos) / 1000000, // Convert to milliseconds
                value: Math.round(point.value[0].fpVal)
              });
            }
          }
        }
      }
    }
    
    console.log(`[GoogleFit] Fetched ${hrData.length} heart rate data points`);
    console.log('hrData',hrData)
    return hrData;
    
  } catch (error) {
    console.error('[GoogleFit] Error fetching data:', error.response?.data || error.message);
    
    // Check if it's an authentication error
    if (error.response?.status === 401) {
      throw new Error('Access token expired or invalid');
    }
    
    // Check if it's a rate limit error
    if (error.response?.status === 429) {
      throw new Error('Rate limit exceeded');
    }
    
    throw new Error(`Failed to fetch Google Fit data: ${error.message}`);
  }
};

// Validate data quality
export const validateDataQuality = (hrData, expectedDataPoints) => {
  const actualDataPoints = hrData.length;
  const completeness = (actualDataPoints / expectedDataPoints) * 100;
  
  return {
    isValid: actualDataPoints > 0,
    actualDataPoints,
    expectedDataPoints,
    completeness: Math.round(completeness),
    isSufficient: actualDataPoints >= expectedDataPoints * 0.8 // At least 80%
  };
};

// Extract heart rate values from data
export const extractHRValues = (hrData) => {
  return hrData.map(item => item.value);
};

// Calculate HR statistics
export const calculateHRStats = (hrValues) => {
  if (!hrValues || hrValues.length === 0) {
    return {
      maxHR: null,
      minHR: null,
      avgHR: null
    };
  }
  
  const maxHR = Math.max(...hrValues);
  const minHR = Math.min(...hrValues);
  const avgHR = Math.round(hrValues.reduce((sum, val) => sum + val, 0) / hrValues.length);
  
  return { maxHR, minHR, avgHR };
};

// Split HR data into phases (warmup, exercise, cooldown) with DYNAMIC ALLOCATION
// If actual duration differs from planned:
// - Shorter session: Shrink exercise and cooldown phases proportionally
// - Longer session: Extend exercise phase, keep cooldown at last 5 min
// - Equal: Standard 5-min warmup, 5-min cooldown, rest is exercise
export const splitDataIntoPhases = (hrData, sessionDuration, plannedDuration = null) => {
  const actualDuration = sessionDuration; // actual duration in minutes (from hrData length or passed param)

  // If plannedDuration is not provided or equals actual, use standard allocation
  if (!plannedDuration || plannedDuration === actualDuration) {
    // Standard allocation: 5-min warmup, 5-min cooldown, rest is exercise
    const warmupData = hrData.slice(0, 5); // First 5 minutes
    const cooldownData = hrData.slice(-5); // Last 5 minutes
    const exerciseData = hrData.slice(5, actualDuration - 5); // Middle portion

    return {
      warmup: warmupData,
      exercise: exerciseData,
      cooldown: cooldownData
    };
  }

  // DYNAMIC ALLOCATION based on actual vs planned duration

  if (actualDuration < plannedDuration) {
    // Session SHORTER than planned: Shrink exercise and cooldown proportionally
    const ratio = actualDuration / plannedDuration;

    // Warmup stays at 5 minutes
    const warmupMinutes = 5;

    // Cooldown shrinks proportionally (but minimum 2 minutes)
    const cooldownMinutes = Math.max(2, Math.round(5 * ratio));

    // Exercise gets the remaining time
    const exerciseMinutes = actualDuration - warmupMinutes - cooldownMinutes;

    const warmupData = hrData.slice(0, warmupMinutes);
    const cooldownData = hrData.slice(-cooldownMinutes);
    const exerciseData = hrData.slice(warmupMinutes, actualDuration - cooldownMinutes);

    console.log(`[DynamicPhases] Shorter session: warmup=${warmupMinutes}min, exercise=${exerciseMinutes}min, cooldown=${cooldownMinutes}min`);

    return {
      warmup: warmupData,
      exercise: exerciseData,
      cooldown: cooldownData
    };

  } else {
    // Session LONGER than planned: Extend exercise phase, cooldown stays at last 5 min
    const warmupMinutes = 5;
    const cooldownMinutes = 5;
    const exerciseMinutes = actualDuration - warmupMinutes - cooldownMinutes;

    const warmupData = hrData.slice(0, warmupMinutes);
    const cooldownData = hrData.slice(-cooldownMinutes);
    const exerciseData = hrData.slice(warmupMinutes, actualDuration - cooldownMinutes);

    console.log(`[DynamicPhases] Longer session: warmup=${warmupMinutes}min, exercise=${exerciseMinutes}min, cooldown=${cooldownMinutes}min`);

    return {
      warmup: warmupData,
      exercise: exerciseData,
      cooldown: cooldownData
    };
  }
};

// Check if HR is within zone (COMMENTED OUT - using phase-specific checks now)
// export const isInZone = (hr, zoneMin, zoneMax) => {
//   return hr >= zoneMin && hr <= zoneMax;
// };

// Check if HR meets warmup criteria (only lower bound)
export const isInWarmupZone = (hr, zoneMin) => {
  return hr >= zoneMin;
};

// Check if HR meets exercise criteria (only lower bound)
export const isInExerciseZone = (hr, zoneMin) => {
  return hr >= zoneMin;
};

// Check if HR meets cooldown criteria (only upper bound)
export const isInCooldownZone = (hr, zoneMax) => {
  return hr <= zoneMax;
};

// Calculate warmup zone score (percentage based - simple)
export const calculateWarmupScore = (hrValues, zoneMin) => {
  if (!hrValues || hrValues.length === 0) {
    return 0;
  }

  // Count values >= lower bound
  const valuesInRange = hrValues.filter(hr => hr >= zoneMin).length;
  const totalValues = hrValues.length;

  // Score = (number of values in range) / (total number of values) * 100
  const score = (valuesInRange / totalValues) * 100;

  return Math.round(score);
};

// Calculate exercise zone score with deviation-based logic
export const calculateExerciseScore = (hrValues, zoneMin, zoneMax) => {
  if (!hrValues || hrValues.length === 0) {
    return 0;
  }

  // Calculate average HR in exercise zone
  const avgExercise = hrValues.reduce((sum, hr) => sum + hr, 0) / hrValues.length;

  let score = 0;

  // [Within target]: If Exercise_low <= A_exercise <= Exercise_high, score = 100
  if (avgExercise >= zoneMin && avgExercise <= zoneMax) {
    score = 100;
  }
  // [Above target]
  else if (avgExercise > zoneMax) {
    if (avgExercise <= zoneMax + 10) {
      score = 80;
    } else if (avgExercise <= zoneMax + 20) {
      score = 70;
    } else {
      score = 20;
    }
  }
  // [Below target]
  else if (avgExercise < zoneMin) {
    // Calculate deviation: min(|A_exercise - Exercise_low|, |A_exercise - Exercise_high|)
    const deviationFromLow = Math.abs(avgExercise - zoneMin);
    const deviationFromHigh = Math.abs(avgExercise - zoneMax);
    const deviation = Math.round(Math.min(deviationFromLow, deviationFromHigh));

    // Score based on deviation
    if (deviation === 0 || deviation <= 5) {
      score = 100;
    } else if (deviation <= 10) {
      score = 95;
    } else if (deviation <= 15) {
      score = 80;
    } else if (deviation <= 20) {
      score = 70;
    } else if (deviation <= 30) {
      score = 20;
    } else if (deviation <= 40) {
      score = 15;
    } else if (deviation <= 50) {
      score = 10;
    } else if (deviation <= 60) {
      score = 8;
    } else {
      score = 5;
    }
  }

  // [Variability]: Check if HR range > 25, cap score at 80
  const maxHR = Math.max(...hrValues);
  const minHR = Math.min(...hrValues);
  const hrRange = maxHR - minHR;

  if (hrRange > 25) {
    score = Math.min(score, 80);
  }

  return Math.round(score);
};

// Calculate cooldown zone score with deviation-based logic
export const calculateCooldownScore = (hrValues, zoneMin, zoneMax) => {
  if (!hrValues || hrValues.length === 0) {
    return 0;
  }

  // Calculate average HR in cooldown zone
  const avgCool = hrValues.reduce((sum, hr) => sum + hr, 0) / hrValues.length;

  let score = 0;

  // [Within target]: If CoolDown_low <= A_cool <= CoolDown_high, score = 100
  if (avgCool >= zoneMin && avgCool <= zoneMax) {
    score = 100;
  }
  // [Above/Below target]: Calculate deviation
  else {
    // Calculate deviation: min(|A_cool - CoolDown_low|, |A_cool - CoolDown_high|)
    const deviationFromLow = Math.abs(avgCool - zoneMin);
    const deviationFromHigh = Math.abs(avgCool - zoneMax);
    const deviation = Math.round(Math.min(deviationFromLow, deviationFromHigh));

    // Score based on deviation
    if (deviation <= 5) {
      score = 100;
    } else if (deviation <= 10) {
      score = 90;
    } else if (deviation <= 15) {
      score = 80;
    } else if (deviation <= 25) {
      score = 60;
    } else {
      score = 40;
    }
  }

  return Math.round(score);
};

// OLD VERSION (COMMENTED OUT):
// export const calculatePhaseScore = (hrValues, zoneMin, zoneMax) => {
//   if (!hrValues || hrValues.length === 0) {
//     return 0;
//   }
//
//   const pointsInZone = hrValues.filter(hr => isInZone(hr, zoneMin, zoneMax)).length;
//   return pointsInZone / hrValues.length;
// };

// Calculate overall session score from all phases
// NEW: Uses deviation-based scoring with weighted formula
export const calculateSessionScore = (hrData, zones, sessionDuration, plannedDuration = null) => {
  const hrValues = extractHRValues(hrData);
  const phases = splitDataIntoPhases(hrValues, sessionDuration, plannedDuration);

  // Calculate warmup score (SW): percentage of values >= lower bound
  const warmupScore = calculateWarmupScore(
    phases.warmup,
    zones.warmupZoneMin
  );

  // Calculate exercise score (SE): average-based with deviation scoring + variability check
  const exerciseScore = calculateExerciseScore(
    phases.exercise,
    zones.exerciseZoneMin,
    zones.exerciseZoneMax
  );

  // Calculate cooldown score (SC): average-based with deviation scoring
  const cooldownScore = calculateCooldownScore(
    phases.cooldown,
    zones.cooldownZoneMin,
    zones.cooldownZoneMax
  );

  // Final score: FinalScore = 0.1*SW + 0.8*SE + 0.1*SC
  // Weighted: 10% warmup, 80% exercise, 10% cooldown
  const overallScore = 0.1 * warmupScore + 0.8 * exerciseScore + 0.1 * cooldownScore;

  return {
    warmupScore: warmupScore,
    exerciseScore: exerciseScore,
    cooldownScore: cooldownScore,
    overallScore: Math.round(overallScore)
  };
};

// OLD VERSION (COMMENTED OUT):
// export const calculateSessionScore = (hrData, zones, sessionDuration) => {
//   const hrValues = extractHRValues(hrData);
//   const phases = splitDataIntoPhases(hrValues, sessionDuration);
//
//   // Calculate score for each phase
//   const warmupScore = calculatePhaseScore(
//     phases.warmup,
//     zones.warmupZoneMin,
//     zones.warmupZoneMax
//   );
//
//   const exerciseScore = calculatePhaseScore(
//     phases.exercise,
//     zones.exerciseZoneMin,
//     zones.exerciseZoneMax
//   );
//
//   const cooldownScore = calculatePhaseScore(
//     phases.cooldown,
//     zones.cooldownZoneMin,
//     zones.cooldownZoneMax
//   );
//
//   // Overall score is average of all three phases
//   const overallScore = (warmupScore + exerciseScore + cooldownScore) / 3;
//
//   return {
//     warmupScore: Math.round(warmupScore * 100) ,
//     exerciseScore: Math.round(exerciseScore * 100) ,
//     cooldownScore: Math.round(cooldownScore * 100) ,
//     overallScore: Math.round(overallScore * 100)
//   };
// };

// Determine risk level based on weekly score
// NEW: Updated thresholds per requirements
// If WeeklyScore <= 50, High risk
// If 51 <= WeeklyScore <= 79, Moderate risk
// If WeeklyScore >= 80, Low risk
export const determineRiskLevel = (weeklyScore) => {
  if (weeklyScore <= 50) {
    return 'High';
  } else if (weeklyScore <= 79) {
    return 'Moderate';
  } else {
    return 'Low';
  }
};

// Calculate median from an array of numbers
export const calculateMedian = (values) => {
  if (!values || values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 0) {
    return Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  } else {
    return sorted[mid];
  }
};

// Impute missing HR data points with median value
// Takes sparse HR data and fills in all missing minute timestamps with median
// Returns: { data: array, completeness: decimal (0-1) }
export const imputeMissingHRData = (hrData, sessionStartTime, sessionEndTime) => {
  if (!hrData || hrData.length === 0) {
    console.log('[Imputation] No data to impute');
    return { data: [], completeness: 0 };
  }

  // Calculate session duration in minutes
  const durationMs = sessionEndTime.getTime() - sessionStartTime.getTime();
  const durationMinutes = Math.round(durationMs / (60 * 1000));

  console.log(`[Imputation] Session duration: ${durationMinutes} minutes`);
  console.log(`[Imputation] Received ${hrData.length} data points`);

  // Round session start time DOWN to nearest minute (ignore seconds)
  const roundedStartTime = Math.floor(sessionStartTime.getTime() / 60000) * 60000;

  console.log(`[Imputation] Session start: ${new Date(sessionStartTime).toISOString()}`);
  console.log(`[Imputation] Rounded start: ${new Date(roundedStartTime).toISOString()}`);

  // Generate all expected minute timestamps (on exact minute boundaries)
  const expectedTimestamps = [];
  for (let i = 0; i < durationMinutes; i++) {
    const timestamp = roundedStartTime + (i * 60 * 1000);
    expectedTimestamps.push(timestamp);
  }

  // Create a map of existing data points (rounded to minute)
  // Handle multiple values at same timestamp by collecting all values
  const existingDataMap = new Map();
  hrData.forEach(item => {
    // Floor timestamp to current minute (not nearest, to avoid rounding up)
    const roundedTimestamp = Math.floor(item.timestamp / 60000) * 60000;

    if (!existingDataMap.has(roundedTimestamp)) {
      existingDataMap.set(roundedTimestamp, []);
    }
    existingDataMap.get(roundedTimestamp).push(item.value);
  });

  // Average multiple values at the same timestamp
  const averagedDataMap = new Map();
  existingDataMap.forEach((values, timestamp) => {
    const average = values.reduce((sum, val) => sum + val, 0) / values.length;
    averagedDataMap.set(timestamp, average);

    if (values.length > 1) {
      console.log(`[Imputation] Averaged ${values.length} values at ${new Date(timestamp).toISOString()}: ${values.join(', ')} → ${average.toFixed(1)}`);
    }
  });

  // Calculate median from existing HR values (used as fallback)
  const existingValues = hrData.map(item => item.value);
  const medianHR = calculateMedian(existingValues);

  // Calculate data completeness (coverage)
  const validCount = averagedDataMap.size;
  const coverage = validCount / durationMinutes;

  console.log(`[Imputation] Calculated median HR: ${medianHR} from ${existingValues.length} points`);
  console.log(`[Imputation] Data coverage: ${(coverage * 100).toFixed(1)}% (${validCount}/${durationMinutes} minutes)`);
  console.log(`[Imputation] Expected timestamps (first 3): ${expectedTimestamps.slice(0, 3).map(t => new Date(t).toISOString()).join(', ')}`);
  console.log(`[Imputation] Data map keys (first 3): ${Array.from(averagedDataMap.keys()).slice(0, 3).map(t => new Date(t).toISOString()).join(', ')}`);

  // Build complete dataset with LINEAR INTERPOLATION or median fallback
  const completeHrData = expectedTimestamps.map((timestamp, index) => {
    const existingValue = averagedDataMap.get(timestamp);

    if (existingValue !== undefined) {
      // Real data point
      return {
        timestamp: timestamp,
        value: existingValue,
        isImputed: false
      };
    } else {
      // Missing data point - choose imputation strategy based on coverage
      let imputedValue;

      if (coverage < 0.4) {
        // LOW COVERAGE (<40%): Use median for all missing points
        // Too sparse for reliable interpolation
        imputedValue = medianHR;
      } else {
        // SUFFICIENT COVERAGE (≥40%): Use linear interpolation

        // Find previous valid data point
        let prevIndex = -1;
        let prevValue = null;
        for (let i = index - 1; i >= 0; i--) {
          const prevTimestamp = expectedTimestamps[i];
          if (averagedDataMap.has(prevTimestamp)) {
            prevIndex = i;
            prevValue = averagedDataMap.get(prevTimestamp);
            break;
          }
        }

        // Find next valid data point
        let nextIndex = -1;
        let nextValue = null;
        for (let i = index + 1; i < expectedTimestamps.length; i++) {
          const nextTimestamp = expectedTimestamps[i];
          if (averagedDataMap.has(nextTimestamp)) {
            nextIndex = i;
            nextValue = averagedDataMap.get(nextTimestamp);
            break;
          }
        }

        // Apply interpolation strategy
        if (prevIndex !== -1 && nextIndex !== -1) {
          // CASE 1: Both neighbors exist → Linear interpolation
          const fraction = (index - prevIndex) / (nextIndex - prevIndex);
          imputedValue = Math.round(prevValue + (nextValue - prevValue) * fraction);
        } else if (prevIndex !== -1) {
          // CASE 2: Only previous exists → Forward fill
          imputedValue = Math.round(prevValue);
        } else if (nextIndex !== -1) {
          // CASE 3: Only next exists → Backward fill
          imputedValue = Math.round(nextValue);
        } else {
          // CASE 4: No neighbors → Use median as fallback
          imputedValue = medianHR;
        }
      }

      return {
        timestamp: timestamp,
        value: imputedValue,
        isImputed: true
      };
    }
  });

  const imputedCount = completeHrData.filter(item => item.isImputed).length;
  const realCount = completeHrData.filter(item => !item.isImputed).length;

  // Calculate completeness as decimal (0-1)
  const completeness = durationMinutes > 0 ? realCount / durationMinutes : 0;

  console.log(`[Imputation] Created ${completeHrData.length} total points (${realCount} real, ${imputedCount} imputed)`);
  console.log(`[Imputation] Data completeness: ${(completeness * 100).toFixed(1)}% (${completeness.toFixed(3)})`);

  // Log imputation method used
  if (imputedCount > 0) {
    if (coverage < 0.4) {
      console.log(`[Imputation] Strategy: MEDIAN-ONLY (coverage ${(coverage * 100).toFixed(1)}% < 40%)`);
    } else {
      console.log(`[Imputation] Strategy: LINEAR INTERPOLATION (coverage ${(coverage * 100).toFixed(1)}% ≥ 40%)`);
    }
  }

  return {
    data: completeHrData,
    completeness: parseFloat(completeness.toFixed(3)) // 0.5 for 50%
  };
};

// Format HR data for storage in HistoricalHRData table
export const formatHRDataForStorage = (hrData, patientId, sessionDate) => {
  return hrData.map(item => {
    const timestamp = new Date(item.timestamp);

    return {
      patientId: patientId,
      recordedDate: sessionDate,
      recordedTime: timestamp.toTimeString().split(' ')[0],
      heartRate: item.value,
      activityType: 'exercise',
      dataSource: 'google_fit',
      isImputed: item.isImputed || false
    };
  });
};