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
                PropertyDetail: {
                    type: 'object',
                    properties: {
                        property: { $ref: '#/components/schemas/Property' },
                        media: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    media_key: { type: 'string' },
                                    media_url: { type: 'string' },
                                    local_url: { type: 'string' },
                                    order_sequence: { type: 'integer' },
                                    caption: { type: 'string' },
                                },
                            },
                        },
                        rooms: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    room_type: { type: 'string' },
                                    room_level: { type: 'string' },
                                    room_length: { type: 'number' },
                                    room_width: { type: 'number' },
                                },
                            },
                        },
                        open_houses: {
                            type: 'array',
                            items: {
                                type: 'object',
                                properties: {
                                    start_time: { type: 'string', format: 'date-time' },
                                    end_time: { type: 'string', format: 'date-time' },
                                    remarks: { type: 'string' },
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