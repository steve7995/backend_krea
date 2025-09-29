import express from 'express';
import { startSession, endSession, getSessionStatus } from '../controllers/sessionController.js';

const router = express.Router();

// POST /api/startSession - Start a new workout session
router.post('/startSession', startSession);

// POST /api/endSession - End session and start background processing
router.post('/endSession', endSession);

// GET /api/getSessionStatus/:sessionId - Check session processing status
router.get('/getSessionStatus/:sessionId', getSessionStatus);

export default router;