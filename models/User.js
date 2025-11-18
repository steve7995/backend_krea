// import { DataTypes } from 'sequelize';
// import sequelize from '../database/db.js';

// const User = sequelize.define('User', {
//   patientId: {
//     type: DataTypes.STRING(50),
//     primaryKey: true,
//     field: 'patient_id'
//   },
//   age: {
//     type: DataTypes.INTEGER,
//     allowNull: true
//   },
//   betaBlockers: {
//     type: DataTypes.BOOLEAN,
//     field: 'beta_blockers',
//      allowNull: true,
//     defaultValue: false
//   },
//   lowEF: {
//     type: DataTypes.BOOLEAN,
//     field: 'low_ef',
//      allowNull: true,
//     defaultValue: false
//   },
//   regime: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//    isIn: {
//         args: [[6, 12]],  // ← Fixed: wrap in args
//         msg: 'Regime must be either 6 or 12'
//       }
//   }
// }, {
//   tableName: 'users',
//   underscored: true
// });

// export default User;

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
    allowNull: true
  },
  betaBlockers: {
    type: DataTypes.BOOLEAN,
    field: 'beta_blockers',
    allowNull: true,
    defaultValue: false
  },
  lowEF: {
    type: DataTypes.BOOLEAN,
    field: 'low_ef',
    allowNull: true,
    defaultValue: false
  },
  regime: {
    type: DataTypes.INTEGER,
    allowNull: true,
    validate: {
      isIn: {
        args: [[6, 12]],  // ← Fixed: wrap in args
        msg: 'Regime must be either 6 or 12'
      }
    }
  }
}, {
  tableName: 'users',
  underscored: true
});

export default User;