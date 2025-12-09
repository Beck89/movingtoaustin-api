import { Router, Request, Response } from 'express';
import pool from '../db.js';
import searchClient, { INDEX_NAME } from '../search.js';

const router = Router();

/**
 * @swagger
 * /status/dashboard:
 *   get:
 *     summary: Get HTML dashboard
 *     description: Mobile-friendly HTML dashboard showing system status
 *     tags: [System]
 *     responses:
 *       200:
 *         description: HTML dashboard
 *         content:
 *           text/html:
 *             schema:
 *               type: string
 */
router.get('/dashboard', async (_req: Request, res: Response) => {
    try {
        // Get database stats
        const dbStats = await pool.query(`
            SELECT
                COUNT(*) as total_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Active') as active_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Pending') as pending_properties
            FROM mls.properties
        `);

        // Get media stats
        const mediaStats = await pool.query(`
            SELECT
                COUNT(*) as total_media,
                COUNT(*) FILTER (WHERE local_url IS NOT NULL) as downloaded_media,
                COUNT(*) FILTER (WHERE local_url IS NULL AND (media_category IS NULL OR media_category != 'Video')) as missing_media
            FROM mls.media
        `);

        // Get properties with missing media count
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

        // Get sync state for all resources
        const syncState = await pool.query(`
            SELECT
                resource,
                last_modification_ts,
                last_run_at,
                EXTRACT(EPOCH FROM (NOW() - last_run_at))::integer as seconds_since_last_sync
            FROM mls.sync_state
            ORDER BY
                CASE WHEN resource = 'Property' THEN 0 ELSE 1 END,
                last_run_at DESC
        `);

        // Get progress history (last 24 hours, every 15 min = ~96 records max)
        let progressHistory: any[] = [];
        try {
            const historyResult = await pool.query(`
                SELECT
                    recorded_at,
                    download_percentage,
                    missing_media,
                    downloaded_media,
                    media_worker_downloads,
                    api_rate_limited,
                    media_cdn_rate_limited
                FROM mls.progress_history
                WHERE recorded_at > NOW() - INTERVAL '24 hours'
                ORDER BY recorded_at DESC
                LIMIT 96
            `);
            progressHistory = historyResult.rows;
        } catch {
            // Table might not exist yet
        }

        const totalMedia = parseInt(mediaStats.rows[0].total_media);
        const downloadedMedia = parseInt(mediaStats.rows[0].downloaded_media);
        const missingMedia = parseInt(mediaStats.rows[0].missing_media);
        const downloadPercentage = totalMedia > 0 ? Math.round((downloadedMedia / totalMedia) * 100) : 0;
        const propertiesWithMissing = parseInt(missingMediaProps.rows[0].count);

        const lastSync = syncState.rows.find(r => r.resource === 'Property');
        const secondsSinceSync = lastSync?.seconds_since_last_sync || 0;
        const minutesSinceSync = Math.floor(secondsSinceSync / 60);
        const syncInterval = parseInt(process.env.ETL_INTERVAL_MINUTES || '5', 10);
        const isHealthy = minutesSinceSync <= syncInterval * 2;

        // Calculate ETA for media downloads
        // Assuming ~1 download per second when not rate limited
        const etaMinutes = Math.ceil(missingMedia / 60);
        const etaHours = Math.floor(etaMinutes / 60);
        const etaRemainingMinutes = etaMinutes % 60;

        const html = `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="refresh" content="60">
    <title>MLS Sync Dashboard</title>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background: #1a1a2e;
            color: #eee;
            padding: 16px;
            min-height: 100vh;
        }
        .header {
            text-align: center;
            margin-bottom: 20px;
        }
        .header h1 {
            font-size: 1.5rem;
            color: #4ade80;
        }
        .header .time {
            font-size: 0.85rem;
            color: #888;
            margin-top: 4px;
        }
        .card {
            background: #16213e;
            border-radius: 12px;
            padding: 16px;
            margin-bottom: 16px;
        }
        .card-title {
            font-size: 0.9rem;
            color: #888;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin-bottom: 12px;
        }
        .stat-row {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 8px 0;
            border-bottom: 1px solid #2a2a4a;
        }
        .stat-row:last-child { border-bottom: none; }
        .stat-label { color: #aaa; }
        .stat-value { font-weight: 600; font-size: 1.1rem; }
        .stat-value.green { color: #4ade80; }
        .stat-value.yellow { color: #fbbf24; }
        .stat-value.red { color: #f87171; }
        .stat-value.blue { color: #60a5fa; }
        .progress-bar {
            background: #2a2a4a;
            border-radius: 8px;
            height: 24px;
            overflow: hidden;
            margin: 12px 0;
        }
        .progress-fill {
            height: 100%;
            background: linear-gradient(90deg, #4ade80, #22c55e);
            display: flex;
            align-items: center;
            justify-content: center;
            font-weight: 600;
            font-size: 0.85rem;
            transition: width 0.5s ease;
        }
        .big-number {
            font-size: 2.5rem;
            font-weight: 700;
            text-align: center;
            margin: 8px 0;
        }
        .sub-text {
            text-align: center;
            color: #888;
            font-size: 0.85rem;
        }
        .status-badge {
            display: inline-block;
            padding: 4px 12px;
            border-radius: 20px;
            font-size: 0.85rem;
            font-weight: 600;
        }
        .status-healthy { background: #166534; color: #4ade80; }
        .status-warning { background: #854d0e; color: #fbbf24; }
        .sync-resources {
            display: grid;
            grid-template-columns: repeat(2, 1fr);
            gap: 8px;
            margin-top: 12px;
        }
        .sync-resource {
            background: #1a1a2e;
            padding: 8px;
            border-radius: 8px;
            text-align: center;
        }
        .sync-resource .name {
            font-size: 0.75rem;
            color: #888;
        }
        .sync-resource .time {
            font-size: 0.85rem;
            color: #60a5fa;
        }
        .footer {
            text-align: center;
            color: #666;
            font-size: 0.75rem;
            margin-top: 20px;
        }
        .history-list {
            display: flex;
            flex-direction: column;
            gap: 8px;
        }
        .history-row {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 6px 8px;
            background: #1a1a2e;
            border-radius: 6px;
            font-size: 0.85rem;
        }
        .history-time {
            color: #888;
            min-width: 100px;
        }
        .history-pct {
            font-weight: 600;
            min-width: 40px;
        }
        .history-missing {
            color: #aaa;
            flex: 1;
        }
        .history-dl {
            font-size: 0.75rem;
            padding: 2px 6px;
            background: rgba(74, 222, 128, 0.15);
            border-radius: 4px;
        }
        .history-new {
            font-size: 0.75rem;
            padding: 2px 6px;
            background: rgba(251, 191, 36, 0.15);
            border-radius: 4px;
        }
        .history-rl {
            font-size: 0.75rem;
        }
        .history-change {
            font-size: 0.75rem;
            margin-left: 4px;
        }
        .history-legend {
            display: flex;
            gap: 16px;
            justify-content: center;
            margin-top: 12px;
            padding-top: 8px;
            border-top: 1px solid #2a2a4a;
            font-size: 0.75rem;
            color: #888;
        }
        .history-legend span {
            display: flex;
            align-items: center;
            gap: 4px;
        }
    </style>
</head>
<body>
    <div class="header">
        <h1>🏠 MLS Sync Dashboard</h1>
        <div class="time">Last updated: ${new Date().toLocaleString()}</div>
        <div class="time">Auto-refreshes every 60 seconds</div>
    </div>

    <div class="card">
        <div class="card-title">📊 Sync Status</div>
        <div style="text-align: center; margin-bottom: 12px;">
            <span class="status-badge ${isHealthy ? 'status-healthy' : 'status-warning'}">
                ${isHealthy ? '✓ Healthy' : '⚠ Warning'}
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Last Sync</span>
            <span class="stat-value ${minutesSinceSync <= syncInterval ? 'green' : minutesSinceSync <= syncInterval * 2 ? 'yellow' : 'red'}">
                ${minutesSinceSync} min ago
            </span>
        </div>
        <div class="stat-row">
            <span class="stat-label">High Water Mark</span>
            <span class="stat-value blue">${lastSync?.last_modification_ts ? new Date(lastSync.last_modification_ts).toLocaleTimeString() : 'N/A'}</span>
        </div>
    </div>

    <div class="card">
        <div class="card-title">📸 Media Downloads</div>
        <div class="big-number ${downloadPercentage >= 99 ? 'green' : downloadPercentage >= 90 ? 'yellow' : 'blue'}">${downloadPercentage}%</div>
        <div class="progress-bar">
            <div class="progress-fill" style="width: ${downloadPercentage}%">${downloadedMedia.toLocaleString()} / ${totalMedia.toLocaleString()}</div>
        </div>
        <div class="stat-row">
            <span class="stat-label">Missing Media</span>
            <span class="stat-value ${missingMedia === 0 ? 'green' : 'yellow'}">${missingMedia.toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Properties Incomplete</span>
            <span class="stat-value ${propertiesWithMissing === 0 ? 'green' : 'yellow'}">${propertiesWithMissing.toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Est. Time Remaining</span>
            <span class="stat-value blue">${etaHours > 0 ? etaHours + 'h ' : ''}${etaRemainingMinutes}m</span>
        </div>
    </div>

    <div class="card">
        <div class="card-title">🏘️ Properties</div>
        <div class="stat-row">
            <span class="stat-label">Total</span>
            <span class="stat-value">${parseInt(dbStats.rows[0].total_properties).toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Active</span>
            <span class="stat-value green">${parseInt(dbStats.rows[0].active_properties).toLocaleString()}</span>
        </div>
        <div class="stat-row">
            <span class="stat-label">Pending</span>
            <span class="stat-value yellow">${parseInt(dbStats.rows[0].pending_properties).toLocaleString()}</span>
        </div>
    </div>

    <div class="card">
        <div class="card-title">🔄 Resource Sync Times</div>
        <div class="sync-resources">
            ${syncState.rows.map(r => `
                <div class="sync-resource">
                    <div class="name">${r.resource}</div>
                    <div class="time">${Math.floor(r.seconds_since_last_sync / 60)}m ago</div>
                </div>
            `).join('')}
        </div>
    </div>

    ${progressHistory.length > 0 ? `
    <div class="card">
        <div class="card-title">📈 Progress History (Last 24h)</div>
        <div class="history-list">
            ${progressHistory.slice(0, 12).map((h, index, arr) => {
                const time = new Date(h.recorded_at);
                const timeStr = time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                const dateStr = time.toLocaleDateString([], { month: 'short', day: 'numeric' });
                const rateLimited = h.api_rate_limited || h.media_cdn_rate_limited;
                const currentMissing = parseInt(h.missing_media);
                
                // Calculate change from previous record (next in array since sorted DESC)
                const prevRecord = arr[index + 1];
                const prevMissing = prevRecord ? parseInt(prevRecord.missing_media) : currentMissing;
                const missingChange = currentMissing - prevMissing;
                
                // Calculate net change: if we downloaded X files but missing went up by Y,
                // then new media added = X + Y
                const downloads = h.media_worker_downloads || 0;
                const newMediaAdded = downloads > 0 ? downloads + missingChange : 0;
                
                // Determine the change indicator
                let changeIndicator = '';
                if (prevRecord) {
                    if (missingChange < 0) {
                        changeIndicator = `<span class="history-change green">↓${Math.abs(missingChange).toLocaleString()}</span>`;
                    } else if (missingChange > 0) {
                        changeIndicator = `<span class="history-change yellow">↑${missingChange.toLocaleString()}</span>`;
                    } else {
                        changeIndicator = `<span class="history-change">—</span>`;
                    }
                }
                
                return `
                <div class="history-row">
                    <span class="history-time">${dateStr} ${timeStr}</span>
                    <span class="history-pct ${h.download_percentage >= 99 ? 'green' : ''}">${h.download_percentage}%</span>
                    <span class="history-missing">${currentMissing.toLocaleString()} missing ${changeIndicator}</span>
                    ${downloads > 0 ? `<span class="history-dl green" title="Downloaded ${downloads} files">↓${downloads}</span>` : ''}
                    ${newMediaAdded > 0 ? `<span class="history-new yellow" title="New media added from sync">+${newMediaAdded}</span>` : ''}
                    ${rateLimited ? '<span class="history-rl" title="Rate limited during this interval">⏸️</span>' : ''}
                </div>
            `}).join('')}
        </div>
        <div class="history-legend">
            <span><span class="green">↓N</span> = downloaded</span>
            <span><span class="yellow">+N</span> = new from sync</span>
            <span>⏸️ = rate limited</span>
        </div>
        ${progressHistory.length > 12 ? `<div class="sub-text" style="margin-top:8px;">${progressHistory.length - 12} more records...</div>` : ''}
    </div>
    ` : ''}

    <div class="footer">
        <p>MLS Grid ETL System</p>
        <p>Sync interval: ${syncInterval} minutes</p>
    </div>
</body>
</html>`;

        res.setHeader('Content-Type', 'text/html');
        res.send(html);
    } catch (error) {
        console.error('Dashboard endpoint error:', error);
        res.status(500).send(`
            <html>
                <body style="background:#1a1a2e;color:#f87171;padding:20px;font-family:sans-serif;">
                    <h1>Error loading dashboard</h1>
                    <p>${error instanceof Error ? error.message : 'Unknown error'}</p>
                </body>
            </html>
        `);
    }
});

