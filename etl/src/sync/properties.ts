/**
 * Property sync operations for MLS Grid ETL
 */
import pool, {
    ORIGINATING_SYSTEM,
    getHighWaterMark,
    setHighWaterMark,
    upsertProperty,
    upsertRooms,
    upsertUnitTypes,
    upsertMediaMetadata,
} from '../db.js';
import { fetchMLSData } from '../mls-client.js';
import { indexPropertyToSearch } from '../search.js';
import { queueMediaDownloads } from '../media-queue.js';
import type { Property } from '../types.js';

// Configuration
const BATCH_SIZE = parseInt(process.env.ETL_BATCH_SIZE || '100', 10);
const MAX_PROPERTIES = process.env.ETL_MAX_PROPERTIES && 
    process.env.ETL_MAX_PROPERTIES.trim() !== '' && 
    process.env.ETL_MAX_PROPERTIES !== 'no_limit' 
    ? parseInt(process.env.ETL_MAX_PROPERTIES, 10) 
    : null;

/**
 * Sync properties from MLS Grid
 */
export async function syncProperties(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting property sync for ${ORIGINATING_SYSTEM}`);

    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⚠️  S3/R2 storage not configured - media will not be downloaded');
    }

    let highWater = await getHighWaterMark('Property');
    let maxTimestamp: string | null = null;
    console.log(`📍 Starting sync with high water mark: ${highWater || 'none'}`);

    // Build filter - following MLS Grid best practices
    const filters = [
        `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
        `MlgCanView eq true`,
    ];

    if (highWater) {
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Property?$filter=${encodeURIComponent(filterString)}&$expand=Media,Rooms,UnitTypes&$top=${BATCH_SIZE}&$orderby=ModificationTimestamp asc`;
    let totalProcessed = 0;

    if (MAX_PROPERTIES) {
        console.log(`⚠️  MAX_PROPERTIES limit set to ${MAX_PROPERTIES} (for testing)`);
    }

    while (nextLink) {
        if (MAX_PROPERTIES && totalProcessed >= MAX_PROPERTIES) {
            console.log(`Reached MAX_PROPERTIES limit of ${MAX_PROPERTIES}. Stopping sync.`);
            break;
        }

        // Handle @odata.nextLink URLs
        let endpoint = nextLink;
        if (nextLink.startsWith('http')) {
            const url = new URL(nextLink);
            const pathname = url.pathname.replace(/^\/v2/, '');
            endpoint = pathname + url.search;
        }

        const data = await fetchMLSData(endpoint, {});
        const properties: Property[] = data.value || [];

        console.log(`Processing batch of ${properties.length} properties`);

        for (const property of properties) {
            if (MAX_PROPERTIES && totalProcessed >= MAX_PROPERTIES) {
                break;
            }

            try {
                // Database operations
                await upsertProperty(property);
                await upsertMediaMetadata(property.ListingKey, property.Media || []);
                await upsertRooms(property.ListingKey, property.Rooms || []);
                await upsertUnitTypes(property.ListingKey, property.UnitTypes || []);
                
                // Search indexing
                await indexPropertyToSearch(property);

                // Queue media downloads if configured
                if (s3Configured && property.Media && property.Media.length > 0) {
                    await queueMediaDownloads(property.ListingKey, property.Media, property.PhotosChangeTimestamp);
                }

                // Track max timestamp
                if (!maxTimestamp || property.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = property.ModificationTimestamp;
                }

                totalProcessed++;
            } catch (error) {
                console.error(`Failed to process property ${property.ListingKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;

        // Update high-water mark after each batch
        if (maxTimestamp) {
            const shouldUpdate = !highWater || maxTimestamp > highWater;
            if (shouldUpdate) {
                await setHighWaterMark('Property', maxTimestamp);
                console.log(`📍 Updated high-water mark: ${highWater || 'none'} -> ${maxTimestamp}`);
                highWater = maxTimestamp;
            }
        }

        // Rate limiting between batches
        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    console.log(`Sync complete. Processed ${totalProcessed} properties`);
}

/**
 * Sync deletions (MlgCanView=false)
 */
export async function syncDeletions(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Checking for deleted properties for ${ORIGINATING_SYSTEM}`);

    // Skip if too few properties
    const countResult = await pool.query(
        'SELECT COUNT(*) FROM mls.properties WHERE originating_system_name = $1',
        [ORIGINATING_SYSTEM]
    );
    const propertyCount = parseInt(countResult.rows[0].count, 10);

    if (propertyCount < 500) {
        console.log(`⏭️  Skipping deletion sync - only ${propertyCount} properties in database`);
        return;
    }

    const highWater = await getHighWaterMark('PropertyDeletions');
    let maxTimestamp = highWater;

    const filters = [
        `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
        `MlgCanView eq false`,
    ];

    if (highWater) {
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Property?$filter=${encodeURIComponent(filterString)}&$select=ListingKey,ModificationTimestamp&$top=${BATCH_SIZE}`;
    let totalDeleted = 0;

    // Import delete functions lazily to avoid circular dependencies
    const { deleteMediaForListing } = await import('../storage.js');
    const { deleteFromSearch } = await import('../search.js');

    while (nextLink) {
        let endpoint = nextLink;
        if (nextLink.startsWith('http')) {
            const url = new URL(nextLink);
            const pathname = url.pathname.replace(/^\/v2/, '');
            endpoint = pathname + url.search;
        }

        const data = await fetchMLSData(endpoint, {});
        const properties: Property[] = data.value || [];

        console.log(`Found ${properties.length} properties marked for deletion`);

        for (const property of properties) {
            try {
                await deleteMediaForListing(property.ListingKey, ORIGINATING_SYSTEM);
                await pool.query('DELETE FROM mls.properties WHERE listing_key = $1', [property.ListingKey]);
                await deleteFromSearch(property.ListingKey);

                if (!maxTimestamp || property.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = property.ModificationTimestamp;
                }

                totalDeleted++;
                console.log(`Deleted property ${property.ListingKey}`);
            } catch (error) {
                console.error(`Failed to delete property ${property.ListingKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;
    }

    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('PropertyDeletions', maxTimestamp);
        console.log(`Updated deletion high-water mark to ${maxTimestamp}`);
    }

    console.log(`Deletion sync complete. Removed ${totalDeleted} properties`);
}
