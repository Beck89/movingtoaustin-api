import { Router, Request, Response } from 'express';
import pool from '../db.js';
import searchClient, { INDEX_NAME } from '../search.js';

const router = Router();

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

        // Get sync state
        const syncState = await pool.query(`
            SELECT 
                resource,
                originating_system_name,
                last_modification_ts,
                last_run_at,
                EXTRACT(EPOCH FROM (NOW() - last_run_at))::integer as seconds_since_last_sync
            FROM mls.sync_state
            ORDER BY last_run_at DESC
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