import { Router, Request, Response } from 'express';
import searchClient, { INDEX_NAME } from '../search.js';

const router = Router();

interface SearchQuery {
    bounds?: string; // lat1,lon1,lat2,lon2
    minPrice?: string;
    maxPrice?: string;
    beds?: string;
    baths?: string;
    status?: string;
    city?: string;
    features?: string; // comma-separated
    text?: string;
    page?: string;
    limit?: string;
}

/**
 * @swagger
 * /listings/search:
 *   get:
 *     summary: Search for property listings
 *     description: Search and filter property listings with faceted search, geospatial filtering, and full-text search
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: bounds
 *         schema:
 *           type: string
 *         description: Geographic bounding box as lat1,lon1,lat2,lon2
 *         example: "30.2,-97.8,30.3,-97.7"
 *       - in: query
 *         name: minPrice
 *         schema:
 *           type: integer
 *         description: Minimum list price
 *         example: 200000
 *       - in: query
 *         name: maxPrice
 *         schema:
 *           type: integer
 *         description: Maximum list price
 *         example: 500000
 *       - in: query
 *         name: beds
 *         schema:
 *           type: integer
 *         description: Minimum number of bedrooms
 *         example: 3
 *       - in: query
 *         name: baths
 *         schema:
 *           type: integer
 *         description: Minimum number of full bathrooms
 *         example: 2
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Property status (Active, Pending, Sold, etc.)
 *         example: "Active"
 *       - in: query
 *         name: city
 *         schema:
 *           type: string
 *         description: City name
 *         example: "Austin"
 *       - in: query
 *         name: features
 *         schema:
 *           type: string
 *         description: Comma-separated list of features
 *         example: "Pool,View"
 *       - in: query
 *         name: text
 *         schema:
 *           type: string
 *         description: Full-text search query
 *         example: "downtown condo"
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number for pagination
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of results per page
 *     responses:
 *       200:
 *         description: Successful search results
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/SearchResponse'
 *       500:
 *         description: Search failed
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Error'
 */
router.get('/', async (req: Request<{}, {}, {}, SearchQuery>, res: Response) => {
    try {
        const {
            bounds,
            minPrice,
            maxPrice,
            beds,
            baths,
            status,
            city,
            features,
            text,
            page = '1',
            limit = '20',
        } = req.query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum;

        // Build Meilisearch filter string
        const filters: string[] = [];

        // Always filter by MlgCanView
        filters.push('mlg_can_view = true');

        // Geo bounds filter
        if (bounds) {
            const [lat1, lon1, lat2, lon2] = bounds.split(',').map(Number);
            const minLat = Math.min(lat1, lat2);
            const maxLat = Math.max(lat1, lat2);
            const minLng = Math.min(lon1, lon2);
            const maxLng = Math.max(lon1, lon2);
            filters.push(`_geo.lat ${minLat} TO ${maxLat}`);
            filters.push(`_geo.lng ${minLng} TO ${maxLng}`);
        }

        // Price range
        if (minPrice) {
            filters.push(`list_price >= ${parseInt(minPrice, 10)}`);
        }
        if (maxPrice) {
            filters.push(`list_price <= ${parseInt(maxPrice, 10)}`);
        }

        // Bedrooms
        if (beds) {
            filters.push(`bedrooms_total >= ${parseInt(beds, 10)}`);
        }

        // Bathrooms
        if (baths) {
            filters.push(`bathrooms_full >= ${parseInt(baths, 10)}`);
        }

        // Status
        if (status) {
            filters.push(`standard_status = "${status}"`);
        }

        // City (normalize to uppercase for MLS data)
        if (city) {
            filters.push(`city = "${city.toUpperCase()}"`);
        }

        // Features (if implemented)
        if (features) {
            const featureList = features.split(',').map(f => f.trim());
            const featureFilters = featureList.map(f => `features = "${f}"`);
            filters.push(`(${featureFilters.join(' OR ')})`);
        }

        const filterString = filters.join(' AND ');

        const index = searchClient.index(INDEX_NAME);

        // Perform search
        const searchParams: any = {
            offset,
            limit: limitNum,
            filter: filterString,
            sort: ['modification_timestamp:desc'],
        };

        // Add text query if provided
        if (text) {
            searchParams.q = text;
            searchParams.attributesToSearchOn = [
                'address_full',
                'remarks_public',
                'city',
                'postal_code',
                'subdivision_name',
            ];
        }

        const result = await index.search(text || '', searchParams);

        // Get facet distributions
        const facetResult = await index.search('', {
            filter: filterString,
            facets: [
                'standard_status',
                'city',
                'property_type',
                'bedrooms_total',
            ],
            limit: 0, // Don't return documents, just facets
        });

        // Format price ranges manually (Meilisearch doesn't have range aggregations)
        const priceRanges = [
            { label: 'Under $200k', from: 0, to: 200000, count: 0 },
            { label: '$200k-$400k', from: 200000, to: 400000, count: 0 },
            { label: '$400k-$600k', from: 400000, to: 600000, count: 0 },
            { label: '$600k-$800k', from: 600000, to: 800000, count: 0 },
            { label: '$800k-$1M', from: 800000, to: 1000000, count: 0 },
            { label: 'Over $1M', from: 1000000, to: Infinity, count: 0 },
        ];

        // Count properties in each price range (simplified - in production, you'd query for each range)
        // For now, we'll return the structure without counts

        res.json({
            total: result.estimatedTotalHits || 0,
            page: pageNum,
            limit: limitNum,
            results: result.hits,
            facets: {
                status_counts: facetResult.facetDistribution?.standard_status || {},
                city_counts: facetResult.facetDistribution?.city || {},
                property_type_counts: facetResult.facetDistribution?.property_type || {},
                beds_counts: facetResult.facetDistribution?.bedrooms_total || {},
                price_ranges: priceRanges,
            },
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({ error: 'Search failed' });
    }
});

export default router;