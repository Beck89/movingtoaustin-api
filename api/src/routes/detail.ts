import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

router.get('/:listing_key', async (req: Request, res: Response) => {
    try {
        const { listing_key } = req.params;

        // Get property details
        const propertyResult = await pool.query(
            `SELECT * FROM mls.properties WHERE listing_key = $1 AND mlg_can_view = true`,
            [listing_key]
        );

        if (propertyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        const property = propertyResult.rows[0];

        // Get media (prefer local_url)
        const mediaResult = await pool.query(
            `SELECT media_key, media_category, order_sequence, local_url, media_url, 
              caption, width, height
       FROM mls.media 
       WHERE listing_key = $1 
       ORDER BY order_sequence ASC`,
            [listing_key]
        );

        // Get rooms
        const roomsResult = await pool.query(
            `SELECT room_type, room_level, room_length, room_width
       FROM mls.rooms 
       WHERE listing_key = $1`,
            [listing_key]
        );

        // Get unit types
        const unitTypesResult = await pool.query(
            `SELECT bedrooms, bathrooms, rent_min, rent_max
       FROM mls.unit_types 
       WHERE listing_key = $1`,
            [listing_key]
        );

        // Get open houses
        const openHousesResult = await pool.query(
            `SELECT start_time, end_time, remarks
       FROM mls.open_houses 
       WHERE listing_key = $1 
       AND end_time > NOW()
       ORDER BY start_time ASC`,
            [listing_key]
        );

        res.json({
            property,
            media: mediaResult.rows,
            rooms: roomsResult.rows,
            unit_types: unitTypesResult.rows,
            open_houses: openHousesResult.rows,
        });
    } catch (error) {
        console.error('Detail error:', error);
        res.status(500).json({ error: 'Failed to fetch listing details' });
    }
});

export default router;