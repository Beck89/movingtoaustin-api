/**
 * Open House sync operations for MLS Grid ETL
 */
import pool, { ORIGINATING_SYSTEM, getHighWaterMark, setHighWaterMark, updateLastRun } from '../db.js';
import { fetchMLSData } from '../mls-client.js';

const BATCH_SIZE = parseInt(process.env.ETL_BATCH_SIZE || '100', 10);
const MAX_OPENHOUSES = process.env.ETL_MAX_OPENHOUSES && 
    process.env.ETL_MAX_OPENHOUSES.trim() !== '' && 
    process.env.ETL_MAX_OPENHOUSES !== 'no_limit' 
    ? parseInt(process.env.ETL_MAX_OPENHOUSES, 10) 
    : null;

/**
 * Sync open houses from MLS Grid
 */
export async function syncOpenHouses(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting open house sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('OpenHouse');
    let maxTimestamp = highWater;

    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/OpenHouse?$filter=${encodeURIComponent(filterString)}&$top=${BATCH_SIZE}`;
    let totalProcessed = 0;

    // Rate limiting tracking
    let requestCount = 0;
    let hourlyStartTime = Date.now();

    if (MAX_OPENHOUSES) {
        console.log(`⚠️  MAX_OPENHOUSES limit set to ${MAX_OPENHOUSES} (for testing)`);
    }

    let totalSeen = 0;

    while (nextLink) {
        if (MAX_OPENHOUSES && totalSeen >= MAX_OPENHOUSES) {
            console.log(`Reached MAX_OPENHOUSES limit of ${MAX_OPENHOUSES}. Stopping sync.`);
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
        const openHouses: any[] = data.value || [];

        console.log(`Processing batch of ${openHouses.length} open houses`);

        for (const openHouse of openHouses) {
            totalSeen++;

            if (MAX_OPENHOUSES && totalSeen >= MAX_OPENHOUSES) {
                console.log(`Reached MAX_OPENHOUSES limit of ${MAX_OPENHOUSES}. Stopping sync.`);
                break;
            }

            try {
                // Check if property exists
                const propertyExists = await pool.query(
                    'SELECT 1 FROM mls.properties WHERE listing_key = $1',
                    [openHouse.ListingKey]
                );

                if (propertyExists.rows.length === 0) {
                    console.log(`Skipping open house for non-existent property ${openHouse.ListingKey}`);
                    continue;
                }

                // Handle missing times using OpenHouseDate as fallback
                let startTime = openHouse.OpenHouseStartTime;
                let endTime = openHouse.OpenHouseEndTime;
                
                if (!startTime && openHouse.OpenHouseDate) {
                    startTime = `${openHouse.OpenHouseDate}T00:00:00.000Z`;
                }
                
                if (!endTime && openHouse.OpenHouseDate) {
                    endTime = `${openHouse.OpenHouseDate}T23:59:59.000Z`;
                }
                
                if (!startTime || !endTime) {
                    console.log(`Skipping open house ${openHouse.OpenHouseKey} - missing times`);
                    continue;
                }

                const query = `
                    INSERT INTO mls.open_houses (
                        listing_key, start_time, end_time, remarks, raw
                    ) VALUES ($1, $2, $3, $4, $5)
                    ON CONFLICT (id) DO NOTHING
                `;

                await pool.query(query, [
                    openHouse.ListingKey,
                    startTime,
                    endTime,
                    openHouse.OpenHouseRemarks,
                    JSON.stringify(openHouse),
                ]);

                if (!maxTimestamp || openHouse.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = openHouse.ModificationTimestamp;
                }

                totalProcessed++;
            } catch (error) {
                console.error(`Failed to process open house for ${openHouse.ListingKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;

        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('OpenHouse', maxTimestamp);
        console.log(`Updated open house high-water mark to ${maxTimestamp}`);
    } else {
        // Always update last_run_at even if no new data was found
        // This ensures the dashboard shows when sync actually ran
        await updateLastRun('OpenHouse');
    }

    console.log(`Open house sync complete. Processed ${totalProcessed} open houses`);
}
