import { Router, Request, Response } from 'express';
import { Pool } from 'pg';
import searchClient, { INDEX_NAME } from '../search.js';

const router = Router();

// Property type mapping from simplified types to MLS PropertySubType values
const PROPERTY_TYPE_MAP: Record<string, string[]> = {
    home: ['Single Family Residence', 'Residential', 'Single Family'],
    condo: ['Condominium', 'Condo'],
    townhouse: ['Townhouse', 'Townhome'],
    lot: ['Lots/Land', 'Land', 'Residential Lots/Land'],
    farm_ranch: ['Farm', 'Ranch', 'Farm/Ranch'],
    multi_family: ['Multi-Family', 'Duplex', 'Triplex', 'Fourplex'],
    commercial: ['Commercial'],
};

// Valid sort fields mapping
const SORT_FIELD_MAP: Record<string, string> = {
    list_date: 'original_entry_timestamp',
    list_price: 'list_price',
    living_area: 'living_area',
    price_per_sqft: 'price_per_sqft',
    status: 'standard_status',
    bedrooms_total: 'bedrooms_total',
    bathrooms_total: 'bathrooms_total_integer',
};

interface SearchQuery {
    // Pagination
    page?: string;
    items_per_page?: string;

    // Sorting
    sort_by?: string;
    sort_direction?: string;

    // Geographic
    min_latitude?: string;
    max_latitude?: string;
    min_longitude?: string;
    max_longitude?: string;

    // Property Characteristics
    property_type?: string;
    min_price?: string;
    max_price?: string;
    min_bedrooms?: string;
    max_bedrooms?: string;
    min_bathrooms?: string;
    max_bathrooms?: string;
    min_sqft?: string;
    max_sqft?: string;
    min_lot_size?: string;
    max_lot_size?: string;
    min_year_built?: string;
    max_year_built?: string;
    min_stories?: string;
    max_stories?: string;
    min_price_per_sqft?: string;
    max_price_per_sqft?: string;

    // Amenities & Features
    pool?: string;
    garage?: string;
    min_garage_spaces?: string;
    max_garage_spaces?: string;
    min_parking_spaces?: string;
    max_parking_spaces?: string;
    waterfront?: string;
    fireplace?: string;
    new_construction?: string;

    // Status & Timing
    status?: string;
    days_on_market?: string;
    price_reduction?: string;
    open_house?: string;

    // Search
    keywords?: string;
}

/**
 * Helper function to parse boolean query parameters
 */
function parseBoolean(value: string | undefined): boolean | undefined {
    if (value === undefined) return undefined;
    return value === 'true' || value === '1';
}

/**
 * Helper function to get weekend date ranges
 */
function getWeekendDates(type: 'this' | 'next'): { start: Date; end: Date } {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 6 = Saturday

    let daysUntilSaturday: number;
    if (type === 'this') {
        // This weekend
        daysUntilSaturday = dayOfWeek === 0 ? 6 : 6 - dayOfWeek;
    } else {
        // Next weekend
        daysUntilSaturday = dayOfWeek === 0 ? 13 : 13 - dayOfWeek;
    }

    const saturday = new Date(now);
    saturday.setDate(now.getDate() + daysUntilSaturday);
    saturday.setHours(0, 0, 0, 0);

    const sunday = new Date(saturday);
    sunday.setDate(saturday.getDate() + 1);
    sunday.setHours(23, 59, 59, 999);

    return { start: saturday, end: sunday };
}

/**
 * Build SQL WHERE conditions from query parameters
 */
