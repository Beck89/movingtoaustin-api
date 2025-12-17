/**
 * Member sync operations for MLS Grid ETL
 */
import pool, { ORIGINATING_SYSTEM, getHighWaterMark, setHighWaterMark } from '../db.js';
import { fetchMLSData } from '../mls-client.js';

const BATCH_SIZE = parseInt(process.env.ETL_BATCH_SIZE || '100', 10);
const MAX_MEMBERS = process.env.ETL_MAX_MEMBERS && 
    process.env.ETL_MAX_MEMBERS.trim() !== '' && 
    process.env.ETL_MAX_MEMBERS !== 'no_limit' 
    ? parseInt(process.env.ETL_MAX_MEMBERS, 10) 
    : null;

/**
 * Sync members from MLS Grid
 */
export async function syncMembers(): Promise<void> {
    console.log(`[${new Date().toISOString()}] Starting member sync for ${ORIGINATING_SYSTEM}`);

    const highWater = await getHighWaterMark('Member');
    let maxTimestamp = highWater;

    const filters = [`OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`];
    if (highWater) {
        const isoTimestamp = new Date(highWater).toISOString();
        filters.push(`ModificationTimestamp gt ${isoTimestamp}`);
    }

    const filterString = filters.join(' and ');
    let nextLink: string | null = `/Member?$filter=${encodeURIComponent(filterString)}&$top=${BATCH_SIZE}`;
    let totalProcessed = 0;

    // Rate limiting tracking
    let requestCount = 0;
    let hourlyStartTime = Date.now();

    if (MAX_MEMBERS) {
        console.log(`⚠️  MAX_MEMBERS limit set to ${MAX_MEMBERS} (for testing)`);
    }

    while (nextLink) {
        if (MAX_MEMBERS && totalProcessed >= MAX_MEMBERS) {
            console.log(`Reached MAX_MEMBERS limit of ${MAX_MEMBERS}. Stopping sync.`);
            break;
        }

        let endpoint = nextLink;
        if (nextLink.startsWith('http')) {
            const url = new URL(nextLink);
            const pathname = url.pathname.replace(/^\/v2/, '');
            endpoint = pathname + url.search;
        }

        // Rate limiting check
        const elapsed = Date.now() - hourlyStartTime;
        if (requestCount >= 7000) {
            if (elapsed < 3600000) {
                const waitTime = 3600000 - elapsed;
                console.log(`⏳ Rate limit: ${requestCount} requests. Waiting ${Math.round(waitTime / 60000)}min...`);
                await new Promise(resolve => setTimeout(resolve, waitTime));
                requestCount = 0;
                hourlyStartTime = Date.now();
            } else {
                requestCount = 0;
                hourlyStartTime = Date.now();
            }
        }

        const data = await fetchMLSData(endpoint, {});
        requestCount++;
        const members: any[] = data.value || [];

        console.log(`Processing batch of ${members.length} members`);

        for (const member of members) {
            if (MAX_MEMBERS && totalProcessed >= MAX_MEMBERS) break;

            try {
                const query = `
                    INSERT INTO mls.members (
                        member_key, member_full_name, originating_system_name, raw, updated_at
                    ) VALUES ($1, $2, $3, $4, NOW())
                    ON CONFLICT (member_key) DO UPDATE SET
                        member_full_name = EXCLUDED.member_full_name,
                        raw = EXCLUDED.raw,
                        updated_at = NOW()
                `;

                await pool.query(query, [
                    member.MemberKey,
                    member.MemberFullName,
                    member.OriginatingSystemName,
                    JSON.stringify(member),
                ]);

                if (!maxTimestamp || member.ModificationTimestamp > maxTimestamp) {
                    maxTimestamp = member.ModificationTimestamp;
                }

                totalProcessed++;
            } catch (error) {
                console.error(`Failed to process member ${member.MemberKey}:`, error);
            }
        }

        nextLink = data['@odata.nextLink'] || null;

        if (nextLink) {
            await new Promise(resolve => setTimeout(resolve, 500));
        }
    }

    if (maxTimestamp && maxTimestamp !== highWater) {
        await setHighWaterMark('Member', maxTimestamp);
        console.log(`Updated member high-water mark to ${maxTimestamp}`);
    }

    console.log(`Member sync complete. Processed ${totalProcessed} members`);
}
