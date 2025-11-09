import { S3Client, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import type pg from 'pg';
import type { MeiliSearch } from 'meilisearch';

// S3 client setup
const s3Client = new S3Client({
    region: process.env.S3_REGION || 'auto',
    endpoint: process.env.S3_ENDPOINT,
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.S3_BUCKET!;
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'production';
const ORIGINATING_SYSTEM = (process.env.ORIGINATING_SYSTEM || 'ACTRIS').toLowerCase();

/**
 * Delete all media files from object storage for this originating system
 */
async function clearObjectStorage(): Promise<void> {
    const prefix = `${STORAGE_PREFIX}/${ORIGINATING_SYSTEM}/`;

    console.log(`🗑️  Clearing object storage with prefix: ${prefix}`);

    try {
        let continuationToken: string | undefined;
        let totalDeleted = 0;

        do {
            // List objects with this prefix
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: prefix,
                ContinuationToken: continuationToken,
            });

            const listResponse = await s3Client.send(listCommand);

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                console.log(`   No objects found with prefix ${prefix}`);
                break;
            }

            // Delete objects in batches of 1000 (S3 limit)
            const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key! }));

            const deleteCommand = new DeleteObjectsCommand({
                Bucket: BUCKET,
                Delete: {
                    Objects: objectsToDelete,
                    Quiet: false,
                },
            });

            await s3Client.send(deleteCommand);
            totalDeleted += objectsToDelete.length;
            console.log(`   Deleted ${objectsToDelete.length} objects (${totalDeleted} total)`);

            continuationToken = listResponse.NextContinuationToken;
        } while (continuationToken);

        console.log(`✅ Cleared ${totalDeleted} media files from object storage`);
    } catch (error) {
        console.error(`❌ Failed to clear object storage:`, error);
        throw error;
    }
}

/**
 * Clear all data from the database
 */
async function clearDatabase(pool: pg.Pool): Promise<void> {
    console.log(`🗑️  Clearing database tables...`);

    try {
        // Delete in order to respect foreign key constraints
        await pool.query('DELETE FROM mls.open_houses');
        await pool.query('DELETE FROM mls.unit_types');
        await pool.query('DELETE FROM mls.rooms');
        await pool.query('DELETE FROM mls.media');
        await pool.query('DELETE FROM mls.properties');
        await pool.query('DELETE FROM mls.members');
        await pool.query('DELETE FROM mls.offices');
        await pool.query('DELETE FROM mls.lookups');
        await pool.query('DELETE FROM mls.sync_state');

        console.log(`✅ Cleared all database tables`);
    } catch (error) {
        console.error(`❌ Failed to clear database:`, error);
        throw error;
    }
}

/**
 * Clear Meilisearch index
 */
async function clearSearchIndex(searchClient: MeiliSearch, indexName: string): Promise<void> {
    console.log(`🗑️  Clearing search index: ${indexName}`);

    try {
        const index = searchClient.index(indexName);
        await index.deleteAllDocuments();
        console.log(`✅ Cleared search index`);
    } catch (error) {
        console.error(`❌ Failed to clear search index:`, error);
        throw error;
    }
}

/**
 * Perform a complete reset of all data
 */
export async function performReset(
    pool: pg.Pool,
    searchClient: MeiliSearch,
    indexName: string
): Promise<void> {
    console.log(`\n${'='.repeat(60)}`);
    console.log(`🔄 PERFORMING COMPLETE RESET`);
    console.log(`${'='.repeat(60)}\n`);

    try {
        // Clear in parallel for speed
        await Promise.all([
            clearDatabase(pool),
            clearObjectStorage(),
            clearSearchIndex(searchClient, indexName),
        ]);

        console.log(`\n${'='.repeat(60)}`);
        console.log(`✅ RESET COMPLETE - Starting fresh!`);
        console.log(`${'='.repeat(60)}\n`);
    } catch (error) {
        console.error(`\n${'='.repeat(60)}`);
        console.error(`❌ RESET FAILED`);
        console.error(`${'='.repeat(60)}\n`);
        throw error;
    }
}