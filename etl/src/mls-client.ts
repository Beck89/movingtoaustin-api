import { request } from 'undici';
import { gunzipSync } from 'zlib';
import dotenv from 'dotenv';

dotenv.config();

export async function fetchMLSData(endpoint: string, params: Record<string, string> = {}): Promise<any> {
    const baseUrl = process.env.MLS_BASE || 'https://api.mlsgrid.com/v2';
    const accessToken = process.env.MLS_ACCESS_TOKEN;

    if (!accessToken) {
        throw new Error('MLS_ACCESS_TOKEN is required in .env file');
    }

    const queryString = new URLSearchParams(params).toString();
    const url = `${baseUrl}${endpoint}${queryString ? '?' + queryString : ''}`;

    const response = await request(url, {
        method: 'GET',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate, br',
        },
    });

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
}