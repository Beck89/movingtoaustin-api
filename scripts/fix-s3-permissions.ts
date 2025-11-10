import { S3Client, ListObjectsV2Command, PutObjectAclCommand } from '@aws-sdk/client-s3';
import dotenv from 'dotenv';

dotenv.config();

const s3Client = new S3Client({
    endpoint: process.env.S3_ENDPOINT,
    region: process.env.S3_REGION || 'auto',
    credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.S3_SECRET_ACCESS_KEY!,
    },
});

const BUCKET = process.env.S3_BUCKET!;
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'production';
const ORIGINATING_SYSTEM = process.env.ORIGINATING_SYSTEM?.toLowerCase() || 'actris';

async function fixS3Permissions() {
    console.log('🔧 Fixing S3 permissions for existing media files...');
    console.log(`Bucket: ${BUCKET}`);
    console.log(`Prefix: ${STORAGE_PREFIX}/${ORIGINATING_SYSTEM}/`);
    console.log('');

    const prefix = `${STORAGE_PREFIX}/${ORIGINATING_SYSTEM}/`;
    let continuationToken: string | undefined;
    let totalProcessed = 0;
    let totalErrors = 0;

    try {
        do {
            // List objects
            const listCommand = new ListObjectsV2Command({
                Bucket: BUCKET,
                Prefix: prefix,
                MaxKeys: 1000,
                ContinuationToken: continuationToken,
            });

            const listResponse = await s3Client.send(listCommand);

            if (!listResponse.Contents || listResponse.Contents.length === 0) {
                console.log('No more objects to process');
                break;
            }

            console.log(`Processing batch of ${listResponse.Contents.length} files...`);

            // Update ACL for each object by copying to itself with new ACL
            for (const obj of listResponse.Contents) {
                if (!obj.Key) continue;

                try {
                    // Update ACL directly using PutObjectAclCommand
                    // This is the proper way to change permissions in DigitalOcean Spaces
                    await s3Client.send(new PutObjectAclCommand({
                        Bucket: BUCKET,
                        Key: obj.Key,
                        ACL: 'public-read',
                    }));

                    totalProcessed++;

                    if (totalProcessed % 100 === 0) {
                        console.log(`  Processed ${totalProcessed} files...`);
                    }
                } catch (error) {
                    totalErrors++;
                    console.error(`  Failed to update ${obj.Key}:`, error instanceof Error ? error.message : error);
                }
            }

            continuationToken = listResponse.NextContinuationToken;

            // Small delay to avoid rate limiting
            if (continuationToken) {
                await new Promise(resolve => setTimeout(resolve, 100));
            }

        } while (continuationToken);

        console.log('');
        console.log('✅ Permission fix complete!');
        console.log(`  Total files processed: ${totalProcessed}`);
        console.log(`  Errors: ${totalErrors}`);
        console.log('');
        console.log('All existing S3 files are now publicly accessible!');

    } catch (error) {
        console.error('❌ Failed to fix S3 permissions:', error);
        throw error;
    }
}

fixS3Permissions().catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
});