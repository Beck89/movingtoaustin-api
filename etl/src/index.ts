import pg from 'pg';
import { MeiliSearch } from 'meilisearch';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import dotenv from 'dotenv';
import { fetchMLSData } from './mls-client.js';
import { downloadAndUploadMedia, deleteMediaForListing } from './storage.js';
import { performReset } from './reset.js';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.PG_URL,
    max: 10,
});

const searchClient = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';
const ORIGINATING_SYSTEM = process.env.ORIGINATING_SYSTEM || 'ACTRIS';
const BATCH_SIZE = parseInt(process.env.ETL_BATCH_SIZE || '100', 10);
const INTERVAL_MINUTES = parseInt(process.env.ETL_INTERVAL_MINUTES || '5', 10);
const MAX_PROPERTIES = process.env.ETL_MAX_PROPERTIES ? parseInt(process.env.ETL_MAX_PROPERTIES, 10) : null;
const MAX_MEMBERS = process.env.ETL_MAX_MEMBERS ? parseInt(process.env.ETL_MAX_MEMBERS, 10) : null;
const MAX_OFFICES = process.env.ETL_MAX_OFFICES ? parseInt(process.env.ETL_MAX_OFFICES, 10) : null;
const MAX_OPENHOUSES = process.env.ETL_MAX_OPENHOUSES ? parseInt(process.env.ETL_MAX_OPENHOUSES, 10) : null;

// Queue for media downloads
// Rate limiting is handled by the centralized rate limiter in storage.ts
const mediaQueue = new PQueue({
    concurrency: 1,  // Only 1 download at a time to avoid overwhelming the system
});

interface Property {
    ListingKey: string;
    ListingId?: string;
    OriginatingSystemName: string;
    StandardStatus?: string;
    PropertyType?: string;
    PropertySubType?: string;
    MlgCanView: boolean;
    MlgCanUse?: string[];
    ModificationTimestamp: string;
    PhotosChangeTimestamp?: string;
    ListPrice?: number;
    ClosePrice?: number;
    BedroomsTotal?: number;
    BathroomsFull?: number;
    BathroomsHalf?: number;
    LivingArea?: number;
    YearBuilt?: number;
    LotSizeAcres?: number;
    Latitude?: number;
    Longitude?: number;
    City?: string;
    StateOrProvince?: string;
    PostalCode?: string;
    CountyOrParish?: string;
    SubdivisionName?: string;
    UnparsedAddress?: string;
    DaysOnMarket?: number;
    PublicRemarks?: string;
    VirtualTourURLBranded?: string;
    VirtualTourURLUnbranded?: string;
    Media?: Media[];
    Rooms?: Room[];
    UnitTypes?: UnitType[];
    [key: string]: any;
}

interface Media {
    MediaKey: string;
    MediaModificationTimestamp: string;
    MediaCategory?: string;
    Order?: number;
    MediaURL?: string;
    ShortDescription?: string;
    ImageWidth?: number;
    ImageHeight?: number;
}

interface Room {
    RoomType?: string;
    RoomLevel?: string;
    RoomLength?: number;
    RoomWidth?: number;
    [key: string]: any;
}

interface UnitType {
    BedroomsTotal?: number;
    BathroomsTotalInteger?: number;
    RentCurrent?: number;
    RentMinimum?: number;
    RentMaximum?: number;
    [key: string]: any;
}

async function getHighWaterMark(resource: string): Promise<string | null> {
    const result = await pool.query(
        `SELECT last_modification_ts FROM mls.sync_state 
     WHERE resource = $1 AND originating_system_name = $2`,
        [resource, ORIGINATING_SYSTEM]
    );
    return result.rows[0]?.last_modification_ts || null;
}

async function setHighWaterMark(resource: string, timestamp: string): Promise<void> {
    await pool.query(
        `INSERT INTO mls.sync_state (resource, originating_system_name, last_modification_ts, last_run_at)
     VALUES ($1, $2, $3, NOW())
     ON CONFLICT (resource) 
     DO UPDATE SET last_modification_ts = $3, last_run_at = NOW()`,
        [resource, ORIGINATING_SYSTEM, timestamp]
    );
}

// Helper to safely convert to integer (handles decimal strings)
function toInteger(value: any): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? null : Math.round(num);
}

