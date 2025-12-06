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
const MEDIA_RECOVERY_BATCH_SIZE = parseInt(process.env.ETL_MEDIA_RECOVERY_BATCH_SIZE || '10', 10);
const MAX_PROPERTIES = process.env.ETL_MAX_PROPERTIES && process.env.ETL_MAX_PROPERTIES.trim() !== '' && process.env.ETL_MAX_PROPERTIES !== 'no_limit' ? parseInt(process.env.ETL_MAX_PROPERTIES, 10) : null;
const MAX_MEMBERS = process.env.ETL_MAX_MEMBERS && process.env.ETL_MAX_MEMBERS.trim() !== '' && process.env.ETL_MAX_MEMBERS !== 'no_limit' ? parseInt(process.env.ETL_MAX_MEMBERS, 10) : null;
const MAX_OFFICES = process.env.ETL_MAX_OFFICES && process.env.ETL_MAX_OFFICES.trim() !== '' && process.env.ETL_MAX_OFFICES !== 'no_limit' ? parseInt(process.env.ETL_MAX_OFFICES, 10) : null;
const MAX_OPENHOUSES = process.env.ETL_MAX_OPENHOUSES && process.env.ETL_MAX_OPENHOUSES.trim() !== '' && process.env.ETL_MAX_OPENHOUSES !== 'no_limit' ? parseInt(process.env.ETL_MAX_OPENHOUSES, 10) : null;

// Queue for media downloads
// Sequential downloads with minimal delay
// Each download takes ~900ms, so with 50ms delay = ~1 RPS
const mediaQueue = new PQueue({
    concurrency: 1,  // One at a time
    interval: 1000,  // 1 second interval
    intervalCap: 20,  // Allow bursts (rate limiter controls actual rate)
});

// Track failed media to avoid infinite retries during a single sync cycle
// Key: mediaKey, Value: { attempts: number, lastAttempt: Date, permanentlyFailed: boolean }
const failedMediaTracker = new Map<string, { attempts: number; lastAttempt: Date; permanentlyFailed: boolean }>();
const MAX_MEDIA_ATTEMPTS_PER_CYCLE = 3;  // Max attempts per sync cycle before skipping
const MEDIA_RETRY_COOLDOWN_MS = 5 * 60 * 1000;  // 5 minutes cooldown (shorter - we want to retry soon)

// Track if we're currently rate limited (global flag for API)
let isRateLimited = false;
let rateLimitResetTime: Date | null = null;

// Separate rate limit tracking for media CDN (different from API rate limits)
let isMediaCdnRateLimited = false;
let mediaCdnRateLimitResetTime: Date | null = null;

// Track media worker downloads for progress history
let mediaWorkerDownloadsThisCycle = 0;
let lastProgressRecordTime = 0;
const PROGRESS_RECORD_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

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
    OriginalListPrice?: number;
    PriceChangeTimestamp?: string;
    ClosePrice?: number;
    BedroomsTotal?: number;
    BathroomsFull?: number;
    BathroomsHalf?: number;
    BathroomsTotalInteger?: number;
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
    StreetName?: string;
    DaysOnMarket?: number;
    PublicRemarks?: string;
    VirtualTourURLBranded?: string;
    VirtualTourURLUnbranded?: string;
    ListAgentKey?: string;
    ListOfficeName?: string;
    MajorChangeType?: string;
    MajorChangeTimestamp?: string;
    OriginalEntryTimestamp?: string;
    NewConstructionYN?: boolean;
    PoolPrivateYN?: boolean;
    WaterfrontYN?: boolean;
    Levels?: string[];
    GarageSpaces?: number;
    ParkingTotal?: number;
    ElementarySchool?: string;
    HighSchoolDistrict?: string;
    AssociationFee?: number;
    AssociationFeeFrequency?: string;
    TaxAnnualAmount?: number;
    FireplacesTotal?: number;
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

