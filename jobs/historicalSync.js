  import cron from 'node-cron';
  import { User, GoogleToken, HistoricalHRData, Session } from '../models/index.js';
  import { acquireTokenLock, releaseTokenLock, getValidToken } from '../utils/tokenManager.js';
  import { fetchGoogleFitData } from '../utils/googleFit.js';
  import { getProcessedHistoricalHR } from '../utils/historicalHRProcessor.js';
import { pushHistoricalHRToSpectrum, pushRestingHRToSpectrum } from '../utils/spectrumFormatter.js';
  import { Op } from 'sequelize';
  import { calculateRestingHR } from '../utils/restingHRCalculator.js';

  // ========================================
  // RUN HISTORICAL SYNC FOR ALL PATIENTS
  // ========================================
  const runHistoricalSync = async () => {
    try {
      // console.log('[HistoricalSync] Starting 12-hour sync...');
      console.log('[HistoricalSync] Starting 6-hour sync...');

      const startTime = Date.now();
      
      // Get all patients with Google tokens
      const patients = await User.findAll({
        include: [{
          model: GoogleToken,
          required: true // Only patients with tokens
        }]
      });
      
      if (patients.length === 0) {
        console.log('[HistoricalSync] No patients with Google Fit connected');
        return;
      }
      
      console.log(`[HistoricalSync] Found ${patients.length} patients to sync`);
      
      let successCount = 0;
      let skipCount = 0;
      let errorCount = 0;
      const skippedPatients = [];
      
      // Process each patient
      for (const patient of patients) {
        try {
          // Check if patient has any processing sessions
          const processingSessions = await Session.count({
            where: {
              patientId: patient.patientId,
              status: 'processing'
            }
          });
          
          if (processingSessions > 0) {
            console.log(`[HistoricalSync] Patient ${patient.patientId} has ${processingSessions} processing session(s), skipping...`);
            skippedPatients.push(patient.patientId);
            skipCount++;
            continue;
          }
          
          // Sync this patient
          const result = await syncPatientData(patient);
          
          if (result.success) {
            successCount++;
          } else {
            errorCount++;
          }
          
        } catch (error) {
          console.error(`[HistoricalSync] Error processing patient ${patient.patientId}:`, error.message);
          errorCount++;
        }
      }
      
      // Retry skipped patients if any
      if (skippedPatients.length > 0) {
        console.log(`[HistoricalSync] Retrying ${skippedPatients.length} skipped patients...`);
        
        // Wait 5 minutes before retry
        await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
        
        for (const patientId of skippedPatients) {
          try {
            const patient = await User.findByPk(patientId, {
              include: [GoogleToken]
            });
            
            if (patient) {
              const result = await syncPatientData(patient);
              if (result.success) {
                successCount++;
                skipCount--;
              }
            }
          } catch (error) {
            console.error(`[HistoricalSync] Retry failed for ${patientId}:`, error.message);
          }
        }
      }
      
      const duration = ((Date.now() - startTime) / 1000).toFixed(2);
      console.log(`[HistoricalSync] Completed in ${duration}s - Success: ${successCount}, Skipped: ${skipCount}, Errors: ${errorCount}`);
      
    } catch (error) {
      console.error('[HistoricalSync] Fatal error:', error);
    }
  };

  

// const syncPatientData = async (patient) => {
//   let lockAcquired = false;
  
//   try {
//     const patientId = patient.patientId;
//     console.log(`[HistoricalSync] Syncing patient ${patientId}...`);
    
//     // Try to acquire token lock
//     lockAcquired = await acquireTokenLock(patientId, 'historical_sync');
    
//     if (!lockAcquired) {
//       console.log(`[HistoricalSync] Could not acquire lock for ${patientId}, skipping`);
//       return { success: false, reason: 'lock_unavailable' };
//     }
    
//     // Get last sync time
//     const lastSync = await getLastSyncTime(patientId);
//     const now = new Date();
    
//     console.log(`[HistoricalSync] Patient ${patientId} - Last sync: ${lastSync.toISOString()}`);
    
//     // Get valid token
//     // const accessToken = await getValidToken(patientId);

