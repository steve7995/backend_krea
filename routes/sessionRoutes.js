import express from 'express';
import { submitRiskAnalysis, capturePatientSessionTime, scoreIndependentExercise, getIndependentExerciseResult } from '../controllers/sessionController.js';

const router = express.Router();

// Capture session start time and create session record
router.post('/capturePatientSessionTime', capturePatientSessionTime);

// Get session stop time endpoint - REMOVED (functionality integrated into capturePatientSessionTime)
// router.post('/getSessionStopTime', getSessionStopTime);

// Submit and retrieve risk analysis for a completed session
router.post('/submitRiskAnalysis', submitRiskAnalysis);
router.get('/submitRiskAnalysis/:patientId', submitRiskAnalysis); // Optional: GET version

// Score independent exercise session (for Spectrum ad-hoc sessions)
router.post('/scoreIndependentExercise', scoreIndependentExercise);

// Get independent exercise result (polling endpoint)
router.get('/getIndependentExerciseResult/:sessionId', getIndependentExerciseResult);

export default router;