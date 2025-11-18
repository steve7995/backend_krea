import { User, HistoricalHRData } from '../models/index.js';
import { Op } from 'sequelize';
import { getValidToken } from './tokenManager.js';
import { fetchGoogleFitData } from './googleFit.js';

// Format raw data for output
const formatRawData = (hrData) => {
  return hrData.map(point => {
    const date = new Date(point.timestamp + (5.5 * 60 * 60 * 1000)); // IST
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    const hours = String(date.getUTCHours()).padStart(2, '0');
    const minutes = String(date.getUTCMinutes()).padStart(2, '0');
    const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
    return {
      hr: point.value,
      timestamp: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
    };
  });
};

// Extract min/max spike windows (5-10 minutes around extreme values)
const extractSpikeWindows = (hrData, windowMinutes = 10) => {
  if (!hrData || hrData.length === 0) {
    return [];
  }

  // Find absolute minimum and maximum HR points
  const minPoint = hrData.reduce((min, point) => point.value < min.value ? point : min, hrData[0]);
  const maxPoint = hrData.reduce((max, point) => point.value > max.value ? point : max, hrData[0]);

  const windowMs = windowMinutes * 60 * 1000; // Convert to milliseconds
  const spikeWindows = [];

  // Extract window around minimum
  const minWindow = hrData.filter(point =>
    Math.abs(point.timestamp - minPoint.timestamp) <= windowMs
  );

  // Extract window around maximum
  const maxWindow = hrData.filter(point =>
    Math.abs(point.timestamp - maxPoint.timestamp) <= windowMs
  );

  // Combine and remove duplicates (sort by timestamp)
  const combined = [...minWindow, ...maxWindow];
  const unique = Array.from(new Map(combined.map(item => [item.timestamp, item])).values())
    .sort((a, b) => a.timestamp - b.timestamp);

  console.log(`[SpikeWindows] Extracted ${unique.length} points around min (${minPoint.value} bpm) and max (${maxPoint.value} bpm) with ${windowMinutes}min window`);

  return unique;
};

// Adaptive bucketing
const applyAdaptiveBucketing = (hrData, startTime, endTime, targetPoints = 200) => {
  const firstTimestamp = startTime.getTime();
  const lastTimestamp = endTime.getTime();
  const timeSpan = lastTimestamp - firstTimestamp;
  const bucketSize = timeSpan / targetPoints;

  const buckets = [];

  for (let i = 0; i < targetPoints; i++) {
    const bucketStart = firstTimestamp + (i * bucketSize);
    const bucketEnd = bucketStart + bucketSize;

    const pointsInBucket = hrData.filter(p =>
      p.timestamp >= bucketStart && p.timestamp < bucketEnd
    );

    if (pointsInBucket.length > 0) {
      const hrValues = pointsInBucket.map(p => p.value);
      const avgHR = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);

      const date = new Date(bucketStart + (5.5 * 60 * 60 * 1000));
      const year = date.getUTCFullYear();
      const month = String(date.getUTCMonth() + 1).padStart(2, '0');
      const day = String(date.getUTCDate()).padStart(2, '0');
      const hours = String(date.getUTCHours()).padStart(2, '0');
      const minutes = String(date.getUTCMinutes()).padStart(2, '0');
      const seconds = String(date.getUTCSeconds()).padStart(2, '0');

      buckets.push({
        hr: avgHR,
        timestamp: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
      });
    }
  }

  return buckets;
};

