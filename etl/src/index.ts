import pg from 'pg';
import { MeiliSearch } from 'meilisearch';
import PQueue from 'p-queue';
import pRetry from 'p-retry';
import dotenv from 'dotenv';
import { fetchMLSData } from './mls-client.js';
import { downloadAndUploadMedia } from './storage.js';

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

// Queue for media downloads (limit concurrency)
const mediaQueue = new PQueue({ concurrency: 5 });

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
                    { retries: 3 }
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
        filters.push(`ModificationTimestamp gt ${highWater}`);
    }

    const filterString = filters.join(' and ');

    let nextLink: string | null = `/Property?$filter=${encodeURIComponent(filterString)}&$expand=Media&$top=${BATCH_SIZE}&$orderby=ModificationTimestamp asc`;
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

        // Small delay between batches
        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 1000));
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

async function runETL(): Promise<void> {
    try {
        await syncProperties();
    } catch (error) {
        console.error('ETL error:', error);
    }
}

// Initialize: Configure Meilisearch, then start ETL
async function initialize(): Promise<void> {
    console.log(`Starting ETL worker (interval: ${INTERVAL_MINUTES} minutes)`);

    try {
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