import express from 'express'
import { getValidToken } from '../utils/tokenManager.js';
import { fetchGoogleFitData } from '../utils/googleFit.js';
import { Op } from 'sequelize';  // ADD THIS LINE
import { User, HistoricalHRData, GoogleToken } from '../models/index.js';
const router = express.Router()




// router.get('/rehab-historical-hr/:patientId', async(req, res) => {
//   try {
//     const { patientId } = req.params;
    
//     console.log(`[HistoricalHR] Fetching data for patient ${patientId}`);
    
//     let hrData = [];
//     let startTime, endTime, timeRange;
//     let dataSource = 'none';
    
//     // Step 1: Check if patient exists
//     const patient = await User.findByPk(patientId);
//     const patientExists = patient !== null;
    
//     console.log(`[HistoricalHR] Patient ${patientExists ? 'EXISTS' : 'NOT FOUND'} in database`);
    
//     // Get access token for Google Fit (needed in both cases)
//     let accessToken;
//     try {
//       accessToken = await getValidToken(patientId);
//     } catch (error) {
//       return res.status(404).json({
//         status: 'failure',
//         message: 'Google token not found for this patient'
//       });
//     }
    
//     endTime = new Date();
    
//     // ============================================
//     // EXISTING PATIENT PATH - Try DB First
//     // ============================================
//     if (patientExists) {
//       console.log(`[HistoricalHR] Existing patient - checking Historical DB first...`);
      
//       // Step 2a: Try Historical Database (24 hours)
//       startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
//       timeRange = '24h';
      
//       const historicalData24h = await HistoricalHRData.findAll({
//         where: {
//           patientId: patientId,
//           recordedDate: {
//             [Op.gte]: startTime.toISOString().split('T')[0]
//           }
//         },
//         order: [['recordedDate', 'ASC'], ['recordedTime', 'ASC']]
//       });
      
//       if (historicalData24h.length > 0) {
//         hrData = historicalData24h.map(record => ({
//           timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
//           value: record.heartRate
//         }));
        
//         const twentyFourHoursAgo = startTime.getTime();
//         hrData = hrData.filter(d => d.timestamp >= twentyFourHoursAgo);
        
//         dataSource = 'historical_db';
//         console.log(`[HistoricalHR] Found ${hrData.length} points in Historical DB (24h)`);
//       }
      
//       // Step 2b: If insufficient, try Google Fit (24 hours)
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Insufficient in DB, trying Google Fit (24h)...`);
        
//         try {
//           hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
//           dataSource = 'google_fit';
//           console.log(`[HistoricalHR] Google Fit 24h: ${hrData.length} points`);
//         } catch (error) {
//           console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//         }
//       }
      
//       // Step 2c: If still insufficient, try Historical DB (7 days)
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Insufficient in 24h, checking Historical DB (7d)...`);
        
//         startTime = new Date(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
//         timeRange = '7d';
        
//         const historicalData7d = await HistoricalHRData.findAll({
//           where: {
//             patientId: patientId,
//             recordedDate: {
//               [Op.gte]: startTime.toISOString().split('T')[0]
//             }
//           },
//           order: [['recordedDate', 'ASC'], ['recordedTime', 'ASC']]
//         });
        
//         if (historicalData7d.length > 0) {
//           hrData = historicalData7d.map(record => ({
//             timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
//             value: record.heartRate
//           }));
          
//           const sevenDaysAgo = startTime.getTime();
//           hrData = hrData.filter(d => d.timestamp >= sevenDaysAgo);
          
//           dataSource = 'historical_db';
//           console.log(`[HistoricalHR] Found ${hrData.length} points in Historical DB (7d)`);
//         }
//       }
      
//       // Step 2d: If still insufficient, try Google Fit (7 days)
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Insufficient in DB, trying Google Fit (7d)...`);
        
//         try {
//           hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
//           dataSource = 'google_fit';
//           console.log(`[HistoricalHR] Google Fit 7d: ${hrData.length} points`);
//         } catch (error) {
//           console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//         }
//       }
      
//       // Step 2e: Last resort - get last 100 points from Historical DB
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Still insufficient, getting last 100 from Historical DB...`);
        
