import { Router, Request, Response } from 'express';
import searchClient, { INDEX_NAME } from '../search.js';

const router = Router();

router.get('/', async (req: Request, res: Response) => {
    try {
        const { q } = req.query;

        if (!q || typeof q !== 'string') {
            return res.status(400).json({ error: 'Query parameter "q" is required' });
        }

        const index = searchClient.index(INDEX_NAME);

        // Meilisearch search with typo tolerance and prefix search
        const result = await index.search(q, {
            limit: 10,
            filter: 'mlg_can_view = true',
            attributesToRetrieve: [
                'listing_key',
                'listing_id',
                'address_full',
                'city',
                'state_or_province',
                'postal_code',
                '_geo',
            ],
            attributesToSearchOn: [
                'address_full',
                'postal_code',
                'subdivision_name',
                'listing_id',
                'city',
            ],
        });

        const suggestions = result.hits.map((hit: any) => ({
            listing_key: hit.listing_key,
            listing_id: hit.listing_id,
            label: hit.address_full || `${hit.city}, ${hit.state_or_province}`,
            city: hit.city,
            state: hit.state_or_province,
            postal_code: hit.postal_code,
            location: hit._geo,
        }));

        res.json({ suggestions });
    } catch (error) {
        console.error('Suggest error:', error);
        res.status(500).json({ error: 'Suggestion failed' });
    }
});

export default router;