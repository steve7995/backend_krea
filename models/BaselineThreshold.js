import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const BaselineThreshold = sequelize.define('BaselineThreshold', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  patientId: {
    type: DataTypes.STRING(50),
    field: 'patient_id',
    allowNull: false
  },
  calculatedAtSession: {
    type: DataTypes.INTEGER,
    field: 'calculated_at_session',
    allowNull: false,
    comment: 'Session number when baseline was calculated (3, 7, or 14)'
  },
  baselineScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'baseline_score',
    allowNull: false
  },
  standardDeviation: {
    type: DataTypes.DECIMAL(5,2),
    field: 'standard_deviation',
    allowNull: false
  },
  thresholdMinus2SD: {
    type: DataTypes.DECIMAL(5,2),
    field: 'threshold_minus_2sd',
    allowNull: false
  },
  thresholdMinus1SD: {
    type: DataTypes.DECIMAL(5,2),
    field: 'threshold_minus_1sd',
    allowNull: false
  },
  thresholdPlus1SD: {
    type: DataTypes.DECIMAL(5,2),
    field: 'threshold_plus_1sd',
    allowNull: false
  },
  thresholdPlus2SD: {
    type: DataTypes.DECIMAL(5,2),
    field: 'threshold_plus_2sd',
    allowNull: false
  }
  ,
  restingHeartRate: {
  type: DataTypes.DECIMAL(5,2),
  field: 'resting_heart_rate',
  allowNull: true
}
}, {
  tableName: 'baseline_thresholds',
  underscored: true,
  indexes: [
    {
      fields: ['patient_id', 'calculated_at_session']
    }
  ]
});

export default BaselineThreshold;