//         timeRange = 'last_100';
        
//         const last100 = await HistoricalHRData.findAll({
//           where: { patientId: patientId },
//           order: [['recordedDate', 'DESC'], ['recordedTime', 'DESC']],
//           limit: 100
//         });
        
//         if (last100.length > 0) {
//           hrData = last100.reverse().map(record => ({
//             timestamp: new Date(`${record.recordedDate}T${record.recordedTime}`).getTime(),
//             value: record.heartRate
//           }));
          
//           dataSource = 'historical_db';
//           console.log(`[HistoricalHR] Found ${hrData.length} points (last 100 from DB)`);
//         }
//       }
      
//       // Step 2f: Final fallback - Google Fit last 30 days, take last 100
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Final fallback: Google Fit last 30 days...`);
        
//         try {
//           startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000));
//           const allData = await fetchGoogleFitData(accessToken, startTime, endTime);
//           hrData = allData.slice(-100);
//           dataSource = 'google_fit';
//           timeRange = 'last_100';
//           console.log(`[HistoricalHR] Got last 100 points from Google Fit`);
//         } catch (error) {
//           console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//         }
//       }
//     }
    
//     // ============================================
//     // NEW PATIENT PATH - Google Fit Only
//     // ============================================
//     else {
//       console.log(`[HistoricalHR] New patient - fetching directly from Google Fit...`);
      
//       // Step 3a: Try Google Fit (24 hours)
//       startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
//       timeRange = '24h';
      
//       try {
//         hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
//         dataSource = 'google_fit';
//         console.log(`[HistoricalHR] Google Fit 24h: ${hrData.length} points`);
//       } catch (error) {
//         console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//       }
      
//       // Step 3b: If insufficient, try Google Fit (7 days)
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Insufficient in 24h, trying Google Fit (7d)...`);
        
//         startTime = new Date(endTime.getTime() - (7 * 24 * 60 * 60 * 1000));
//         timeRange = '7d';
        
//         try {
//           hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
//           dataSource = 'google_fit';
//           console.log(`[HistoricalHR] Google Fit 7d: ${hrData.length} points`);
//         } catch (error) {
//           console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//         }
//       }
      
//       // Step 3c: Last resort - Google Fit last 30 days, take last 100
//       if (hrData.length < 50) {
//         console.log(`[HistoricalHR] Still insufficient, trying Google Fit last 30 days...`);
        
//         startTime = new Date(endTime.getTime() - (30 * 24 * 60 * 60 * 1000));
//         timeRange = 'last_100';
        
//         try {
//           const allData = await fetchGoogleFitData(accessToken, startTime, endTime);
//           hrData = allData.slice(-100);
//           dataSource = 'google_fit';
//           console.log(`[HistoricalHR] Got last 100 points from Google Fit`);
//         } catch (error) {
//           console.error(`[HistoricalHR] Error fetching from Google Fit:`, error);
//         }
//       }
//     }
    
//     // ============================================
//     // COMMON PATH - Process Data
//     // ============================================
    
//     // Step 4: If no data found, return empty
//     if (hrData.length === 0) {
//       return res.json({
//         patient_id: parseInt(patientId),
//         patient_status: patientExists ? 'existing' : 'new',
//         time_range: timeRange,
//         raw_data_points: 0,
//         returned_data_points: 0,
//         strategy: 'no_data',
//         data_source: 'none',
//         data: []
//       });
//     }
    
//     // Step 5: Process data (bucket if >200 points)
//     let processedData;
//     let strategy;
    
//     if (hrData.length <= 200) {
//       console.log(`[HistoricalHR] Data ≤ 200 points, returning as-is`);
//       strategy = 'raw';
//       processedData = formatRawData(hrData);
//     } else {
//       console.log(`[HistoricalHR] Data > 200 points (${hrData.length}), applying bucketing`);
//       strategy = 'bucketed';
      
