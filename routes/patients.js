import express from 'express';
import { registerGoogleAccount, registerPatientData } from '../controllers/patientController.js';

const router = express.Router();

// POST /registerGoogleAccount
router.post('/registerGoogleAccount', registerGoogleAccount);

// POST /patientClinicalData  
router.post('/patientClinicalData', registerPatientData);

export default router;