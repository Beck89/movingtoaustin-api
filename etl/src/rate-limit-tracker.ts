/**
 * Rate limit tracking for database logging
 * Stores rate limit events and problematic properties for debugging
 */
import pool from './db.js';

export interface RateLimitEvent {
    eventType: 'api_429' | 'cdn_429' | 'hourly_limit' | 'daily_limit';
    source: string;
    listingKey?: string;
    endpoint?: string;
    responseBody?: string;
    responseHeaders?: string;
    requestCountAtEvent?: number;
    cooldownUntil?: Date;
}

/**
 * Log a rate limit event to the database
 */
export async function logRateLimitEvent(event: RateLimitEvent): Promise<void> {
    try {
        await pool.query(
            `INSERT INTO mls.rate_limit_events 
             (event_type, source, listing_key, endpoint, response_body, response_headers, request_count_at_event, cooldown_until)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
            [
                event.eventType,
                event.source,
                event.listingKey || null,
                event.endpoint || null,
                event.responseBody || null,
                event.responseHeaders || null,
                event.requestCountAtEvent || null,
                event.cooldownUntil || null,
            ]
        );
    } catch (error) {
        // Don't fail if logging fails - just log to console
        console.error('[Rate Limit Tracker] Failed to log event:', error);
    }
}

/**
 * Track a property that caused a rate limit
 */
export async function trackProblematicProperty(
    listingKey: string,
    cooldownUntil: Date,
    consecutiveFails: number,
    notes?: string
): Promise<void> {
    try {
        // Determine status based on consecutive fails
        let status = 'cooldown';
        if (consecutiveFails >= 5) {
            status = 'permanent_skip';
        }

        await pool.query(
            `INSERT INTO mls.problematic_properties 
             (listing_key, rate_limit_count, consecutive_fails, last_rate_limit_at, first_rate_limit_at, cooldown_until, status, notes, updated_at)
             VALUES ($1, 1, $2, NOW(), NOW(), $3, $4, $5, NOW())
             ON CONFLICT (listing_key) DO UPDATE SET
                rate_limit_count = mls.problematic_properties.rate_limit_count + 1,
                consecutive_fails = $2,
                last_rate_limit_at = NOW(),
                cooldown_until = $3,
                status = $4,
                notes = COALESCE($5, mls.problematic_properties.notes),
                updated_at = NOW()`,
            [listingKey, consecutiveFails, cooldownUntil, status, notes || null]
        );
    } catch (error) {
        console.error('[Rate Limit Tracker] Failed to track problematic property:', error);
    }
}

/**
 * Clear a property from the problematic list after successful download
 */
export async function clearProblematicProperty(listingKey: string): Promise<void> {
    try {
        await pool.query(
            `UPDATE mls.problematic_properties 
             SET status = 'cleared', consecutive_fails = 0, updated_at = NOW()
             WHERE listing_key = $1`,
            [listingKey]
        );
    } catch (error) {
        console.error('[Rate Limit Tracker] Failed to clear problematic property:', error);
    }
}

/**
 * Get summary statistics for rate limits
 */
export async function getRateLimitStats(): Promise<{
    last24Hours: { eventType: string; count: number; uniqueProperties: number }[];
    problematicProperties: {
        listingKey: string;
        rateLimitCount: number;
        consecutiveFails: number;
        status: string;
        cooldownUntil: Date | null;
        lastRateLimitAt: Date | null;
    }[];
    recentEvents: {
        eventType: string;
        source: string;
        listingKey: string | null;
        createdAt: Date;
        cooldownUntil: Date | null;
    }[];
}> {
    try {
        // Get 24-hour summary
        const summaryResult = await pool.query(`
            SELECT 
                event_type,
                COUNT(*)::int as count,
                COUNT(DISTINCT listing_key)::int as unique_properties
            FROM mls.rate_limit_events
            WHERE created_at > NOW() - INTERVAL '24 hours'
            GROUP BY event_type
            ORDER BY count DESC
        `);

        // Get problematic properties
        const problematicResult = await pool.query(`
            SELECT 
                listing_key,
                rate_limit_count,
                consecutive_fails,
                status,
                cooldown_until,
                last_rate_limit_at
            FROM mls.problematic_properties
            WHERE status != 'cleared'
            ORDER BY rate_limit_count DESC
            LIMIT 20
        `);

        // Get recent events
        const recentResult = await pool.query(`
            SELECT 
                event_type,
                source,
                listing_key,
                created_at,
                cooldown_until
            FROM mls.rate_limit_events
            ORDER BY created_at DESC
            LIMIT 50
        `);

        return {
            last24Hours: summaryResult.rows.map(r => ({
                eventType: r.event_type,
                count: r.count,
                uniqueProperties: r.unique_properties,
            })),
            problematicProperties: problematicResult.rows.map(r => ({
                listingKey: r.listing_key,
                rateLimitCount: r.rate_limit_count,
                consecutiveFails: r.consecutive_fails,
                status: r.status,
                cooldownUntil: r.cooldown_until,
                lastRateLimitAt: r.last_rate_limit_at,
            })),
            recentEvents: recentResult.rows.map(r => ({
                eventType: r.event_type,
                source: r.source,
                listingKey: r.listing_key,
                createdAt: r.created_at,
                cooldownUntil: r.cooldown_until,
            })),
        };
    } catch (error) {
        console.error('[Rate Limit Tracker] Failed to get stats:', error);
        return {
            last24Hours: [],
            problematicProperties: [],
            recentEvents: [],
        };
    }
}

/**
 * Clean up old rate limit events (keep last 7 days)
 */
export async function cleanupOldEvents(): Promise<void> {
    try {
        const result = await pool.query(
            `DELETE FROM mls.rate_limit_events WHERE created_at < NOW() - INTERVAL '7 days' RETURNING id`
        );
        if (result.rowCount && result.rowCount > 0) {
            console.log(`[Rate Limit Tracker] Cleaned up ${result.rowCount} old events`);
        }
    } catch (error) {
        console.error('[Rate Limit Tracker] Failed to cleanup old events:', error);
    }
}
