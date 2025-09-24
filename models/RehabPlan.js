import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const RehabPlan = sequelize.define('RehabPlan', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
patientId: {
  type: DataTypes.STRING(50),
  field: 'patient_id',
  allowNull: false,
  references: {
    model: 'users',
    key: 'patient_id'
  }
},
  weekNumber: {
    type: DataTypes.INTEGER,
    field: 'week_number',
    allowNull: false
  },
  targetHR: {
    type: DataTypes.INTEGER,
    field: 'target_hr'
  },
  maxPermissibleHR: {
    type: DataTypes.INTEGER,
    field: 'max_permissible_hr'
  },
  warmupZoneMin: {
    type: DataTypes.INTEGER,
    field: 'warmup_zone_min'
  },
  warmupZoneMax: {
    type: DataTypes.INTEGER,
    field: 'warmup_zone_max'
  },
  exerciseZoneMin: {
    type: DataTypes.INTEGER,
    field: 'exercise_zone_min'
  },
  exerciseZoneMax: {
    type: DataTypes.INTEGER,
    field: 'exercise_zone_max'
  },
  cooldownZoneMin: {
    type: DataTypes.INTEGER,
    field: 'cooldown_zone_min'
  },
  cooldownZoneMax: {
    type: DataTypes.INTEGER,
    field: 'cooldown_zone_max'
  },
  sessionDuration: {
    type: DataTypes.INTEGER,
    field: 'session_duration_minutes'
  }
}, {
  tableName: 'rehab_plan',
  underscored: true
});

export default RehabPlan;