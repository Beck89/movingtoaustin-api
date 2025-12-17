/**
 * Media download queue management for MLS Grid ETL
 */
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import pool from './db.js';
import { downloadAndUploadMedia } from './storage.js';
import { fetchMLSData } from './mls-client.js';
import type { Media, MediaStats, FailedMediaInfo } from './types.js';

// Queue configuration - sequential downloads
export const mediaQueue = new PQueue({
    concurrency: 1,
    interval: 1000,
    intervalCap: 20,
});

// Rate limit state
export let isRateLimited = false;
export let rateLimitResetTime: Date | null = null;

// API rate limit tracking (separate from CDN rate limit)
export let isApiRateLimited = false;
export let apiRateLimitResetTime: Date | null = null;
const API_RATE_LIMIT_COOLDOWN_MS = 30 * 60 * 1000;

// Failed media tracking
const failedMediaTracker = new Map<string, FailedMediaInfo>();
const MAX_MEDIA_ATTEMPTS_PER_CYCLE = 3;
const MEDIA_RETRY_COOLDOWN_MS = 5 * 60 * 1000;
const MEDIA_RATE_LIMIT_COOLDOWN_MS = 60 * 1000;

// Media statistics
export const mediaStats: MediaStats = {
    totalSuccessful: 0,
    totalRateLimits: 0,
    lastRateLimitTime: null,
    inCooldown: false,
};

// Track downloads for progress history
export let mediaWorkerDownloadsSinceLastRecord = 0;

export function resetMediaWorkerDownloads(): number {
    const count = mediaWorkerDownloadsSinceLastRecord;
    mediaWorkerDownloadsSinceLastRecord = 0;
    return count;
}

export function incrementMediaWorkerDownloads(): void {
    mediaWorkerDownloadsSinceLastRecord++;
}

/**
 * Record a successful media download
 */
export function recordMediaDownloadSuccess(): void {
    mediaStats.totalSuccessful++;
    mediaStats.inCooldown = false;
    
    if (mediaStats.totalSuccessful % 500 === 0) {
        console.log(`[Media Stats] 📊 Progress: ${mediaStats.totalSuccessful} successful, ${mediaStats.totalRateLimits} rate limits`);
    }
}

/**
 * Record a media rate limit hit
 */
export function recordMediaRateLimitHit(): void {
    mediaStats.totalRateLimits++;
    mediaStats.lastRateLimitTime = new Date();
    mediaStats.inCooldown = true;
    
    console.log(`[Media Stats] ⚠️ Hit media rate limit! Cooling down for ${MEDIA_RATE_LIMIT_COOLDOWN_MS / 1000} seconds...`);
}

/**
 * Record an API rate limit hit
 */
export function recordApiRateLimitHit(listingKey?: string): void {
    isApiRateLimited = true;
    apiRateLimitResetTime = new Date(Date.now() + API_RATE_LIMIT_COOLDOWN_MS);
    console.log(`[API Rate Limit] ⚠️ Hit MLS Grid API rate limit! Cooling down until ${apiRateLimitResetTime.toISOString()}`);
    
    if (listingKey) {
        console.log(`[API Rate Limit] Property ${listingKey} caused rate limit`);
    }
}

/**
 * Check if we're in rate limit cooldown
 */
export function isInRateLimitCooldown(): boolean {
    // Check API rate limit first
    if (isApiRateLimited && apiRateLimitResetTime) {
        if (apiRateLimitResetTime > new Date()) {
            return true;
        }
        isApiRateLimited = false;
        apiRateLimitResetTime = null;
    }
    
    // Check media CDN rate limit
    if (!mediaStats.inCooldown || !mediaStats.lastRateLimitTime) return false;
    const timeSinceRateLimit = Date.now() - mediaStats.lastRateLimitTime.getTime();
    if (timeSinceRateLimit >= MEDIA_RATE_LIMIT_COOLDOWN_MS) {
        mediaStats.inCooldown = false;
        return false;
    }
    return true;
}

/**
 * Get remaining cooldown time
 */
export function getRateLimitCooldownRemaining(): number {
    if (isApiRateLimited && apiRateLimitResetTime) {
        const remaining = apiRateLimitResetTime.getTime() - Date.now();
        if (remaining > 0) return remaining;
    }
    
    if (!mediaStats.lastRateLimitTime) return 0;
    const timeSinceRateLimit = Date.now() - mediaStats.lastRateLimitTime.getTime();
    return Math.max(0, MEDIA_RATE_LIMIT_COOLDOWN_MS - timeSinceRateLimit);
}

/**
 * Check if media has permanently failed
 */
export function isMediaPermanentlyFailed(mediaKey: string): boolean {
    return failedMediaTracker.get(mediaKey)?.permanentlyFailed ?? false;
}

/**
 * Check if media is in cooldown
 */
export function isMediaInCooldown(mediaKey: string): boolean {
    const info = failedMediaTracker.get(mediaKey);
    if (!info) return false;
    if (info.permanentlyFailed) return true;
    
    if (info.attempts >= MAX_MEDIA_ATTEMPTS_PER_CYCLE) {
        const timeSinceLastAttempt = Date.now() - info.lastAttempt.getTime();
        if (timeSinceLastAttempt < MEDIA_RETRY_COOLDOWN_MS) {
            return true;
        }
        // Cooldown expired, reset
        info.attempts = 0;
    }
    return false;
}

/**
 * Track failed media download
 */
