import { DataTypes } from 'sequelize';
import sequelize from '../database/db.js';

const PatientVital = sequelize.define('PatientVital', {
patientId: {
  type: DataTypes.STRING(50),
  primaryKey: true,
  field: 'patient_id',
  references: {
    model: 'users',
    key: 'patient_id'
  }
},
  systolic: DataTypes.INTEGER,
  diastolic: DataTypes.INTEGER,
  bloodGlucose: {
    type: DataTypes.STRING(20),
    field: 'blood_glucose'
  },
  spo2: DataTypes.INTEGER,
  temperature: DataTypes.DECIMAL(4,1),
  height: DataTypes.DECIMAL(5,1),
  weight: DataTypes.DECIMAL(5,1),
  cardiacCondition: {
    type: DataTypes.ENUM('ACS', 'CSA', 'Valvular disorder', 'Others'),
    field: 'cardiac_condition'
  }
}, {
  tableName: 'patient_vitals',
  underscored: true
});

export default PatientVital;