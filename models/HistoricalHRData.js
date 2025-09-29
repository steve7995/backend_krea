import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const HistoricalHRData = sequelize.define('HistoricalHRData', {
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
  recordedDate: {
    type: DataTypes.DATEONLY,
    field: 'recorded_date',
    allowNull: false
  },
  recordedTime: {
    type: DataTypes.TIME,
    field: 'recorded_time',
    allowNull: false
  },
  heartRate: {
    type: DataTypes.INTEGER,
    field: 'heart_rate',
    allowNull: false,
    validate: {
      min: 30,
      max: 250
    }
  },
  activityType: {
    type: DataTypes.ENUM('rest', 'exercise', 'sleep', 'unknown'),
    field: 'activity_type',
    defaultValue: 'unknown'
  },
  dataSource: {
    type: DataTypes.STRING(50),
    field: 'data_source',
    defaultValue: 'google_fit'
  }
}, {
  tableName: 'historical_hr_data',
  underscored: true,
  indexes: [
    {
      fields: ['patient_id', 'recorded_date']
    },
    {
      fields: ['patient_id', 'recorded_date', 'recorded_time']
    }
  ]
});

export default HistoricalHRData;