async function upsertProperty(property: Property): Promise<void> {
    const query = `
    INSERT INTO mls.properties (
      listing_key, listing_id, originating_system_name, standard_status,
      property_type, property_sub_type, mlg_can_view, mlg_can_use,
      modification_timestamp, photos_change_timestamp, list_price, close_price,
      bedrooms_total, bathrooms_full, bathrooms_half, living_area, year_built,
      lot_size_acres, latitude, longitude, city, state_or_province, postal_code,
      county_or_parish, subdivision_name, address_full, days_on_market,
      remarks_public, virtual_tour_url_branded, virtual_tour_url_unbranded,
      photo_count, raw
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
      $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32
    )
    ON CONFLICT (listing_key) DO UPDATE SET
      listing_id = EXCLUDED.listing_id,
      standard_status = EXCLUDED.standard_status,
      property_type = EXCLUDED.property_type,
      property_sub_type = EXCLUDED.property_sub_type,
      mlg_can_view = EXCLUDED.mlg_can_view,
      mlg_can_use = EXCLUDED.mlg_can_use,
      modification_timestamp = EXCLUDED.modification_timestamp,
      photos_change_timestamp = EXCLUDED.photos_change_timestamp,
      list_price = EXCLUDED.list_price,
      close_price = EXCLUDED.close_price,
      bedrooms_total = EXCLUDED.bedrooms_total,
      bathrooms_full = EXCLUDED.bathrooms_full,
      bathrooms_half = EXCLUDED.bathrooms_half,
      living_area = EXCLUDED.living_area,
      year_built = EXCLUDED.year_built,
      lot_size_acres = EXCLUDED.lot_size_acres,
      latitude = EXCLUDED.latitude,
      longitude = EXCLUDED.longitude,
      city = EXCLUDED.city,
      state_or_province = EXCLUDED.state_or_province,
      postal_code = EXCLUDED.postal_code,
      county_or_parish = EXCLUDED.county_or_parish,
      subdivision_name = EXCLUDED.subdivision_name,
      address_full = EXCLUDED.address_full,
      days_on_market = EXCLUDED.days_on_market,
      remarks_public = EXCLUDED.remarks_public,
      virtual_tour_url_branded = EXCLUDED.virtual_tour_url_branded,
      virtual_tour_url_unbranded = EXCLUDED.virtual_tour_url_unbranded,
      photo_count = EXCLUDED.photo_count,
      raw = EXCLUDED.raw,
      updated_at = NOW()
  `;

    const photoCount = property.Media?.length || 0;

    await pool.query(query, [
        property.ListingKey,
        property.ListingId,
        property.OriginatingSystemName,
        property.StandardStatus,
        property.PropertyType,
        property.PropertySubType,
        property.MlgCanView,
        property.MlgCanUse || [],
        property.ModificationTimestamp,
        property.PhotosChangeTimestamp,
        property.ListPrice,
        property.ClosePrice,
        toInteger(property.BedroomsTotal),
        toInteger(property.BathroomsFull),
        toInteger(property.BathroomsHalf),
        toInteger(property.LivingArea), // Fix: convert decimal strings to integers
        toInteger(property.YearBuilt),
        property.LotSizeAcres,
        property.Latitude,
        property.Longitude,
        property.City,
        property.StateOrProvince,
        property.PostalCode,
        property.CountyOrParish,
        property.SubdivisionName,
        property.UnparsedAddress,
        toInteger(property.DaysOnMarket),
        property.PublicRemarks,
        property.VirtualTourURLBranded,
        property.VirtualTourURLUnbranded,
        photoCount,
        JSON.stringify(property),
    ]);
}

