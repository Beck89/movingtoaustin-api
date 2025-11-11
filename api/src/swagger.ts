import swaggerJsdoc from 'swagger-jsdoc';

// Dynamically determine server URLs based on environment
const getServers = () => {
    const servers = [];

    // Production server (if API_URL is set)
    if (process.env.API_URL) {
        servers.push({
            url: process.env.API_URL,
            description: 'Production server',
        });
    }

    // Always include localhost for development
    servers.push({
        url: `http://localhost:${process.env.API_PORT || 3000}`,
        description: 'Development server',
    });

    return servers;
};

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: '3.0.0',
        info: {
            title: 'MLS Grid Listings API',
            version: '1.0.0',
            description: 'RESTful API for searching and retrieving MLS property listings',
            contact: {
                name: 'API Support',
            },
        },
        servers: getServers(),
        components: {
            schemas: {
                Property: {
                    type: 'object',
                    properties: {
                        listing_key: { type: 'string', example: 'ACT123456' },
                        listing_id: { type: 'string', example: '123456' },
                        standard_status: { type: 'string', example: 'Active' },
                        property_type: { type: 'string', example: 'Residential' },
                        list_price: { type: 'number', example: 450000 },
                        bedrooms_total: { type: 'integer', example: 3 },
                        bathrooms_full: { type: 'integer', example: 2 },
                        living_area: { type: 'integer', example: 2000 },
                        city: { type: 'string', example: 'Austin' },
                        state_or_province: { type: 'string', example: 'TX' },
                        postal_code: { type: 'string', example: '78704' },
                        address_full: { type: 'string', example: '123 Main St' },
                        latitude: { type: 'number', example: 30.2672 },
                        longitude: { type: 'number', example: -97.7431 },
                        photo_count: { type: 'integer', example: 15 },
                        primary_photo_url: { type: 'string', example: 'https://cdn.example.com/photo.jpg' },
                    },
                },
                SearchResponse: {
                    type: 'object',
                    properties: {
                        hits: {
                            type: 'array',
                            items: { $ref: '#/components/schemas/Property' },
                        },
                        estimatedTotalHits: { type: 'integer', example: 150 },
                        limit: { type: 'integer', example: 20 },
                        offset: { type: 'integer', example: 0 },
                        processingTimeMs: { type: 'integer', example: 12 },
                        facetDistribution: {
                            type: 'object',
                            additionalProperties: {
                                type: 'object',
                                additionalProperties: { type: 'integer' },
                            },
                        },
                    },
                },
                ListingDetailV2: {
                    type: 'object',
                    properties: {
                        listing: {
                            type: 'object',
                            properties: {
                                ids: {
                                    type: 'object',
                                    properties: {
                                        listing_key: { type: 'string', example: 'ACT209777414' },
                                        listing_id: { type: 'string', example: 'ACT9743847' },
                                        mls: { type: 'string', example: 'actris' },
                                    },
                                },
                                status: {
                                    type: 'object',
                                    properties: {
                                        standard_status: { type: 'string', example: 'Active' },
                                        listing_date: { type: 'string', format: 'date', example: '2025-10-27' },
                                        days_on_market: { type: 'integer', example: 14 },
                                        last_modified: { type: 'string', format: 'date-time' },
                                    },
                                },
                                pricing: {
                                    type: 'object',
                                    properties: {
                                        current_price: { type: 'number', example: 530000 },
                                        original_price: { type: 'number', example: 559990 },
                                        price_reduction: { type: 'number', example: 29990 },
                                        price_reduction_percentage: { type: 'number', example: 5.36 },
                                        price_per_sqft: { type: 'number', example: 205.83 },
                                        last_price_change: { type: 'string', format: 'date-time' },
                                    },
                                },
                                property_details: {
                                    type: 'object',
                                    properties: {
                                        type: { type: 'string', example: 'Single Family Residence' },
                                        category: { type: 'string', example: 'Residential' },
                                        condition: { type: 'string', example: 'New Construction' },
                                        year_built: { type: 'integer', example: 2025 },
                                        builder: { type: 'string', example: 'CastleRock Communities' },
                                    },
                                },
                                location: {
                                    type: 'object',
                                    properties: {
                                        address: { type: 'string', example: '508 Echo Pass' },
                                        city: { type: 'string', example: 'Liberty Hill' },
                                        state: { type: 'string', example: 'TX' },
                                        zip: { type: 'string', example: '78642' },
                                        county: { type: 'string', example: 'Williamson' },
                                        subdivision: { type: 'string', example: 'Santa Rita Ranch' },
                                        direction_faces: { type: 'string', example: 'East' },
                                        coordinates: {
                                            type: 'object',
                                            properties: {
                                                latitude: { type: 'number', example: 30.65768844 },
                                                longitude: { type: 'number', example: -97.82743594 },
                                            },
                                        },
                                    },
                                },
                                size: {
                                    type: 'object',
                                    properties: {
                                        living_area_sqft: { type: 'integer', example: 2575 },
                                        lot_size_acres: { type: 'number', example: 0.1544 },
                                        lot_size_sqft: { type: 'integer', example: 6726 },
                                        stories: { type: 'string', example: 'Two' },
                                    },
                                },
                                rooms: {
                                    type: 'object',
                                    properties: {
                                        bedrooms: { type: 'integer', example: 4 },
                                        bedrooms_main_floor: { type: 'integer', example: 2 },
                                        bedrooms_upper_floor: { type: 'string', example: '2' },
                                        bathrooms_full: { type: 'integer', example: 3 },
                                        bathrooms_half: { type: 'integer', example: 0 },
                                        bathrooms_total: { type: 'integer', example: 3 },
                                        garage_spaces: { type: 'number', example: 2 },
                                        parking_total: { type: 'number', example: 2 },
                                    },
                                },
                                room_list: {
                                    type: 'array',
                                    items: {
                                        type: 'object',
                                        properties: {
                                            type: { type: 'string', example: 'Bedroom' },
                                            level: { type: 'string', example: 'Main' },
                                        },
                                    },
                                },
                                features: {
                                    type: 'object',
                                    properties: {
                                        interior: { type: 'array', items: { type: 'string' } },
                                        exterior: { type: 'array', items: { type: 'string' } },
                                        construction: { type: 'array', items: { type: 'string' } },
                                        pool: { type: 'string', example: 'None' },
                                        fireplace: { type: 'boolean', example: false },
                                        waterfront: { type: 'boolean', example: false },
                                    },
                                },
                                financial: {
                                    type: 'object',
                                    properties: {
                                        hoa: {
                                            type: 'object',
                                            properties: {
                                                required: { type: 'boolean', example: true },
                                                name: { type: 'string', example: 'Santa Rita Ranch HOA' },
                                                fee_monthly: { type: 'number', example: 106 },
                                                fee_annual: { type: 'number', example: 1272 },
                                            },
                                        },
                                        taxes: {
                                            type: 'object',
                                            properties: {
                                                year: { type: 'integer', example: 2024 },
                                                annual_amount: { type: 'number', example: 2169.07 },
                                                monthly_estimate: { type: 'number', example: 180.76 },
                                            },
                                        },
                                    },
                                },
                                media: {
                                    type: 'object',
                                    properties: {
                                        photo_count: { type: 'integer', example: 30 },
                                        photos: {
                                            type: 'array',
                                            items: {
                                                type: 'object',
                                                properties: {
                                                    order: { type: 'integer', example: 0 },
                                                    url: { type: 'string' },
                                                    width: { type: 'integer', example: 2048 },
                                                    height: { type: 'integer', example: 1151 },
                                                },
                                            },
                                        },
                                        virtual_tour: { type: 'string' },
                                        video_tour: { type: 'string' },
                                    },
                                },
                                calculated_metrics: {
                                    type: 'object',
                                    properties: {
                                        price_per_sqft: { type: 'number', example: 205.83 },
                                        price_per_acre: { type: 'number', example: 3432624.19 },
                                        estimated_monthly_costs: {
                                            type: 'object',
                                            properties: {
                                                hoa: { type: 'number', example: 106 },
                                                taxes: { type: 'number', example: 180.76 },
                                                total: { type: 'number', example: 286.76 },
                                            },
                                        },
                                    },
                                },
                            },
                        },
                    },
                },
                SyncStatus: {
                    type: 'object',
                    properties: {
                        resource: { type: 'string', example: 'Property' },
                        last_sync: { type: 'string', format: 'date-time' },
                        last_modification: { type: 'string', format: 'date-time' },
                        record_count: { type: 'integer', example: 1250 },
                    },
                },
                Error: {
                    type: 'object',
                    properties: {
                        error: { type: 'string', example: 'Invalid request parameters' },
                    },
                },
            },
        },
    },
    apis: ['./api/src/routes/*.ts'], // Path to the API routes
};

export const swaggerSpec = swaggerJsdoc(options);