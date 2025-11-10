import { MeiliSearch } from 'meilisearch';
import dotenv from 'dotenv';

dotenv.config();

const client = new MeiliSearch({
    host: process.env.MEILI_HOST || 'http://localhost:7700',
    apiKey: process.env.MEILI_MASTER_KEY || 'MySecureMasterKey123!',
});

const INDEX_NAME = process.env.MEILI_INDEX || 'listings_actris_v1';

async function updateSearchableAttributes() {
    console.log('🔧 Updating Meilisearch searchable attributes...');
    console.log(`Index: ${INDEX_NAME}`);
    console.log('');

    try {
        const index = client.index(INDEX_NAME);

        console.log('⚙️  Updating searchable attributes to include listing_key...');
        await index.updateSearchableAttributes([
            'listing_key',      // Add listing_key for ID search
            'listing_id',       // Keep listing_id as well
            'address_full',
            'street_name',
            'city',
            'postal_code',
            'subdivision_name',
            'remarks_public',
            'elementary_school',
            'high_school_district',
        ]);

        console.log('✅ Searchable attributes updated successfully!');
        console.log('');
        console.log('Listing ID search will now work for both:');
        console.log('  - listing_key (e.g., ACT123939028)');
        console.log('  - listing_id (e.g., ACT5377502)');
        console.log('');
        console.log('Test with:');
        console.log('  curl "https://your-api.com/api/listings/search?keywords=ACT123939028"');

    } catch (error) {
        console.error('❌ Failed to update searchable attributes:', error);
        throw error;
    }
}

updateSearchableAttributes().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});