import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

/**
 * @swagger
 * /api/stats:
 *   get:
 *     summary: Get public listing statistics
 *     description: Returns aggregate statistics about listings including homes for sale, homes for rent, and new listings in the last 30 days
 *     tags: [Stats]
 *     responses:
 *       200:
 *         description: Statistics retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 homes_for_sale:
 *                   type: integer
 *                   description: Number of active residential properties for sale
 *                   example: 1250
 *                 homes_for_rent:
 *                   type: integer
 *                   description: Number of active residential lease properties
 *                   example: 340
 *                 new_listings_30_days:
 *                   type: integer
 *                   description: Number of new listings added in the last 30 days
 *                   example: 425
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                   description: When the stats were generated
 *       500:
 *         description: Failed to fetch statistics
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (_req: Request, res: Response) => {
    try {
        const statsResult = await pool.query(`
            SELECT 
                COUNT(*) FILTER (
                    WHERE property_type = 'Residential' 
                    AND standard_status = 'Active'
                    AND mlg_can_view = true
                ) as homes_for_sale,
                COUNT(*) FILTER (
                    WHERE property_type = 'Residential Lease' 
                    AND standard_status = 'Active'
                    AND mlg_can_view = true
                ) as homes_for_rent,
                COUNT(*) FILTER (
                    WHERE original_entry_timestamp >= NOW() - INTERVAL '30 days'
                    AND standard_status = 'Active'
                    AND mlg_can_view = true
                ) as new_listings_30_days
            FROM mls.properties
        `);

        const stats = statsResult.rows[0];

        res.json({
            homes_for_sale: parseInt(stats.homes_for_sale) || 0,
            homes_for_rent: parseInt(stats.homes_for_rent) || 0,
            new_listings_30_days: parseInt(stats.new_listings_30_days) || 0,
            timestamp: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Stats endpoint error:', error);
        res.status(500).json({
            error: 'Failed to fetch statistics',
            timestamp: new Date().toISOString(),
        });
    }
});

export default router;