// Record progress history to database
async function recordProgressHistory(): Promise<void> {
    try {
        // Check if enough time has passed since last record
        const now = Date.now();
        if (now - lastProgressRecordTime < PROGRESS_RECORD_INTERVAL_MS) {
            return;
        }
        lastProgressRecordTime = now;

        // Get current stats
        const dbStats = await pool.query(`
            SELECT
                COUNT(*) as total_properties,
                COUNT(*) FILTER (WHERE standard_status = 'Active') as active_properties
            FROM mls.properties
        `);

        const mediaStats = await pool.query(`
            SELECT
                COUNT(*) as total_media,
                COUNT(*) FILTER (WHERE local_url IS NOT NULL) as downloaded_media,
                COUNT(*) FILTER (WHERE local_url IS NULL AND (media_category IS NULL OR media_category != 'Video')) as missing_media
            FROM mls.media
        `);

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

        const totalMedia = parseInt(mediaStats.rows[0].total_media);
        const downloadedMedia = parseInt(mediaStats.rows[0].downloaded_media);
        const missingMedia = parseInt(mediaStats.rows[0].missing_media);
        const downloadPercentage = totalMedia > 0 ? Math.round((downloadedMedia / totalMedia) * 100) : 0;

        // Insert progress record
        await pool.query(`
            INSERT INTO mls.progress_history (
                total_properties, active_properties, total_media, downloaded_media,
                missing_media, download_percentage, properties_with_missing_media,
                media_worker_downloads, api_rate_limited, media_cdn_rate_limited
            ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [
            parseInt(dbStats.rows[0].total_properties),
            parseInt(dbStats.rows[0].active_properties),
            totalMedia,
            downloadedMedia,
            missingMedia,
            downloadPercentage,
            parseInt(missingMediaProps.rows[0].count),
            mediaWorkerDownloadsThisCycle,
            isRateLimited,
            isMediaCdnRateLimited
        ]);

        console.log(`📊 Progress recorded: ${downloadPercentage}% complete, ${missingMedia} missing`);
        
        // Reset counter for next cycle
        mediaWorkerDownloadsThisCycle = 0;

        // Clean up old records (keep last 7 days)
        await pool.query(`
            DELETE FROM mls.progress_history
            WHERE recorded_at < NOW() - INTERVAL '7 days'
        `);
    } catch (error: any) {
        // Don't fail the sync if progress recording fails
        // Table might not exist yet
        if (!error.message?.includes('does not exist')) {
            console.error('Failed to record progress history:', error);
        }
    }
}

async function getHighWaterMark(resource: string): Promise<string | null> {
    const result = await pool.query(
        `SELECT last_modification_ts FROM mls.sync_state
     WHERE resource = $1 AND originating_system_name = $2`,
        [resource, ORIGINATING_SYSTEM]
    );
    // PostgreSQL returns Date objects, convert to ISO string for consistent comparison
    const timestamp = result.rows[0]?.last_modification_ts;
    if (timestamp instanceof Date) {
        return timestamp.toISOString();
    }
    return timestamp || null;
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
      modification_timestamp, photos_change_timestamp, list_price, original_list_price,
      price_change_timestamp, close_price, bedrooms_total, bathrooms_full, bathrooms_half,
      bathrooms_total_integer, living_area, year_built, lot_size_acres, latitude, longitude,
      city, state_or_province, postal_code, county_or_parish, subdivision_name, address_full,
      street_name, days_on_market, remarks_public, virtual_tour_url_branded,
      virtual_tour_url_unbranded, list_agent_key, list_office_name, major_change_type,
      major_change_timestamp, original_entry_timestamp, new_construction_yn, pool_private_yn,
      waterfront_yn, levels, garage_spaces, parking_total, elementary_school,
      high_school_district, association_fee, association_fee_frequency, tax_annual_amount,
      fireplaces_total, photo_count, raw
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18,
      $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $32, $33, $34,
      $35, $36, $37, $38, $39, $40, $41, $42, $43, $44, $45, $46, $47, $48, $49, $50,
      $51, $52, $53
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
      original_list_price = EXCLUDED.original_list_price,
      price_change_timestamp = EXCLUDED.price_change_timestamp,
      close_price = EXCLUDED.close_price,
      bedrooms_total = EXCLUDED.bedrooms_total,
      bathrooms_full = EXCLUDED.bathrooms_full,
      bathrooms_half = EXCLUDED.bathrooms_half,
      bathrooms_total_integer = EXCLUDED.bathrooms_total_integer,
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
      street_name = EXCLUDED.street_name,
      days_on_market = EXCLUDED.days_on_market,
      remarks_public = EXCLUDED.remarks_public,
      virtual_tour_url_branded = EXCLUDED.virtual_tour_url_branded,
      virtual_tour_url_unbranded = EXCLUDED.virtual_tour_url_unbranded,
      list_agent_key = EXCLUDED.list_agent_key,
      list_office_name = EXCLUDED.list_office_name,
      major_change_type = EXCLUDED.major_change_type,
      major_change_timestamp = EXCLUDED.major_change_timestamp,
      original_entry_timestamp = EXCLUDED.original_entry_timestamp,
      new_construction_yn = EXCLUDED.new_construction_yn,
      pool_private_yn = EXCLUDED.pool_private_yn,
      waterfront_yn = EXCLUDED.waterfront_yn,
      levels = EXCLUDED.levels,
      garage_spaces = EXCLUDED.garage_spaces,
      parking_total = EXCLUDED.parking_total,
      elementary_school = EXCLUDED.elementary_school,
      high_school_district = EXCLUDED.high_school_district,
      association_fee = EXCLUDED.association_fee,
      association_fee_frequency = EXCLUDED.association_fee_frequency,
      tax_annual_amount = EXCLUDED.tax_annual_amount,
      fireplaces_total = EXCLUDED.fireplaces_total,
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
        property.OriginalListPrice,
        property.PriceChangeTimestamp,
        property.ClosePrice,
        toInteger(property.BedroomsTotal),
        toInteger(property.BathroomsFull),
        toInteger(property.BathroomsHalf),
        toInteger(property.BathroomsTotalInteger),
        toInteger(property.LivingArea),
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
        property.StreetName,
        toInteger(property.DaysOnMarket),
        property.PublicRemarks,
        property.VirtualTourURLBranded,
        property.VirtualTourURLUnbranded,
        property.ListAgentKey,
        property.ListOfficeName,
        property.MajorChangeType,
        property.MajorChangeTimestamp,
        property.OriginalEntryTimestamp,
        property.NewConstructionYN,
        property.PoolPrivateYN,
        property.WaterfrontYN,
        property.Levels || [],
        toInteger(property.GarageSpaces),
        toInteger(property.ParkingTotal),
        property.ElementarySchool,
        property.HighSchoolDistrict,
        property.AssociationFee,
        property.AssociationFeeFrequency,
        property.TaxAnnualAmount,
        toInteger(property.FireplacesTotal),
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

async function upsertMedia(listingKey: string, media: Media[], photosChangeTimestamp?: string): Promise<void> {
    if (!media || media.length === 0) return;

    // Check if photos have changed by comparing PhotosChangeTimestamp
    // Only download media if photos changed or if we don't have local_url yet
    const shouldCheckForChanges = photosChangeTimestamp !== undefined;

    let photosChanged = true; // Default to true if no timestamp to compare
    if (shouldCheckForChanges) {
        const result = await pool.query(
            `SELECT photos_change_timestamp FROM mls.properties WHERE listing_key = $1`,
            [listingKey]
        );

        if (result.rows.length > 0 && result.rows[0].photos_change_timestamp) {
            const existingTimestamp = new Date(result.rows[0].photos_change_timestamp).getTime();
            const newTimestamp = new Date(photosChangeTimestamp).getTime();
            photosChanged = newTimestamp > existingTimestamp;
        }
    }

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

        // Download if URL exists and it's not a video
        // Many MLS systems don't set MediaCategory, so we check the URL extension
        const isVideo = item.MediaCategory === 'Video' ||
            (item.MediaURL && /\.(mp4|mov|avi|wmv|flv|webm)$/i.test(item.MediaURL));

        // Check if we already have this media downloaded
        const existingMedia = await pool.query(
            `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
            [item.MediaKey]
        );
        const alreadyDownloaded = existingMedia.rows.length > 0;

        // Only download if:
        // 1. S3 is configured
        // 2. It's not a video
        // 3. Photos have changed OR we don't have it downloaded yet
        if (item.MediaURL && !isVideo && s3Configured && (photosChanged || !alreadyDownloaded)) {
            // Check if this media has permanently failed (404, 403)
            const failedInfo = failedMediaTracker.get(item.MediaKey);
            if (failedInfo?.permanentlyFailed) {
                // Skip permanently failed media - these will never succeed
                continue;
            }
            
            // Check if we're globally rate limited - skip all media downloads
            if (isRateLimited && rateLimitResetTime && rateLimitResetTime > new Date()) {
                // Don't queue more downloads while rate limited
                continue;
            }
            
            // Check if this specific media is in cooldown (failed too many times this cycle)
            if (failedInfo && failedInfo.attempts >= MAX_MEDIA_ATTEMPTS_PER_CYCLE) {
                const timeSinceLastAttempt = Date.now() - failedInfo.lastAttempt.getTime();
                if (timeSinceLastAttempt < MEDIA_RETRY_COOLDOWN_MS) {
                    // Still in cooldown, skip this media for now - will retry next cycle
                    continue;
                }
                // Cooldown expired, reset attempts for another try
                failedInfo.attempts = 0;
            }
            
            // Queue media download with limited retries
            mediaQueue.add(() =>
                pRetry(
                    async () => {
                        // Check rate limit before attempting
                        if (isRateLimited && rateLimitResetTime && rateLimitResetTime > new Date()) {
                            throw new Error('Rate limited - skipping');
                        }
                        
                        try {
                            return await downloadAndUploadMedia(item.MediaURL!, listingKey, item.Order || 0, item.MediaCategory || 'Photo');
                        } catch (error: any) {
                            // Handle rate limiting globally
                            if (error.message?.includes('429')) {
                                isRateLimited = true;
                                // MLS Grid rate limits typically last 1 hour, but we'll check more frequently
                                rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes
                                console.log(`[Media] Rate limited! Will pause media downloads until ${rateLimitResetTime.toISOString()}`);
                                throw error;
                            }
                            
                            // If URL expired or got 400 error, fetch fresh URL from MLS API
                            if (error.message?.includes('expired') || error.message?.includes('400')) {
                                console.log(`[Media] URL expired for ${item.MediaKey}, fetching fresh URL...`);
                                try {
                                    const endpoint = `/Property('${listingKey}')?$expand=Media&$select=ListingKey`;
                                    const data = await fetchMLSData(endpoint, {});

                                    if (data && data.Media) {
                                        const freshMedia = data.Media.find((m: Media) => m.MediaKey === item.MediaKey);
                                        if (freshMedia && freshMedia.MediaURL) {
                                            // Update database with fresh URL
                                            await pool.query(
                                                `UPDATE mls.media SET media_url = $1, media_modification_ts = $2 WHERE media_key = $3`,
                                                [freshMedia.MediaURL, freshMedia.MediaModificationTimestamp, item.MediaKey]
                                            );
                                            // Retry with fresh URL
                                            return await downloadAndUploadMedia(freshMedia.MediaURL, listingKey, item.Order || 0, item.MediaCategory || 'Photo');
                                        }
                                    }
                                } catch (refreshError: any) {
                                    // If refresh also fails with rate limit, set global flag
                                    if (refreshError.message?.includes('429')) {
                                        isRateLimited = true;
                                        rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000);
                                        throw new Error('Rate limited while refreshing URL');
                                    }
                                    console.error(`[Media] Failed to refresh URL for ${item.MediaKey}:`, refreshError);
                                }
                            }
                            throw error;
                        }
                    },
                    {
                        retries: 2,  // Limited retries per attempt
                        minTimeout: 2000,  // 2 seconds
                        maxTimeout: 10000,  // 10 seconds max
                        factor: 2,
                        onFailedAttempt: (error) => {
                            if (error.message?.includes('429')) {
                                // Don't retry on rate limit - let the cooldown handle it
                            }
                        }
                    }
                ).then(async (localUrl) => {
                    // Success - clear from failed tracker and reset rate limit flag
                    failedMediaTracker.delete(item.MediaKey);
                    isRateLimited = false;
                    await pool.query(
                        `UPDATE mls.media SET local_url = $1 WHERE media_key = $2`,
                        [localUrl, item.MediaKey]
                    );
                }).catch((err) => {
                    // Track failed media
                    const existing = failedMediaTracker.get(item.MediaKey) || { attempts: 0, lastAttempt: new Date(), permanentlyFailed: false };
                    existing.attempts++;
                    existing.lastAttempt = new Date();
                    
                    // Mark as permanently failed if it's a 404 or other non-recoverable error
                    if (err.message?.includes('404') || err.message?.includes('403')) {
                        existing.permanentlyFailed = true;
                        console.log(`[Media] Permanently failed ${item.MediaKey}: ${err.message}`);
                    }
                    // Don't log rate limit errors - they're expected and handled globally
                    
                    failedMediaTracker.set(item.MediaKey, existing);
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
        original_list_price: property.OriginalListPrice,
        bedrooms_total: toInteger(property.BedroomsTotal),
        bathrooms_full: toInteger(property.BathroomsFull),
        bathrooms_total_integer: toInteger(property.BathroomsTotalInteger),
        living_area: toInteger(property.LivingArea),
        year_built: toInteger(property.YearBuilt),
        lot_size_acres: property.LotSizeAcres,
        latitude: property.Latitude,
        longitude: property.Longitude,
        city: property.City,
        state_or_province: property.StateOrProvince,
        postal_code: property.PostalCode,
        county_or_parish: property.CountyOrParish,
        subdivision_name: property.SubdivisionName,
        address_full: property.UnparsedAddress,
        street_name: property.StreetName,
        remarks_public: property.PublicRemarks,
        elementary_school: property.ElementarySchool,
        high_school_district: property.HighSchoolDistrict,
        new_construction: property.NewConstructionYN,
        pool_private: property.PoolPrivateYN,
        waterfront: property.WaterfrontYN,
        garage_spaces: toInteger(property.GarageSpaces),
        parking_total: toInteger(property.ParkingTotal),
        fireplaces_total: toInteger(property.FireplacesTotal),
        photo_count: property.Media?.length || 0,
        primary_photo_url: property.Media?.[0]?.MediaURL,
        _geo: property.Latitude && property.Longitude
            ? { lat: property.Latitude, lng: property.Longitude }
            : undefined,
        modification_timestamp: new Date(property.ModificationTimestamp).getTime(),
        photos_change_timestamp: property.PhotosChangeTimestamp
            ? new Date(property.PhotosChangeTimestamp).getTime()
            : undefined,
        original_entry_timestamp: property.OriginalEntryTimestamp
            ? new Date(property.OriginalEntryTimestamp).getTime()
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

        // Always update searchable attributes to ensure listing_key is included
        console.log('  - Updating searchable attributes...');
        await index.updateSearchableAttributes([
            'listing_key',      // Add listing_key for ID search
            'listing_id',       // Keep listing_id as well
            'address_full',
            'street_name',
            'city',
            'postal_code',
            'subdivision_name',
            'remarks_public',
            'elementary_school',
            'high_school_district',
        ]);

        // Only configure filterable/sortable if not yet configured
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
                'original_list_price',
                'bedrooms_total',
                'bathrooms_full',
                'bathrooms_total_integer',
                'living_area',
                'year_built',
                'lot_size_acres',
                'garage_spaces',
                'parking_total',
                'new_construction',
                'pool_private',
                'waterfront',
                'fireplaces_total',
                'features',
            ]);

            console.log('  - Setting sortable attributes...');
            await index.updateSortableAttributes([
                'list_price',
                'original_list_price',
                'modification_timestamp',
                'original_entry_timestamp',
                'bedrooms_total',
                'bathrooms_full',
                'bathrooms_total_integer',
                'living_area',
                'year_built',
                'lot_size_acres',
            ]);

            console.log('  - Setting searchable attributes...');
            await index.updateSearchableAttributes([
                'listing_key',      // Add listing_key for ID search
                'listing_id',       // Keep listing_id as well
                'address_full',
                'street_name',
                'city',
                'postal_code',
                'subdivision_name',
                'remarks_public',
                'elementary_school',
                'high_school_district',
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

    let highWater = await getHighWaterMark('Property');
    let maxTimestamp: string | null = null; // Start with null, not highWater
    console.log(`📍 Starting sync with high water mark: ${highWater || 'none'}`);

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
                await upsertMedia(property.ListingKey, property.Media || [], property.PhotosChangeTimestamp);
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

        // Don't wait for media downloads - let them complete in background
        // This prevents the sync from getting stuck on rate-limited media
        const pendingMedia = mediaQueue.size + mediaQueue.pending;
        if (pendingMedia > 0) {
            console.log(`📸 ${pendingMedia} media downloads queued (processing in background)`);
        }
        
        // Only wait if queue is getting too large (backpressure) AND we're not rate limited
        // If rate limited, skip backpressure wait - the queue will drain when rate limit expires
        if (pendingMedia > 500 && !isRateLimited) {
            console.log(`⏳ Queue backpressure: waiting for some downloads to complete...`);
            // Wait for queue to drain to 100 items, but break out if rate limited
            let waitIterations = 0;
            const maxWaitIterations = 60; // Max 5 minutes (60 * 5 seconds)
            while (mediaQueue.size + mediaQueue.pending > 100 && !isRateLimited && waitIterations < maxWaitIterations) {
                await new Promise(resolve => setTimeout(resolve, 5000));
                waitIterations++;
            }
            if (isRateLimited) {
                console.log(`⚠️  Rate limited during backpressure wait - continuing sync without waiting`);
            } else if (waitIterations >= maxWaitIterations) {
                console.log(`⚠️  Backpressure wait timeout - continuing sync`);
            } else {
                console.log(`✅ Queue drained, continuing sync`);
            }
        } else if (pendingMedia > 500 && isRateLimited) {
            console.log(`⏭️  Skipping backpressure wait - rate limited, queue will drain when limit expires`);
        }

        nextLink = data['@odata.nextLink'] || null;

        // Update high-water mark after each batch to ensure progress is saved
        // This prevents re-processing the same properties if sync is interrupted
        if (maxTimestamp) {
            // Only update if we have a new max timestamp that's different from current high water
            const shouldUpdate = !highWater || maxTimestamp > highWater;
            if (shouldUpdate) {
                await setHighWaterMark('Property', maxTimestamp);
                console.log(`📍 Updated high-water mark: ${highWater || 'none'} -> ${maxTimestamp}`);
                highWater = maxTimestamp; // Update local copy to avoid redundant DB writes
            }
        }

        // Rate limiting: Minimum 500ms delay to ensure max 2 RPS
        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
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

                // Handle missing start_time or end_time by using OpenHouseDate as fallback
                // OpenHouseDate is just a date (e.g., "2025-07-26"), so we create timestamps from it
                let startTime = openHouse.OpenHouseStartTime;
                let endTime = openHouse.OpenHouseEndTime;
                
                if (!startTime && openHouse.OpenHouseDate) {
                    // Use OpenHouseDate with a default start time of 00:00:00
                    startTime = `${openHouse.OpenHouseDate}T00:00:00.000Z`;
                }
                
                if (!endTime && openHouse.OpenHouseDate) {
                    // Use OpenHouseDate with a default end time of 23:59:59
                    endTime = `${openHouse.OpenHouseDate}T23:59:59.000Z`;
                }
                
                // Skip if we still don't have valid times
                if (!startTime || !endTime) {
                    console.log(`Skipping open house ${openHouse.OpenHouseKey} - missing start/end time and no OpenHouseDate fallback`);
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
    }

    console.log(`Open house sync complete. Processed ${totalProcessed} open houses`);
}

async function retryFailedMediaDownloads(): Promise<void> {
    console.log(`[${new Date().toISOString()}] 🔄 Checking for properties with missing media...`);

    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⏭️  Skipping media recovery - S3/R2 storage not configured');
        return;
    }

    // Check if we're still rate limited
    if (isRateLimited && rateLimitResetTime && rateLimitResetTime > new Date()) {
        const minutesLeft = Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 60000);
        console.log(`⏸️  Media recovery paused - rate limited for ${minutesLeft} more minutes`);
        return;
    }
    
    // Reset rate limit flag if cooldown expired
    if (isRateLimited && rateLimitResetTime && rateLimitResetTime <= new Date()) {
        console.log(`✅ Rate limit cooldown expired, resuming media downloads`);
        isRateLimited = false;
        rateLimitResetTime = null;
    }

    // Log failed media tracker stats and clear expired cooldowns
    const permanentlyFailed = Array.from(failedMediaTracker.values()).filter(f => f.permanentlyFailed).length;
    let inCooldown = 0;
    
    // Clear cooldowns that have expired (so media gets retried)
    for (const [, value] of failedMediaTracker.entries()) {
        if (!value.permanentlyFailed && value.attempts >= MAX_MEDIA_ATTEMPTS_PER_CYCLE) {
            const timeSinceLastAttempt = Date.now() - value.lastAttempt.getTime();
            if (timeSinceLastAttempt >= MEDIA_RETRY_COOLDOWN_MS) {
                value.attempts = 0; // Reset for retry
            } else {
                inCooldown++;
            }
        }
    }
    
    if (permanentlyFailed > 0 || inCooldown > 0) {
        console.log(`📊 Failed media tracker: ${permanentlyFailed} permanently failed, ${inCooldown} in cooldown`);
    }

    try {
        // Get count of total missing media
        const countResult = await pool.query(`
            SELECT COUNT(*) as total_missing
            FROM mls.media m
            WHERE m.local_url IS NULL
              AND (m.media_category IS NULL OR m.media_category != 'Video')
              AND m.media_url IS NOT NULL
        `);
        const totalMissing = parseInt(countResult.rows[0]?.total_missing || '0', 10);
        
        if (totalMissing === 0) {
            console.log('✅ All media has been downloaded');
            return;
        }
        
        // Count how many properties have missing media
        const propertiesWithMissingResult = await pool.query(`
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
        const propertiesWithMissing = parseInt(propertiesWithMissingResult.rows[0]?.count || '0', 10);
        console.log(`📊 Total missing media: ${totalMissing} across ${propertiesWithMissing} properties`);

        // Find properties with missing media - process more aggressively
        // Use a larger batch size to catch up faster
        // With ~35k missing media and ~15 photos per property, we need to process ~2,400 properties
        // Process 200 properties per cycle to catch up in ~12 cycles (6 hours at 30 min intervals)
        const recoveryBatchSize = Math.min(MEDIA_RECOVERY_BATCH_SIZE * 20, 200); // Up to 200 properties
        
        const result = await pool.query(`
            SELECT p.listing_key, p.modification_timestamp,
                   (SELECT COUNT(*) FROM mls.media m WHERE m.listing_key = p.listing_key AND m.local_url IS NULL) as missing_count
            FROM mls.properties p
            WHERE p.photo_count > 0
              AND EXISTS (
                SELECT 1 FROM mls.media m
                WHERE m.listing_key = p.listing_key
                  AND m.local_url IS NULL
                  AND (m.media_category IS NULL OR m.media_category != 'Video')
              )
            ORDER BY p.modification_timestamp DESC
            LIMIT $1
        `, [recoveryBatchSize]);

        if (result.rows.length === 0) {
            console.log('✅ All properties have their media downloaded');
            return;
        }

        const totalMissingInBatch = result.rows.reduce((sum: number, r: any) => sum + parseInt(r.missing_count, 10), 0);
        console.log(`📊 Found ${result.rows.length} properties with ${totalMissingInBatch} missing media items`);
        console.log(`🔄 Re-fetching fresh media URLs from MLS API...`);

        let skippedCount = 0;
        let queuedCount = 0;
        let alreadyDownloadedCount = 0;
        let noUrlCount = 0;

        // Re-fetch each property with fresh Media URLs
        for (const row of result.rows) {
            // Check rate limit before each property
            if (isRateLimited) {
                console.log(`⏸️  Rate limited - stopping media recovery for this cycle`);
                break;
            }
            
            try {
                const endpoint = `/Property('${row.listing_key}')?$expand=Media&$select=ListingKey`;
                const data = await fetchMLSData(endpoint, {});

                if (data && data.Media && data.Media.length > 0) {
                    // Update media URLs in database and queue downloads
                    for (const item of data.Media) {
                        // Check if already downloaded
                        const existingMedia = await pool.query(
                            `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
                            [item.MediaKey]
                        );
                        if (existingMedia.rows.length > 0) {
                            alreadyDownloadedCount++;
                            continue; // Already downloaded
                        }
                        
                        // Check if this media has permanently failed
                        const failedInfo = failedMediaTracker.get(item.MediaKey);
                        if (failedInfo?.permanentlyFailed) {
                            skippedCount++;
                            continue;
                        }
                        
                        // Check cooldown
                        if (failedInfo && failedInfo.attempts >= MAX_MEDIA_ATTEMPTS_PER_CYCLE) {
                            const timeSinceLastAttempt = Date.now() - failedInfo.lastAttempt.getTime();
                            if (timeSinceLastAttempt < MEDIA_RETRY_COOLDOWN_MS) {
                                skippedCount++;
                                continue;
                            }
                            // Cooldown expired, reset attempts
                            failedInfo.attempts = 0;
                        }

                        // Update the media_url with fresh token
                        await pool.query(
                            `UPDATE mls.media
                             SET media_url = $1, media_modification_ts = $2
                             WHERE media_key = $3`,
                            [item.MediaURL, item.MediaModificationTimestamp, item.MediaKey]
                        );

                        // Queue download with fresh URL
                        const isVideo = item.MediaCategory === 'Video' ||
                            (item.MediaURL && /\.(mp4|mov|avi|wmv|flv|webm)$/i.test(item.MediaURL));

                        if (!item.MediaURL) {
                            noUrlCount++;
                            continue;
                        }

                        if (item.MediaURL && !isVideo) {
                            queuedCount++;
                            mediaQueue.add(() =>
                                pRetry(
                                    async () => {
                                        if (isRateLimited) {
                                            throw new Error('Rate limited - skipping');
                                        }
                                        return downloadAndUploadMedia(
                                            item.MediaURL,
                                            row.listing_key,
                                            item.Order || 0,
                                            item.MediaCategory || 'Photo'
                                        );
                                    },
                                    {
                                        retries: 2,
                                        minTimeout: 2000,
                                        maxTimeout: 10000,
                                        factor: 2,
                                    }
                                ).then(async (localUrl) => {
                                    // Success - clear from failed tracker
                                    failedMediaTracker.delete(item.MediaKey);
                                    isRateLimited = false; // Success means we're not rate limited
                                    await pool.query(
                                        'UPDATE mls.media SET local_url = $1 WHERE media_key = $2',
                                        [localUrl, item.MediaKey]
                                    );
                                }).catch((err) => {
                                    // Track failed media
                                    const existing = failedMediaTracker.get(item.MediaKey) || { attempts: 0, lastAttempt: new Date(), permanentlyFailed: false };
                                    existing.attempts++;
                                    existing.lastAttempt = new Date();
                                    
                                    if (err.message?.includes('404') || err.message?.includes('403')) {
                                        existing.permanentlyFailed = true;
                                    }
                                    
                                    if (err.message?.includes('429')) {
                                        isRateLimited = true;
                                        rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000);
                                    }
                                    
                                    failedMediaTracker.set(item.MediaKey, existing);
                                })
                            );
                        }
                    }
                }

                // Rate limit: wait between property fetches
                await new Promise(resolve => setTimeout(resolve, 500));
            } catch (error: any) {
                // If we hit rate limit during recovery, stop and try again next cycle
                if (error.message?.includes('429')) {
                    isRateLimited = true;
                    rateLimitResetTime = new Date(Date.now() + 10 * 60 * 1000);
                    console.log(`⚠️  Rate limited during media recovery, will continue in 10 minutes`);
                    break;
                }
                console.error(`Failed to refresh media for ${row.listing_key}:`, error);
            }
        }

        console.log(`📈 Media recovery: ${queuedCount} queued, ${skippedCount} skipped (failed/cooldown), ${alreadyDownloadedCount} already downloaded, ${noUrlCount} no URL`);
        
        // Log overall progress
        const remainingResult = await pool.query(`
            SELECT COUNT(*) as remaining
            FROM mls.media m
            WHERE m.local_url IS NULL
              AND (m.media_category IS NULL OR m.media_category != 'Video')
              AND m.media_url IS NOT NULL
        `);
        const remaining = parseInt(remainingResult.rows[0]?.remaining || '0', 10);
        const percentage = totalMissing > 0 ? Math.round((1 - remaining / totalMissing) * 100) : 100;
        console.log(`📊 Media download progress: ~${percentage}% complete (${remaining} remaining)`);
        
    } catch (error) {
        console.error('Media recovery error:', error);
    }
}

