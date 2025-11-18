import express from 'express';
import { GoogleToken } from '../models/index.js';

const router = express.Router();

// Check token status
router.get('/token-status/:patientId', async (req, res) => {
  try {
    const { patientId } = req.params;
    
    const token = await GoogleToken.findOne({ where: { patientId } });
    
    if (!token) {
      return res.json({
        connected: false,
        message: 'Google Fit not connected'
      });
    }
    
    if (token.tokenStatus === 'invalid') {
      return res.json({
        connected: false,
        message: 'Google Fit access expired. Please reconnect.',
        invalidatedAt: token.invalidatedAt,
        reason: token.invalidationReason
      });
    }
    
    return res.json({
      connected: true,
      message: 'Google Fit connected'
    });
    
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

export default router;