function buildWhereConditions(query: SearchQuery, _pool: Pool): { conditions: string[]; params: any[] } {
    const conditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    // Always filter by MlgCanView
    conditions.push('p.mlg_can_view = true');

    // Geographic bounding box
    if (query.min_latitude && query.max_latitude && query.min_longitude && query.max_longitude) {
        const minLat = parseFloat(query.min_latitude);
        const maxLat = parseFloat(query.max_latitude);
        const minLng = parseFloat(query.min_longitude);
        const maxLng = parseFloat(query.max_longitude);

        conditions.push(`p.geog && ST_MakeEnvelope($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, 4326)::geography`);
        params.push(minLng, minLat, maxLng, maxLat);
        paramIndex += 4;
    }

    // Property type
    if (query.property_type) {
        const types = query.property_type.split(',').map(t => t.trim());
        const subTypes: string[] = [];
        types.forEach(type => {
            if (PROPERTY_TYPE_MAP[type]) {
                subTypes.push(...PROPERTY_TYPE_MAP[type]);
            }
        });
        if (subTypes.length > 0) {
            conditions.push(`p.property_sub_type = ANY($${paramIndex})`);
            params.push(subTypes);
            paramIndex++;
        }
    }

    // Price range
    if (query.min_price) {
        conditions.push(`p.list_price >= $${paramIndex}`);
        params.push(parseInt(query.min_price));
        paramIndex++;
    }
    if (query.max_price) {
        conditions.push(`p.list_price <= $${paramIndex}`);
        params.push(parseInt(query.max_price));
        paramIndex++;
    }

    // Bedrooms
    if (query.min_bedrooms) {
        conditions.push(`p.bedrooms_total >= $${paramIndex}`);
        params.push(parseInt(query.min_bedrooms));
        paramIndex++;
    }
    if (query.max_bedrooms) {
        conditions.push(`p.bedrooms_total <= $${paramIndex}`);
        params.push(parseInt(query.max_bedrooms));
        paramIndex++;
    }

    // Bathrooms
    if (query.min_bathrooms) {
        conditions.push(`p.bathrooms_total_integer >= $${paramIndex}`);
        params.push(parseFloat(query.min_bathrooms));
        paramIndex++;
    }
    if (query.max_bathrooms) {
        conditions.push(`p.bathrooms_total_integer <= $${paramIndex}`);
        params.push(parseFloat(query.max_bathrooms));
        paramIndex++;
    }

    // Square footage
    if (query.min_sqft) {
        conditions.push(`p.living_area >= $${paramIndex}`);
        params.push(parseInt(query.min_sqft));
        paramIndex++;
    }
    if (query.max_sqft) {
        conditions.push(`p.living_area <= $${paramIndex}`);
        params.push(parseInt(query.max_sqft));
        paramIndex++;
    }

    // Lot size
    if (query.min_lot_size) {
        conditions.push(`p.lot_size_acres >= $${paramIndex}`);
        params.push(parseFloat(query.min_lot_size));
        paramIndex++;
    }
    if (query.max_lot_size) {
        conditions.push(`p.lot_size_acres <= $${paramIndex}`);
        params.push(parseFloat(query.max_lot_size));
        paramIndex++;
    }

    // Year built
    if (query.min_year_built) {
        conditions.push(`p.year_built >= $${paramIndex}`);
        params.push(parseInt(query.min_year_built));
        paramIndex++;
    }
    if (query.max_year_built) {
        conditions.push(`p.year_built <= $${paramIndex}`);
        params.push(parseInt(query.max_year_built));
        paramIndex++;
    }

    // Price per sqft (calculated field)
    if (query.min_price_per_sqft) {
        conditions.push(`(p.list_price / NULLIF(p.living_area, 0)) >= $${paramIndex}`);
        params.push(parseFloat(query.min_price_per_sqft));
        paramIndex++;
    }
    if (query.max_price_per_sqft) {
        conditions.push(`(p.list_price / NULLIF(p.living_area, 0)) <= $${paramIndex}`);
        params.push(parseFloat(query.max_price_per_sqft));
        paramIndex++;
    }

    // Amenities
    if (query.pool !== undefined) {
        const hasPool = parseBoolean(query.pool);
        if (hasPool !== undefined) {
            conditions.push(`p.pool_private_yn = $${paramIndex}`);
            params.push(hasPool);
            paramIndex++;
        }
    }

    if (query.garage !== undefined) {
        const hasGarage = parseBoolean(query.garage);
        if (hasGarage !== undefined) {
            if (hasGarage) {
                conditions.push(`p.garage_spaces > 0`);
            } else {
                conditions.push(`(p.garage_spaces IS NULL OR p.garage_spaces = 0)`);
            }
        }
    }

    if (query.min_garage_spaces) {
        conditions.push(`p.garage_spaces >= $${paramIndex}`);
        params.push(parseInt(query.min_garage_spaces));
        paramIndex++;
    }
    if (query.max_garage_spaces) {
        conditions.push(`p.garage_spaces <= $${paramIndex}`);
        params.push(parseInt(query.max_garage_spaces));
        paramIndex++;
    }

    if (query.min_parking_spaces) {
        conditions.push(`p.parking_total >= $${paramIndex}`);
        params.push(parseInt(query.min_parking_spaces));
        paramIndex++;
    }
    if (query.max_parking_spaces) {
        conditions.push(`p.parking_total <= $${paramIndex}`);
        params.push(parseInt(query.max_parking_spaces));
        paramIndex++;
    }

    if (query.waterfront !== undefined) {
        const isWaterfront = parseBoolean(query.waterfront);
        if (isWaterfront !== undefined) {
            conditions.push(`p.waterfront_yn = $${paramIndex}`);
            params.push(isWaterfront);
            paramIndex++;
        }
    }

    if (query.fireplace !== undefined) {
        const hasFireplace = parseBoolean(query.fireplace);
        if (hasFireplace !== undefined) {
            if (hasFireplace) {
                conditions.push(`p.fireplaces_total > 0`);
            } else {
                conditions.push(`(p.fireplaces_total IS NULL OR p.fireplaces_total = 0)`);
            }
        }
    }

    if (query.new_construction !== undefined) {
        const isNewConstruction = parseBoolean(query.new_construction);
        if (isNewConstruction !== undefined) {
            conditions.push(`p.new_construction_yn = $${paramIndex}`);
            params.push(isNewConstruction);
            paramIndex++;
        }
    }

    // Status
    if (query.status) {
        const statuses = query.status.split(',').map(s => {
            const status = s.trim().toLowerCase();
            if (status === 'active') return 'Active';
            if (status === 'pending') return 'Pending';
            if (status === 'sold') return 'Closed';
            return s.trim();
        });
        conditions.push(`p.standard_status = ANY($${paramIndex})`);
        params.push(statuses);
        paramIndex++;
    }

    // Days on market
    if (query.days_on_market) {
        conditions.push(`EXTRACT(DAY FROM NOW() - p.original_entry_timestamp) <= $${paramIndex}`);
        params.push(parseInt(query.days_on_market));
        paramIndex++;
    }

    // Price reduction
    if (query.price_reduction) {
        // Base condition: price has been reduced
        conditions.push(`p.original_list_price > p.list_price`);

        if (query.price_reduction !== 'any') {
            // Time-based price reduction filters
            const daysMap: Record<string, number> = {
                last_day: 1,
                last_3_days: 3,
                last_7_days: 7,
                last_14_days: 14,
                last_30_days: 30,
            };

            if (daysMap[query.price_reduction]) {
                conditions.push(`p.major_change_type = 'Price Change'`);
                conditions.push(`p.major_change_timestamp >= NOW() - INTERVAL '${daysMap[query.price_reduction]} days'`);
            } else if (query.price_reduction.startsWith('over_')) {
                const months = parseInt(query.price_reduction.replace('over_', '').replace('_months', '').replace('_month', ''));
                conditions.push(`p.major_change_type = 'Price Change'`);
                conditions.push(`p.major_change_timestamp < NOW() - INTERVAL '${months} months'`);
            }
        }
    }

    // Open house
    if (query.open_house) {
        if (query.open_house === 'this_weekend') {
            const { start, end } = getWeekendDates('this');
            conditions.push(`EXISTS (
                SELECT 1 FROM mls.open_houses oh
                WHERE oh.listing_key = p.listing_key
                AND oh.start_time >= $${paramIndex}
                AND oh.start_time <= $${paramIndex + 1}
            )`);
            params.push(start, end);
            paramIndex += 2;
        } else if (query.open_house === 'next_weekend') {
            const { start, end } = getWeekendDates('next');
            conditions.push(`EXISTS (
                SELECT 1 FROM mls.open_houses oh
                WHERE oh.listing_key = p.listing_key
                AND oh.start_time >= $${paramIndex}
                AND oh.start_time <= $${paramIndex + 1}
            )`);
            params.push(start, end);
            paramIndex += 2;
        } else if (query.open_house === 'all') {
            conditions.push(`EXISTS (
                SELECT 1 FROM mls.open_houses oh
                WHERE oh.listing_key = p.listing_key
                AND oh.start_time >= NOW()
            )`);
        }
    }

    return { conditions, params };
}

