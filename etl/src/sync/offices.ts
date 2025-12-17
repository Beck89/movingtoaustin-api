/**
 * Office sync operations for MLS Grid ETL
 */
import pool, { ORIGINATING_SYSTEM, getHighWaterMark, setHighWaterMark } from '../db.js';
import { fetchMLSData } from '../mls-client.js';

const BATCH_SIZE = parseInt(process.env.ETL_BATCH_SIZE || '100', 10);
const MAX_OFFICES = process.env.ETL_MAX_OFFICES && 
    process.env.ETL_MAX_OFFICES.trim() !== '' && 
    process.env.ETL_MAX_OFFICES !== 'no_limit' 
    ? parseInt(process.env.ETL_MAX_OFFICES, 10) 
    : null;

/**
 * Sync offices from MLS Grid
 */
export async function syncOffices(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting office sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('Office');
    let maxTimestamp = highWater;

    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Office?$filter=${encodeURIComponent(filterString)}&$top=${BATCH_SIZE}`;
    let totalProcessed = 0;

    // Rate limiting tracking
    let requestCount = 0;
    let hourlyStartTime = Date.now();

    if (MAX_OFFICES) {
        console.log(`⚠️  MAX_OFFICES limit set to ${MAX_OFFICES} (for testing)`);
    }

    while (nextLink) {
        if (MAX_OFFICES && totalProcessed >= MAX_OFFICES) {
            console.log(`Reached MAX_OFFICES limit of ${MAX_OFFICES}. Stopping sync.`);
            break;
        }

        let endpoint = nextLink;
        if (nextLink.startsWith('http')) {
            const url = new URL(nextLink);
            const pathname = url.pathname.replace(/^\/v2/, '');
            endpoint = pathname + url.search;
        }

        // Rate limiting check
        const elapsed = Date.now() - hourlyStartTime;
        if (requestCount >= 7000) {
            if (elapsed < 3600000) {
                const waitTime = 3600000 - elapsed;
                console.log(`⏳ Rate limit: ${requestCount} requests. Waiting ${Math.round(waitTime / 60000)}min...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                requestCount = 0;
                hourlyStartTime = Date.now();
            } else {
                requestCount = 0;
                hourlyStartTime = Date.now();
            }
        }

        const data = await fetchMLSData(endpoint, {});
        requestCount++;
        const offices: any[] = data.value || [];

        console.log(`Processing batch of ${offices.length} offices`);

        for (const office of offices) {
            if (MAX_OFFICES && totalProcessed >= MAX_OFFICES) break;

            try {
                const query = `
                    INSERT INTO mls.offices (
                        office_key, office_name, originating_system_name, raw, updated_at
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (office_key) DO UPDATE SET
                        office_name = EXCLUDED.office_name,
                        raw = EXCLUDED.raw,
                        updated_at = NOW()
                `;

                await pool.query(query, [
                    office.OfficeKey,
                    office.OfficeName,
                    office.OriginatingSystemName,
                    JSON.stringify(office),
                ]);

                if (!maxTimestamp || office.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = office.ModificationTimestamp;
                }

                totalProcessed++;
            } catch (error) {
                console.error(`Failed to process office ${office.OfficeKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;

        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('Office', maxTimestamp);
        console.log(`Updated office high-water mark to ${maxTimestamp}`);
    }

    console.log(`Office sync complete. Processed ${totalProcessed} offices`);
}
