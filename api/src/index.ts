import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import pg from 'pg';
import swaggerUi from 'swagger-ui-express';
import { swaggerSpec } from './swagger.js';
import searchRouter from './routes/search.js';
import listingsSearchRouter from './routes/listings-search.js';
import detailRouter from './routes/detail.js';
import suggestRouter from './routes/suggest.js';
import statusRouter from './routes/status.js';

dotenv.config();

const app = express();

// Initialize database pool
const pool = new pg.Pool({
    connectionString: process.env.PG_URL,
    max: 10,
});

// Make pool available to routes
app.locals.db = pool;
const PORT = process.env.API_PORT || 3000;
const HOST = process.env.API_HOST || '0.0.0.0';

// Middleware
app.use(helmet({
    contentSecurityPolicy: false, // Disable CSP for Swagger UI
}));
app.use(cors());
app.use(express.json());

// Swagger UI
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec, {
    customCss: '.swagger-ui .topbar { display: none }',
    customSiteTitle: 'MLS Grid API Documentation',
}));

// Swagger JSON endpoint
app.get('/api-docs.json', (_req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.send(swaggerSpec);
});

// Health check
app.get('/health', (_req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Routes
app.use('/api/listings/search', listingsSearchRouter); // New comprehensive search endpoint
app.use('/listings/search', searchRouter); // Legacy search endpoint (keep for backward compatibility)
app.use('/listings', detailRouter);
app.use('/suggest', suggestRouter);
app.use('/status', statusRouter);

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error('Unhandled error:', err);
    res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(Number(PORT), HOST, () => {
    console.log(`API server running on http://${HOST}:${PORT}`);
});