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

// Generate quick retry schedule for past independent sessions
// Extended to 6 attempts to handle delayed wearable device syncs (can take hours)
export const generateQuickRetrySchedule = (currentTime) => {
  const now = new Date(currentTime);
  const schedule = [];

  // EXTENDED schedule: 6 attempts with progressive delays
  // Handles both immediate syncs and delayed wearable syncs
  const delays = [
    0,                      // Attempt 1: Immediate
    10 * 60 * 1000,        // Attempt 2: +10 minutes
    20 * 60 * 1000,        // Attempt 3: +20 minutes
    45 * 60 * 1000,        // Attempt 4: +45 minutes
    2 * 60 * 60 * 1000,    // Attempt 5: +2 hours
    4 * 60 * 60 * 1000     // Attempt 6: +4 hours
  ];

  for (let i = 0; i < delays.length; i++) {
    const attempt = i + 1;
    const scheduledFor = new Date(now.getTime() + delays[i]);

    schedule.push({
      attempt: attempt,
      scheduledFor: scheduledFor.toISOString(),
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
// Progressive Thresholds - More lenient for past sessions:
// Attempts 1-2: 70% (past sessions, expect some delay)
// Attempts 3-4: 60% (wearable sync delays common)
// Attempts 5-6: 50% (reasonable minimum for scoring)
// Attempts 7-11: 40% (final attempts before fallback)
export const shouldAcceptPartialData = (attemptNumber, completenessPercentage) => {
  let threshold;

  if (attemptNumber >= 1 && attemptNumber <= 2) {
    threshold = 70; // Tier 1: Initial checks (0-10 min)
  } else if (attemptNumber >= 3 && attemptNumber <= 4) {
    threshold = 60; // Tier 2: Medium wait (20-45 min)
  } else if (attemptNumber >= 5 && attemptNumber <= 6) {
    threshold = 50; // Tier 3: Extended wait (2-4 hours)
  } else if (attemptNumber >= 7 && attemptNumber <= 11) {
    threshold = 40; // Tier 4: Final attempts or historical fallback
  } else {
    threshold = 40; // Default for attempt 12+ (historical fallback)
  }

  return completenessPercentage >= threshold;
};