export function trackFailedMedia(mediaKey: string, error: Error): void {
    const existing = failedMediaTracker.get(mediaKey) || {
        attempts: 0,
        lastAttempt: new Date(),
        permanentlyFailed: false,
    };
    
    existing.attempts++;
    existing.lastAttempt = new Date();
    
    if (error.message?.includes('404') || error.message?.includes('403')) {
        existing.permanentlyFailed = true;
        console.log(`[Media] Permanently failed ${mediaKey}: ${error.message}`);
    }
    
    failedMediaTracker.set(mediaKey, existing);
}

/**
 * Clear failed media tracking
 */
export function clearFailedMedia(mediaKey: string): void {
    failedMediaTracker.delete(mediaKey);
}

/**
 * Get failed media stats
 */
export function getFailedMediaStats(): { permanentlyFailed: number; inCooldown: number } {
    let permanentlyFailed = 0;
    let inCooldown = 0;
    
    for (const [, value] of failedMediaTracker.entries()) {
        if (value.permanentlyFailed) {
            permanentlyFailed++;
        } else if (value.attempts >= MAX_MEDIA_ATTEMPTS_PER_CYCLE) {
            const timeSinceLastAttempt = Date.now() - value.lastAttempt.getTime();
            if (timeSinceLastAttempt < MEDIA_RETRY_COOLDOWN_MS) {
                inCooldown++;
            } else {
                value.attempts = 0;
            }
        }
    }
    
    return { permanentlyFailed, inCooldown };
}

/**
 * Queue media downloads for a property
 */
export async function queueMediaDownloads(
    listingKey: string,
    media: Media[],
    photosChangeTimestamp?: string
): Promise<void> {
    if (!media || media.length === 0) return;

    // Check if photos have changed
    let photosChanged = true;
    if (photosChangeTimestamp) {
        const result = await pool.query(
            `SELECT photos_change_timestamp FROM mls.properties WHERE listing_key = $1`,
            [listingKey]
        );
        if (result.rows.length > 0 && result.rows[0].photos_change_timestamp) {
            const existingTs = new Date(result.rows[0].photos_change_timestamp).getTime();
            const newTs = new Date(photosChangeTimestamp).getTime();
            photosChanged = newTs > existingTs;
        }
    }

    for (const item of media) {
        // Skip videos
        const isVideo = item.MediaCategory === 'Video' ||
            (item.MediaURL && /\.(mp4|mov|avi|wmv|flv|webm)$/i.test(item.MediaURL));
        if (!item.MediaURL || isVideo) continue;

        // Check if already downloaded
        const existing = await pool.query(
            `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
            [item.MediaKey]
        );
        if (existing.rows.length > 0) continue;

        // Skip if permanently failed or in cooldown
        if (isMediaPermanentlyFailed(item.MediaKey)) continue;
        if (isMediaInCooldown(item.MediaKey)) continue;

        // Skip if rate limited
        if (isRateLimited && rateLimitResetTime && rateLimitResetTime > new Date()) continue;

        // Only download if photos changed or not already downloaded
        if (!photosChanged) continue;

        // Queue the download
        mediaQueue.add(() =>
            pRetry(
                async () => {
                    if (isRateLimited && rateLimitResetTime && rateLimitResetTime > new Date()) {
                        throw new Error('Rate limited - skipping');
                    }
                    
                    try {
                        return await downloadAndUploadMedia(
                            item.MediaURL!,
                            listingKey,
                            item.Order || 0,
                            item.MediaCategory || 'Photo'
                        );
                    } catch (error: any) {
                        if (error.message?.includes('429')) {
                            isRateLimited = true;
                            rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000);
                            throw error;
                        }
                        
                        // Handle expired URLs
                        if (error.message?.includes('expired') || error.message?.includes('400')) {
                            console.log(`[Media] URL expired for ${item.MediaKey}, fetching fresh URL...`);
                            try {
                                const endpoint = `/Property('${listingKey}')?$expand=Media&$select=ListingKey`;
                                const data = await fetchMLSData(endpoint, {});
                                
                                if (data?.Media) {
                                    const freshMedia = data.Media.find((m: Media) => m.MediaKey === item.MediaKey);
                                    if (freshMedia?.MediaURL) {
                                        await pool.query(
                                            `UPDATE mls.media SET media_url = $1, media_modification_ts = $2 WHERE media_key = $3`,
                                            [freshMedia.MediaURL, freshMedia.MediaModificationTimestamp, item.MediaKey]
                                        );
                                        return await downloadAndUploadMedia(
                                            freshMedia.MediaURL,
                                            listingKey,
                                            item.Order || 0,
                                            item.MediaCategory || 'Photo'
                                        );
                                    }
                                }
                            } catch (refreshError: any) {
                                if (refreshError.message?.includes('429')) {
                                    isRateLimited = true;
                                    rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000);
                                    throw new Error('Rate limited while refreshing URL');
                                }
                            }
                        }
                        throw error;
                    }
                },
                {
                    retries: 2,
                    minTimeout: 2000,
                    maxTimeout: 10000,
                    factor: 2,
                }
            ).then(async (localUrl) => {
                clearFailedMedia(item.MediaKey);
                isRateLimited = false;
                incrementMediaWorkerDownloads();
                await pool.query(
                    `UPDATE mls.media SET local_url = $1 WHERE media_key = $2`,
                    [localUrl, item.MediaKey]
                );
            }).catch((err) => {
                trackFailedMedia(item.MediaKey, err);
            })
        );
    }
}
