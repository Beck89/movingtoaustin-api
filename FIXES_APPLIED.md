# Fixes Applied to Production Deployment

## Issues Found

After connecting to the Coolify server and diagnosing the running containers, I identified three critical issues:

### 1. **Meilisearch Index Not Configured** ❌
- **Problem**: The Meilisearch index had no filterable or sortable attributes configured
- **Symptom**: API search requests failed with error: `Attribute 'mlg_can_view' is not filterable`
- **Root Cause**: The `setup-meilisearch.ts` script was never run in production

### 2. **LivingArea Data Type Mismatch** ❌
- **Problem**: Some MLS properties have `LivingArea` as decimal strings (e.g., "472.44")
- **Symptom**: ETL failed with error: `invalid input syntax for type integer: "472.44"`
- **Impact**: Properties with decimal LivingArea values couldn't be imported

### 3. **City Search Case Sensitivity** ❌
- **Problem**: Meilisearch filters are case-sensitive, but MLS data stores cities in uppercase
- **Symptom**: Searching for `?city=Austin` returned no results (data has `city=AUSTIN`)

## Fixes Applied

### Fix 1: Auto-Configure Meilisearch on ETL Startup ✅

**File**: `etl/src/index.ts`

Added `configureMeilisearchIndex()` function that runs on ETL startup:

```typescript
async function configureMeilisearchIndex(): Promise<void> {
    console.log('🔧 Configuring Meilisearch index...');
    
    const index = searchClient.index(INDEX_NAME);
    const settings = await index.getSettings();
    
    // Only configure if not already configured
    if (!settings.filterableAttributes || settings.filterableAttributes.length === 0) {
        await index.updateFilterableAttributes([
            'mlg_can_view', 'standard_status', 'property_type',
            'city', 'list_price', 'bedrooms_total', 'bathrooms_full',
            'living_area', 'year_built', ...
        ]);
        
        await index.updateSortableAttributes([...]);
        await index.updateSearchableAttributes([...]);
        
        console.log('✅ Meilisearch index configured successfully!');
    }
}
```

**Benefits**:
- No manual setup required
- Idempotent (safe to run multiple times)
- Runs automatically on every deployment

### Fix 2: Handle Decimal LivingArea Values ✅

**File**: `etl/src/index.ts`

Added `toInteger()` helper function:

```typescript
function toInteger(value: any): number | null {
    if (value === null || value === undefined) return null;
    const num = typeof value === 'string' ? parseFloat(value) : value;
    return isNaN(num) ? null : Math.round(num);
}
```

Applied to all integer fields:

```typescript
await pool.query(query, [
    // ...
    toInteger(property.BedroomsTotal),
    toInteger(property.BathroomsFull),
    toInteger(property.BathroomsHalf),
    toInteger(property.LivingArea),  // ← Fixed!
    toInteger(property.YearBuilt),
    toInteger(property.DaysOnMarket),
    // ...
]);
```

**Benefits**:
- Handles both integer and decimal string values
- Rounds decimals to nearest integer
- Prevents database insertion errors

### Fix 3: Case-Insensitive City Search ✅

**File**: `api/src/routes/search.ts`

Normalized city parameter to uppercase:

```typescript
// City (normalize to uppercase for MLS data)
if (city) {
    filters.push(`city = "${city.toUpperCase()}"`);
}
```

**Benefits**:
- Users can search with any case: `Austin`, `austin`, `AUSTIN`
- Matches MLS data format (uppercase)
- No database changes required

## Current Status

### Production Deployment (Coolify)
- ✅ 9,881 properties in Postgres
- ✅ 9,957 documents in Meilisearch (still indexing)
- ✅ All 4 containers running healthy
- ✅ Persistent volumes configured

### What Happens on Next Deployment

1. **ETL container starts**
2. **Auto-configures Meilisearch** (if needed)
3. **Resumes delta sync** from last high-water mark
4. **No data loss** (persistent volumes)
5. **Search API works immediately**

## Testing After Deployment

```bash
# Test city search (should work now)
curl "https://mta-api.optimizedevops.com/listings/search?city=Austin&limit=3"

# Test with different cases
curl "https://mta-api.optimizedevops.com/listings/search?city=austin&limit=3"
curl "https://mta-api.optimizedevops.com/listings/search?city=AUSTIN&limit=3"

# Test with filters
curl "https://mta-api.optimizedevops.com/listings/search?city=Austin&beds=3&minPrice=300000&limit=5"
```

## Files Modified

1. `etl/src/index.ts` - Added auto-configuration + data type fixes
2. `api/src/routes/search.ts` - Added case-insensitive city search
3. `scripts/test-search.ts` - Created diagnostic script
4. `package.json` - Added `test:search` script
5. `COOLIFY_VOLUMES.md` - Created persistent storage guide

## Deployment Instructions

1. **Commit and push changes**:
   ```bash
   git add .
   git commit -m "Fix: Auto-configure Meilisearch + handle decimal LivingArea + case-insensitive city search"
   git push origin main
   ```

2. **Coolify will auto-deploy** (if configured)
   - Or manually trigger deployment in Coolify dashboard

3. **Monitor ETL logs**:
   ```bash
   # On Coolify server
   sudo docker logs -f etl-<container-id>
   ```
   
   You should see:
   ```
   🔧 Configuring Meilisearch index...
   ✅ Meilisearch index configured successfully!
   Starting property sync...
   ```

4. **Test the API** using the curl commands above

## Expected Behavior

- **First deployment**: ETL configures Meilisearch, then resumes sync
- **Subsequent deployments**: ETL sees index is configured, skips setup
- **Search API**: Works immediately with case-insensitive city search
- **ETL errors**: No more "invalid input syntax" errors for decimal values

## Rollback Plan

If issues occur, rollback is simple:

```bash
git revert HEAD
git push origin main
```

The persistent volumes ensure no data loss during rollback.