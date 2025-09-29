import { GoogleToken } from '../models/index.js';
import axios from 'axios';

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

// Get valid token (refresh if needed)
export const getValidToken = async (patientId) => {
  try {
    const token = await GoogleToken.findByPk(patientId);
    
    if (!token) {
      throw new Error('Google token not found');
    }
    
    const now = Date.now();
    const bufferTime = 5 * 60 * 1000; // 5 minutes buffer
    
    // Check if token needs refresh
    if (now >= token.expiresAt - bufferTime) {
      console.log(`[TokenManager] Token expired for ${patientId}, refreshing...`);
      
      // Refresh token
      const newTokens = await refreshAccessToken(token.refreshToken);
      
      // Update in database
      await token.update({
        accessToken: newTokens.access_token,
        expiresAt: newTokens.expires_at
      });
      
      console.log(`[TokenManager] Token refreshed for ${patientId}`);
      return newTokens.access_token;
    }
    
    // Token is still valid
    return token.accessToken;
    
  } catch (error) {
    console.error(`[TokenManager] Error getting valid token for ${patientId}:`, error);
    throw error;
  }
};

// Refresh access token using refresh token
const refreshAccessToken = async (refreshToken) => {
  try {
    const response = await axios.post('https://oauth2.googleapis.com/token', {
      client_id: process.env.GOOGLE_CLIENT_ID,
      client_secret: process.env.GOOGLE_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token'
    });
    
    return {
      access_token: response.data.access_token,
      expires_at: Date.now() + (response.data.expires_in * 1000)
    };
    
  } catch (error) {
    console.error('[TokenManager] Error refreshing token:', error.response?.data || error.message);
    throw new Error('Failed to refresh access token');
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

