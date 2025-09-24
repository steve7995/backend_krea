import { User, PatientVital, RehabPlan, GoogleToken } from '../models/index.js';
import { calculateHeartRateZones } from '../utils/calculations.js';

// Register Google Account
export const registerGoogleAccount = async (req, res) => {
  try {
    const { patientId, tokens } = req.body;
    
    // Check if user exists
    const user = await User.findByPk(patientId);
    if (!user) {
      return res.status(404).json({
        status: 'failure',
        message: 'Patient not found'
      });
    }
    
    // Store or update Google tokens
    await GoogleToken.upsert({
      patientId,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      expiresAt: tokens.expires_at,
      tokenType: tokens.token_type,
      scope: tokens.scope
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

// Register/Update Patient Clinical Data
export const registerPatientData = async (req, res) => {
  try {
    const {
      patientId, systolic, diastolic, bloodGlucose, spo2,
      temperature, height, weight, age, cardiacCondition,
      BB, LowEF, Regime
    } = req.body;
    
    // Create or update user
    await User.upsert({
      patientId,
      age,
      betaBlockers: BB,
      lowEF: LowEF,
      regime: Regime
    });
    
    // Create or update patient vitals
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