import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import sequelize from './database/db.js';
import patientRoutes from './routes/patients.js';


const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', patientRoutes);

// Basic test route
app.get('/', (req, res) => {
  res.json({ message: 'KREA Rehab API is running!' });
});

// Start server and sync database
const startServer = async () => {
  try {
    // Import models to ensure associations are loaded
    const { User, PatientVital, RehabPlan, GoogleToken } = await import('./models/index.js');
    
    // Sync models in order (parent tables first)
    await User.sync({ force: false });
    await PatientVital.sync({ force: false });
    await RehabPlan.sync({ force: false });
    await GoogleToken.sync({ force: false });
    
    console.log('Database synced successfully');
        
    app.listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
  }
};
startServer();