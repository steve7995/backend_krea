import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const Session = sequelize.define('Session', {
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
    allowNull: false,
    validate: {
      min: 1,
      max: 12
    }
  },
  sessionAttemptNumber: {
    type: DataTypes.INTEGER,
    field: 'session_attempt_number',
    allowNull: false,
    validate: {
      min: 1
    }
  },
  sessionDate: {
    type: DataTypes.DATEONLY,
    field: 'session_date'
  },
  sessionStartTime: {
    type: DataTypes.TIME,
    field: 'session_start_time'
  },
  sessionDuration: {
    type: DataTypes.STRING(20),
    field: 'session_duration'
  },
  sessionRiskScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'session_risk_score'
  },
  baselineScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'baseline_score'
  },
  riskLevel: {
    type: DataTypes.ENUM('High', 'Moderate', 'Low'),
    field: 'risk_level'
  },
  maxHR: {
    type: DataTypes.INTEGER,
    field: 'max_hr'
  },
  minHR: {
    type: DataTypes.INTEGER,
    field: 'min_hr'
  },
  avgHR: {
    type: DataTypes.INTEGER,
    field: 'avg_hr'
  },
  isCountedInWeekly: {
    type: DataTypes.BOOLEAN,
    field: 'is_counted_in_weekly',
    defaultValue: false
  },
  summary: {
    type: DataTypes.TEXT
  },
  status: {
    type: DataTypes.ENUM('completed', 'missed', 'in_progress', 'processing', 'failed', 'data_unavailable'),
    field: 'status',
    defaultValue: 'in_progress'
  },
  // NEW FIELDS BELOW
  attemptCount: {
    type: DataTypes.INTEGER,
    field: 'attempt_count',
    defaultValue: 0,
    validate: {
      min: 0,
      max: 6
    }
  },
  nextAttemptAt: {
    type: DataTypes.DATE,
    field: 'next_attempt_at',
    allowNull: true
  },
  lastAttemptAt: {
    type: DataTypes.DATE,
    field: 'last_attempt_at',
    allowNull: true
  },
  retrySchedule: {
    type: DataTypes.JSON,
    field: 'retry_schedule',
    allowNull: true,
    defaultValue: null
  },
  failureReason: {
    type: DataTypes.TEXT,
    field: 'failure_reason',
    allowNull: true
  }
}, {
  tableName: 'sessions',
  underscored: true,
  indexes: [
    {
      fields: ['patient_id', 'week_number']
    },
    {
      fields: ['patient_id', 'week_number', 'session_attempt_number']
    },
    {
      fields: ['status', 'next_attempt_at']  // NEW INDEX for retry worker efficiency
    }
  ]
});

export default Session;