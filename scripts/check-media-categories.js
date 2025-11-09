#!/usr/bin/env node

/**
 * Check media_category values in database
 * Run with: node scripts/check-media-categories.js
 */

import pg from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.PG_URL,
});

async function checkMediaCategories() {
    try {
        console.log('Checking media_category values...\n');

        // Check category distribution
        const categories = await pool.query(`
            SELECT 
                media_category,
                COUNT(*) as count,
                COUNT(local_url) as downloaded,
                COUNT(*) - COUNT(local_url) as missing
            FROM mls.media
            GROUP BY media_category
            ORDER BY count DESC
        `);

        console.log('Media Categories:');
        console.log('═══════════════════════════════════════════════════════');
        console.log('Category         | Total    | Downloaded | Missing');
        console.log('───────────────────────────────────────────────────────');
        for (const row of categories.rows) {
            const cat = (row.media_category || 'NULL').padEnd(16);
            const total = String(row.count).padStart(8);
            const downloaded = String(row.downloaded).padStart(10);
            const missing = String(row.missing).padStart(7);
            console.log(`${cat} | ${total} | ${downloaded} | ${missing}`);
        }
        console.log('═══════════════════════════════════════════════════════\n');

        // Sample media URLs
        const samples = await pool.query(`
            SELECT 
                media_key,
                media_category,
                media_url,
                local_url
            FROM mls.media
            WHERE local_url IS NULL
            LIMIT 10
        `);

        console.log('Sample media without local_url:');
        console.log('═══════════════════════════════════════════════════════');
        for (const row of samples.rows) {
            console.log(`\nMedia Key: ${row.media_key}`);
            console.log(`Category: ${row.media_category}`);
            console.log(`URL: ${row.media_url?.substring(0, 80)}...`);
            console.log(`Local URL: ${row.local_url}`);
        }
        console.log('═══════════════════════════════════════════════════════\n');

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await pool.end();
    }
}

checkMediaCategories();