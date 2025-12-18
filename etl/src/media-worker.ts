/**
 * Continuous media download worker for MLS Grid ETL
 * Runs independently of the main sync cycle to catch up on missing media
 *
 * KEY INSIGHT: MLS Grid has per-property rate limiting. Some properties consistently
 * trigger 429s while other API calls succeed immediately. These "problematic" properties
 * should be handled separately - either their media URLs are stale, the property is
 * deleted from MLS, or there's some MLS Grid-side issue.
 */
import pool from './db.js';
import { fetchMLSData } from './mls-client.js';
import { downloadAndUploadMedia } from './storage.js';
import { deleteFromSearch } from './search.js';
import {
    isInRateLimitCooldown,
    getRateLimitCooldownRemaining,
    isMediaPermanentlyFailed,
    trackFailedMedia,
    clearFailedMedia,
    recordMediaDownloadSuccess,
    recordMediaRateLimitHit,
    recordApiRateLimitHit,
    incrementMediaWorkerDownloads,
    getFailedMediaStats,
} from './media-queue.js';
import { getMediaDownloadDelayFromDb } from './rate-limiter.js';
import type { Media } from './types.js';

// Track properties that cause API rate limits
// Properties that repeatedly cause rate limits get progressively longer cooldowns
// NOTE: MLS Grid appears to have per-property rate limiting - properties that consistently
// fail should be put on long cooldowns to avoid blocking the entire media worker
const apiRateLimitedProperties = new Map<string, { hitCount: number; lastHit: Date; consecutiveFails: number }>();
const API_RATE_LIMIT_PROPERTY_BASE_COOLDOWN_MS = 2 * 60 * 60 * 1000; // 2 hours base
const API_RATE_LIMIT_PROPERTY_MAX_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000; // 7 days max for chronic offenders
const MAX_API_RATE_LIMIT_HITS_BEFORE_LONG_COOLDOWN = 2;
const CONSECUTIVE_FAILS_BEFORE_PERMANENT_SKIP = 5; // After 5 consecutive 429s, skip for a week

function shouldSkipPropertyDueToRateLimit(listingKey: string): boolean {
    const info = apiRateLimitedProperties.get(listingKey);
    if (!info) return false;
    
    // If property has had 5+ consecutive 429 failures, it's a "chronic offender"
    // Skip it for 7 days - something is wrong on MLS Grid's side
    if (info.consecutiveFails >= CONSECUTIVE_FAILS_BEFORE_PERMANENT_SKIP) {
        const timeSinceLastHit = Date.now() - info.lastHit.getTime();
        if (timeSinceLastHit < API_RATE_LIMIT_PROPERTY_MAX_COOLDOWN_MS) {
            const daysLeft = ((API_RATE_LIMIT_PROPERTY_MAX_COOLDOWN_MS - timeSinceLastHit) / (24 * 60 * 60 * 1000)).toFixed(1);
            console.log(`[API Rate Limit] 🚫 CHRONIC: Property ${listingKey} has ${info.consecutiveFails} consecutive 429s. Skipping for ${daysLeft} more days`);
            return true;
        }
        // 7 day cooldown expired - reset consecutive fails and allow retry
        info.consecutiveFails = 0;
        console.log(`[API Rate Limit] 7-day cooldown expired for ${listingKey}, resetting consecutive fails counter`);
    }
    
    // Calculate progressive cooldown based on hit count
    // 2 hits = 2 hours, 3 hits = 8 hours, 4+ hits = 7 days
    let cooldownMs = API_RATE_LIMIT_PROPERTY_BASE_COOLDOWN_MS;
    if (info.hitCount >= 4) {
        cooldownMs = API_RATE_LIMIT_PROPERTY_MAX_COOLDOWN_MS; // 7 days
    } else if (info.hitCount >= 2) {
        cooldownMs = API_RATE_LIMIT_PROPERTY_BASE_COOLDOWN_MS * Math.pow(2, info.hitCount - 1);
    }
    cooldownMs = Math.min(cooldownMs, API_RATE_LIMIT_PROPERTY_MAX_COOLDOWN_MS);
    
    const timeSinceLastHit = Date.now() - info.lastHit.getTime();
    if (timeSinceLastHit >= cooldownMs) {
        // Cooldown expired - don't delete, just allow retry (hit count stays for progressive tracking)
        console.log(`[API Rate Limit] Cooldown expired for ${listingKey} after ${Math.round(timeSinceLastHit / 60000)}min, allowing retry`);
        return false;
    }
    
    if (info.hitCount >= MAX_API_RATE_LIMIT_HITS_BEFORE_LONG_COOLDOWN) {
        const minutesLeft = Math.ceil((cooldownMs - timeSinceLastHit) / 60000);
        const hoursLeft = (minutesLeft / 60).toFixed(1);
        console.log(`[API Rate Limit] Skipping property ${listingKey} - ${info.hitCount} rate limits, cooldown for ${hoursLeft}h (${minutesLeft}min)`);
        return true;
    }
    
    return false;
}

