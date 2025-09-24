import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const User = sequelize.define('User', {
  patientId: {
    type: DataTypes.STRING(50),
    primaryKey: true,
    field: 'patient_id'
  },
  age: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  betaBlockers: {
    type: DataTypes.BOOLEAN,
    field: 'beta_blockers',
    defaultValue: false
  },
  lowEF: {
    type: DataTypes.BOOLEAN,
    field: 'low_ef',
    defaultValue: false
  },
  regime: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      isIn: [[6, 12]]
    }
  }
}, {
  tableName: 'users',
  underscored: true
});

export default User;