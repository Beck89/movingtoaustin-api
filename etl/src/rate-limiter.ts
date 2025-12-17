/**
 * Centralized rate limiter for MLS Grid API
 *
 * MLS Grid enforces:
 * - 2 requests per second (RPS) - max allowed
 * - 7,200 requests per hour
 * - 40,000 requests per day
 *
 * This module tracks API requests separately from media downloads.
 * Media downloads should use their own delay mechanism since they
 * often hit rate limits at the CDN level, not the API level.
 */

import pool from './db.js';

export class RateLimiter {
    private requestCount = 0;
    private hourlyStartTime = Date.now();
    private readonly maxRequestsPerHour = 7000; // Leave 200 buffer
    private readonly minDelayMs: number;
    private lastRequestTime = 0;
    private recentRequests: number[] = []; // Track last 10 request timestamps
    private readonly name: string;

    constructor(name: string = 'API', minDelayMs: number = 550) {
        this.name = name;
        // Default to 550ms between requests (~1.8 RPS) for API calls
        // This is conservative but allows catching up while staying under 2 RPS
        this.minDelayMs = minDelayMs;
    }

    /**
     * Wait if necessary to respect rate limits, then increment counter
     * This properly calculates remaining wait time rather than always waiting the full delay
     */
    async waitForSlot(): Promise<void> {
        const now = Date.now();

        // Calculate time since last request
        const timeSinceLastRequest = this.lastRequestTime ? now - this.lastRequestTime : this.minDelayMs;

        // Log request timing for debugging (every 50 requests to reduce noise)
        if (this.requestCount % 50 === 0) {
            const recentRate = this.recentRequests.length > 1
                ? (this.recentRequests.length - 1) / ((now - this.recentRequests[0]) / 1000)
                : 0;
            console.log(`[${this.name} Rate Limiter] Request #${this.requestCount}, Last: ${timeSinceLastRequest}ms ago, Recent rate: ${recentRate.toFixed(2)} RPS`);
        }

        // Track recent requests (keep last 10)
        this.recentRequests.push(now);
        if (this.recentRequests.length > 10) {
            this.recentRequests.shift();
        }

        // Check hourly limit
        const elapsed = Date.now() - this.hourlyStartTime;
        if (this.requestCount >= this.maxRequestsPerHour) {
            if (elapsed < 3600000) { // Less than 1 hour
                const waitTime = 3600000 - elapsed;
                console.log(`⏳ [${this.name}] Rate limit: ${this.requestCount} requests in ${Math.round(elapsed / 60000)}min. Waiting ${Math.round(waitTime / 60000)}min...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                this.reset();
            } else {
                // Hour has passed, reset counter
                this.reset();
            }
        }

        // Calculate remaining wait time needed (not a fixed delay)
        // Only wait if we haven't waited long enough since the last request
        const remainingWait = Math.max(0, this.minDelayMs - timeSinceLastRequest);
        if (remainingWait > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingWait));
        }

        // Update last request time and increment counter
        this.lastRequestTime = Date.now();
        this.requestCount++;
    }

    /**
     * Reset the hourly counter
     */
    private reset(): void {
        this.requestCount = 0;
        this.hourlyStartTime = Date.now();
    }

    /**
     * Get current stats
     */
    getStats(): { requestCount: number; elapsedMinutes: number; lastRequestTime: number } {
        const elapsed = Date.now() - this.hourlyStartTime;
        return {
            requestCount: this.requestCount,
            elapsedMinutes: Math.round(elapsed / 60000),
            lastRequestTime: this.lastRequestTime,
        };
    }

    /**
     * Get the minimum delay in milliseconds
     */
    getMinDelayMs(): number {
        return this.minDelayMs;
    }
}

// Singleton instance for MLS Grid API calls (Property, Member, Office, OpenHouse endpoints)
// Uses 550ms delay (~1.8 RPS) - conservative but efficient for API calls
export const rateLimiter = new RateLimiter('API', 550);

// Separate rate limiter for media downloads from MLS Grid CDN
// Default: 1500ms delay (1.5 seconds between requests)
// This can be adjusted at runtime via the API
export const mediaRateLimiter = new RateLimiter('Media', 1500);

// Runtime-configurable delay for media downloads (applied AFTER successful download)
// This is separate from the rate limiter - it's the pause between completing one download
// and starting the next request
let mediaDownloadDelayMs = 1500; // Default 1.5 seconds
let lastDbFetchTime = 0;
const DB_FETCH_INTERVAL_MS = 10000; // Check DB every 10 seconds

/**
 * Get the current media download delay, refreshing from DB periodically
 */
export async function getMediaDownloadDelayFromDb(): Promise<number> {
    const now = Date.now();
    
    // Only fetch from DB periodically to reduce load
    if (now - lastDbFetchTime > DB_FETCH_INTERVAL_MS) {
        try {
            const result = await pool.query(
                `SELECT value FROM mls.settings WHERE key = 'media_download_delay_ms'`
            );
            if (result.rows.length > 0) {
                const dbValue = parseInt(result.rows[0].value, 10);
                if (!isNaN(dbValue) && dbValue >= 500 && dbValue <= 5000) {
                    if (dbValue !== mediaDownloadDelayMs) {
                        console.log(`[Rate Limiter] Media download delay updated from DB: ${dbValue}ms`);
                        mediaDownloadDelayMs = dbValue;
                    }
                }
            }
            lastDbFetchTime = now;
        } catch {
            // Table might not exist yet, use default
        }
    }
    
    return mediaDownloadDelayMs;
}

/**
 * Get the current media download delay (in-memory value)
 */
export function getMediaDownloadDelay(): number {
    return mediaDownloadDelayMs;
}

/**
 * Set media download delay (also persists to DB for cross-process communication)
 */
export async function setMediaDownloadDelay(delayMs: number): Promise<void> {
    // Clamp to reasonable values: 500ms - 5000ms
    const clampedDelay = Math.max(500, Math.min(5000, delayMs));
    mediaDownloadDelayMs = clampedDelay;
    
    try {
        await pool.query(
            `INSERT INTO mls.settings (key, value, updated_at)
             VALUES ('media_download_delay_ms', $1, NOW())
             ON CONFLICT (key) DO UPDATE SET value = $1, updated_at = NOW()`,
            [clampedDelay.toString()]
        );
        console.log(`[Rate Limiter] Media download delay set to ${clampedDelay}ms (saved to DB)`);
    } catch (err) {
        console.log(`[Rate Limiter] Media download delay set to ${clampedDelay}ms (DB save failed: ${err})`);
    }
}