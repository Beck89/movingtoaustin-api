/**
 * Database operations for MLS Grid ETL
 */
import pg from 'pg';
import type { Property, Room, UnitType, Media } from './types.js';

// Database pool - singleton
const pool = new pg.Pool({
    connectionString: process.env.PG_URL,
    max: 10,
});

export default pool;

// Configuration constants
export const ORIGINATING_SYSTEM = process.env.ORIGINATING_SYSTEM || 'ACTRIS';

/**
 * Helper to safely convert to integer (handles decimal strings)
 */
export function toInteger(value: any): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? null : Math.round(num);
}

/**
 * Get high water mark for a resource
 */
export async function getHighWaterMark(resource: string): Promise<string | null> {
    const result = await pool.query(
        `SELECT last_modification_ts FROM mls.sync_state
         WHERE resource = $1 AND originating_system_name = $2`,
        [resource, ORIGINATING_SYSTEM]
    );
    const timestamp = result.rows[0]?.last_modification_ts;
    if (timestamp instanceof Date) {
        return timestamp.toISOString();
    }
    return timestamp || null;
}

/**
 * Set high water mark for a resource
 */
export async function setHighWaterMark(resource: string, timestamp: string): Promise<void> {
    await pool.query(
        `INSERT INTO mls.sync_state (resource, originating_system_name, last_modification_ts, last_run_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (resource)
         DO UPDATE SET last_modification_ts = $3, last_run_at = NOW()`,
        [resource, ORIGINATING_SYSTEM, timestamp]
    );
}

/**
 * Update last_run_at timestamp for a resource (even if no new data)
 * This ensures the dashboard shows when sync actually ran, not when data was last modified
 */
export async function updateLastRun(resource: string): Promise<void> {
    await pool.query(
        `UPDATE mls.sync_state SET last_run_at = NOW() WHERE resource = $1`,
        [resource]
    );
}

/**
 * Upsert a property into the database
 */
export async function upsertProperty(property: Property): Promise<void> {
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

/**
 * Upsert rooms for a property
 */
export async function upsertRooms(listingKey: string, rooms: Room[]): Promise<void> {
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

/**
 * Upsert unit types for a property
 */
export async function upsertUnitTypes(listingKey: string, unitTypes: UnitType[]): Promise<void> {
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

/**
 * Upsert media metadata for a property (does not handle downloads)
 */
export async function upsertMediaMetadata(listingKey: string, media: Media[]): Promise<void> {
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
    }
}

/**
 * Check if photos have changed for a property
 */
export async function havePhotosChanged(listingKey: string, newTimestamp?: string): Promise<boolean> {
    if (!newTimestamp) return true;

    const result = await pool.query(
        `SELECT photos_change_timestamp FROM mls.properties WHERE listing_key = $1`,
        [listingKey]
    );

    if (result.rows.length > 0 && result.rows[0].photos_change_timestamp) {
        const existingTimestamp = new Date(result.rows[0].photos_change_timestamp).getTime();
        const newTs = new Date(newTimestamp).getTime();
        return newTs > existingTimestamp;
    }

    return true;
}

/**
 * Check if media is already downloaded
 */
export async function isMediaDownloaded(mediaKey: string): Promise<boolean> {
    const result = await pool.query(
        `SELECT local_url FROM mls.media WHERE media_key = $1 AND local_url IS NOT NULL`,
        [mediaKey]
    );
    return result.rows.length > 0;
}

/**
 * Update media local URL after download
 */
export async function updateMediaLocalUrl(mediaKey: string, localUrl: string): Promise<void> {
    await pool.query(
        `UPDATE mls.media SET local_url = $1 WHERE media_key = $2`,
        [localUrl, mediaKey]
    );
}

/**
 * Update media URL with fresh token
 */
export async function updateMediaUrl(mediaKey: string, mediaUrl: string, modificationTs: string): Promise<void> {
    await pool.query(
        `UPDATE mls.media SET media_url = $1, media_modification_ts = $2 WHERE media_key = $3`,
        [mediaUrl, modificationTs, mediaKey]
    );
}

/**
 * Delete a property and its related data
 */
export async function deleteProperty(listingKey: string): Promise<void> {
    await pool.query('DELETE FROM mls.properties WHERE listing_key = $1', [listingKey]);
}

/**
 * Delete media records by keys
 */
export async function deleteMediaByKeys(mediaKeys: string[]): Promise<void> {
    if (mediaKeys.length === 0) return;
    await pool.query(`DELETE FROM mls.media WHERE media_key = ANY($1::text[])`, [mediaKeys]);
}

/**
 * Get count of properties
 */
export async function getPropertyCount(): Promise<number> {
    const result = await pool.query(
        'SELECT COUNT(*) FROM mls.properties WHERE originating_system_name = $1',
        [ORIGINATING_SYSTEM]
    );
    return parseInt(result.rows[0].count, 10);
}