//     let accessToken;
//     try {
//       lockAcquired = await acquireTokenLock(patientId, 'historical-sync');
//       if (!lockAcquired) {
//         return { success: false, reason: 'token_locked' };
//       }
      
//       accessToken = await getValidToken(patientId);
      
//     } catch (tokenError) {
//       // Handle token errors
//       if (
//         tokenError.message === 'REFRESH_TOKEN_EXPIRED' ||
//         tokenError.message === 'TOKEN_INVALID' ||
//         tokenError.message === 'TOKEN_NOT_FOUND'
//       ) {
//         console.error(`[HistoricalSync] ✗ Token expired for patient ${patientId}`);
        
//         // Notify Spectrum
//         await notifySpectrumTokenExpired(patientId);
        
//         return { 
//           success: false, 
//           reason: 'token_expired' 
//         };
//       }
      
//       throw tokenError;
//     }
    
//     // Fetch data in 6-hour chunks (Google Fit limits)
//     let currentStart = lastSync;
//     let totalRecords = 0;
    
//     while (currentStart < now) {
//       const chunkEnd = new Date(Math.min(
//         currentStart.getTime() + 6 * 60 * 60 * 1000, // 6 hours
//         now.getTime()
//       ));
      
//       console.log(`[HistoricalSync] Patient ${patientId} - Fetching ${currentStart.toISOString()} to ${chunkEnd.toISOString()}`);
      
//       try {
//         const hrData = await fetchGoogleFitData(accessToken, currentStart, chunkEnd);
        
//         if (hrData && hrData.length > 0) {
//           // Format and store data
//           const records = hrData.map(hr => {
//             const timestamp = new Date(hr.timestamp);
//             return {
//               patientId,
//               recordedDate: timestamp.toISOString().split('T')[0],
//               recordedTime: timestamp.toTimeString().split(' ')[0],
//               heartRate: hr.value,
//               activityType: determineActivityType(hr.value, timestamp),
//               dataSource: 'google_fit'
//             };
//           });
          
//           // Bulk insert (ignore duplicates)
//           await HistoricalHRData.bulkCreate(records, {
//             ignoreDuplicates: true
//           });
          
//           totalRecords += records.length;
//         }
        
//       } catch (chunkError) {
//         console.error(`[HistoricalSync] Error fetching chunk for ${patientId}:`, chunkError.message);
//         // Continue with next chunk even if one fails
//       }
      
//       currentStart = chunkEnd;
//     }
    
//     console.log(`[HistoricalSync] ✓ Patient ${patientId} - Synced ${totalRecords} records`);
    
//     // NEW: Push to Spectrum after successful sync
//     if (totalRecords > 0) {
//       try {
//         console.log(`[HistoricalSync] Pushing to Spectrum for patient ${patientId}`);
        
//         // Get processed data (reuses GET route logic)
//         const processedResult = await getProcessedHistoricalHR(patientId);
        
//         if (processedResult.data && processedResult.data.length > 0) {
//           // Push to Spectrum
//           await pushHistoricalHRToSpectrum(patientId, processedResult.data);
//         } else {
//           console.log(`[HistoricalSync] No data to push for patient ${patientId}`);
//         }
//       } catch (pushError) {
//         console.error(`[HistoricalSync] Error pushing to Spectrum:`, pushError);
//         // Don't fail the sync if push fails
//       }
//     }
    
//     return { success: true, recordCount: totalRecords };
    
//   } catch (error) {
//     console.error(`[HistoricalSync] Error syncing patient ${patient.patientId}:`, error);
//     return { success: false, reason: error.message };
    