async function runETL(): Promise<void> {
    const startTime = Date.now();
    
    try {
        // Log sync start with queue status
        const pendingMedia = mediaQueue.size + mediaQueue.pending;
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${new Date().toISOString()}] Starting ETL sync cycle`);
        if (pendingMedia > 0) {
            console.log(`📸 ${pendingMedia} media downloads still in queue from previous cycle`);
        }
        if (isRateLimited && rateLimitResetTime) {
            const minutesLeft = Math.ceil((rateLimitResetTime.getTime() - Date.now()) / 60000);
            if (minutesLeft > 0) {
                console.log(`⚠️  Rate limited - media downloads paused for ${minutesLeft} more minutes`);
            }
        }
        console.log(`${'='.repeat(60)}\n`);
        
        // Sync active properties first (this is the critical path - must complete)
        await syncProperties();

        // Then check for deletions (MlgCanView=false)
        await syncDeletions();

        // Sync supporting resources
        await syncMembers();
        await syncOffices();
        await syncOpenHouses();

        // Retry failed media downloads (runs after main sync to avoid competing for rate limits)
        await retryFailedMediaDownloads();
        
        // Record progress history (every 15 minutes)
        await recordProgressHistory();
        
        const duration = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[${new Date().toISOString()}] ETL sync cycle complete (${duration}s)`);
        console.log(`📸 Media queue: ${mediaQueue.size + mediaQueue.pending} pending downloads`);
        console.log(`${'='.repeat(60)}\n`);
        
    } catch (error) {
        console.error('ETL error:', error);
    }
}

