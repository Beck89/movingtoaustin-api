import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { request } from 'undici';
import dotenv from 'dotenv';
import { mediaRateLimiter } from './rate-limiter.js';

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

/**
 * Check if a media URL has expired by parsing the expires parameter
 */
function isUrlExpired(url: string): boolean {
    try {
        const urlObj = new URL(url);
        const expiresParam = urlObj.searchParams.get('expires');

        if (!expiresParam) {
            // No expiration parameter, assume it's valid
            return false;
        }

        const expiresTimestamp = parseInt(expiresParam, 10);
        const nowTimestamp = Math.floor(Date.now() / 1000); // Current time in seconds

        // URL is expired if the expiration time is in the past
        // Add 5 minute buffer (300 seconds) to catch URLs about to expire
        const isExpired = expiresTimestamp < (nowTimestamp + 300);

        if (isExpired) {
            const expiresDate = new Date(expiresTimestamp * 1000);
            const now = new Date();
            console.log(`[URL Check] URL expired or expiring soon. Expires: ${expiresDate.toISOString()}, Now: ${now.toISOString()}`);
        }

        return isExpired;
    } catch (error) {
        // If we can't parse the URL, assume it's not expired and let the download attempt proceed
        console.log(`[URL Check] Could not parse URL expiration, assuming valid: ${error}`);
        return false;
    }
}

export async function downloadAndUploadMedia(
    mediaUrl: string,
    listingKey: string,
    orderSequence: number,
    _mediaCategory: string
): Promise<string> {
    const startTime = Date.now();

    try {
        // Check if URL is expired before attempting download
        if (isUrlExpired(mediaUrl)) {
            throw new Error('Media URL has expired - needs refresh from MLS API');
        }

        // Wait for rate limit slot before downloading from MLS Grid
        // Uses dedicated media rate limiter with 1.5s delay between requests
        await mediaRateLimiter.waitForSlot();

        const afterWait = Date.now();
        console.log(`[Media Download] Starting ${listingKey}/${orderSequence} (waited ${afterWait - startTime}ms)`);

        // Download from MLS
        const response = await request(mediaUrl, {
            method: 'GET',
            maxRedirections: 5,
            headersTimeout: 30000, // 30 second timeout
            bodyTimeout: 60000,    // 60 second timeout
        });

        if (response.statusCode !== 200) {
            // Log specific error codes for debugging
            if (response.statusCode === 400) {
                throw new Error(`Invalid media URL (400) - URL may be expired or malformed`);
            } else if (response.statusCode === 404) {
                throw new Error(`Media not found (404) - file may have been deleted`);
            } else if (response.statusCode === 403) {
                throw new Error(`Access denied (403) - authentication issue`);
            } else if (response.statusCode === 429) {
                // Rate limit - log headers and body for debugging
                const headers = JSON.stringify(response.headers);
                let body = '';
                try {
                    const bodyBuffer = await response.body.arrayBuffer();
                    body = Buffer.from(bodyBuffer).toString('utf-8').substring(0, 500);
                } catch (e) {
                    body = 'Could not read body';
                }
                console.error(`[429 Rate Limit] Headers: ${headers}`);
                console.error(`[429 Rate Limit] Body: ${body}`);
                throw new Error(`Failed to download media: 429`);
            }
            throw new Error(`Failed to download media: ${response.statusCode}`);
        }

        const buffer = Buffer.from(await response.body.arrayBuffer());

        // Validate buffer size (skip empty or corrupt files)
        if (buffer.length === 0) {
            throw new Error('Downloaded file is empty');
        }

        // Determine file extension
        const contentType = response.headers['content-type'] as string || 'image/jpeg';
        const ext = contentType.includes('png') ? 'png' :
            contentType.includes('gif') ? 'gif' :
                contentType.includes('webp') ? 'webp' : 'jpg';

        // Generate stable key with environment prefix
        const originatingSystem = process.env.ORIGINATING_SYSTEM?.toLowerCase() || 'actris';
        const key = `${STORAGE_PREFIX}/${originatingSystem}/${listingKey}/${orderSequence}.${ext}`;

        // Upload to S3/R2 with public-read ACL
        await s3Client.send(new PutObjectCommand({
            Bucket: BUCKET,
            Key: key,
            Body: buffer,
            ContentType: contentType,
            CacheControl: 'public, max-age=31536000', // 1 year
            ACL: 'public-read', // Make files publicly accessible
        }));

        // Return CDN URL
        const totalTime = Date.now() - startTime;
        console.log(`[Media Download] Completed ${listingKey}/${orderSequence} in ${totalTime}ms`);
        return `${CDN_BASE}/${key}`;
    } catch (error) {
        // Enhanced error logging with context
        const errorMessage = error instanceof Error ? error.message : String(error);
        const totalTime = Date.now() - startTime;
        console.error(`[Media Download Failed] Listing: ${listingKey}, Order: ${orderSequence}, Time: ${totalTime}ms, URL: ${mediaUrl.substring(0, 100)}..., Error: ${errorMessage}`);
        throw error;
    }
}