/**
 * Retry failed media downloads
 */
export async function retryFailedMediaDownloads(): Promise<void> {
    console.log(`[${new Date().toISOString()}] 🔄 Checking for properties with missing media...`);

    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⏭️  Skipping media recovery - S3/R2 storage not configured');
        return;
    }

    if (isInRateLimitCooldown()) {
        const secondsLeft = Math.ceil(getRateLimitCooldownRemaining() / 1000);
        console.log(`⏸️  Media recovery paused - cooling down for ${secondsLeft} more seconds`);
        return;
    }

    const { permanentlyFailed, inCooldown } = getFailedMediaStats();
    if (permanentlyFailed > 0 || inCooldown > 0) {
        console.log(`📊 Failed media tracker: ${permanentlyFailed} permanently failed, ${inCooldown} in cooldown`);
    }

    try {
        const countResult = await pool.query(`
            SELECT COUNT(*) as total_missing
            FROM mls.media m
            WHERE m.local_url IS NULL
              AND (m.media_category IS NULL OR m.media_category != 'Video')
              AND m.media_url IS NOT NULL
        `);
        const totalMissing = parseInt(countResult.rows[0]?.total_missing || '0', 10);
        
        if (totalMissing === 0) {
            console.log('✅ All media has been downloaded');
            return;
        }

        const propertiesWithMissingResult = await pool.query(`
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
        const propertiesWithMissing = parseInt(propertiesWithMissingResult.rows[0]?.count || '0', 10);
        console.log(`📊 Total missing media: ${totalMissing} across ${propertiesWithMissing} properties`);

        console.log('✅ Media recovery will be handled by the continuous worker');
    } catch (error) {
        console.error('Media recovery error:', error);
    }
}

/**
 * Continuous media download worker - runs independently
 */
export async function runMediaDownloadWorker(): Promise<void> {
    console.log(`\n📸 Starting continuous media download worker...`);
    
    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⏭️  Media download worker disabled - S3/R2 storage not configured');
        return;
    }

    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            // Check if we're in rate limit cooldown
            if (isInRateLimitCooldown()) {
                const secondsLeft = Math.ceil(getRateLimitCooldownRemaining() / 1000);
                console.log(`⏸️  Media worker paused - cooling down for ${secondsLeft} more seconds`);
                await new Promise(resolve => setTimeout(resolve, getRateLimitCooldownRemaining() + 100));
                continue;
            }

            // Get count of total missing media
            const countResult = await pool.query(`
                SELECT COUNT(*) as total_missing
                FROM mls.media m
                WHERE m.local_url IS NULL
                  AND (m.media_category IS NULL OR m.media_category != 'Video')
                  AND m.media_url IS NOT NULL
            `);
            const totalMissing = parseInt(countResult.rows[0]?.total_missing || '0', 10);
            
            if (totalMissing === 0) {
                console.log('✅ All media has been downloaded. Worker sleeping for 5 minutes...');
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                continue;
            }

            // Find a single property with missing media
            const result = await pool.query(`
                SELECT p.listing_key,
                       (SELECT COUNT(*) FROM mls.media m 
                        WHERE m.listing_key = p.listing_key 
                        AND m.local_url IS NULL 
                        AND (m.media_category IS NULL OR m.media_category != 'Video')) as missing_count
                FROM mls.properties p
                WHERE p.photo_count > 0
                  AND EXISTS (
                    SELECT 1 FROM mls.media m
                    WHERE m.listing_key = p.listing_key
                      AND m.local_url IS NULL
                      AND (m.media_category IS NULL OR m.media_category != 'Video')
                  )
                ORDER BY p.modification_timestamp DESC
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                console.log('✅ No properties with missing media. Worker sleeping for 5 minutes...');
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                continue;
            }

            let row = result.rows[0];
            const currentListingKey = row.listing_key;
            
            // Check if this property should be skipped due to rate limits
            if (shouldSkipPropertyDueToRateLimit(currentListingKey)) {
                // Find an alternate property
                const alternateResult = await pool.query(`
                    SELECT p.listing_key,
                           (SELECT COUNT(*) FROM mls.media m 
                            WHERE m.listing_key = p.listing_key 
                            AND m.local_url IS NULL 
                            AND (m.media_category IS NULL OR m.media_category != 'Video')) as missing_count
                    FROM mls.properties p
                    WHERE p.photo_count > 0
                      AND p.listing_key != $1
                      AND EXISTS (
                        SELECT 1 FROM mls.media m
                        WHERE m.listing_key = p.listing_key
                          AND m.local_url IS NULL
                          AND (m.media_category IS NULL OR m.media_category != 'Video')
                      )
                    ORDER BY p.modification_timestamp DESC
                    LIMIT 10
                `, [currentListingKey]);
                
                let foundAlternate = false;
                for (const altRow of alternateResult.rows) {
                    if (!shouldSkipPropertyDueToRateLimit(altRow.listing_key)) {
                        console.log(`[Media Worker] Switching to alternate property ${altRow.listing_key}`);
                        row = altRow;
                        foundAlternate = true;
                        break;
                    }
                }
                
                if (!foundAlternate) {
                    console.log(`[Media Worker] All properties are rate limited, sleeping for 5 minutes...`);
                    await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                    continue;
                }
            }
            
            console.log(`[Media Worker] Processing ${row.listing_key} (${row.missing_count} missing in DB)`);
            
            // IMPORTANT: Wait before making the MLS Grid API call to prevent rate limits
            // This delay is separate from CDN download delays - it's for the API call to get fresh media URLs
            // MLS Grid limits: 2 RPS, 7200/hour, 40000/day - we need to be very conservative here
            // because the main sync process is also making API calls
            const apiDelay = await getMediaDownloadDelayFromDb();
            console.log(`[Media Worker] Waiting ${apiDelay}ms before MLS API call...`);
            await new Promise(resolve => setTimeout(resolve, apiDelay));
            
            // Fetch fresh media URLs from MLS API
            const endpoint = `/Property('${row.listing_key}')?$expand=Media&$select=ListingKey`;
            const data = await fetchMLSData(endpoint, {});

            if (data && data.Media && data.Media.length > 0) {
                console.log(`[Media Worker] MLS API returned ${data.Media.length} media items for ${row.listing_key}`);
                
                // Get MediaKeys from API response
                const apiMediaKeys = new Set(data.Media.map((m: Media) => m.MediaKey));
                
                // Find and delete orphaned media
                const orphanedResult = await pool.query(`
                    SELECT media_key FROM mls.media
                    WHERE listing_key = $1
                      AND local_url IS NULL
                      AND (media_category IS NULL OR media_category != 'Video')
                      AND media_key NOT IN (SELECT unnest($2::text[]))
                `, [row.listing_key, Array.from(apiMediaKeys)]);
                
                if (orphanedResult.rows.length > 0) {
                    const orphanedKeys = orphanedResult.rows.map(r => r.media_key);
                    console.log(`[Media Worker] Cleaning up ${orphanedKeys.length} orphaned media records`);
                    await pool.query(`DELETE FROM mls.media WHERE media_key = ANY($1::text[])`, [orphanedKeys]);
                }
                
                let downloadedCount = 0;
                let skippedCount = 0;
                
                for (const item of data.Media) {
                    if (isInRateLimitCooldown()) break;
                    
                    // Check if already downloaded
                    const existingMedia = await pool.query(
                        `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
                        [item.MediaKey]
                    );
                    if (existingMedia.rows.length > 0) continue;
                    
                    // Check if permanently failed
                    if (isMediaPermanentlyFailed(item.MediaKey)) {
                        skippedCount++;
                        continue;
                    }

                    // Skip videos
                    const isVideo = item.MediaCategory === 'Video' ||
                        (item.MediaURL && /\.(mp4|mov|avi|wmv|flv|webm)$/i.test(item.MediaURL));
                    if (!item.MediaURL || isVideo) continue;

                    // Update media_url with fresh token
                    await pool.query(
                        `UPDATE mls.media SET media_url = $1, media_modification_ts = $2 WHERE media_key = $3`,
                        [item.MediaURL, item.MediaModificationTimestamp, item.MediaKey]
                    );

                    // Download directly
                    try {
                        const localUrl = await downloadAndUploadMedia(
                            item.MediaURL,
                            row.listing_key,
                            item.Order || 0,
                            item.MediaCategory || 'Photo'
                        );
                        
                        await pool.query(
                            'UPDATE mls.media SET local_url = $1 WHERE media_key = $2',
                            [localUrl, item.MediaKey]
                        );
                        
                        downloadedCount++;
                        incrementMediaWorkerDownloads();
                        clearFailedMedia(item.MediaKey);
                        recordMediaDownloadSuccess();
                        
                        // Wait after successful download to respect rate limits
                        // This delay is configurable via the dashboard
                        const mediaDelay = await getMediaDownloadDelayFromDb();
                        await new Promise(resolve => setTimeout(resolve, mediaDelay));
                        
                    } catch (err: any) {
                        if (err.message?.includes('429')) {
                            recordMediaRateLimitHit();
                            break;
                        }
                        
                        trackFailedMedia(item.MediaKey, err);
                        skippedCount++;
                    }
                }
                
                console.log(`[Media Worker] ${row.listing_key}: ${downloadedCount} downloaded, ${skippedCount} skipped. ${totalMissing - downloadedCount} remaining.`);
            }
            
            // Note: No additional delay needed here - we add proper delay BEFORE the next API call
            
        } catch (error: any) {
            if (error.message?.includes('429')) {
                if (error.message?.includes('api.mlsgrid.com') || error.message?.includes('MLS API')) {
                    const urlMatch = error.message?.match(/Property\('([^']+)'\)/);
                    const rateLimitedListingKey = urlMatch?.[1];
                    recordApiRateLimitHit(rateLimitedListingKey);
                    
                    // Track the property - MLS Grid appears to have per-property rate limiting
                    // Properties that consistently fail should get progressively longer cooldowns
                    if (rateLimitedListingKey) {
                        const existing = apiRateLimitedProperties.get(rateLimitedListingKey) || {
                            hitCount: 0,
                            lastHit: new Date(),
                            consecutiveFails: 0
                        };
                        existing.hitCount++;
                        existing.consecutiveFails++;
                        existing.lastHit = new Date();
                        
                        // Check if this is a chronic offender (>= 5 consecutive fails)
                        if (existing.consecutiveFails >= CONSECUTIVE_FAILS_BEFORE_PERMANENT_SKIP) {
                            console.log(`[API Rate Limit] ⚠️ Property ${rateLimitedListingKey} has ${existing.consecutiveFails} consecutive 429s - skipping for 7 days`);
                        }
                        
                        apiRateLimitedProperties.set(rateLimitedListingKey, existing);
                    }
                } else {
                    recordMediaRateLimitHit();
                }
            } else if (error.message?.includes('400') && error.message?.includes('Resource not found')) {
                // Property no longer exists in MLS
                const urlMatch = error.message?.match(/Property\('([^']+)'\)/);
                const orphanedListingKey = urlMatch?.[1];
                
                if (orphanedListingKey) {
                    console.log(`[Media Worker] Property ${orphanedListingKey} no longer exists in MLS, deleting...`);
                    try {
                        await pool.query('DELETE FROM mls.media WHERE listing_key = $1', [orphanedListingKey]);
                        await pool.query('DELETE FROM mls.properties WHERE listing_key = $1', [orphanedListingKey]);
                        await deleteFromSearch(orphanedListingKey);
                        console.log(`[Media Worker] Deleted orphaned property ${orphanedListingKey}`);
                    } catch (deleteError) {
                        console.error('[Media Worker] Failed to delete orphaned property:', deleteError);
                    }
                }
            } else {
                console.error('[Media Worker] Error:', error);
            }
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
}