/**
 * @swagger
 * /status:
 *   get:
 *     summary: Get system status
 *     description: Retrieve comprehensive system status including database stats, sync health, media stats, and search index information
 *     tags: [System]
 *     responses:
 *       200:
 *         description: System status retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: "ok"
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 sync:
 *                   type: object
 *                   properties:
 *                     health:
 *                       type: string
 *                       enum: [healthy, warning]
 *                     last_sync:
 *                       type: string
 *                       format: date-time
 *                     minutes_since_last_sync:
 *                       type: integer
 *                     sync_interval_minutes:
 *                       type: integer
 *                     high_water_mark:
 *                       type: string
 *                       format: date-time
 *                     originating_system:
 *                       type: string
 *                 database:
 *                   type: object
 *                   properties:
 *                     total_properties:
 *                       type: integer
 *                     active_properties:
 *                       type: integer
 *                     viewable_properties:
 *                       type: integer
 *                     unique_cities:
 *                       type: integer
 *                     price_stats:
 *                       type: object
 *                       properties:
 *                         average:
 *                           type: number
 *                         max:
 *                           type: number
 *                         min:
 *                           type: number
 *                 media:
 *                   type: object
 *                   properties:
 *                     total_media:
 *                       type: integer
 *                     downloaded_media:
 *                       type: integer
 *                     download_percentage:
 *                       type: integer
 *                 search:
 *                   type: object
 *                   properties:
 *                     index_name:
 *                       type: string
 *                     total_documents:
 *                       type: integer
 *                     is_indexing:
 *                       type: boolean
 *       500:
 *         description: Failed to fetch status
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        // Get database stats
        const dbStats = await pool.query(`
            SELECT 
                COUNT(*) as total_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Active') as active_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Pending') as pending_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Closed') as closed_properties,
                COUNT(*) FILTER (WHERE mlg_can_view = true) as viewable_properties,
                MAX(modification_timestamp) as latest_property_update,
                MIN(modification_timestamp) as oldest_property_update,
                COUNT(DISTINCT city) as unique_cities,
                AVG(list_price)::numeric(12,2) as avg_list_price,
                MAX(list_price) as max_list_price,
                MIN(list_price) as min_list_price
            FROM mls.properties
        `);

        // Get media stats
        const mediaStats = await pool.query(`
            SELECT 
                COUNT(*) as total_media,
                COUNT(*) FILTER (WHERE media_category = 'Photo') as total_photos,
                COUNT(*) FILTER (WHERE local_url IS NOT NULL) as downloaded_media,
                COUNT(DISTINCT listing_key) as properties_with_media
            FROM mls.media
        `);

        // Get sync state - prioritize Property resource for high water mark
        const syncState = await pool.query(`
            SELECT
                resource,
                originating_system_name,
                last_modification_ts,
                last_run_at,
                EXTRACT(EPOCH FROM (NOW() - last_run_at))::integer as seconds_since_last_sync
            FROM mls.sync_state
            ORDER BY
                CASE WHEN resource = 'Property' THEN 0 ELSE 1 END,
                last_run_at DESC
        `);

        // Get Meilisearch stats
        const index = searchClient.index(INDEX_NAME);
        const meiliStats = await index.getStats();
        const meiliSettings = await index.getSettings();

        // Calculate data freshness
        const lastSync = syncState.rows[0];
        const secondsSinceSync = lastSync?.seconds_since_last_sync || 0;
        const minutesSinceSync = Math.floor(secondsSinceSync / 60);

        // Determine sync health
        const syncInterval = parseInt(process.env.ETL_INTERVAL_MINUTES || '5', 10);
        const isHealthy = minutesSinceSync <= syncInterval * 2; // Allow 2x interval before warning

        // Get property type breakdown
        const propertyTypes = await pool.query(`
            SELECT 
                property_type,
                COUNT(*) as count
            FROM mls.properties
            WHERE property_type IS NOT NULL
            GROUP BY property_type
            ORDER BY count DESC
            LIMIT 10
        `);

        // Get city breakdown (top 10)
        const topCities = await pool.query(`
            SELECT 
                city,
                COUNT(*) as count,
                AVG(list_price)::numeric(12,2) as avg_price
            FROM mls.properties
            WHERE city IS NOT NULL AND standard_status = 'Active'
            GROUP BY city
            ORDER BY count DESC
            LIMIT 10
        `);

        res.json({
            status: 'ok',
            timestamp: new Date().toISOString(),
            sync: {
                health: isHealthy ? 'healthy' : 'warning',
                last_sync: lastSync?.last_run_at || null,
                minutes_since_last_sync: minutesSinceSync,
                sync_interval_minutes: syncInterval,
                high_water_mark: lastSync?.last_modification_ts || null,
                originating_system: lastSync?.originating_system_name || null,
            },
            database: {
                total_properties: parseInt(dbStats.rows[0].total_properties),
                active_properties: parseInt(dbStats.rows[0].active_properties),
                pending_properties: parseInt(dbStats.rows[0].pending_properties),
                closed_properties: parseInt(dbStats.rows[0].closed_properties),
                viewable_properties: parseInt(dbStats.rows[0].viewable_properties),
                latest_property_update: dbStats.rows[0].latest_property_update,
                oldest_property_update: dbStats.rows[0].oldest_property_update,
                unique_cities: parseInt(dbStats.rows[0].unique_cities),
                price_stats: {
                    average: parseFloat(dbStats.rows[0].avg_list_price || 0),
                    max: parseFloat(dbStats.rows[0].max_list_price || 0),
                    min: parseFloat(dbStats.rows[0].min_list_price || 0),
                },
            },
            media: {
                total_media: parseInt(mediaStats.rows[0].total_media),
                total_photos: parseInt(mediaStats.rows[0].total_photos),
                downloaded_media: parseInt(mediaStats.rows[0].downloaded_media),
                properties_with_media: parseInt(mediaStats.rows[0].properties_with_media),
                download_percentage: mediaStats.rows[0].total_media > 0
                    ? Math.round((mediaStats.rows[0].downloaded_media / mediaStats.rows[0].total_media) * 100)
                    : 0,
            },
            search: {
                index_name: INDEX_NAME,
                total_documents: meiliStats.numberOfDocuments,
                is_indexing: meiliStats.isIndexing,
                filterable_attributes_configured: (meiliSettings.filterableAttributes?.length || 0) > 0,
                sortable_attributes_configured: (meiliSettings.sortableAttributes?.length || 0) > 0,
            },
            breakdown: {
                property_types: propertyTypes.rows,
                top_cities: topCities.rows.map(row => ({
                    city: row.city,
                    count: parseInt(row.count),
                    avg_price: parseFloat(row.avg_price || 0),
                })),
            },
        });
    } catch (error) {
        console.error('Status endpoint error:', error);
        res.status(500).json({
            status: 'error',
            error: 'Failed to fetch status',
            timestamp: new Date().toISOString(),
        });
    }
});

export default router;