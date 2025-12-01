import { request } from 'undici';
import { gunzipSync } from 'zlib';
import dotenv from 'dotenv';
import { rateLimiter } from './rate-limiter.js';

dotenv.config();

const MAX_RETRIES = 5;
const INITIAL_BACKOFF_MS = 60000; // Start with 1 minute for 429 errors

export async function fetchMLSData(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const baseUrl = process.env.MLS_BASE || 'https://api.mlsgrid.com/v2';
    const accessToken = process.env.MLS_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error('MLS_ACCESS_TOKEN is required in .env file');
    }

    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
        // Wait for rate limit slot before making API request
        await rateLimiter.waitForSlot();

        try {
            const response = await request(url, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Accept': 'application/json',
                    'Accept-Encoding': 'gzip, deflate, br',
                },
            });

            // Handle 429 rate limit errors with exponential backoff
            if (response.statusCode === 429) {
                const body = await response.body.text();
                const retryAfter = response.headers['retry-after'];
                const backoffMs = retryAfter
                    ? parseInt(retryAfter as string, 10) * 1000
                    : INITIAL_BACKOFF_MS * Math.pow(2, attempt);
                
                console.warn(`⚠️ [429 Rate Limit] Attempt ${attempt + 1}/${MAX_RETRIES}. Waiting ${Math.round(backoffMs / 1000)}s before retry...`);
                console.warn(`   Response: ${body}`);
                
                await new Promise(resolve => setTimeout(resolve, backoffMs));
                lastError = new Error(`MLS API rate limited: 429 ${url}\nResponse: ${body}`);
                continue;
            }

            if (response.statusCode !== 200) {
                const body = await response.body.text();
                throw new Error(`MLS API request failed: ${response.statusCode} ${url}\nResponse: ${body}`);
            }

            // Get the raw buffer
            const buffer = await response.body.arrayBuffer();
            const contentEncoding = response.headers['content-encoding'];

            // Decompress if gzipped
            let text: string;
            if (contentEncoding === 'gzip') {
                const decompressed = gunzipSync(Buffer.from(buffer));
                text = decompressed.toString('utf-8');
            } else {
                text = Buffer.from(buffer).toString('utf-8');
            }

            return JSON.parse(text);
        } catch (error) {
            // If it's not a rate limit error, throw immediately
            if (error instanceof Error && !error.message.includes('429')) {
                throw error;
            }
            lastError = error as Error;
        }
    }

    // All retries exhausted
    throw lastError || new Error(`MLS API request failed after ${MAX_RETRIES} retries: ${url}`);
}