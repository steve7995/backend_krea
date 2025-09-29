import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const GoogleToken = sequelize.define('GoogleToken', {
  patientId: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    field: 'patient_id',
    references: {
      model: 'users',
      key: 'patient_id'
    }
  },
  accessToken: {
    type: DataTypes.TEXT,
    field: 'access_token'
  },
  refreshToken: {
    type: DataTypes.TEXT,
    field: 'refresh_token'
  },
  expiresAt: {
    type: DataTypes.BIGINT,
    field: 'expires_at'
  },
  tokenType: {
    type: DataTypes.STRING,
    field: 'token_type'
  },
  scope: {
    type: DataTypes.JSON
  },
  // NEW FIELDS BELOW
  tokenInUse: {
    type: DataTypes.BOOLEAN,
    field: 'token_in_use',
    defaultValue: false
  },
  tokenLockedBy: {
    type: DataTypes.STRING(100),
    field: 'token_locked_by',
    allowNull: true
  },
  tokenLockedAt: {
    type: DataTypes.DATE,
    field: 'token_locked_at',
    allowNull: true
  },
  lastUsedAt: {
    type: DataTypes.DATE,
    field: 'last_used_at',
    allowNull: true
  }
}, {
  tableName: 'google_tokens',
  underscored: true,
  indexes: [
    {
      fields: ['token_in_use', 'token_locked_at']  // NEW INDEX for checking locks
    }
  ]
});

export default GoogleToken;