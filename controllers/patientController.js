import { User, PatientVital, RehabPlan, GoogleToken } from '../models/index.js';
import { calculateHeartRateZones } from '../utils/calculations.js';
import { syncSinglePatient } from '../jobs/historicalSync.js';
import { getProcessedHistoricalHR } from '../utils/historicalHRProcessor.js';
import { pushHistoricalHRToSpectrum } from '../utils/spectrumFormatter.js';


export const registerGoogleAccount = async (req, res) => {
  try {
    const { patientId, tokens } = req.body;
    
    if (!tokens || !tokens.access_token || !tokens.refresh_token) {
      return res.status(400).json({
        status: 'failure',
        message: 'Valid tokens required'
      });
    }
    
    // Create user if doesn't exist
    await User.findOrCreate({
      where: { patientId },
      defaults: {
        patientId,
        age: 0,
        betaBlockers: false,
        lowEF: false,
        regime: 6
      }
    });
    
    // Store tokens and reset status flags
    await GoogleToken.upsert({
      patientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at || tokens.expiry_date || (Date.now() + 3600 * 1000),
      tokenType: tokens.token_type || 'Bearer',
      scope: tokens.scope,
      // Reset status fields when new tokens are saved
      tokenStatus: 'valid',
      invalidatedAt: null,
      invalidationReason: null,
      reconnectNotifiedAt: null
    });
    
    // NEW: Trigger initial sync and push (async - don't wait)
    console.log(`[OAuth] Triggering initial sync and push for patient ${patientId}`);
    
    syncSinglePatient(patientId)
      .then(async () => {
        console.log(`[OAuth] Sync complete, pushing to Spectrum for patient ${patientId}`);
        const processedResult = await getProcessedHistoricalHR(patientId);
        if (processedResult.data && processedResult.data.length > 0) {
          await pushHistoricalHRToSpectrum(patientId, processedResult.data);
        }
      })
      .catch(error => {
        console.error(`[OAuth] Error in sync/push for patient ${patientId}:`, error);
      });
    
    res.json({
      status: 'success',
      message: 'Google account registered successfully'
    });
    
  } catch (error) {
    console.error('Error registering Google account:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};
export const registerPatientData = async (req, res) => {
  try {
    const {
      patientId, systolic, diastolic, bloodGlucose, spo2,
      temperature, height, weight, age, cardiacCondition,
      BB, LowEF, Regime
    } = req.body;
    
    // Validate required fields
    if (!patientId || !age || Regime === undefined) {
      return res.status(400).json({
        status: 'failure',
        message: 'patientId, age, and Regime are required'
      });
    }
    
    // Create or update user
    await User.upsert({
      patientId,
      age,
      betaBlockers: BB !== undefined ? BB : false,
      lowEF: LowEF !== undefined ? LowEF : false,
      regime: Regime
    });
    
    // Create or update patient vitals (if vitals data provided)
    if (systolic || diastolic || bloodGlucose || spo2 || temperature || height || weight || cardiacCondition) {
      await PatientVital.upsert({
        patientId,
        systolic,
        diastolic,
        bloodGlucose,
        spo2,
        temperature,
        height,
        weight,
        cardiacCondition
      });
    }
    
    // Generate rehab plan for all weeks
    const rehabPlanData = [];
    for (let week = 1; week <= Regime; week++) {
      const zones = calculateHeartRateZones(age, BB, LowEF, week);
      rehabPlanData.push({
        patientId,
        weekNumber: week,
        ...zones
      });
    }
    
    // Delete existing plan and create new one
    await RehabPlan.destroy({ where: { patientId } });
    await RehabPlan.bulkCreate(rehabPlanData);
    
    res.json({
      status: 'success',
      message: 'Patient data registered/updated successfully',
      rehabPlan: rehabPlanData
    });
    
  } catch (error) {
    console.error('Error registering patient data:', error);
    res.status(500).json({
      status: 'failure',
      message: 'Internal server error'
    });
  }
};