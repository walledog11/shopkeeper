import express from 'express';
import dotenv from 'dotenv';
import { db } from '@clerk/db'; // Your freshly generated Prisma client!
import webhookRoutes from './routes/webhooks.js'

// Load environment variables from your apps/gateway/.env file
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8080;

// Middleware to parse incoming JSON payloads and capture raw body for signature verification
app.use(express.json({
  verify: (req, _res, buf) => {
    req.rawBody = buf;
  }
}));

// Twilio sends webhooks as application/x-www-form-urlencoded
app.use(express.urlencoded({ extended: false }));

// A simple health-check route to prove the server is alive
app.get('/', async (req, res) => {
  try {
    // A quick query to test the database connection
    const customerCount = await db.customer.count();
    res.status(200).json({ 
      status: 'Clerk Gateway is running 🟢', 
      customersInDatabase: customerCount 
    });
  } catch (error) {
    console.error('Database connection failed:', error);
    res.status(500).json({ status: 'Database connection failed 🔴' });
  }
});

// We will import and mount your webhook routes here in the next step
// app.use('/webhooks', webhookRoutes);
app.use('/webhooks', webhookRoutes);

app.listen(PORT, () => {
  console.log(`[Clerk Gateway] Server listening on port ${PORT}`);
});