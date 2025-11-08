import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { request } from 'undici';
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
const CDN_BASE = process.env.CDN_BASE_URL || process.env.S3_ENDPOINT;
const STORAGE_PREFIX = process.env.STORAGE_PREFIX || 'production'; // Default to production for safety

export async function downloadAndUploadMedia(
    mediaUrl: string,
    listingKey: string,
    orderSequence: number,
    _mediaCategory: string
): Promise<string> {
    try {
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