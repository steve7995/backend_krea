import User from './User.js';
import PatientVital from './PatientVital.js';
import RehabPlan from './RehabPlan.js';
import GoogleToken from './GoogleToken.js';
import Session from './Session.js';
import WeeklyScore from './WeeklyScore.js';
import HistoricalHRData from './HistoricalHRData.js';

// Define relationships
User.hasOne(PatientVital, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});
User.hasMany(RehabPlan, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});
User.hasOne(GoogleToken, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});
User.hasMany(Session, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});
User.hasMany(WeeklyScore, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});
User.hasMany(HistoricalHRData, { 
  foreignKey: 'patientId',
  sourceKey: 'patientId'
});

PatientVital.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});
RehabPlan.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});
GoogleToken.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});
Session.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});
WeeklyScore.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});
HistoricalHRData.belongsTo(User, { 
  foreignKey: 'patientId',
  targetKey: 'patientId'
});

export { User, PatientVital, RehabPlan, GoogleToken, Session, WeeklyScore, HistoricalHRData };