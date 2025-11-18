import express from 'express';
import { getValidToken } from '../utils/tokenManager.js';
import { fetchGoogleFitData } from '../utils/googleFit.js';

const router = express.Router();

router.get('/test-heart-rate/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    console.log(`[TestAPI] Fetching 24h heart rate data for patient ${patientId}`);
    
    // Get valid token
    const accessToken = await getValidToken(patientId);
    
    // Calculate 24 hours ago to now
    const endTime = new Date();
    const startTime = new Date(endTime.getTime() - (24 * 60 * 60 * 1000));
    
    console.log(`[TestAPI] Time range: ${startTime.toISOString()} to ${endTime.toISOString()}`);
    
    // Fetch data
    const hrData = await fetchGoogleFitData(accessToken, startTime, endTime);
    console.log('hrData',hrData)
    console.log(`[TestAPI] Fetched ${hrData.length} data points`);
    
    // Format response with readable timestamps
    const formattedData = hrData.map(point => ({
      timestamp: new Date(point.timestamp).toISOString(),
      timestampIST: new Date(point.timestamp + (5.5 * 60 * 60 * 1000)).toISOString(), // IST
      heartRate: point.value,
      unixMs: point.timestamp
    }));
    
    res.json({
      status: 'success',
      patientId,
      timeRange: {
        start: startTime.toISOString(),
        end: endTime.toISOString()
      },
      totalPoints: hrData.length,
      data: formattedData
    });
    
  } catch (error) {
    console.error('[TestAPI] Error:', error);
    res.status(500).json({
      status: 'failure',
      message: error.message
    });
  }
});

export default router;