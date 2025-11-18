import 'dotenv/config';
import { GoogleToken } from '../models/index.js';
import axios from 'axios';
import { Op } from 'sequelize';
// Acquire token lock
export const acquireTokenLock = async (patientId, lockedBy) => {
  try {
    const token = await GoogleToken.findByPk(patientId);

    if (!token) {
      throw new Error('Google token not found for patient');
    }

    // Check if token is already in use
    if (token.tokenInUse) {
      const lockedDuration = Date.now() - new Date(token.tokenLockedAt).getTime();
      const fiveMinutes = 5 * 60 * 1000;

      // If locked for more than 5 minutes, assume crashed process - force take over
      if (lockedDuration > fiveMinutes) {
        console.log(`[TokenManager] Stale lock detected for ${patientId}, forcing takeover`);
        await token.update({
          tokenInUse: true,
          tokenLockedBy: lockedBy,
          tokenLockedAt: new Date()
        });
        return true;
      }

      // Lock is fresh, can't acquire
      console.log(`[TokenManager] Token for ${patientId} is in use by ${token.tokenLockedBy}`);
      return false;
    }

    // Token is free, acquire it
    await token.update({
      tokenInUse: true,
      tokenLockedBy: lockedBy,
      tokenLockedAt: new Date()
    });

    console.log(`[TokenManager] Lock acquired for ${patientId} by ${lockedBy}`);
    return true;

  } catch (error) {
    console.error(`[TokenManager] Error acquiring lock for ${patientId}:`, error);
    return false;
  }
};

// Release token lock
export const releaseTokenLock = async (patientId) => {
  try {
    const token = await GoogleToken.findByPk(patientId);

    if (!token) {
      console.log(`[TokenManager] Token not found for ${patientId}`);
      return;
    }

    await token.update({
      tokenInUse: false,
      tokenLockedBy: null,
      tokenLockedAt: null,
      lastUsedAt: new Date()
    });

    console.log(`[TokenManager] Lock released for ${patientId}`);

  } catch (error) {
    console.error(`[TokenManager] Error releasing lock for ${patientId}:`, error);
  }
};

// Check if token is available
export const isTokenAvailable = async (patientId) => {
  try {
    const token = await GoogleToken.findByPk(patientId);

    if (!token) {
      return false;
    }

    // If not in use, it's available
    if (!token.tokenInUse) {
      return true;
    }

    // If locked for more than 5 minutes, consider it available (stale lock)
    const lockedDuration = Date.now() - new Date(token.tokenLockedAt).getTime();
    const fiveMinutes = 5 * 60 * 1000;

    return lockedDuration > fiveMinutes;

  } catch (error) {
    console.error(`[TokenManager] Error checking availability for ${patientId}:`, error);
    return false;
  }
};


// Force release all stale locks (for cleanup job)
export const releaseAllStaleLocks = async () => {
  try {
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = await GoogleToken.update(
      {
        tokenInUse: false,
        tokenLockedBy: null,
        tokenLockedAt: null
      },
      {
        where: {
          tokenInUse: true,
          tokenLockedAt: {
            [Op.lt]: fiveMinutesAgo
          }
        }
      }
    );

    console.log(`[TokenManager] Released ${result[0]} stale locks`);
    return result[0];

  } catch (error) {
    console.error('[TokenManager] Error releasing stale locks:', error);
    return 0;
  }
};

// Get valid access token
export const getValidToken = async (patientId) => {
  const tokenRecord = await GoogleToken.findOne({ where: { patientId } });
  
  if (!tokenRecord) {
    throw new Error('TOKEN_NOT_FOUND');
  }
  
  // Check if already marked invalid
  if (tokenRecord.tokenStatus === 'invalid') {
    throw new Error('TOKEN_INVALID');
  }
  
  const now = Date.now();
  const expiresAt = new Date(tokenRecord.expiresAt).getTime();
  
  // Token still valid (5 min buffer)
  if (now < expiresAt - (5 * 60 * 1000)) {
    return tokenRecord.accessToken;
  }
  
  // Token expired, refresh it
  return await refreshAccessToken(patientId);
};

// Refresh access token
export const refreshAccessToken = async (patientId) => {
  const tokenRecord = await GoogleToken.findOne({ where: { patientId } });
  
  if (!tokenRecord) {
    throw new Error('TOKEN_NOT_FOUND');
  }
  
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: tokenRecord.refreshToken,
      grant_type: 'refresh_token'
    }, {
      timeout: 10000
    });
    
    // Success - update token
    await tokenRecord.update({
      accessToken: response.data.access_token,
      expiresAt: Date.now() + (response.data.expires_in * 1000),
      tokenStatus: 'valid'
    });
    
    console.log(`[TokenManager] ✓ Refreshed token for patient ${patientId}`);
    return response.data.access_token;
    
  } catch (error) {
    // Check if refresh token is expired/invalid
    if (error.response?.status === 400 || error.response?.status === 401) {
      const errorData = error.response?.data;
      
      if (errorData?.error === 'invalid_grant' || errorData?.error === 'invalid_token') {
        console.error(`[TokenManager] ✗ Refresh token expired for patient ${patientId}`);
        
        // Mark as invalid
        await tokenRecord.update({
          tokenStatus: 'invalid',
          invalidatedAt: new Date(),
          invalidationReason: errorData?.error_description || 'Refresh token expired'
        });
        
        throw new Error('REFRESH_TOKEN_EXPIRED');
      }
    }
    
    throw error;
  }
};
