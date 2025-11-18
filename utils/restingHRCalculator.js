import { Session, HistoricalHRData } from '../models/index.js';

/**
 * Calculate resting heart rate for a patient using all available historical data
 *
 * Algorithm:
 * 1. Exclude HR data from exercise sessions
 * 2. Filter to 50-80 BPM range (typical resting range)
 * 3. Remove statistical outliers (mean ± 2×SD)
 * 4. Return median value
 *
 * @param {string} patientId - Patient ID
 * @returns {Promise<number|null>} Resting HR or null if insufficient data
 */
export const calculateRestingHR = async (patientId) => {
  try {
    // Get all session time windows to exclude
    const allSessions = await Session.findAll({
      where: {
        patientId,
        status: 'completed',
      },
      attributes: ['sessionDate', 'sessionStartTime', 'sessionDuration'],
    });

    // Get all historical HR data
    const allHRData = await HistoricalHRData.findAll({
      where: { patientId },
      attributes: ['recordedDate', 'recordedTime', 'heartRate'],
    });

    if (allHRData.length === 0) {
      console.log(`[RestingHR] No historical data for patient ${patientId}`);
      return null;
    }

    // Filter out data that falls within session times
    const nonSessionData = allHRData.filter((hr) => {
      const hrTimestamp = new Date(`${hr.recordedDate}T${hr.recordedTime}`);

      // Check if this HR reading falls within any session window
      for (const session of allSessions) {
        const sessionStart = new Date(
          `${session.sessionDate}T${session.sessionStartTime}`
        );
        const durationMinutes = session.sessionDuration;
        const sessionEnd = new Date(
          sessionStart.getTime() + durationMinutes * 60 * 1000
        );

        if (hrTimestamp >= sessionStart && hrTimestamp <= sessionEnd) {
          return false; // Exclude this reading
        }
      }
      return true; // Include this reading
    });

    // Step 1: Filter to keep only 50-80 bpm
    const filteredData = nonSessionData
      .map((hr) => hr.heartRate)
      .filter((hr) => hr >= 50 && hr <= 80);

    if (filteredData.length === 0) {
      console.log(`[RestingHR] No valid data in 50-80 range for patient ${patientId}`);
      return null;
    }

    // Step 2: Calculate mean and standard deviation
    const mean =
      filteredData.reduce((sum, val) => sum + val, 0) / filteredData.length;
    const variance =
      filteredData.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) /
      filteredData.length;
    const stdDev = Math.sqrt(variance);

    // Step 3: Calculate bounds (mean ± 2×SD)
    const lowerBound = mean - 2 * stdDev;
    const upperBound = mean + 2 * stdDev;

    // Step 4: Remove outliers
    const cleanedData = filteredData.filter(
      (hr) => hr >= lowerBound && hr <= upperBound
    );

    if (cleanedData.length === 0) {
      console.log(
        `[RestingHR] No data after outlier removal for patient ${patientId}`
      );
      return null;
    }

    // Step 5: Find median
    cleanedData.sort((a, b) => a - b);
    const median =
      cleanedData.length % 2 === 0
        ? (cleanedData[cleanedData.length / 2 - 1] +
            cleanedData[cleanedData.length / 2]) /
          2
        : cleanedData[Math.floor(cleanedData.length / 2)];

    console.log(
      `[RestingHR] Patient ${patientId}:`
    );
    console.log(
      `  Total HR readings: ${allHRData.length}, Non-session: ${nonSessionData.length}`
    );
    console.log(
      `  After 50-80 filter: ${filteredData.length}, Mean: ${mean.toFixed(2)}, SD: ${stdDev.toFixed(2)}`
    );
    console.log(
      `  After outlier removal: ${cleanedData.length}, Median (Resting HR): ${median.toFixed(2)}`
    );

    return parseFloat(median.toFixed(2));
  } catch (error) {
    console.error('[RestingHR] Error calculating resting heart rate:', error);
    return null;
  }
};