// Main function - Gets and processes historical HR data
export const getProcessedHistoricalHR = async (patientId) => {
  try {
    console.log(`[HistoricalHR] Processing for patient ${patientId}`);
    
    let hrData = [];
    let startTime, endTime, timeRange;
    let dataSource = 'none';
    
    const patient = await User.findByPk(patientId);
    const patientExists = patient !== null;
    
    let accessToken;
    try {
      accessToken = await getValidToken(patientId);
    } catch (error) {
      throw new Error('Google token not found');
    }
    
    endTime = new Date();
    
    // EXISTING PATIENT - Try DB first
    if (patientExists) {
      startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
      timeRange = '24h';
      
      // Try DB 24h
      const historicalData24h = await HistoricalHRData.findAll({
        where: {
          patientId: patientId,
          recordedDate: { [Op.gte]: startTime.toISOString().split('T')[0] }
        },
        order: [['recordedDate', 'ASC'], ['recordedTime', 'ASC']]
      });
      
      if (historicalData24h.length > 0) {
        hrData = historicalData24h.map(record => ({
          timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
          value: record.heartRate
        })).filter(d => d.timestamp >= startTime.getTime());
        
        dataSource = 'historical_db';
        console.log(`[HistoricalHR] DB 24h: ${hrData.length} points`);
      }
      
      // Fallback to Google Fit 24h
      if (hrData.length < 50) {
        try {
          hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
          dataSource = 'google_fit';
          console.log(`[HistoricalHR] Google Fit 24h: ${hrData.length} points`);
        } catch (error) {
          console.error(`[HistoricalHR] Google Fit error:`, error);
        }
      }
      
      // Try DB 7d
      if (hrData.length < 50) {
        startTime = new Date(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
        timeRange = '7d';
        
        const historicalData7d = await HistoricalHRData.findAll({
          where: {
            patientId: patientId,
            recordedDate: { [Op.gte]: startTime.toISOString().split('T')[0] }
          },
          order: [['recordedDate', 'ASC'], ['recordedTime', 'ASC']]
        });
        
        if (historicalData7d.length > 0) {
          hrData = historicalData7d.map(record => ({
            timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
            value: record.heartRate
          })).filter(d => d.timestamp >= startTime.getTime());
          
          dataSource = 'historical_db';
          console.log(`[HistoricalHR] DB 7d: ${hrData.length} points`);
        }
      }
      
      // Fallback to Google Fit 7d
      if (hrData.length < 50) {
        try {
          hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
          dataSource = 'google_fit';
          console.log(`[HistoricalHR] Google Fit 7d: ${hrData.length} points`);
        } catch (error) {
          console.error(`[HistoricalHR] Google Fit error:`, error);
        }
      }
      
      // Try DB last 100
      if (hrData.length < 50) {
        timeRange = 'last_100';
        const last100 = await HistoricalHRData.findAll({
          where: { patientId: patientId },
          order: [['recordedDate', 'DESC'], ['recordedTime', 'DESC']],
          limit: 100
        });
        
        if (last100.length > 0) {
          hrData = last100.reverse().map(record => ({
            timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
            value: record.heartRate
          }));
          dataSource = 'historical_db';
          console.log(`[HistoricalHR] DB last 100: ${hrData.length} points`);
        }
      }
      
      // Final fallback: Google Fit last 100
      if (hrData.length < 50) {
        try {
          startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000));
          const allData = await fetchGoogleFitData(accessToken, startTime, endTime);
          hrData = allData.slice(-100);
          dataSource = 'google_fit';
          timeRange = 'last_100';
          console.log(`[HistoricalHR] Google Fit last 100: ${hrData.length} points`);
        } catch (error) {
          console.error(`[HistoricalHR] Google Fit error:`, error);
        }
      }
    }
    // NEW PATIENT - Google Fit only
    else {
      startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
      timeRange = '24h';
      
      try {
        hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
        dataSource = 'google_fit';
        console.log(`[HistoricalHR] New patient - Google Fit 24h: ${hrData.length} points`);
      } catch (error) {
        console.error(`[HistoricalHR] Google Fit error:`, error);
      }
      
      if (hrData.length < 50) {
        startTime = new Date(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
        timeRange = '7d';
        try {
          hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
          dataSource = 'google_fit';
          console.log(`[HistoricalHR] New patient - Google Fit 7d: ${hrData.length} points`);
        } catch (error) {
          console.error(`[HistoricalHR] Google Fit error:`, error);
        }
      }
      
      if (hrData.length < 50) {
        startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000));
        timeRange = 'last_100';
        try {
          const allData = await fetchGoogleFitData(accessToken, startTime, endTime);
          hrData = allData.slice(-100);
          dataSource = 'google_fit';
          console.log(`[HistoricalHR] New patient - Google Fit last 100: ${hrData.length} points`);
        } catch (error) {
          console.error(`[HistoricalHR] Google Fit error:`, error);
        }
      }
    }
    
    // No data found
    if (hrData.length === 0) {
      return {
        patient_id: parseInt(patientId),
        patient_status: patientExists ? 'existing' : 'new',
        time_range: timeRange,
        raw_data_points: 0,
        returned_data_points: 0,
        strategy: 'no_data',
        data_source: 'none',
        data: []
      };
    }
    
    // Process data - Extract spike windows (min/max + 5-10 min around them)
    let processedData;
    let strategy = 'spike_windows';

    // Always extract spike windows (min/max + surrounding data)
    const spikeData = extractSpikeWindows(hrData, 10); // 10-minute window
    processedData = formatRawData(spikeData);

    console.log(`[HistoricalHR] Processed ${hrData.length} → ${processedData.length} spike window points`);

    return {
      patient_id: parseInt(patientId),
      patient_status: patientExists ? 'existing' : 'new',
      time_range: timeRange,
      raw_data_points: hrData.length,
      returned_data_points: processedData.length,
      strategy: strategy,
      data_source: dataSource,
      data: processedData // Only spike windows, no separate outliers key
    };
    
  } catch (error) {
    console.error('[HistoricalHR] Error:', error);
    throw error;
  }
};