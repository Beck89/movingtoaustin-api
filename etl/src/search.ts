/**
 * Meilisearch operations for MLS Grid ETL
 */
import { MeiliSearch } from 'meilisearch';
import type { Property } from './types.js';
import { toInteger } from './db.js';

export const searchClient = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

export const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';

/**
 * Index a property to Meilisearch
 */
export async function indexPropertyToSearch(property: Property): Promise<void> {
    const doc = {
        id: property.ListingKey,
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

/**
 * Delete a property from the search index
 */
export async function deleteFromSearch(listingKey: string): Promise<void> {
    const index = searchClient.index(INDEX_NAME);
    await index.deleteDocument(listingKey);
}

/**
 * Configure Meilisearch index settings on startup
 */
export async function configureMeilisearchIndex(): Promise<void> {
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
                await searchClient.createIndex(INDEX_NAME, { primaryKey: 'id' });
                console.log('  - Index created successfully');
                settings = null;
            } else {
                throw error;
            }
        }

        // Always update searchable attributes to ensure listing_key is included
        console.log('  - Updating searchable attributes...');
        await index.updateSearchableAttributes([
            'listing_key',
            'listing_id',
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

            console.log('✅ Meilisearch index configured successfully!');
        } else {
            console.log('✅ Meilisearch index already configured');
        }
    } catch (error) {
        console.error('❌ Failed to configure Meilisearch index:', error);
        throw error;
    }
}
