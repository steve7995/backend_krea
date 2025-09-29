import axios from 'axios';

// Fetch heart rate data from Google Fit for a specific time range
export const fetchGoogleFitData = async (accessToken, startTime, endTime) => {
  try {
    const response = await axios.post(
      'https://www.googleapis.com/fitness/v1/users/me/dataset:aggregate',
      {
        aggregateBy: [{
          dataTypeName: 'com.google.heart_rate.bpm',
          dataSourceId: 'derived:com.google.heart_rate.bpm:com.google.android.gms:merge_heart_rate_bpm'
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

// Split HR data into phases (warmup, exercise, cooldown)
export const splitDataIntoPhases = (hrData, sessionDuration) => {
  const warmupData = hrData.slice(0, 5); // First 5 minutes
  const cooldownData = hrData.slice(-5); // Last 5 minutes
  const exerciseData = hrData.slice(5, sessionDuration - 5); // Middle portion
  
  return {
    warmup: warmupData,
    exercise: exerciseData,
    cooldown: cooldownData
  };
};

// Check if HR is within zone
export const isInZone = (hr, zoneMin, zoneMax) => {
  return hr >= zoneMin && hr <= zoneMax;
};

// Calculate phase score (percentage of time in zone)
export const calculatePhaseScore = (hrValues, zoneMin, zoneMax) => {
  if (!hrValues || hrValues.length === 0) {
    return 0;
  }
  
  const pointsInZone = hrValues.filter(hr => isInZone(hr, zoneMin, zoneMax)).length;
  return pointsInZone / hrValues.length;
};

// Calculate overall session score from all phases
export const calculateSessionScore = (hrData, zones, sessionDuration) => {
  const hrValues = extractHRValues(hrData);
  const phases = splitDataIntoPhases(hrValues, sessionDuration);
  
  // Calculate score for each phase
  const warmupScore = calculatePhaseScore(
    phases.warmup, 
    zones.warmupZoneMin, 
    zones.warmupZoneMax
  );
  
  const exerciseScore = calculatePhaseScore(
    phases.exercise, 
    zones.exerciseZoneMin, 
    zones.exerciseZoneMax
  );
  
  const cooldownScore = calculatePhaseScore(
    phases.cooldown, 
    zones.cooldownZoneMin, 
    zones.cooldownZoneMax
  );
  
  // Overall score is average of all three phases
  const overallScore = (warmupScore + exerciseScore + cooldownScore) / 3;
  
  return {
    warmupScore: Math.round(warmupScore * 100) / 100,
    exerciseScore: Math.round(exerciseScore * 100) / 100,
    cooldownScore: Math.round(cooldownScore * 100) / 100,
    overallScore: Math.round(overallScore * 100) / 100
  };
};

// Determine risk level based on session score
export const determineRiskLevel = (sessionScore) => {
  if (sessionScore < 0.5) {
    return 'High';
  } else if (sessionScore < 0.7) {
    return 'Moderate';
  } else {
    return 'Low';
  }
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
      dataSource: 'google_fit'
    };
  });
};