/**
 * GET /api/listings/search
 * Comprehensive search endpoint with all filters, sorting, and pagination
 */
router.get('/', async (req: Request<Record<string, never>, Record<string, never>, Record<string, never>, SearchQuery>, res: Response) => {
    try {
        const query = req.query;

        // Pagination
        const page = parseInt(query.page || '1', 10);
        const itemsPerPage = Math.min(parseInt(query.items_per_page || '20', 10), 100);
        const offset = (page - 1) * itemsPerPage;

        // Sorting
        const sortBy = query.sort_by || 'list_date';
        const sortDirection = (query.sort_direction || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const sortField = SORT_FIELD_MAP[sortBy] || 'original_entry_timestamp';

        // Get database pool from app
        const pool: Pool = (req.app.locals.db as Pool);

        // Step 1: If keywords provided, use Meilisearch to get listing_keys
        let listingKeys: string[] | null = null;
        if (query.keywords) {
            const index = searchClient.index(INDEX_NAME);
            const meiliResults = await index.search(query.keywords, {
                filter: 'mlg_can_view = true',
                limit: 1000,
                attributesToRetrieve: ['listing_key'],
            });
            listingKeys = meiliResults.hits.map((hit: any) => hit.listing_key);

            // If no results from Meilisearch, return empty
            if (listingKeys.length === 0) {
                return res.json({
                    data: [],
                    metadata: {
                        total_listings_count: 0,
                        filtered_listings_count: 0,
                        current_page: page,
                        total_pages: 0,
                        items_per_page: itemsPerPage,
                        sort_by: sortBy,
                        sort_direction: sortDirection.toLowerCase(),
                    },
                });
            }
        }

        // Step 2: Build SQL query with all filters
        const { conditions, params } = buildWhereConditions(query, pool);

        // Add listing_keys filter if from Meilisearch
        if (listingKeys) {
            conditions.push(`p.listing_key = ANY($${params.length + 1})`);
            params.push(listingKeys);
        }

        const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Build ORDER BY clause
        let orderByClause = '';
        if (sortField === 'price_per_sqft') {
            orderByClause = `ORDER BY (p.list_price / NULLIF(p.living_area, 0)) ${sortDirection} NULLS LAST`;
        } else if (sortField === 'standard_status') {
            // Custom status ordering: Active > Pending > Sold
            orderByClause = `ORDER BY 
                CASE p.standard_status
                    WHEN 'Active' THEN 1
                    WHEN 'Pending' THEN 2
                    WHEN 'Closed' THEN 3
                    ELSE 4
                END ${sortDirection}`;
        } else {
            orderByClause = `ORDER BY p.${sortField} ${sortDirection} NULLS LAST`;
        }

        // Get total counts
        const totalCountQuery = `SELECT COUNT(*) as count FROM mls.properties p`;
        const totalCountResult = await pool.query(totalCountQuery);
        const totalListingsCount = parseInt(totalCountResult.rows[0].count, 10);

        const filteredCountQuery = `SELECT COUNT(*) as count FROM mls.properties p ${whereClause}`;
        const filteredCountResult = await pool.query(filteredCountQuery, params);
        const filteredListingsCount = parseInt(filteredCountResult.rows[0].count, 10);

        // Main query with all fields and calculated fields
        const mainQuery = `
            SELECT 
                p.listing_key,
                p.standard_status,
                p.bathrooms_total_integer as bathrooms_total,
                p.bedrooms_total,
                p.original_list_price,
                p.list_price,
                p.price_change_timestamp,
                p.list_agent_key,
                p.list_office_name,
                p.major_change_type,
                p.major_change_timestamp,
                p.new_construction_yn as new_construction,
                p.original_entry_timestamp,
                p.pool_private_yn as pool_private,
                p.living_area,
                p.lot_size_acres,
                p.property_type,
                p.property_sub_type,
                p.year_built,
                p.levels,
                p.garage_spaces,
                p.parking_total,
                p.elementary_school,
                p.high_school_district,
                p.subdivision_name,
                p.photo_count as photos_count,
                -- Primary photo URL with fallback to first media item
                COALESCE(
                    p.primary_photo_url,
                    (SELECT m.media_url FROM mls.media m
                     WHERE m.listing_key = p.listing_key
                     AND (m.media_category = 'Photo' OR m.media_category IS NULL)
                     ORDER BY m.order_sequence ASC
                     LIMIT 1)
                ) as primary_photo_url,
                p.street_name,
                p.city,
                p.state_or_province,
                p.postal_code,
                p.county_or_parish,
                p.address_full as unparsed_address,
                p.latitude,
                p.longitude,
                p.association_fee,
                p.association_fee_frequency,
                p.tax_annual_amount,
                p.virtual_tour_url_unbranded as virtual_tour_url,
                p.waterfront_yn as waterfront,
                p.fireplaces_total,
                -- Calculated fields
                CASE 
                    WHEN p.living_area > 0 THEN ROUND((p.list_price / p.living_area)::numeric, 2)
                    ELSE NULL 
                END as price_per_sqft,
                (p.original_list_price > p.list_price) as price_reduced,
                CASE 
                    WHEN p.original_list_price > p.list_price 
                    THEN p.original_list_price - p.list_price
                    ELSE 0 
                END as price_reduction_amount,
                CASE 
                    WHEN p.original_list_price > p.list_price AND p.original_list_price > 0
                    THEN ROUND(((p.original_list_price - p.list_price) / p.original_list_price * 100)::numeric, 2)
                    ELSE 0 
                END as price_reduction_percentage,
                CASE 
                    WHEN p.original_entry_timestamp IS NOT NULL
                    THEN EXTRACT(DAY FROM NOW() - p.original_entry_timestamp)::integer
                    ELSE NULL 
                END as days_on_market,
                -- Open houses as JSON array
                (
                    SELECT COALESCE(json_agg(DISTINCT jsonb_build_object(
                        'start_time', oh.start_time,
                        'end_time', oh.end_time
                    ) ORDER BY jsonb_build_object('start_time', oh.start_time, 'end_time', oh.end_time)), '[]'::json)
                    FROM mls.open_houses oh
                    WHERE oh.listing_key = p.listing_key
                    AND oh.start_time >= NOW()
                ) as open_houses
            FROM mls.properties p
            ${whereClause}
            ${orderByClause}
            LIMIT $${params.length + 1} OFFSET $${params.length + 2}
        `;

        params.push(itemsPerPage, offset);
        const result = await pool.query(mainQuery, params);

        const totalPages = Math.ceil(filteredListingsCount / itemsPerPage);

        res.json({
            data: result.rows,
            metadata: {
                total_listings_count: totalListingsCount,
                filtered_listings_count: filteredListingsCount,
                current_page: page,
                total_pages: totalPages,
                items_per_page: itemsPerPage,
                sort_by: sortBy,
                sort_direction: sortDirection.toLowerCase(),
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            error: {
                code: 'SEARCH_ERROR',
                message: 'An error occurred while searching listings',
                details: error instanceof Error ? error.message : 'Unknown error',
            },
        });
    }
});

export default router;