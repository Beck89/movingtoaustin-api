import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { request } from 'undici';
import dotenv from 'dotenv';
import { rateLimiter } from './rate-limiter.js';

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
const CDN_BASE = process.env.CDN_BASE_URL || process.env.S3_ENDPOINT;
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'production'; // Default to production for safety

/**
 * Delete media files from storage for a given listing
 */
export async function deleteMediaForListing(listingKey: string, originatingSystem: string): Promise<void> {
    const storagePrefix = process.env.STORAGE_PREFIX || 'production';
    const prefix = `${storagePrefix}/${originatingSystem.toLowerCase()}/${listingKey}/`;

    try {
        // List all objects with this prefix
        const { ListObjectsV2Command, DeleteObjectsCommand } = await import('@aws-sdk/client-s3');

        const listCommand = new ListObjectsV2Command({
            Bucket: BUCKET,
            Prefix: prefix,
        });

        const listResponse = await s3Client.send(listCommand);

        if (!listResponse.Contents || listResponse.Contents.length === 0) {
            console.log(`No media files found for listing ${listingKey}`);
            return;
        }

        // Delete all objects
        const objectsToDelete = listResponse.Contents.map(obj => ({ Key: obj.Key }));

        const deleteCommand = new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: {
                Objects: objectsToDelete,
            },
        });

        await s3Client.send(deleteCommand);
        console.log(`Deleted ${objectsToDelete.length} media files for listing ${listingKey}`);
    } catch (error) {
        console.error(`Failed to delete media for listing ${listingKey}:`, error);
        // Don't throw - we don't want media deletion failures to stop property deletion
    }
}

export async function downloadAndUploadMedia(
    mediaUrl: string,
    listingKey: string,
    orderSequence: number,
    _mediaCategory: string
): Promise<string> {
    try {
        // Wait for rate limit slot before downloading from MLS Grid
        await rateLimiter.waitForSlot();

        // Download from MLS
        const response = await request(mediaUrl, {
            method: 'GET',
            maxRedirections: 5,
        });

        if (response.statusCode !== 200) {
            throw new Error(`Failed to download media: ${response.statusCode}`);
        }

        const buffer = Buffer.from(await response.body.arrayBuffer());

        // Determine file extension
        const contentType = response.headers['content-type'] as string || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' :
            contentType.includes('gif') ? 'gif' :
                contentType.includes('webp') ? 'webp' : 'jpg';

        // Generate stable key with environment prefix
        const originatingSystem = process.env.ORIGINATING_SYSTEM?.toLowerCase() || 'actris';
        const key = `${STORAGE_PREFIX}/${originatingSystem}/${listingKey}/${orderSequence}.${ext}`;

        // Upload to S3/R2
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000', // 1 year
        }));

        // Return CDN URL
        return `${CDN_BASE}/${key}`;
    } catch (error) {
        console.error(`Failed to process media ${mediaUrl}:`, error);
        throw error;
    }
}