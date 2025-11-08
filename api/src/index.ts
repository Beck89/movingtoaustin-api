import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import searchRouter from './routes/search.js';
import detailRouter from './routes/detail.js';
import suggestRouter from './routes/suggest.js';

dotenv.config();

const app = express();
const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || '0.0.0.0';

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/listings/search', searchRouter);
app.use('/listings', detailRouter);
app.use('/suggest', suggestRouter);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(Number(PORT), HOST, () => {
    console.log(`API server running on http://${HOST}:${PORT}`);
});