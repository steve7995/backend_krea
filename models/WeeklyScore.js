import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const WeeklyScore = sequelize.define('WeeklyScore', {
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
  weekNumber: {
    type: DataTypes.INTEGER,
    field: 'week_number',
    allowNull: false
  },
  weeklyScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'weekly_score'
  },
  cumulativeScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'cumulative_score'
  }
}, {
  tableName: 'weekly_scores',
  underscored: true,
  indexes: [
    {
      unique: true,
      fields: ['patient_id', 'week_number']
    }
  ]
});

export default WeeklyScore;
