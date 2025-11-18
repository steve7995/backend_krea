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
  sessionType: {
    type: DataTypes.ENUM('start_stop', 'complete'),
    field: 'session_type',
    allowNull: false,
    defaultValue: 'start_stop',
    comment: 'start_stop: initiated via start/stop actions; complete: created with both start and end times'
  },
  sessionDate: {
    type: DataTypes.DATEONLY,
    field: 'session_date'
  },
  sessionStartTime: {
    type: DataTypes.TIME,
    field: 'session_start_time'
  },
  sessionEndTime: {
    type: DataTypes.TIME,
    field: 'session_end_time',
    allowNull: true,
    comment: 'Actual end time of session (for stop action)'
  },
  sessionDuration: {
    type: DataTypes.INTEGER,
    field: 'session_duration',
    allowNull: true,
    comment: 'Planned session duration in minutes from rehab plan'
  },
  actualDuration: {
    type: DataTypes.DECIMAL(5,2),
    field: 'actual_duration',
    allowNull: true,
    comment: 'Actual session duration in minutes (calculated from start/stop times)'
  },
  sessionRiskScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'session_risk_score'
  },
  warmupScore: {
    type: DataTypes.INTEGER,
    field: 'warmup_score',
    allowNull: true,
    comment: 'Warmup phase score (0-100)'
  },
  exerciseScore: {
    type: DataTypes.INTEGER,
    field: 'exercise_score',
    allowNull: true,
    comment: 'Exercise phase score (0-100)'
  },
  cooldownScore: {
    type: DataTypes.INTEGER,
    field: 'cooldown_score',
    allowNull: true,
    comment: 'Cooldown phase score (0-100)'
  },
  overallScore: {
    type: DataTypes.INTEGER,
    field: 'overall_score',
    allowNull: true,
    comment: 'Overall session score (0-100)'
  },
  baselineScore: {
    type: DataTypes.DECIMAL(5,2),
    field: 'baseline_score'
  },
  healthStatus: {
  type: DataTypes.ENUM('at_risk', 'declining', 'consistent', 'improving', 'strong_improvement'),
  field: 'health_status',
  allowNull: true
},sessionRiskLevel: {
  type: DataTypes.ENUM('High', 'Moderate', 'Low'),
  field: 'session_risk_level',
  allowNull: true
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
  // Heart Rate Zone Fields (from RehabPlan)
  targetHR: {
    type: DataTypes.INTEGER,
    field: 'target_hr',
    allowNull: true
  },
  maxPermissibleHR: {
    type: DataTypes.INTEGER,
    field: 'max_permissible_hr',
    allowNull: true
  },
  warmupZoneMin: {
    type: DataTypes.INTEGER,
    field: 'warmup_zone_min',
    allowNull: true
  },
  warmupZoneMax: {
    type: DataTypes.INTEGER,
    field: 'warmup_zone_max',
    allowNull: true
  },
  exerciseZoneMin: {
    type: DataTypes.INTEGER,
    field: 'exercise_zone_min',
    allowNull: true
  },
  exerciseZoneMax: {
    type: DataTypes.INTEGER,
    field: 'exercise_zone_max',
    allowNull: true
  },
  cooldownZoneMin: {
    type: DataTypes.INTEGER,
    field: 'cooldown_zone_min',
    allowNull: true
  },
  cooldownZoneMax: {
    type: DataTypes.INTEGER,
    field: 'cooldown_zone_max',
    allowNull: true
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
    type: DataTypes.ENUM('active', 'completed', 'missed', 'in_progress', 'processing', 'failed', 'data_unavailable', 'pending_sync', 'abandoned'),
    field: 'status',
    defaultValue: 'in_progress'
  },sentToSpectrum: {
  type: DataTypes.BOOLEAN,
  field: 'sent_to_spectrum',
  defaultValue: false
},
spectrumSentAt: {
  type: DataTypes.DATE,
  field: 'spectrum_sent_at',
  allowNull: true
},
spectrumResponseStatus: {
  type: DataTypes.STRING(20),
  field: 'spectrum_response_status',
  allowNull: true  // 'success' or 'failed'
},
vitalScore: {
  type: DataTypes.DECIMAL(5,2),
  field: 'vital_score',
  allowNull: true
},
vitalRiskLevel: {
  type: DataTypes.ENUM('High', 'Moderate', 'Low'),
  field: 'vital_risk_level',
  allowNull: true
},
dataCompleteness: {
  type: DataTypes.DECIMAL(4,3),
  field: 'data_completeness',
  allowNull: true,
  comment: 'Data completeness as decimal 0-1 (e.g., 0.5 for 50%)'
},
  // NEW FIELDS BELOW
  attemptCount: {
    type: DataTypes.INTEGER,
    field: 'attempt_count',
    defaultValue: 0,
    validate: {
      min: 0,
      max: 12
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
  processingStartsAt: {
  type: DataTypes.DATE,
  field: 'processing_starts_at',
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