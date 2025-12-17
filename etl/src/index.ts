/**
 * MLS Grid ETL Worker - Main Entry Point
 * 
 * This ETL worker syncs data from MLS Grid to a local PostgreSQL database
 * and Meilisearch index. It follows MLS Grid best practices:
 * 
 * - Uses ModificationTimestamp > [high-water-mark] for incremental sync
 * - Includes MlgCanView=true filter for active properties
 * - Uses $expand for Media, Rooms, UnitTypes
 * - Follows @odata.nextLink for pagination
 * - Respects rate limits (2 RPS max)
 */
import dotenv from 'dotenv';
dotenv.config();

// Import modules
import { configureMeilisearchIndex, searchClient, INDEX_NAME } from './search.js';
import { syncProperties, syncDeletions } from './sync/properties.js';
import { syncMembers } from './sync/members.js';
import { syncOffices } from './sync/offices.js';
import { syncOpenHouses } from './sync/open-houses.js';
import { retryFailedMediaDownloads, runMediaDownloadWorker } from './media-worker.js';
import { recordProgressHistory } from './progress.js';
import { performReset } from './reset.js';
import { mediaQueue, isRateLimited, rateLimitResetTime } from './media-queue.js';
import pool from './db.js';

// Configuration
const INTERVAL_MINUTES = parseInt(process.env.ETL_INTERVAL_MINUTES || '5', 10);

/**
 * Run a complete ETL sync cycle
 */
async function runETL(): Promise<void> {
    const startTime = Date.now();
    
    try {
        // Log sync start with queue status
        const pendingMedia = mediaQueue.size + mediaQueue.pending;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${new Date().toISOString()}] Starting ETL sync cycle`);
        if (pendingMedia > 0) {
            console.log(`📸 ${pendingMedia} media downloads still in queue from previous cycle`);
        }
        if (isRateLimited && rateLimitResetTime) {
            const minutesLeft = Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 60000);
            if (minutesLeft > 0) {
                console.log(`⚠️  Rate limited - media downloads paused for ${minutesLeft} more minutes`);
            }
        }
        console.log(`${'='.repeat(60)}\n`);
        
        // Sync active properties first (critical path)
        await syncProperties();

        // Check for deletions (MlgCanView=false)
        await syncDeletions();

        // Sync supporting resources
        await syncMembers();
        await syncOffices();
        await syncOpenHouses();

        // Retry failed media downloads
        await retryFailedMediaDownloads();
        
        // Record progress history
        await recordProgressHistory();
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${new Date().toISOString()}] ETL sync cycle complete (${duration}s)`);
        console.log(`📸 Media queue: ${mediaQueue.size + mediaQueue.pending} pending downloads`);
        console.log(`${'='.repeat(60)}\n`);
        
    } catch (error) {
        console.error('ETL error:', error);
    }
}

/**
 * Initialize the ETL worker
 */
async function initialize(): Promise<void> {
    console.log(`Starting ETL worker (interval: ${INTERVAL_MINUTES} minutes)`);

    try {
        // Check if reset is requested
        if (process.env.ETL_RESET_ON_START === 'true') {
            console.log(`\n⚠️  ETL_RESET_ON_START=true detected`);
            await performReset(pool, searchClient, INDEX_NAME);
        }

        // Configure Meilisearch index on startup
        await configureMeilisearchIndex();

        // Start the continuous media download worker in the background
        runMediaDownloadWorker().catch(err => {
            console.error('Media download worker crashed:', err);
        });

        // Run first sync
        await runETL();

        // Schedule recurring syncs
        setInterval(runETL, INTERVAL_MINUTES * 60 * 1000);
    } catch (error) {
        console.error('Failed to initialize ETL:', error);
        process.exit(1);
    }
}

// Start the ETL worker
initialize();
