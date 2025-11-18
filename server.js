import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import 'dotenv/config';
import sequelize from './database/db.js';
import morgan from 'morgan';  // Add this
import patientRoutes from './routes/patients.js';
import sessionRoutes from './routes/sessionRoutes.js';
import historicalRoutes from './routes/historicalRoutes.js'
import { startRetryWorker } from './workers/retryWorker.js';
import { startHistoricalSync } from './jobs/historicalSync.js'; // ADD THIS LINE
import testRoutes from './routes/test.js';  // Add this import
import authRoutes from './routes/auth.js';  // Add this import
const app = express();
const PORT = process.env.PORT ;
// Request logging - Add this before routes
if (process.env.NODE_ENV === 'production') {
  app.use(morgan('combined')); // Detailed logs for production
} else {
  app.use(morgan('dev')); // Colored, concise logs for development
}

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use('/api/auth', authRoutes); 
// Routes
app.use('/api', patientRoutes);
app.use('/api', sessionRoutes);
app.use('/api/test', testRoutes); 
app.use('/api/patients',historicalRoutes)



// Basic test route
app.get('/', (req, res) => {
  res.json({ 
    message: 'KREA Rehab API is running!',
    version: '1.0.0',
    endpoints: {
      patient: {
        registerClinicalData: 'POST /api/patientClinicalData',
        registerGoogleAccount: 'POST /api/registerGoogleAccount'
      },
      session: {
        startSession: 'POST /api/startSession',
        endSession: 'POST /api/endSession',
        getStatus: 'GET /api/getSessionStatus/:sessionId'
      }
    }
  });
});



// Start server and sync database
const startServer = async () => {
  try {
    // Import models to ensure associations are loaded
    const { User, PatientVital, RehabPlan, GoogleToken, Session, WeeklyScore, HistoricalHRData, BaselineThreshold } = await import('./models/index.js');

    // Sync models in order (parent tables first)
    await User.sync({ alter: true });
    await PatientVital.sync({ alter: true });
    await RehabPlan.sync({ alter: true });
    await GoogleToken.sync({ alter: true });
    await Session.sync({ alter: true });
    await WeeklyScore.sync({ alter: true });
    await HistoricalHRData.sync({ alter: true });
    await BaselineThreshold.sync({ alter: true });

    console.log('✓ Database synced successfully');
    
    // Start retry worker for background session processing
    startRetryWorker();
    console.log('✓ Retry worker started');
    
    // Start historical data sync (runs at 2 AM and 2 PM)
    startHistoricalSync(); // ADD THIS LINE
    console.log('✓ Historical sync scheduled');
        
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`✓ Server running on port ${PORT}`);
      console.log(`✓ Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`✓ API Base URL: http://localhost:${PORT}/api`);
    });
  } catch (error) {
    console.error('✗ Failed to start server:', error);
    process.exit(1);
  }
};

// Handle uncaught errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled Rejection:', error);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received, shutting down gracefully...');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('SIGINT received, shutting down gracefully...');
  process.exit(0);
});

startServer();