//   } finally {
//     // Always release lock
//     if (lockAcquired) {
//       await releaseTokenLock(patient.patientId);
//     }
//   }
// };
  // ========================================
  // GET LAST SYNC TIME FOR PATIENT
  // ========================================
  const syncPatientData = async (patient) => {
  let lockAcquired = false;
  
  try {
    const patientId = patient.patientId;
    console.log(`[HistoricalSync] Syncing patient ${patientId}...`);
    
    // Try to acquire token lock
    lockAcquired = await acquireTokenLock(patientId, 'historical_sync');
    
    if (!lockAcquired) {
      console.log(`[HistoricalSync] Could not acquire lock for ${patientId}, skipping`);
      return { success: false, reason: 'lock_unavailable' };
    }
    
    // Get last sync time
    const lastSync = await getLastSyncTime(patientId);
    const now = new Date();
    
    console.log(`[HistoricalSync] Patient ${patientId} - Last sync: ${lastSync.toISOString()}`);
    
    // Get valid token (no need to acquire lock again - we already have it!)
    let accessToken;
    try {
      accessToken = await getValidToken(patientId);
    } catch (tokenError) {
      // Handle token errors
      if (
        tokenError.message === 'REFRESH_TOKEN_EXPIRED' ||
        tokenError.message === 'TOKEN_INVALID' ||
        tokenError.message === 'TOKEN_NOT_FOUND'
      ) {
        console.error(`[HistoricalSync] ✗ Token expired for patient ${patientId}`);

        // Spectrum checks token status via /api/auth/token-status endpoint before each session
        // No need to notify them here

        return {
          success: false,
          reason: 'token_expired'
        };
      }
      
      throw tokenError;
    }
    
    // Fetch data in 6-hour chunks (Google Fit limits)
    let currentStart = lastSync;
    let totalRecords = 0;
    
    while (currentStart < now) {
      const chunkEnd = new Date(Math.min(
        currentStart.getTime() + 6 * 60 * 60 * 1000, // 6 hours
        now.getTime()
      ));
      
      console.log(`[HistoricalSync] Patient ${patientId} - Fetching ${currentStart.toISOString()} to ${chunkEnd.toISOString()}`);
      
      try {
        const hrData = await fetchGoogleFitData(accessToken, currentStart, chunkEnd);
        
        if (hrData && hrData.length > 0) {
          // Format and store data
          const records = hrData.map(hr => {
            const timestamp = new Date(hr.timestamp);
            return {
              patientId,
              recordedDate: timestamp.toISOString().split('T')[0],
              recordedTime: timestamp.toTimeString().split(' ')[0],
              heartRate: hr.value,
              activityType: determineActivityType(hr.value, timestamp),
              dataSource: 'google_fit'
            };
          });
          
          // Bulk insert (ignore duplicates)
          await HistoricalHRData.bulkCreate(records, {
            ignoreDuplicates: true
          });
          
          totalRecords += records.length;
        }
        
      } catch (chunkError) {
        console.error(`[HistoricalSync] Error fetching chunk for ${patientId}:`, chunkError.message);
        // Continue with next chunk even if one fails
      }
      
      currentStart = chunkEnd;
    }
    
    console.log(`[HistoricalSync] ✓ Patient ${patientId} - Synced ${totalRecords} records`);

    // Push to Spectrum after successful sync
    if (totalRecords > 0) {
      try {
        console.log(`[HistoricalSync] Pushing to Spectrum for patient ${patientId}`);

        // Get processed data (reuses GET route logic)
        const processedResult = await getProcessedHistoricalHR(patientId);

        if (processedResult.data && processedResult.data.length > 0) {
          // Push historical HR to Spectrum
          await pushHistoricalHRToSpectrum(patientId, processedResult.data);
        } else {
          console.log(`[HistoricalSync] No data to push for patient ${patientId}`);
        }
      } catch (pushError) {
        console.error(`[HistoricalSync] Error pushing to Spectrum:`, pushError);
        // Don't fail the sync if push fails
      }
    }

    // Calculate and push resting HR to Spectrum (runs every 6 hours after sync)
    try {
      console.log(`[HistoricalSync] Calculating resting HR for patient ${patientId}`);

      const restingHR = await calculateRestingHR(patientId);

      if (restingHR !== null && restingHR > 0) {
        // Push resting HR to Spectrum
        await pushRestingHRToSpectrum(patientId, restingHR);
        console.log(`[HistoricalSync] ✓ Resting HR calculated and pushed: ${restingHR} bpm`);
      } else {
        console.log(`[HistoricalSync] Insufficient data to calculate resting HR for patient ${patientId}`);
      }
    } catch (restingHRError) {
      console.error(`[HistoricalSync] Error calculating/pushing resting HR:`, restingHRError);
      // Don't fail the sync if resting HR calculation fails
    }
    
    return { success: true, recordCount: totalRecords };
    
  } catch (error) {
    console.error(`[HistoricalSync] Error syncing patient ${patient.patientId}:`, error);
    return { success: false, reason: error.message };
    
  } finally {
    // Always release lock
    if (lockAcquired) {
      await releaseTokenLock(patient.patientId);
    }
  }
};
  
  const getLastSyncTime = async (patientId) => {
    try {
      // Find most recent record for this patient
      const lastRecord = await HistoricalHRData.findOne({
        where: { patientId },
        order: [['recordedDate', 'DESC'], ['recordedTime', 'DESC']],
        attributes: ['recordedDate', 'recordedTime']
      });
      
      if (lastRecord) {
        // Start from last recorded time
        return new Date(`${lastRecord.recordedDate}T${lastRecord.recordedTime}`);
      }
      
      // No previous data, start from 12 hours ago
      // return new Date(Date.now() - 12 * 60 * 60 * 1000);
      return new Date(Date.now() - 6 * 60 * 60 * 1000);

    } catch (error) {
      console.error(`[HistoricalSync] Error getting last sync time for ${patientId}:`, error);
      // Default to 12 hours ago
      // return new Date(Date.now() - 12 * 60 * 60 * 1000);
      return new Date(Date.now() - 6 * 60 * 60 * 1000);

    }
  };

  // ========================================
  // DETERMINE ACTIVITY TYPE BASED ON HR AND TIME
  // ========================================
  const determineActivityType = (heartRate, timestamp) => {
    // const hour = timestamp.getHours();
    
    // // Sleep hours (10 PM - 6 AM) and low HR
    // if ((hour >= 22 || hour < 6) && heartRate < 70) {
    //   return 'sleep';
    // }
    
    // // High HR suggests exercise
    // if (heartRate > 100) {
    //   return 'exercise';
    // }
    
    // // Low HR suggests rest
    // if (heartRate < 80) {
    //   return 'rest';
    // }
    
    // Default
    return 'unknown';
  };

  // ========================================
  // START HISTORICAL SYNC CRON JOB
  // ========================================
  export const startHistoricalSync = () => {
    // Run at 2:00 AM and 2:00 PM every day
    // Cron format: '0 2,14 * * *' means "at minute 0 of hour 2 and 14"
    // cron.schedule('0 2,14 * * *', () => {
    //   console.log('[HistoricalSync] Cron job triggered');
    //   runHistoricalSync();
    // });
    cron.schedule('0 0,6,12,18 * * *', () => {
    console.log('[HistoricalSync] Cron job triggered');
    runHistoricalSync();
  });
    // console.log('[HistoricalSync] Cron job scheduled - Runs at 2:00 AM and 2:00 PM daily');
    console.log('[HistoricalSync] Cron job scheduled - Runs every 6 hours (0:00, 6:00, 12:00, 18:00)');

    // Optional: Run immediately on startup (for testing)
    // Uncomment below to test immediately
    // console.log('[HistoricalSync] Running initial sync on startup...');
    // runHistoricalSync();
  };

  // For manual testing
  export const runHistoricalSyncManual = runHistoricalSync;

// Export for manual sync
export const syncSinglePatient = async (patientId) => {
  try {
    console.log(`[HistoricalSync] Manual sync for patient ${patientId}`);
    
    const patient = await User.findByPk(patientId, {
      include: [GoogleToken]
    });
    
    if (!patient || !patient.GoogleToken) {
      console.error(`[HistoricalSync] Patient ${patientId} not found or no token`);
      return { success: false, reason: 'no_token' };
    }
    
    const result = await syncPatientData(patient);
    return result;
    
  } catch (error) {
    console.error(`[HistoricalSync] Error in manual sync for ${patientId}:`, error);
    return { success: false, reason: error.message };
  }
};