import 'dotenv/config'

// Debug to verify
console.log('Environment loaded:');
console.log('DB_NAME:', process.env.DB_NAME);
console.log('DB_USER:', process.env.DB_USER);
import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
  'rehab',
  'root', 
  '7995',
  {
    host: 'localhost',
    port: 3306,
    dialect: 'mysql',
    logging: false // set to console.log to see SQL queries
  }
);

// Test connection
try {
  await sequelize.authenticate();
  console.log('Database connected successfully!');
} catch (error) {
  console.error('Unable to connect to database:', error);
}

export default sequelize;