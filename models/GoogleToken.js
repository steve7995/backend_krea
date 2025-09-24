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
  }
}, {
  tableName: 'google_tokens',
  underscored: true
});

export default GoogleToken;
