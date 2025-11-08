import { MeiliSearch } from 'meilisearch';
import dotenv from 'dotenv';

dotenv.config();

const client = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';

async function setupMeilisearch() {
    console.log('🔧 Setting up Meilisearch index...');
    console.log(`Index: ${INDEX_NAME}`);
    console.log('');

    try {
        // Get or create index
        const index = client.index(INDEX_NAME);

        // Configure filterable attributes
        console.log('⚙️  Configuring filterable attributes...');
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
            'bedrooms_total',
            'bathrooms_full',
            'living_area',
            'year_built',
            'features',
        ]);

        // Configure sortable attributes
        console.log('⚙️  Configuring sortable attributes...');
        await index.updateSortableAttributes([
            'list_price',
            'modification_timestamp',
            'bedrooms_total',
            'bathrooms_full',
            'living_area',
            'year_built',
        ]);

        // Configure searchable attributes (with ranking)
        console.log('⚙️  Configuring searchable attributes...');
        await index.updateSearchableAttributes([
            'address_full',
            'city',
            'postal_code',
            'subdivision_name',
            'listing_id',
            'remarks_public',
        ]);

        // Configure displayed attributes (what gets returned)
        console.log('⚙️  Configuring displayed attributes...');
        await index.updateDisplayedAttributes([
            'id',
            'listing_key',
            'listing_id',
            'originating_system',
            'standard_status',
            'mlg_can_view',
            'mlg_can_use',
            'property_type',
            'property_sub_type',
            'list_price',
            'bedrooms_total',
            'bathrooms_full',
            'living_area',
            'year_built',
            'lot_size_acres',
            'city',
            'state_or_province',
            'postal_code',
            'county_or_parish',
            'subdivision_name',
            'address_full',
            'remarks_public',
            'photo_count',
            'primary_photo_url',
            '_geo',
            'modification_timestamp',
            'photos_change_timestamp',
        ]);

        // Configure ranking rules
        console.log('⚙️  Configuring ranking rules...');
        await index.updateRankingRules([
            'words',
            'typo',
            'proximity',
            'attribute',
            'sort',
            'exactness',
        ]);

        // Configure typo tolerance
        console.log('⚙️  Configuring typo tolerance...');
        await index.updateTypoTolerance({
            enabled: true,
            minWordSizeForTypos: {
                oneTypo: 4,
                twoTypos: 8,
            },
        });

        // Configure pagination
        console.log('⚙️  Configuring pagination...');
        await index.updatePagination({
            maxTotalHits: 10000,
        });

        console.log('');
        console.log('✅ Meilisearch index configured successfully!');
        console.log('');
        console.log('Index settings:');
        console.log('  - Typo tolerance: Enabled (1 typo for 4+ chars, 2 typos for 8+ chars)');
        console.log('  - Geo search: Enabled via _geo field');
        console.log('  - Facets: Available on all filterable attributes');
        console.log('  - Max results: 10,000 hits');
        console.log('');
        console.log('Next steps:');
        console.log('  1. Run test import: npm run test:import');
        console.log('  2. Start API: npm run dev:api');
        console.log('  3. Test search: curl "http://localhost:3000/listings/search?status=Active&limit=5"');

    } catch (error) {
        console.error('❌ Failed to setup Meilisearch:', error);
        throw error;
    }
}

setupMeilisearch().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});