// Get delay in milliseconds for each attempt number
export const getNextAttemptDelay = (attemptNumber) => {
  // const delays = {
  //   1: 0,                    // Immediate (0 minutes)
  //   2: 15 * 60 * 1000,       // 15 minutes
  //   3: 30 * 60 * 1000,       // 30 minutes
  //   4: 60 * 60 * 1000,       // 1 hour
  //   5: 3 * 60 * 60 * 1000,   // 3 hours
  //   6: 6 * 60 * 60 * 1000    // 6 hours
  // };
  
  const delays = {
    1: 0,                      // Immediate
    // Fast checks (every 5 min)
    2: 5 * 60 * 1000,          // 5 minutes
    3: 5 * 60 * 1000,          // 5 minutes
    4: 5 * 60 * 1000,          // 5 minutes
    5: 5 * 60 * 1000,          // 5 minutes
    6: 5 * 60 * 1000,          // 5 minutes
    // Old schedule
    7: 15 * 60 * 1000,         // 15 minutes
    8: 30 * 60 * 1000,         // 30 minutes
    9: 60 * 60 * 1000,         // 1 hour
    10: 3 * 60 * 60 * 1000,    // 3 hours
    11: 6 * 60 * 60 * 1000     // 6 hours
  };
  
  return delays[attemptNumber] || null;
};

// Calculate exact time for next attempt based on session start time
export const calculateNextAttemptTime = (sessionStartTime, attemptNumber) => {
  const delay = getNextAttemptDelay(attemptNumber);
  
  if (delay === null) {
    return null; // No more attempts
  }
  
  const startTime = new Date(sessionStartTime);
  const nextAttempt = new Date(startTime.getTime() + delay);
  
  return nextAttempt;
};

// Check if it's time to attempt now (with 1-minute grace period)
export const shouldAttemptNow = (nextAttemptAt) => {
  if (!nextAttemptAt) {
    return false;
  }
  
  const now = new Date();
  const scheduledTime = new Date(nextAttemptAt);
  const gracePeriod = 60 * 1000; // 1 minute grace period
  
  // Allow processing if we're within 1 minute before or after scheduled time
  return now >= new Date(scheduledTime.getTime() - gracePeriod);
};

// Generate complete retry schedule for a session
export const generateRetrySchedule = (sessionStartTime) => {
  const schedule = [];
  
  // before attempts <=6 increased to 11 due to new 5 min intervals too
  for (let attempt = 1; attempt <= 11; attempt++) {
    const scheduledFor = calculateNextAttemptTime(sessionStartTime, attempt);
    
    schedule.push({
      attempt: attempt,
      scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
      executedAt: null,
      status: 'pending',
      result: null,
      dataPoints: null,
      errorMessage: null
    });
  }
  
  return schedule;
};

// Update retry schedule after an attempt
export const updateRetryScheduleItem = (retrySchedule, attemptNumber, result) => {
  const schedule = [...retrySchedule];
  const index = schedule.findIndex(item => item.attempt === attemptNumber);
  
  if (index !== -1) {
    schedule[index] = {
      ...schedule[index],
      executedAt: new Date().toISOString(),
      status: 'completed',
      result: result.result, // 'success', 'no_data', 'partial_data', 'error'
      dataPoints: result.dataPoints || 0,
      errorMessage: result.errorMessage || null
    };
  }
  
  return schedule;
};

// Get next pending attempt from schedule
export const getNextPendingAttempt = (retrySchedule) => {
  if (!retrySchedule || retrySchedule.length === 0) {
    return null;
  }
  
  const pending = retrySchedule.find(item => item.status === 'pending');
  return pending || null;
};

// Get human-readable time description
export const getAttemptDescription = (attemptNumber) => {
  const descriptions = {
    1: 'immediately',
    2: 'after 15 minutes',
    3: 'after 30 minutes',
    4: 'after 1 hour',
    5: 'after 3 hours',
    6: 'after 6 hours'
  };
  
  return descriptions[attemptNumber] || 'unknown';
};

// Check if all attempts exhausted
export const areAllAttemptsExhausted = (retrySchedule) => {
  if (!retrySchedule || retrySchedule.length === 0) {
    return false;
  }
  
  // Check if all 6 attempts are completed but now 11
  
  const completedAttempts = retrySchedule.filter(item => item.status === 'completed');
  return completedAttempts.length >= 11;
};

// Get data completeness percentage
export const calculateDataCompleteness = (actualDataPoints, expectedDataPoints) => {
  if (expectedDataPoints === 0) {
    return 0;
  }
  
  return (actualDataPoints / expectedDataPoints) * 100;
};

// Determine if partial data is acceptable based on attempt number
export const shouldAcceptPartialData = (attemptNumber, completenessPercentage) => {
  // Progressive acceptance based on attempt number
  const thresholds = {
    1: 100, // First attempt: need 100%
    2: 90,  // 15 min: accept 90%
    3: 80,  // 30 min: accept 80%
    4: 70,  // 1 hour: accept 70%
    5: 60,  // 3 hours: accept 60%
    6: 50   // 6 hours: accept 50% (last chance)
  };
  
  const threshold = thresholds[attemptNumber] || 80;
  return completenessPercentage >= threshold;
};