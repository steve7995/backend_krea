import User from './User.js';
import PatientVital from './PatientVital.js';
import RehabPlan from './RehabPlan.js';
import GoogleToken from './GoogleToken.js';

// In models/index.js, replace your current associations with:
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
export { User, PatientVital, RehabPlan, GoogleToken };