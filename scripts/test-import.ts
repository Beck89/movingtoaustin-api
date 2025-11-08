import pg from 'pg';
import { MeiliSearch } from 'meilisearch';
import dotenv from 'dotenv';
import { fetchMLSData } from '../etl/src/mls-client.js';

dotenv.config();

const pool = new pg.Pool({
    connectionString: process.env.PG_URL,
    max: 5,
});

const searchClient = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';
const ORIGINATING_SYSTEM = process.env.ORIGINATING_SYSTEM || 'ACTRIS';
const TEST_LIMIT = parseInt(process.env.TEST_LIMIT || '10', 10);

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
        property.BedroomsTotal,
        property.BathroomsFull,
        property.BathroomsHalf,
        property.LivingArea,
        property.YearBuilt,
        property.LotSizeAcres,
        property.Latitude,
        property.Longitude,
        property.City,
        property.StateOrProvince,
        property.PostalCode,
        property.CountyOrParish,
        property.SubdivisionName,
        property.UnparsedAddress,
        property.DaysOnMarket,
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

        // Note: Media download skipped for test import
        // Configure S3/R2 in .env and run full ETL to download media
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
        bedrooms_total: property.BedroomsTotal,
        bathrooms_full: property.BathroomsFull,
        living_area: property.LivingArea,
        year_built: property.YearBuilt,
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

async function testImport(): Promise<void> {
    console.log('🧪 MLS Grid Test Import');
    console.log('======================');
    console.log(`Originating System: ${ORIGINATING_SYSTEM}`);
    console.log(`Test Limit: ${TEST_LIMIT} records`);
    console.log('');

    const s3Configured = process.env.S3_ENDPOINT && process.env.S3_BUCKET;
    if (!s3Configured) {
        console.log('ℹ️  S3/R2 not configured - media URLs will point to MLS Grid');
        console.log('   (This is fine for testing! Configure S3 later to download media)');
        console.log('');
    }

    try {
        // Build filter for test import
        const filters = [
            `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
            `MlgCanView eq true`,
            `StandardStatus eq 'Active'`, // Only active listings for testing
        ];

        const filterString = filters.join(' and ');
        const endpoint = `/Property?$filter=${encodeURIComponent(filterString)}&$expand=Media&$top=${TEST_LIMIT}&$orderby=ModificationTimestamp desc`;

        console.log('📡 Fetching properties from MLS Grid...');
        const data = await fetchMLSData(endpoint, {});
        const properties: Property[] = data.value || [];

        console.log(`✅ Received ${properties.length} properties`);
        console.log('');

        if (properties.length === 0) {
            console.log('⚠️  No properties returned. Check your filters and credentials.');
            return;
        }

        console.log('💾 Importing to database and search index...');
        let successCount = 0;
        let errorCount = 0;

        for (const property of properties) {
            try {
                console.log(`  Processing: ${property.ListingKey} - ${property.UnparsedAddress || 'No address'}`);

                await upsertProperty(property);
                await upsertMedia(property.ListingKey, property.Media || []);
                await indexPropertyToSearch(property);

                successCount++;
            } catch (error) {
                console.error(`  ❌ Error processing ${property.ListingKey}:`, error);
                errorCount++;
            }
        }

        console.log('');
        console.log('Note: Meilisearch indexes documents automatically (no manual refresh needed)');
        console.log('📊 Import Summary');
        console.log('=================');
        console.log(`✅ Success: ${successCount}`);
        console.log(`❌ Errors: ${errorCount}`);
        console.log('');

        // Show sample data
        console.log('📋 Sample Properties:');
        const result = await pool.query(
            `SELECT listing_key, listing_id, address_full, city, list_price, 
              bedrooms_total, bathrooms_full, standard_status
       FROM mls.properties 
       ORDER BY created_at DESC 
       LIMIT 5`
        );

        result.rows.forEach((row, i) => {
            console.log(`  ${i + 1}. ${row.listing_id || row.listing_key}`);
            console.log(`     ${row.address_full || 'No address'}`);
            console.log(`     ${row.city || 'Unknown'} | $${row.list_price?.toLocaleString() || 'N/A'} | ${row.bedrooms_total || 0} bed, ${row.bathrooms_full || 0} bath`);
            console.log(`     Status: ${row.standard_status}`);
            console.log('');
        });

        console.log('✅ Test import complete!');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Start the API: npm run dev:api');
        console.log('  2. Test search: curl "http://localhost:3000/listings/search?status=Active&limit=5"');
        console.log('  3. If everything looks good, run the full ETL worker: npm run dev:etl');

    } catch (error) {
        console.error('❌ Test import failed:', error);
        throw error;
    } finally {
        await pool.end();
    }
}

// Run the test import
testImport().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});