//       const actualStart = new Date(Math.min(...hrData.map(d => d.timestamp)));
//       const actualEnd = new Date(Math.max(...hrData.map(d => d.timestamp)));
      
//       processedData = applyAdaptiveBucketing(hrData, actualStart, actualEnd, 200);
//     }
    
//     // Step 6: Return response
//     res.json({
//       patient_id: parseInt(patientId),
//       patient_status: patientExists ? 'existing' : 'new',
//       time_range: timeRange,
//       raw_data_points: hrData.length,
//       returned_data_points: processedData.length,
//       strategy: strategy,
//       data_source: dataSource,
//       data: processedData
//     });
    
//   } catch (error) {
//     console.error('[HistoricalHR] Error:', error);
//     res.status(500).json({
//       status: 'failure',
//       message: error.message
//     });
//   }
// });

// // Helper: Format raw data (≤200 points)
// function formatRawData(hrData) {
//   return hrData.map(point => {
//     const date = new Date(point.timestamp + (5.5 * 60 * 60 * 1000)); // IST
//     const year = date.getUTCFullYear();
//     const month = String(date.getUTCMonth() + 1).padStart(2, '0');
//     const day = String(date.getUTCDate()).padStart(2, '0');
//     const hours = String(date.getUTCHours()).padStart(2, '0');
//     const minutes = String(date.getUTCMinutes()).padStart(2, '0');
//     const seconds = String(date.getUTCSeconds()).padStart(2, '0');
    
//     return {
//       hr: point.value,
//       timestamp: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
//     };
//   });
// }

// // Helper: Apply adaptive bucketing (>200 points)
// function applyAdaptiveBucketing(hrData, startTime, endTime, targetPoints = 200) {
//   const firstTimestamp = startTime.getTime();
//   const lastTimestamp = endTime.getTime();
//   const timeSpan = lastTimestamp - firstTimestamp;
//   const bucketSize = timeSpan / targetPoints;
  
//   console.log(`[Bucketing] Time span: ${timeSpan}ms, Bucket size: ${bucketSize}ms (~${(bucketSize / 60000).toFixed(1)} min)`);
  
//   const buckets = [];
  
//   for (let i = 0; i < targetPoints; i++) {
//     const bucketStart = firstTimestamp + (i * bucketSize);
//     const bucketEnd = bucketStart + bucketSize;
    
//     const pointsInBucket = hrData.filter(p => 
//       p.timestamp >= bucketStart && p.timestamp < bucketEnd
//     );
    
//     if (pointsInBucket.length > 0) {
//       const hrValues = pointsInBucket.map(p => p.value);
//       const avgHR = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
//       const minHR = Math.min(...hrValues);
//       const maxHR = Math.max(...hrValues);
      
//       const date = new Date(bucketStart + (5.5 * 60 * 60 * 1000));
//       const year = date.getUTCFullYear();
//       const month = String(date.getUTCMonth() + 1).padStart(2, '0');
//       const day = String(date.getUTCDate()).padStart(2, '0');
//       const hours = String(date.getUTCHours()).padStart(2, '0');
//       const minutes = String(date.getUTCMinutes()).padStart(2, '0');
//       const seconds = String(date.getUTCSeconds()).padStart(2, '0');
      
//       buckets.push({
//         hr: avgHR,
//         min_hr: minHR,
//         max_hr: maxHR,
//         sample_count: pointsInBucket.length,
//         timestamp: `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
//       });
//     }
//   }
  
//   console.log(`[Bucketing] Created ${buckets.length} buckets from ${hrData.length} points`);
  
//   return buckets;
// }


import { getProcessedHistoricalHR } from '../utils/historicalHRProcessor.js';

router.get('/rehab-historical-hr/:patientId', async(req, res) => {
  try {
    const { patientId } = req.params;
    const result = await getProcessedHistoricalHR(patientId);
    res.json(result);
  } catch (error) {
    console.error('[HistoricalHR] Error:', error);
    res.status(500).json({
      status: 'failure',
      message: error.message
    });
  }
});
export default router