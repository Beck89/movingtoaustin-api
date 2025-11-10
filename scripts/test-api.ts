#!/usr/bin/env tsx

/**
 * Simple test to verify MLS Grid API connection
 */

import 'dotenv/config';

const MLS_BASE = process.env.MLS_BASE || 'https://api.mlsgrid.com/v2';
const MLS_ACCESS_TOKEN = process.env.MLS_ACCESS_TOKEN;
const ORIGINATING_SYSTEM = process.env.ORIGINATING_SYSTEM || 'actris';

async function testAPI() {
    if (!MLS_ACCESS_TOKEN) {
        console.error('❌ MLS_ACCESS_TOKEN not set in .env');
        process.exit(1);
    }

    console.log('🔍 Testing MLS Grid API connection...');
    console.log(`   Base URL: ${MLS_BASE}`);
    console.log(`   System: ${ORIGINATING_SYSTEM}`);
    console.log(`   Token: ${MLS_ACCESS_TOKEN.substring(0, 10)}...`);

    try {
        // Test 1: Fetch metadata
        console.log('\n📋 Test 1: Fetching metadata...');
        const metadataUrl = `${MLS_BASE}/$metadata`;
        const metadataRes = await fetch(metadataUrl, {
            headers: {
                'Authorization': `Bearer ${MLS_ACCESS_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!metadataRes.ok) {
            console.error(`❌ Metadata request failed: ${metadataRes.status} ${metadataRes.statusText}`);
            const text = await metadataRes.text();
            console.error('Response:', text.substring(0, 500));
            process.exit(1);
        }

        console.log('✅ Metadata fetch successful');

        // Test 2: Fetch one property
        console.log('\n📋 Test 2: Fetching one Active property...');
        const filter = `OriginatingSystemName eq '${ORIGINATING_SYSTEM}' and StandardStatus eq 'Active' and MlgCanView eq true`;
        const propertyUrl = `${MLS_BASE}/Property?$filter=${encodeURIComponent(filter)}&$top=1&$select=ListingKey,ListingId,StandardStatus,ListPrice,City`;

        console.log(`   URL: ${propertyUrl}`);

        const propertyRes = await fetch(propertyUrl, {
            headers: {
                'Authorization': `Bearer ${MLS_ACCESS_TOKEN}`,
                'Accept': 'application/json'
            }
        });

        if (!propertyRes.ok) {
            console.error(`❌ Property request failed: ${propertyRes.status} ${propertyRes.statusText}`);
            const text = await propertyRes.text();
            console.error('Response:', text.substring(0, 500));
            process.exit(1);
        }

        const data = await propertyRes.json() as { value?: any[] };
        console.log('✅ Property fetch successful');
        console.log(`   Found ${data.value?.length || 0} properties`);

        if (data.value && data.value.length > 0) {
            const prop = data.value[0];
            console.log('\n📍 Sample Property:');
            console.log(`   ListingKey: ${prop.ListingKey}`);
            console.log(`   ListingId: ${prop.ListingId}`);
            console.log(`   Status: ${prop.StandardStatus}`);
            console.log(`   Price: $${prop.ListPrice?.toLocaleString()}`);
            console.log(`   City: ${prop.City}`);
        }

        console.log('\n✅ All tests passed! MLS Grid API is working correctly.');

    } catch (error) {
        console.error('\n❌ Error testing API:', error);
        process.exit(1);
    }
}

testAPI();