async function upsertRooms(listingKey: string, rooms: Room[]): Promise<void> {
    if (!rooms || rooms.length === 0) return;

    // Delete existing rooms for this listing
    await pool.query('DELETE FROM mls.rooms WHERE listing_key = $1', [listingKey]);

    for (const room of rooms) {
        const query = `
            INSERT INTO mls.rooms (
                listing_key, room_type, room_level, room_length, room_width, raw
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await pool.query(query, [
            listingKey,
            room.RoomType,
            room.RoomLevel,
            room.RoomLength,
            room.RoomWidth,
            JSON.stringify(room),
        ]);
    }
}

async function upsertUnitTypes(listingKey: string, unitTypes: UnitType[]): Promise<void> {
    if (!unitTypes || unitTypes.length === 0) return;

    // Delete existing unit types for this listing
    await pool.query('DELETE FROM mls.unit_types WHERE listing_key = $1', [listingKey]);

    for (const unit of unitTypes) {
        const query = `
            INSERT INTO mls.unit_types (
                listing_key, bedrooms, bathrooms, rent_min, rent_max, raw
            ) VALUES ($1, $2, $3, $4, $5, $6)
        `;

        await pool.query(query, [
            listingKey,
            unit.BedroomsTotal,
            unit.BathroomsTotalInteger,
            unit.RentMinimum || unit.RentCurrent,
            unit.RentMaximum || unit.RentCurrent,
            JSON.stringify(unit),
        ]);
    }
}

async function upsertMedia(listingKey: string, media: Media[]): Promise<void> {
    if (!media || media.length === 0) return;

    for (const item of media) {
        const query = `
      INSERT INTO mls.media (
        media_key, listing_key, media_modification_ts, media_category,
        order_sequence, media_url, caption, width, height, raw
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
      ON CONFLICT (media_key) DO UPDATE SET
        media_modification_ts = EXCLUDED.media_modification_ts,
        media_category = EXCLUDED.media_category,
        order_sequence = EXCLUDED.order_sequence,
        media_url = EXCLUDED.media_url,
        caption = EXCLUDED.caption,
        width = EXCLUDED.width,
        height = EXCLUDED.height,
        raw = EXCLUDED.raw,
        updated_at = NOW()
    `;

        await pool.query(query, [
            item.MediaKey,
            listingKey,
            item.MediaModificationTimestamp,
            item.MediaCategory,
            item.Order,
            item.MediaURL,
            item.ShortDescription,
            item.ImageWidth,
            item.ImageHeight,
            JSON.stringify(item),
        ]);

        // Queue media download (only if S3 is configured)
        const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
            process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

        // Download if URL exists and it's a photo (or category is null but URL looks like an image)
        const isPhoto = item.MediaCategory === 'Photo' ||
            (!item.MediaCategory && item.MediaURL && /\.(jpg|jpeg|png|gif|webp)$/i.test(item.MediaURL));

        if (item.MediaURL && isPhoto && s3Configured) {
            mediaQueue.add(() =>
                pRetry(
                    () => downloadAndUploadMedia(item.MediaURL!, listingKey, item.Order || 0, item.MediaCategory || 'Photo'),
                    {
                        retries: 5,  // Increased from 3
                        minTimeout: 10000,  // Start with 10 second delay
                        maxTimeout: 60000,  // Max 60 second delay
                        factor: 2,  // Exponential backoff
                        onFailedAttempt: (error) => {
                            console.log(`Media download attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Waiting ${error.attemptNumber * 10}s before retry...`);
                        }
                    }
                ).then(async (localUrl) => {
                    await pool.query(
                        `UPDATE mls.media SET local_url = $1 WHERE media_key = $2`,
                        [localUrl, item.MediaKey]
                    );
                }).catch((err) => {
                    console.error(`Failed to download media ${item.MediaKey}:`, err);
                })
            );
        }
    }
}

async function indexPropertyToSearch(property: Property): Promise<void> {
    const doc = {
        id: property.ListingKey, // Meilisearch requires 'id' field
        listing_key: property.ListingKey,
        listing_id: property.ListingId,
        originating_system: property.OriginatingSystemName,
        standard_status: property.StandardStatus,
        mlg_can_view: property.MlgCanView,
        mlg_can_use: property.MlgCanUse || [],
        property_type: property.PropertyType,
        property_sub_type: property.PropertySubType,
        list_price: property.ListPrice,
        bedrooms_total: toInteger(property.BedroomsTotal),
        bathrooms_full: toInteger(property.BathroomsFull),
        living_area: toInteger(property.LivingArea),
        year_built: toInteger(property.YearBuilt),
        lot_size_acres: property.LotSizeAcres,
        city: property.City,
        state_or_province: property.StateOrProvince,
        postal_code: property.PostalCode,
        county_or_parish: property.CountyOrParish,
        subdivision_name: property.SubdivisionName,
        address_full: property.UnparsedAddress,
        remarks_public: property.PublicRemarks,
        photo_count: property.Media?.length || 0,
        primary_photo_url: property.Media?.[0]?.MediaURL,
        _geo: property.Latitude && property.Longitude
            ? { lat: property.Latitude, lng: property.Longitude }
            : undefined,
        modification_timestamp: new Date(property.ModificationTimestamp).getTime(),
        photos_change_timestamp: property.PhotosChangeTimestamp
            ? new Date(property.PhotosChangeTimestamp).getTime()
            : undefined,
    };

    const index = searchClient.index(INDEX_NAME);
    await index.addDocuments([doc], { primaryKey: 'id' });
}

// Configure Meilisearch index settings on startup
async function configureMeilisearchIndex(): Promise<void> {
    console.log('🔧 Configuring Meilisearch index...');

    try {
        const index = searchClient.index(INDEX_NAME);

        // Try to get settings - if index doesn't exist, create it first
        let settings;
        try {
            settings = await index.getSettings();
        } catch (error: any) {
            if (error.code === 'index_not_found') {
                console.log('  - Index does not exist, creating it...');
                // Create index by adding an empty document (Meilisearch creates index automatically)
                await searchClient.createIndex(INDEX_NAME, { primaryKey: 'id' });
                console.log('  - Index created successfully');
                settings = null; // Force configuration
            } else {
                throw error;
            }
        }

        // Only configure if filterableAttributes is empty (not yet configured)
        if (!settings || !settings.filterableAttributes || settings.filterableAttributes.length === 0) {
            console.log('  - Setting filterable attributes...');
            await index.updateFilterableAttributes([
                'mlg_can_view',
                'standard_status',
                'property_type',
                'property_sub_type',
                'city',
                'state_or_province',
                'postal_code',
                'county_or_parish',
                'list_price',
                'bedrooms_total',
                'bathrooms_full',
                'living_area',
                'year_built',
                'features',
            ]);

            console.log('  - Setting sortable attributes...');
            await index.updateSortableAttributes([
                'list_price',
                'modification_timestamp',
                'bedrooms_total',
                'bathrooms_full',
                'living_area',
                'year_built',
            ]);

            console.log('  - Setting searchable attributes...');
            await index.updateSearchableAttributes([
                'address_full',
                'city',
                'postal_code',
                'subdivision_name',
                'listing_id',
                'remarks_public',
            ]);

            console.log('✅ Meilisearch index configured successfully!');
        } else {
            console.log('✅ Meilisearch index already configured');
        }
    } catch (error) {
        console.error('❌ Failed to configure Meilisearch index:', error);
        throw error;
    }
}

async function syncDeletions(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Checking for deleted properties (MlgCanView=false) for ${ORIGINATING_SYSTEM}`);

    // Skip deletion sync if we have very few properties (likely a fresh start/reset)
    const countResult = await pool.query('SELECT COUNT(*) FROM mls.properties WHERE originating_system_name = $1', [ORIGINATING_SYSTEM]);
    const propertyCount = parseInt(countResult.rows[0].count, 10);

    if (propertyCount < 500) {
        console.log(`⏭️  Skipping deletion sync - only ${propertyCount} properties in database (likely fresh start)`);
        console.log(`   Deletion sync will run once you have 500+ properties`);
        return;
    }

    const highWater = await getHighWaterMark('PropertyDeletions');
    let maxTimestamp = highWater;

    // Build filter for deleted properties (MlgCanView=false)
    const filters = [
        `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
        `MlgCanView eq false`,
    ];

    if (highWater) {
        // Ensure timestamp is in ISO 8601 format for MLS Grid API
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Property?$filter=${encodeURIComponent(filterString)}&$select=ListingKey,ModificationTimestamp&$top=${BATCH_SIZE}`;
    let totalDeleted = 0;

    while (nextLink) {
        // If nextLink is a full URL, extract just the path and query
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
                // Delete media files from storage first
                await deleteMediaForListing(property.ListingKey, ORIGINATING_SYSTEM);

                // Delete from database (CASCADE will handle media, rooms, unit_types)
                await pool.query(
                    'DELETE FROM mls.properties WHERE listing_key = $1',
                    [property.ListingKey]
                );

                // Delete from search index
                const index = searchClient.index(INDEX_NAME);
                await index.deleteDocument(property.ListingKey);

                // Track max timestamp
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

    // Update high-water mark for deletions
    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('PropertyDeletions', maxTimestamp);
        console.log(`Updated deletion high-water mark to ${maxTimestamp}`);
    }

    console.log(`Deletion sync complete. Removed ${totalDeleted} properties`);
}

async function syncProperties(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting property sync for ${ORIGINATING_SYSTEM}`);

    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⚠️  S3/R2 storage not configured - media will not be downloaded');
        console.log('   Media URLs will point to MLS Grid (configure S3 in .env to download)');
    }

    const highWater = await getHighWaterMark('Property');
    let maxTimestamp = highWater;

    // Build filter
    const filters = [
        `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
        `MlgCanView eq true`,
    ];

    if (highWater) {
        // Ensure timestamp is in ISO 8601 format for MLS Grid API
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
        // Check if we've hit the max properties limit
        if (MAX_PROPERTIES && totalProcessed >= MAX_PROPERTIES) {
            console.log(`Reached MAX_PROPERTIES limit of ${MAX_PROPERTIES}. Stopping sync.`);
            break;
        }
        // If nextLink is a full URL (from @odata.nextLink), extract just the path and query
        let endpoint = nextLink;
        if (nextLink.startsWith('http')) {
            const url = new URL(nextLink);
            // Remove /v2 prefix from pathname since fetchMLSData will add it via baseUrl
            const pathname = url.pathname.replace(/^\/v2/, '');
            endpoint = pathname + url.search;
        }

        const data = await fetchMLSData(endpoint, {});
        const properties: Property[] = data.value || [];

        console.log(`Processing batch of ${properties.length} properties`);

        for (const property of properties) {
            // Check if we've hit the max properties limit
            if (MAX_PROPERTIES && totalProcessed >= MAX_PROPERTIES) {
                console.log(`Reached MAX_PROPERTIES limit of ${MAX_PROPERTIES}. Stopping sync.`);
                break;
            }

            try {
                await upsertProperty(property);
                await upsertMedia(property.ListingKey, property.Media || []);
                await upsertRooms(property.ListingKey, property.Rooms || []);
                await upsertUnitTypes(property.ListingKey, property.UnitTypes || []);
                await indexPropertyToSearch(property);

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

        // Rate limiting: Minimum 500ms delay to ensure max 2 RPS
        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    // Update high-water mark
    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('Property', maxTimestamp);
        console.log(`Updated high-water mark to ${maxTimestamp}`);
    }

    console.log(`Sync complete. Processed ${totalProcessed} properties`);
    console.log('Note: Meilisearch indexes documents automatically (no manual refresh needed)');
}

async function syncMembers(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting member sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('Member');
    let maxTimestamp = highWater;

    // Build filter
    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        // Ensure timestamp is in ISO 8601 format for MLS Grid API
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Member?$filter=${encodeURIComponent(filterString)}&$top=${BATCH_SIZE}`;
    let totalProcessed = 0;

    // Rate limiting tracking
    let requestCount = 0;
    let hourlyStartTime = Date.now();

    if (MAX_MEMBERS) {
        console.log(`⚠️  MAX_MEMBERS limit set to ${MAX_MEMBERS} (for testing)`);
    }

    while (nextLink) {
        // Check if we've hit the max members limit
        if (MAX_MEMBERS && totalProcessed >= MAX_MEMBERS) {
            console.log(`Reached MAX_MEMBERS limit of ${MAX_MEMBERS}. Stopping sync.`);
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
                console.log(`⏳ Rate limit: ${requestCount} requests in ${Math.round(elapsed / 60000)}min. Waiting ${Math.round(waitTime / 60000)}min...`);
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
        const members: any[] = data.value || [];

        console.log(`Processing batch of ${members.length} members`);

        for (const member of members) {
            // Check if we've hit the max members limit
            if (MAX_MEMBERS && totalProcessed >= MAX_MEMBERS) {
                console.log(`Reached MAX_MEMBERS limit of ${MAX_MEMBERS}. Stopping sync.`);
                break;
            }

            try {
                const query = `
                    INSERT INTO mls.members (
                        member_key, member_full_name, originating_system_name, raw, updated_at
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (member_key) DO UPDATE SET
                        member_full_name = EXCLUDED.member_full_name,
                        raw = EXCLUDED.raw,
                        updated_at = NOW()
                `;

                await pool.query(query, [
                    member.MemberKey,
                    member.MemberFullName,
                    member.OriginatingSystemName,
                    JSON.stringify(member),
                ]);

                if (!maxTimestamp || member.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = member.ModificationTimestamp;
                }

                totalProcessed++;
            } catch (error) {
                console.error(`Failed to process member ${member.MemberKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;

        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('Member', maxTimestamp);
        console.log(`Updated member high-water mark to ${maxTimestamp}`);
    }

    console.log(`Member sync complete. Processed ${totalProcessed} members`);
}

async function syncOffices(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting office sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('Office');
    let maxTimestamp = highWater;

    // Build filter
    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        // Ensure timestamp is in ISO 8601 format for MLS Grid API
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
        // Check if we've hit the max offices limit
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
                console.log(`⏳ Rate limit: ${requestCount} requests in ${Math.round(elapsed / 60000)}min. Waiting ${Math.round(waitTime / 60000)}min...`);
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
            // Check if we've hit the max offices limit
            if (MAX_OFFICES && totalProcessed >= MAX_OFFICES) {
                console.log(`Reached MAX_OFFICES limit of ${MAX_OFFICES}. Stopping sync.`);
                break;
            }

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

async function syncOpenHouses(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting open house sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('OpenHouse');
    let maxTimestamp = highWater;

    // Build filter
    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        // Ensure timestamp is in ISO 8601 format for MLS Grid API
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

    let totalSeen = 0; // Track all open houses seen, not just processed

    while (nextLink) {
        // Check if we've hit the max open houses limit (based on total seen, not just processed)
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
                console.log(`⏳ Rate limit: ${requestCount} requests in ${Math.round(elapsed / 60000)}min. Waiting ${Math.round(waitTime / 60000)}min...`);
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
            totalSeen++; // Count every open house we see

            // Check if we've hit the max open houses limit
            if (MAX_OPENHOUSES && totalSeen >= MAX_OPENHOUSES) {
                console.log(`Reached MAX_OPENHOUSES limit of ${MAX_OPENHOUSES}. Stopping sync.`);
                break;
            }

            try {
                // Check if property exists before inserting open house
                const propertyExists = await pool.query(
                    'SELECT 1 FROM mls.properties WHERE listing_key = $1',
                    [openHouse.ListingKey]
                );

                if (propertyExists.rows.length === 0) {
                    console.log(`Skipping open house for non-existent property ${openHouse.ListingKey}`);
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
                    openHouse.OpenHouseStartTime,
                    openHouse.OpenHouseEndTime,
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
    }

    console.log(`Open house sync complete. Processed ${totalProcessed} open houses`);
}

async function runETL(): Promise<void> {
    try {
        // Sync active properties first
        await syncProperties();

        // Then check for deletions (MlgCanView=false)
        await syncDeletions();

        // Sync supporting resources
        await syncMembers();
        await syncOffices();
        await syncOpenHouses();
    } catch (error) {
        console.error('ETL error:', error);
    }
}

// Initialize: Configure Meilisearch, then start ETL
async function initialize(): Promise<void> {
    console.log(`Starting ETL worker (interval: ${INTERVAL_MINUTES} minutes)`);

    try {
        // Check if reset is requested
        if (process.env.ETL_RESET_ON_START === 'true') {
            console.log(`\n⚠️  ETL_RESET_ON_START=true detected`);
            await performReset(pool, searchClient, INDEX_NAME);
        }

        // Configure Meilisearch index on startup
        await configureMeilisearchIndex();

        // Run first sync
        await runETL();

        // Schedule recurring syncs
        setInterval(runETL, INTERVAL_MINUTES * 60 * 1000);
    } catch (error) {
        console.error('Failed to initialize ETL:', error);
        process.exit(1);
    }
}

initialize();