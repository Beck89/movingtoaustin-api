import { Router, Request, Response } from 'express';
import pool from '../db.js';

const router = Router();

// ============================================================================
// TypeScript Interfaces for Clean JSON Structure
// ============================================================================

interface ListingIDs {
    listing_key: string;
    listing_id: string;
    mls: string;
}

interface ListingStatus {
    standard_status: string;
    listing_date: string | null;
    days_on_market: number | null;
    last_modified: string;
}

interface ListingPricing {
    current_price: number;
    original_price: number | null;
    price_reduction: number | null;
    price_reduction_percentage: number | null;
    price_per_sqft: number | null;
    last_price_change: string | null;
}

interface PropertyDetails {
    type: string | null;
    category: string | null;
    condition: string | null;
    year_built: number | null;
    builder: string | null;
}

interface LocationCoordinates {
    latitude: number | null;
    longitude: number | null;
}

interface Location {
    address: string | null;
    city: string | null;
    state: string | null;
    zip: string | null;
    county: string | null;
    subdivision: string | null;
    direction_faces: string | null;
    coordinates: LocationCoordinates;
}

interface Size {
    living_area_sqft: number | null;
    lot_size_acres: number | null;
    lot_size_sqft: number | null;
    stories: string | null;
}

interface Rooms {
    bedrooms: number | null;
    bedrooms_main_floor: number | null;
    bedrooms_upper_floor: string | null;
    bathrooms_full: number | null;
    bathrooms_half: number | null;
    bathrooms_total: number | null;
    garage_spaces: number | null;
    parking_total: number | null;
}

interface RoomDetail {
    type: string;
    level: string;
}

interface Features {
    interior: string[];
    exterior: string[];
    construction: string[];
    roof: string[];
    foundation: string[];
    flooring: string[];
    windows: string[];
    lot: string[];
    fencing: string[];
    parking: string[];
    security: string[];
    accessibility: string[];
    pool: string | null;
    fireplace: boolean;
    fireplaces_total: number;
    view: string[];
    waterfront: boolean;
    horse_property: boolean;
}

interface GreenFeatures {
    sustainability: string[];
    energy_efficient: string[];
}

interface Systems {
    cooling: string[];
    heating: string[];
    appliances: string[];
    utilities: string[];
    water: string | null;
    sewer: string | null;
    green_features: GreenFeatures;
}

interface HOA {
    required: boolean;
    name: string | null;
    fee_monthly: number | null;
    fee_annual: number | null;
    frequency: string | null;
    includes: string[];
}

interface Taxes {
    year: number | null;
    annual_amount: number | null;
    monthly_estimate: number | null;
    assessed_value: number | null;
    rate_percentage: string | null;
    legal_description: string | null;
    parcel_number: string | null;
}

interface Financial {
    hoa: HOA;
    taxes: Taxes;
}

interface Schools {
    district: string | null;
    elementary: string | null;
    middle: string | null;
    high: string | null;
}

interface Community {
    name: string | null;
    amenities: string[];
    website: string | null;
}

interface ListingAgent {
    name: string | null;
    email: string | null;
    phone: string | null;
    mls_id: string | null;
    key: string | null;
}

interface ListingOffice {
    name: string | null;
    phone: string | null;
    mls_id: string | null;
    key: string | null;
}

interface Photo {
    order: number;
    url: string;
    width: number | null;
    height: number | null;
}

interface Media {
    photo_count: number;
    photos_last_updated: string | null;
    virtual_tour: string | null;
    video_tour: string | null;
    listing_url: string | null;
    photos: Photo[];
}

interface Syndication {
    display_online: boolean;
    allow_comments: boolean;
    allow_avm: boolean;
    syndicated_to: string[];
}

interface OpenHouse {
    date: string;
    start_time: string;
    end_time: string;
    timezone: string;
}

interface EstimatedMonthlyCosts {
    hoa: number;
    taxes: number;
    total: number;
}

interface CalculatedMetrics {
    price_per_sqft: number | null;
    price_per_acre: number | null;
    hoa_per_sqft_annual: number | null;
    taxes_per_sqft_annual: number | null;
    estimated_monthly_costs: EstimatedMonthlyCosts;
}

