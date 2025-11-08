import { MeiliSearch } from 'meilisearch';
import dotenv from 'dotenv';

dotenv.config();

const client = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';

async function testSearch() {
    console.log('🔍 Testing Meilisearch...\n');

    try {
        const index = client.index(INDEX_NAME);

        // Check index stats
        console.log('📊 Index Stats:');
        const stats = await index.getStats();
        console.log(`  - Total documents: ${stats.numberOfDocuments}`);
        console.log('');

        // Check settings
        console.log('⚙️  Index Settings:');
        const settings = await index.getSettings();
        console.log('  - Filterable attributes:', settings.filterableAttributes);
        console.log('  - Sortable attributes:', settings.sortableAttributes);
        console.log('  - Searchable attributes:', settings.searchableAttributes);
        console.log('');

        // Test basic search
        console.log('🔎 Test 1: Basic search (no filters)');
        const result1 = await index.search('', { limit: 3 });
        console.log(`  - Found ${result1.estimatedTotalHits} total hits`);
        console.log(`  - Returned ${result1.hits.length} results`);
        if (result1.hits.length > 0) {
            const firstHit = result1.hits[0] as any;
            console.log(`  - First result city: "${firstHit.city}"`);
        }
        console.log('');

        // Test city filter with uppercase
        console.log('🔎 Test 2: City filter (AUSTIN)');
        try {
            const result2 = await index.search('', {
                filter: 'city = "AUSTIN"',
                limit: 3,
            });
            console.log(`  - Found ${result2.estimatedTotalHits} results`);
            console.log(`  - Success! ✅`);
        } catch (error: any) {
            console.log(`  - Error: ${error.message} ❌`);
        }
        console.log('');

        // Test mlg_can_view filter
        console.log('🔎 Test 3: MlgCanView filter');
        try {
            const result3 = await index.search('', {
                filter: 'mlg_can_view = true',
                limit: 3,
            });
            console.log(`  - Found ${result3.estimatedTotalHits} results`);
            console.log(`  - Success! ✅`);
        } catch (error: any) {
            console.log(`  - Error: ${error.message} ❌`);
        }
        console.log('');

        // Test combined filters
        console.log('🔎 Test 4: Combined filters (mlg_can_view AND city)');
        try {
            const result4 = await index.search('', {
                filter: 'mlg_can_view = true AND city = "AUSTIN"',
                limit: 3,
            });
            console.log(`  - Found ${result4.estimatedTotalHits} results`);
            console.log(`  - Success! ✅`);
        } catch (error: any) {
            console.log(`  - Error: ${error.message} ❌`);
        }
        console.log('');

        // Get sample cities
        console.log('📍 Sample cities in index:');
        const sampleResult = await index.search('', {
            limit: 10,
            attributesToRetrieve: ['city', 'listing_key'],
        });
        const cities = new Set(sampleResult.hits.map((h: any) => h.city).filter(Boolean));
        console.log(`  - Unique cities (sample): ${Array.from(cities).join(', ')}`);
        console.log('');

        console.log('✅ All tests completed!');

    } catch (error) {
        console.error('❌ Test failed:', error);
        throw error;
    }
}

testSearch().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});