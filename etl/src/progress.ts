/**
 * Progress tracking and history recording for MLS Grid ETL
 */
import pool from './db.js';
import {
    mediaStats,
    isApiRateLimited,
    resetMediaWorkerDownloads,
    isRateLimited,
} from './media-queue.js';

// Progress recording interval (15 minutes)
const PROGRESS_RECORD_INTERVAL_MS = 15 * 60 * 1000;
let lastProgressRecordTime = 0;

/**
 * Record progress history to database
 */
export async function recordProgressHistory(): Promise<void> {
    try {
        const now = Date.now();
        if (now - lastProgressRecordTime < PROGRESS_RECORD_INTERVAL_MS) {
            return;
        }
        lastProgressRecordTime = now;

        // Get current stats
        const dbStats = await pool.query(`
            SELECT
                COUNT(*) as total_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Active') as active_properties
            FROM mls.properties
        `);

        const mediaDbStats = await pool.query(`
            SELECT
                COUNT(*) as total_media,
                COUNT(*) FILTER (WHERE local_url IS NOT NULL) as downloaded_media,
                COUNT(*) FILTER (WHERE local_url IS NULL AND (media_category IS NULL OR media_category != 'Video')) as missing_media
            FROM mls.media
        `);

        const missingMediaProps = await pool.query(`
            SELECT COUNT(DISTINCT p.listing_key) as count
            FROM mls.properties p
            WHERE p.photo_count > 0
              AND EXISTS (
                SELECT 1 FROM mls.media m
                WHERE m.listing_key = p.listing_key
                  AND m.local_url IS NULL
                  AND (m.media_category IS NULL OR m.media_category != 'Video')
              )
        `);

        const totalMedia = parseInt(mediaDbStats.rows[0].total_media);
        const downloadedMedia = parseInt(mediaDbStats.rows[0].downloaded_media);
        const missingMedia = parseInt(mediaDbStats.rows[0].missing_media);
        const downloadPercentage = totalMedia > 0 ? Math.round((downloadedMedia / totalMedia) * 100) : 0;

        // Get and reset download counter
        const downloadsToRecord = resetMediaWorkerDownloads();

        // Insert progress record
        await pool.query(`
            INSERT INTO mls.progress_history (
                total_properties, active_properties, total_media, downloaded_media,
                missing_media, download_percentage, properties_with_missing_media,
                media_worker_downloads, api_rate_limited, media_cdn_rate_limited
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            parseInt(dbStats.rows[0].total_properties),
            parseInt(dbStats.rows[0].active_properties),
            totalMedia,
            downloadedMedia,
            missingMedia,
            downloadPercentage,
            parseInt(missingMediaProps.rows[0].count),
            downloadsToRecord,
            isApiRateLimited,
            mediaStats.inCooldown || isRateLimited
        ]);

        console.log(`📊 Progress recorded: ${downloadPercentage}% complete, ${missingMedia} missing, ${downloadsToRecord} downloads this interval`);

        // Clean up old records (keep last 7 days)
        await pool.query(`
            DELETE FROM mls.progress_history
            WHERE recorded_at < NOW() - INTERVAL '7 days'
        `);
    } catch (error: any) {
        // Don't fail the sync if progress recording fails
        if (!error.message?.includes('does not exist')) {
            console.error('Failed to record progress history:', error);
        }
    }
}