interface CleanListing {
    ids: ListingIDs;
    status: ListingStatus;
    pricing: ListingPricing;
    property_details: PropertyDetails;
    location: Location;
    size: Size;
    rooms: Rooms;
    room_list: RoomDetail[];
    features: Features;
    systems: Systems;
    financial: Financial;
    schools: Schools;
    community: Community;
    description: string | null;
    directions: string | null;
    disclosures: string[];
    listing_agent: ListingAgent;
    listing_office: ListingOffice;
    media: Media;
    syndication: Syndication;
    open_houses: OpenHouse[];
    calculated_metrics: CalculatedMetrics;
}

interface ListingDetailResponse {
    listing: CleanListing;
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Calculate days on market from listing date to current date
 */
function calculateDaysOnMarket(listingDate: string | null): number | null {
    if (!listingDate) return null;
    const listing = new Date(listingDate);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - listing.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

/**
 * Safely get array from JSONB field
 */
function getArrayFromRaw(raw: any, field: string): string[] {
    if (!raw || !raw[field]) return [];
    const value = raw[field];
    if (Array.isArray(value)) return value.filter((v: any) => v && v !== 'See Remarks');
    return [];
}

/**
 * Safely get first element from array in JSONB
 */
function getFirstFromArray(raw: any, field: string): string | null {
    const arr = getArrayFromRaw(raw, field);
    return arr.length > 0 ? arr[0] : null;
}

/**
 * Transform appliance codes (e.g., RNGHD -> Range Hood)
 */
function transformAppliances(appliances: string[]): string[] {
    return appliances.map(app => {
        if (app === 'RNGHD') return 'Range Hood';
        return app;
    });
}

/**
 * Extract date from ISO timestamp
 */
function extractDate(isoString: string | null | Date): string | null {
    if (!isoString) return null;
    // Handle Date objects
    if (isoString instanceof Date) {
        return isoString.toISOString().split('T')[0];
    }
    // Handle strings
    const str = String(isoString);
    return str.split('T')[0];
}

/**
 * Extract time from ISO timestamp
 */
function extractTime(isoString: string | null | Date): string | null {
    if (!isoString) return null;
    // Handle Date objects
    if (isoString instanceof Date) {
        isoString = isoString.toISOString();
    }
    // Handle strings
    const str = String(isoString);
    const parts = str.split('T');
    if (parts.length < 2) return null;
    return parts[1].replace('Z', '').split('.')[0];
}

// ============================================================================
// Main Transformation Function
// ============================================================================

function transformToCleanStructure(
    property: any,
    media: any[],
    rooms: any[],
    openHouses: any[]
): CleanListing {
    const raw = property.raw || {};

    // Calculate metrics
    const currentPrice = parseFloat(property.list_price) || 0;
    const originalPrice = parseFloat(property.original_list_price) || null;
    const livingArea = parseInt(property.living_area) || null;
    const lotSizeAcres = parseFloat(property.lot_size_acres) || null;
    const hoaFeeMonthly = parseFloat(property.association_fee) || null;
    const taxAnnual = parseFloat(property.tax_annual_amount) || null;

    const priceReduction = originalPrice ? originalPrice - currentPrice : null;
    const priceReductionPercentage = originalPrice && priceReduction
        ? parseFloat(((priceReduction / originalPrice) * 100).toFixed(2))
        : null;
    const pricePerSqft = livingArea ? parseFloat((currentPrice / livingArea).toFixed(2)) : null;
    const pricePerAcre = lotSizeAcres ? parseFloat((currentPrice / lotSizeAcres).toFixed(2)) : null;
    const hoaAnnual = hoaFeeMonthly ? hoaFeeMonthly * 12 : null;
    const hoaPerSqftAnnual = hoaAnnual && livingArea
        ? parseFloat((hoaAnnual / livingArea).toFixed(2))
        : null;
    const taxesPerSqftAnnual = taxAnnual && livingArea
        ? parseFloat((taxAnnual / livingArea).toFixed(2))
        : null;
    const taxMonthly = taxAnnual ? parseFloat((taxAnnual / 12).toFixed(2)) : null;

    // Combine exterior features from multiple sources
    const exteriorFeatures = [
        ...getArrayFromRaw(raw, 'ExteriorFeatures'),
        ...getArrayFromRaw(raw, 'PatioAndPorchFeatures')
    ];

    // Transform rooms
    const roomList: RoomDetail[] = rooms.map(room => ({
        type: room.room_type || '',
        level: room.room_level || ''
    }));

    // Transform media
    // Note: media_category may be null/empty, so we include all media records
    // and rely on the presence of local_url or media_url to determine if it's valid
    const photos: Photo[] = media
        .filter(m => (m.local_url || m.media_url)) // Include if has any URL
        .map(m => ({
            order: m.order_sequence || 0,
            url: m.local_url || m.media_url || '',
            width: m.width || null,
            height: m.height || null
        }));

    // Transform open houses
    const openHousesList: OpenHouse[] = openHouses.map(oh => ({
        date: extractDate(oh.start_time) || '',
        start_time: extractTime(oh.start_time) || '',
        end_time: extractTime(oh.end_time) || '',
        timezone: 'UTC'
    }));

    const listing: CleanListing = {
        ids: {
            listing_key: property.listing_key,
            listing_id: property.listing_id || '',
            mls: property.originating_system_name || ''
        },
        status: {
            standard_status: property.standard_status || '',
            listing_date: raw.ListingContractDate || null,
            days_on_market: calculateDaysOnMarket(raw.ListingContractDate),
            last_modified: property.modification_timestamp || ''
        },
        pricing: {
            current_price: currentPrice,
            original_price: originalPrice,
            price_reduction: priceReduction,
            price_reduction_percentage: priceReductionPercentage,
            price_per_sqft: pricePerSqft,
            last_price_change: property.major_change_timestamp || null
        },
        property_details: {
            type: property.property_sub_type || null,
            category: property.property_type || null,
            condition: getFirstFromArray(raw, 'PropertyCondition'),
            year_built: property.year_built || null,
            builder: raw.BuilderName || null
        },
        location: {
            address: property.address_full || null,
            city: property.city || null,
            state: property.state_or_province || null,
            zip: property.postal_code || null,
            county: property.county_or_parish || null,
            subdivision: property.subdivision_name || null,
            direction_faces: raw.DirectionFaces || null,
            coordinates: {
                latitude: property.latitude || null,
                longitude: property.longitude || null
            }
        },
        size: {
            living_area_sqft: livingArea,
            lot_size_acres: lotSizeAcres,
            lot_size_sqft: raw.LotSizeSquareFeet ? Math.round(parseFloat(raw.LotSizeSquareFeet)) : null,
            stories: getFirstFromArray(raw, 'Levels')
        },
        rooms: {
            bedrooms: property.bedrooms_total || null,
            bedrooms_main_floor: raw.MainLevelBedrooms || null,
            bedrooms_upper_floor: raw.ACT_NumOtherLevelBeds || null,
            bathrooms_full: property.bathrooms_full || null,
            bathrooms_half: property.bathrooms_half || null,
            bathrooms_total: property.bathrooms_total_integer || null,
            garage_spaces: property.garage_spaces || null,
            parking_total: property.parking_total || null
        },
        room_list: roomList,
        features: {
            interior: getArrayFromRaw(raw, 'InteriorFeatures'),
            exterior: exteriorFeatures,
            construction: getArrayFromRaw(raw, 'ConstructionMaterials'),
            roof: getArrayFromRaw(raw, 'Roof'),
            foundation: getArrayFromRaw(raw, 'FoundationDetails'),
            flooring: getArrayFromRaw(raw, 'Flooring'),
            windows: getArrayFromRaw(raw, 'WindowFeatures'),
            lot: getArrayFromRaw(raw, 'LotFeatures'),
            fencing: getArrayFromRaw(raw, 'Fencing'),
            parking: getArrayFromRaw(raw, 'ParkingFeatures'),
            security: getArrayFromRaw(raw, 'SecurityFeatures'),
            accessibility: getArrayFromRaw(raw, 'AccessibilityFeatures'),
            pool: getFirstFromArray(raw, 'PoolFeatures'),
            fireplace: (property.fireplaces_total || 0) > 0,
            fireplaces_total: property.fireplaces_total || 0,
            view: getArrayFromRaw(raw, 'View'),
            waterfront: property.waterfront_yn || false,
            horse_property: raw.HorseYN || false
        },
        systems: {
            cooling: getArrayFromRaw(raw, 'Cooling'),
            heating: getArrayFromRaw(raw, 'Heating'),
            appliances: transformAppliances(getArrayFromRaw(raw, 'Appliances')),
            utilities: getArrayFromRaw(raw, 'Utilities'),
            water: getFirstFromArray(raw, 'WaterSource'),
            sewer: getFirstFromArray(raw, 'Sewer'),
            green_features: {
                sustainability: getArrayFromRaw(raw, 'GreenSustainability'),
                energy_efficient: getArrayFromRaw(raw, 'GreenEnergyEfficient')
            }
        },
        financial: {
            hoa: {
                required: raw.AssociationYN || false,
                name: raw.AssociationName || null,
                fee_monthly: hoaFeeMonthly,
                fee_annual: hoaAnnual,
                frequency: property.association_fee_frequency || null,
                includes: getArrayFromRaw(raw, 'AssociationFeeIncludes')
            },
            taxes: {
                year: raw.TaxYear || null,
                annual_amount: taxAnnual,
                monthly_estimate: taxMonthly,
                assessed_value: raw.TaxAssessedValue || null,
                rate_percentage: raw.ACT_EstimatedTaxes || null,
                legal_description: raw.TaxLegalDescription || null,
                parcel_number: raw.ParcelNumber || null
            }
        },
        schools: {
            district: raw.HighSchoolDistrict || null,
            elementary: property.elementary_school || null,
            middle: raw.MiddleOrJuniorSchool || null,
            high: raw.HighSchool || null
        },
        community: {
            name: property.subdivision_name || null,
            amenities: getArrayFromRaw(raw, 'CommunityFeatures'),
            website: raw.ACT_CommunityWebSite || null
        },
        description: property.remarks_public || null,
        directions: raw.Directions || null,
        disclosures: getArrayFromRaw(raw, 'Disclosures'),
        listing_agent: {
            name: raw.ListAgentFullName || null,
            email: raw.ListAgentEmail || null,
            phone: raw.ListAgentDirectPhone || null,
            mls_id: raw.ListAgentMlsId || null,
            key: raw.ListAgentKey || null
        },
        listing_office: {
            name: raw.ListOfficeName || null,
            phone: raw.ListOfficePhone || null,
            mls_id: raw.ListOfficeMlsId || null,
            key: raw.ListOfficeKey || null
        },
        media: {
            photo_count: property.photo_count || 0,
            photos_last_updated: property.photos_change_timestamp || null,
            virtual_tour: property.virtual_tour_url_branded || null,
            video_tour: raw.ACT_VideoTourLinkBranded || null,
            listing_url: raw.ACT_ListingDetailURL || null,
            photos: photos
        },
        syndication: {
            display_online: raw.InternetAddressDisplayYN || false,
            allow_comments: raw.InternetConsumerCommentYN || false,
            allow_avm: raw.InternetAutomatedValuationDisplayYN || false,
            syndicated_to: getArrayFromRaw(raw, 'SyndicateTo')
        },
        open_houses: openHousesList,
        calculated_metrics: {
            price_per_sqft: pricePerSqft,
            price_per_acre: pricePerAcre,
            hoa_per_sqft_annual: hoaPerSqftAnnual,
            taxes_per_sqft_annual: taxesPerSqftAnnual,
            estimated_monthly_costs: {
                hoa: hoaFeeMonthly || 0,
                taxes: taxMonthly || 0,
                total: (hoaFeeMonthly || 0) + (taxMonthly || 0)
            }
        }
    };

    return listing;
}

// ============================================================================
// Route Handler
// ============================================================================

/**
 * @swagger
 * /api/listings:
 *   get:
 *     summary: Get property details (v2 - Clean Structure)
 *     description: Retrieve complete property details in a clean, organized JSON structure with calculated metrics. Supports lookup by listing_id or by address+city combination.
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: listing_id
 *         schema:
 *           type: string
 *         description: Listing key (e.g., ACT123456). Use this OR address+city, not both.
 *         example: "ACT209777414"
 *       - in: query
 *         name: address
 *         schema:
 *           type: string
 *         description: Property address with spaces replaced by hyphens (e.g., 508-echo-pass). Must be used with city parameter.
 *         example: "508-echo-pass"
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name with spaces replaced by hyphens (e.g., liberty-hill). Must be used with address parameter.
 *         example: "liberty-hill"
 *     responses:
 *       200:
 *         description: Property details retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ListingDetailV2'
 *       400:
 *         description: Invalid parameters - must provide either listing_id or both address and city
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       404:
 *         description: Listing not found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 *       500:
 *         description: Failed to fetch listing details
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req: Request, res: Response) => {
    try {
        const { listing_id, address, city } = req.query;

        let propertyResult;

        // Validate parameters
        if (listing_id) {
            // Lookup by listing_id
            propertyResult = await pool.query(
                `SELECT * FROM mls.properties WHERE listing_key = $1 AND mlg_can_view = true`,
                [listing_id]
            );
        } else if (address && city) {
            // Lookup by address + city
            // Convert hyphens back to spaces
            const addressSearch = String(address).replace(/-/g, ' ');
            const citySearch = String(city).replace(/-/g, ' ');

            console.log(`[Address Lookup] Searching for address: "${addressSearch}", city: "${citySearch}"`);

            // Search by address and city (case-insensitive, handles multiple spaces)
            // Using REGEXP_REPLACE to normalize multiple spaces to single space
            propertyResult = await pool.query(
                `SELECT * FROM mls.properties
                 WHERE mlg_can_view = true
                 AND LOWER(TRIM(REGEXP_REPLACE(address_full, '\\s+', ' ', 'g'))) = LOWER(TRIM(REGEXP_REPLACE($1, '\\s+', ' ', 'g')))
                 AND LOWER(TRIM(city)) = LOWER(TRIM($2))
                 LIMIT 1`,
                [addressSearch, citySearch]
            );

            console.log(`[Address Lookup] Found ${propertyResult.rows.length} results`);
            if (propertyResult.rows.length > 0) {
                console.log(`[Address Lookup] Matched listing: ${propertyResult.rows[0].listing_key}`);
            }
        } else {
            return res.status(400).json({
                error: 'Invalid parameters. Must provide either listing_id or both address and city.'
            });
        }

        if (propertyResult.rows.length === 0) {
            return res.status(404).json({ error: 'Listing not found' });
        }

        const property = propertyResult.rows[0];
        const listing_key = property.listing_key;

        // Get media (prefer local_url)
        const mediaResult = await pool.query(
            `SELECT media_key, media_category, order_sequence, local_url, media_url,
              caption, width, height
       FROM mls.media
       WHERE listing_key = $1
       ORDER BY order_sequence ASC`,
            [listing_key]
        );

        // Get rooms
        const roomsResult = await pool.query(
            `SELECT room_type, room_level, room_length, room_width
       FROM mls.rooms
       WHERE listing_key = $1`,
            [listing_key]
        );

        // Get open houses (future only)
        const openHousesResult = await pool.query(
            `SELECT start_time, end_time, remarks
       FROM mls.open_houses
       WHERE listing_key = $1
       AND end_time > NOW()
       ORDER BY start_time ASC`,
            [listing_key]
        );

        // Transform to clean structure
        const cleanListing = transformToCleanStructure(
            property,
            mediaResult.rows,
            roomsResult.rows,
            openHousesResult.rows
        );

        const response: ListingDetailResponse = {
            listing: cleanListing
        };

        res.json(response);
    } catch (error) {
        console.error('Detail v2 error:', error);
        res.status(500).json({ error: 'Failed to fetch listing details' });
    }
});

export default router;