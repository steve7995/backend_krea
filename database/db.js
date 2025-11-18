

import { Sequelize } from 'sequelize';

const sequelize = new Sequelize(
  process.env.DB_NAME || 'mydb',
  process.env.DB_USER || 'root', 
  process.env.DB_PASSWORD   || '7995',
  {
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT),
    dialect: 'mysql',
    logging: false
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