// Continuous media download worker - runs independently of the main sync
async function runMediaDownloadWorker(): Promise<void> {
    console.log(`\n📸 Starting continuous media download worker...`);
    
    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET &&
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY;

    if (!s3Configured) {
        console.log('⏭️  Media download worker disabled - S3/R2 storage not configured');
        return;
    }

    // Run continuously with a small delay between batches
    // eslint-disable-next-line no-constant-condition
    while (true) {
        try {
            // Check if media CDN is rate limited (separate from API rate limits)
            if (isMediaCdnRateLimited && mediaCdnRateLimitResetTime && mediaCdnRateLimitResetTime > new Date()) {
                const minutesLeft = Math.ceil((mediaCdnRateLimitResetTime.getTime() - Date.now()) / 60000);
                console.log(`⏸️  Media worker paused - CDN rate limited for ${minutesLeft} more minutes`);
                // Wait until rate limit expires (check every minute)
                await new Promise(resolve => setTimeout(resolve, Math.min(minutesLeft * 60 * 1000, 60000)));
                continue;
            }
            
            // Reset media CDN rate limit flag if cooldown expired
            if (isMediaCdnRateLimited && mediaCdnRateLimitResetTime && mediaCdnRateLimitResetTime <= new Date()) {
                console.log(`✅ Media CDN rate limit cooldown expired, resuming downloads`);
                isMediaCdnRateLimited = false;
                mediaCdnRateLimitResetTime = null;
            }

            // Get count of total missing media
            const countResult = await pool.query(`
                SELECT COUNT(*) as total_missing
                FROM mls.media m
                WHERE m.local_url IS NULL
                  AND (m.media_category IS NULL OR m.media_category != 'Video')
                  AND m.media_url IS NOT NULL
            `);
            const totalMissing = parseInt(countResult.rows[0]?.total_missing || '0', 10);
            
            if (totalMissing === 0) {
                console.log('✅ All media has been downloaded. Worker sleeping for 5 minutes...');
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                continue;
            }

            // Find a single property with missing media
            const result = await pool.query(`
                SELECT p.listing_key,
                       (SELECT COUNT(*) FROM mls.media m WHERE m.listing_key = p.listing_key AND m.local_url IS NULL AND (m.media_category IS NULL OR m.media_category != 'Video')) as missing_count
                FROM mls.properties p
                WHERE p.photo_count > 0
                  AND EXISTS (
                    SELECT 1 FROM mls.media m
                    WHERE m.listing_key = p.listing_key
                      AND m.local_url IS NULL
                      AND (m.media_category IS NULL OR m.media_category != 'Video')
                  )
                ORDER BY p.modification_timestamp DESC
                LIMIT 1
            `);

            if (result.rows.length === 0) {
                console.log('✅ No properties with missing media. Worker sleeping for 5 minutes...');
                await new Promise(resolve => setTimeout(resolve, 5 * 60 * 1000));
                continue;
            }

            const row = result.rows[0];
            console.log(`[Media Worker] Processing ${row.listing_key} (${row.missing_count} missing in DB)`);
            
            // Fetch fresh media URLs from MLS API
            const endpoint = `/Property('${row.listing_key}')?$expand=Media&$select=ListingKey`;
            const data = await fetchMLSData(endpoint, {});

            if (data && data.Media && data.Media.length > 0) {
                console.log(`[Media Worker] MLS API returned ${data.Media.length} media items for ${row.listing_key}`);
                let downloadedCount = 0;
                let skippedCount = 0;
                
                for (const item of data.Media) {
                    // Check media CDN rate limit (separate from API)
                    if (isMediaCdnRateLimited) {
                        break;
                    }
                    
                    // Check if already downloaded
                    const existingMedia = await pool.query(
                        `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
                        [item.MediaKey]
                    );
                    if (existingMedia.rows.length > 0) {
                        continue; // Already downloaded
                    }
                    
                    // Check if permanently failed
                    const failedInfo = failedMediaTracker.get(item.MediaKey);
                    if (failedInfo?.permanentlyFailed) {
                        skippedCount++;
                        continue;
                    }

                    // Skip videos
                    const isVideo = item.MediaCategory === 'Video' ||
                        (item.MediaURL && /\.(mp4|mov|avi|wmv|flv|webm)$/i.test(item.MediaURL));
                    if (!item.MediaURL || isVideo) {
                        continue;
                    }

                    // Update the media_url with fresh token
                    await pool.query(
                        `UPDATE mls.media SET media_url = $1, media_modification_ts = $2 WHERE media_key = $3`,
                        [item.MediaURL, item.MediaModificationTimestamp, item.MediaKey]
                    );

                    // Download directly (not queued) - one at a time
                    try {
                        const localUrl = await downloadAndUploadMedia(
                            item.MediaURL,
                            row.listing_key,
                            item.Order || 0,
                            item.MediaCategory || 'Photo'
                        );
                        
                        await pool.query(
                            'UPDATE mls.media SET local_url = $1 WHERE media_key = $2',
                            [localUrl, item.MediaKey]
                        );
                        
                        downloadedCount++;
                        mediaWorkerDownloadsThisCycle++;
                        failedMediaTracker.delete(item.MediaKey);
                        
                    } catch (err: any) {
                        if (err.message?.includes('429')) {
                            // Media CDN rate limit - use shorter cooldown (2 minutes)
                            isMediaCdnRateLimited = true;
                            mediaCdnRateLimitResetTime = new Date(Date.now() + 2 * 60 * 1000);
                            console.log(`[Media Worker] CDN rate limited! Pausing for 2 minutes...`);
                            break;
                        }
                        
                        // Track failed media
                        const existing = failedMediaTracker.get(item.MediaKey) || { attempts: 0, lastAttempt: new Date(), permanentlyFailed: false };
                        existing.attempts++;
                        existing.lastAttempt = new Date();
                        
                        if (err.message?.includes('404') || err.message?.includes('403')) {
                            existing.permanentlyFailed = true;
                        }
                        
                        failedMediaTracker.set(item.MediaKey, existing);
                        skippedCount++;
                    }
                    
                    // Small delay between downloads to respect rate limits
                    // ~350ms delay + ~700ms download = ~1 RPS which works well
                    await new Promise(resolve => setTimeout(resolve, 350));
                }
                
                // Always log progress for debugging
                console.log(`[Media Worker] ${row.listing_key}: ${downloadedCount} downloaded, ${skippedCount} skipped (of ${data.Media.length} from API). ${totalMissing - downloadedCount} remaining.`);
            }
            
            // Small delay before processing next property
            await new Promise(resolve => setTimeout(resolve, 100));
            
        } catch (error: any) {
            if (error.message?.includes('429')) {
                // Media CDN rate limit - use shorter cooldown (2 minutes)
                isMediaCdnRateLimited = true;
                mediaCdnRateLimitResetTime = new Date(Date.now() + 2 * 60 * 1000);
                console.log(`[Media Worker] CDN rate limited! Pausing for 2 minutes...`);
            } else {
                console.error('[Media Worker] Error:', error);
            }
            // Wait a bit before retrying on error
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
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

        // Start the continuous media download worker in the background
        // This runs independently of the main sync cycle
        runMediaDownloadWorker().catch(err => {
            console.error('Media download worker crashed:', err);
        });

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