import axios from 'axios';
import { Session } from '../models/index.js';  





export const sendToSpectrum = async (sessionId, spectrumData) => {
  try {
    const SPECTRUM_URL = `https://sandbox.spectrum-api.healthkon.com/api/patients/cardiac-rehab-session/${spectrumData.patient_id}`;
    
    console.log(`[Spectrum] Sending session ${sessionId} for patient ${spectrumData.patient_id}`);
    
    const response = await axios.post(SPECTRUM_URL, spectrumData, {
      headers: {
        'Content-Type': 'application/json'
      },
      timeout: 10000
    });
    
    console.log(`[Spectrum] ✓ Success for session ${sessionId}`);
    return { success: true, response: response.data };
    
  } catch (error) {
    console.error(`[Spectrum] ✗ Error for session ${sessionId}:`, error.response?.data || error.message);
    
    // Log missing fields details
    if (error.response?.data?.detail) {
      console.error('[Spectrum] Validation errors:');
      error.response.data.detail.forEach((err, idx) => {
        console.error(`  ${idx + 1}. ${err.loc?.join('.')}: ${err.msg}`);
      });
    }
    
    return { success: false, error: error.message };
  }
};



export const formatForSpectrum = (session, hrData, scores, zones) => {
  return {
    // Top level: snake_case
    patient_id: session.patientId,
    session_number: session.sessionAttemptNumber,
    week_number: session.weekNumber,
    session_risk_score: scores.sessionRiskScore || 0,
    cumulative_risk_score: scores.cumulativeRiskScore || 0,
    risk_level: scores.riskLevel || 'Low',
    baseline_score: scores.baselineScore || 0,
    summary: scores.summary || 'Session completed',

    // Nested objects: camelCase
    session_data: {
      sessionDate: session.sessionDate,
      sessionStartTime: session.sessionStartTime,
      sessionDuration: session.sessionDuration || 20, // Integer (minutes)
      MaxHR: hrData.maxHR || 0,
      MinHR: hrData.minHR || 0,
      AvgHR: hrData.avgHR || 0,
      sessionRiskLevel: scores.sessionRiskLevel || 'Low',
      dataCompleteness: session.dataCompleteness || null // Decimal 0-1 (e.g., 0.5 for 50%)
    },
    session_zones: {
      targetHR: zones?.targetHR || session.targetHR,
      maxPermissibleHR: zones?.maxPermissibleHR || session.maxPermissibleHR,
      warmupZoneMin: zones?.warmupZoneMin || session.warmupZoneMin,
      warmupZoneMax: zones?.warmupZoneMax || session.warmupZoneMax,
      exerciseZoneMin: zones?.exerciseZoneMin || session.exerciseZoneMin,
      exerciseZoneMax: zones?.exerciseZoneMax || session.exerciseZoneMax,
      cooldownZoneMin: zones?.cooldownZoneMin || session.cooldownZoneMin,
      cooldownZoneMax: zones?.cooldownZoneMax || session.cooldownZoneMax,
      sessionDuration: session.sessionDuration || zones?.sessionDuration || 20 // Integer (minutes)
    }
  };
};


// Notify Spectrum that patient needs to reconnect
export const notifySpectrumTokenExpired = async (patientId, sessionId = null) => {
  try {
    const SPECTRUM_URL = `https://sandbox.spectrum-api.healthkon.com/api/patients/token-expired/${patientId}`;
    
    const payload = {
      patient_id: patientId,
      message: 'Google Fit access expired. Patient needs to reconnect.',
      timestamp: new Date().toISOString(),
      session_id: sessionId,
      action_required: 'reconnect_google_fit'
    };
    
    console.log(`[Spectrum] Notifying token expiry for patient ${patientId}`);
    
    await axios.post(SPECTRUM_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });
    
    console.log(`[Spectrum] ✓ Token expiry notification sent for patient ${patientId}`);
    return { success: true };
    
  } catch (error) {
    console.error(`[Spectrum] ✗ Failed to notify token expiry for patient ${patientId}:`, error.message);
    return { success: false, error: error.message };
  }
};









export const pushHistoricalHRToSpectrum = async (patientId, processedData) => {
  try {
    const SPECTRUM_URL = `https://sandbox.spectrum-api.healthkon.com/api/patients/rehab-historical-hr/${patientId}`;

    const payload = {
      patient_id: parseInt(patientId),
      data: processedData  // Array of {hr, timestamp}
    };
    console.log('processed Data',processedData)
    console.log(`[Spectrum-Push] Sending ${processedData.length} points for patient ${patientId}`);

    const response = await axios.post(SPECTRUM_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 15000
    });

    console.log(`[Spectrum-Push] ✓ Success for patient ${patientId}`);
    return { success: true };

  } catch (error) {
    console.error(`[Spectrum-Push] ✗ Error for patient ${patientId}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};

// Push resting HR to Spectrum
export const pushRestingHRToSpectrum = async (patientId, restingHR) => {
  try {
    const SPECTRUM_URL = `https://sandbox.spectrum-api.healthkon.com/api/patients/rehab-resting-hr/${patientId}`;

    const payload = {
      patient_id: parseInt(patientId),
      hr: Math.round(restingHR) // Round to integer
    };

    console.log(`[Spectrum-RestingHR] Sending resting HR ${restingHR} for patient ${patientId}`);

    const response = await axios.post(SPECTRUM_URL, payload, {
      headers: { 'Content-Type': 'application/json' },
      timeout: 10000
    });

    console.log(`[Spectrum-RestingHR] ✓ Success for patient ${patientId}`);
    return { success: true };

  } catch (error) {
    console.error(`[Spectrum-RestingHR] ✗ Error for patient ${patientId}:`, error.response?.data || error.message);
    return { success: false, error: error.message };
  }
};