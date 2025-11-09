# MLS Grid Rate Limiting - Resolution Plan

## Current Situation

### Problem
MLS Grid is aggressively rate-limiting media downloads with **429 (Too Many Requests)** errors, preventing any images from being downloaded to DigitalOcean Spaces.

### Root Causes Identified

1. **Dual Environment Conflict**
   - Both local development AND production Coolify were running ETL workers simultaneously
   - Both hitting the same MLS Grid API with the same credentials
   - Effectively **doubling the request rate** to MLS Grid servers

2. **Aggressive Initial Concurrency**
   - Started with `concurrency: 5` (5 simultaneous downloads)
   - Even after reducing to `concurrency: 1`, still getting rate limited
   - MLS Grid's rate limits are stricter than anticipated

3. **Large Backlog**
   - Production has **1,000 properties** with **18,404 media files** queued
   - All attempting to download at once triggered rate limiting
   - Once rate-limited, the ban appears to persist for an extended period

## Current Status

### Production (Coolify)
- ✅ **Properties**: 1,000 synced successfully
- ❌ **Media**: 0 of 18,404 downloaded (100% rate limited)
- ❌ **Storage**: No files in DigitalOcean Spaces `production/` folder yet
- 🔄 **ETL**: Running with updated code (concurrency: 1, 5s intervals, exponential backoff)

### Local Development
- ⏸️ **ETL**: **STOPPED** to avoid conflicting with production
- ✅ **Previous Test**: Successfully downloaded 1,670 media files (100%) for 100 properties
- 📝 **Note**: Local testing was successful before production deployment

## Code Changes Made

### 1. Reduced Concurrency (etl/src/index.ts:27-32)
```typescript
const mediaQueue = new PQueue({ 
    concurrency: 1,  // Only 1 download at a time (reduced from 5)
    interval: 5000,  // Wait 5 seconds between downloads (increased from 2s)
    intervalCap: 1   // Only 1 download per interval
});
```

### 2. Enhanced Retry Logic (etl/src/index.ts:231-246)
```typescript
pRetry(
    () => downloadAndUploadMedia(...),
    { 
        retries: 5,  // Increased from 3
        minTimeout: 10000,  // Start with 10 second delay
        maxTimeout: 60000,  // Max 60 second delay
        factor: 2,  // Exponential backoff
        onFailedAttempt: (error) => {
            console.log(`Media download attempt ${error.attemptNumber} failed. ${error.retriesLeft} retries left. Waiting ${error.attemptNumber * 10}s before retry...`);
        }
    }
)
```

## Resolution Plan

### Immediate Actions (Next 1-2 Hours)

1. **Wait for Rate Limit Reset**
   - MLS Grid rate limits typically reset after 1-2 hours
   - Production ETL will continue attempting with exponential backoff
   - Monitor logs for successful downloads

2. **Monitor Production**
   ```bash
   # SSH to production and check logs
   ssh optimize@64.202.191.7
   sudo docker logs etl-container-name --tail 100 --follow
   
   # Check for successful downloads
   sudo docker exec postgres-container psql -U postgres -d mls -c \
     "SELECT COUNT(*) as downloaded FROM mls.media WHERE local_url IS NOT NULL;"
   ```

3. **Verify DigitalOcean Spaces**
   - Check for files appearing in `production/actris/` folder
   - First successful download will confirm rate limit has lifted

### Short-term Improvements (Next Deployment)

1. **Even More Conservative Settings**
   ```typescript
   const mediaQueue = new PQueue({ 
       concurrency: 1,
       interval: 10000,  // 10 seconds between downloads
       intervalCap: 1
   });
   ```

2. **Batch Processing Strategy**
   - Process media in smaller batches (e.g., 100 files per hour)
   - Add configurable daily/hourly limits
   - Spread downloads over 24 hours instead of all at once

3. **Smart Retry with Circuit Breaker**
   - If 3 consecutive 429 errors, pause for 30 minutes
   - Gradually increase delay after each 429
   - Log rate limit events for monitoring

### Long-term Solutions

1. **Separate Media Download Worker**
   - Decouple property sync from media downloads
   - Run media downloads as a separate, slower background job
   - Priority queue: new listings first, then backfill old ones

2. **Rate Limit Monitoring**
   - Track 429 responses and adjust concurrency dynamically
   - Implement adaptive rate limiting based on success rate
   - Alert when rate limits are hit

3. **Caching Strategy**
   - Check if media already exists before downloading
   - Use `PhotosChangeTimestamp` to avoid re-downloading unchanged images
   - Implement checksum verification

4. **MLS Grid API Consultation**
   - Contact MLS Grid support to understand their rate limits
   - Request higher rate limits if available
   - Clarify best practices for bulk media downloads

## Testing Strategy

### When Rate Limits Lift

1. **Small Test First**
   ```bash
   # Set very low limit to test
   ETL_MAX_PROPERTIES=5
   ```

2. **Monitor Success Rate**
   - Watch for first successful download
   - Verify file appears in DigitalOcean Spaces
   - Check database `local_url` is populated

3. **Gradual Scale-Up**
   - If 5 properties work, try 10
   - If 10 work, try 50
   - Monitor for any 429 responses

### Preventing Future Issues

1. **Never Run Multiple ETL Workers**
   - Only production OR local, never both
   - Document this clearly in setup guides
   - Consider adding environment check/lock

2. **Start with Conservative Limits**
   - New deployments should use slowest settings
   - Gradually increase speed based on success
   - Better to be slow than rate-limited

## Current Configuration Summary

### Environment Variables (Production)
```env
ETL_MAX_PROPERTIES=1000
STORAGE_PREFIX=production
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_BUCKET=movingtoaustin
CDN_BASE_URL=https://movingtoaustin.nyc3.cdn.digitaloceanspaces.com
```

### Rate Limiting Settings
- **Concurrency**: 1 (one download at a time)
- **Interval**: 5 seconds between downloads
- **Retry Attempts**: 5 with exponential backoff (10s → 20s → 40s → 60s → 60s)
- **Total Time per Failed Download**: ~3 minutes before giving up

### Expected Performance (When Working)
- **Download Rate**: ~12 images per minute (5s interval)
- **18,404 images**: ~25.5 hours to complete
- **Realistic with retries**: 30-40 hours for full backfill

## Next Steps

1. ✅ **Stop local ETL** (DONE - prevents dual requests)
2. ⏳ **Wait 1-2 hours** for rate limit to reset
3. 🔍 **Monitor production logs** for successful downloads
4. ✅ **Verify first file** appears in DigitalOcean Spaces
5. 📊 **Track progress** using status endpoint
6. 📝 **Document findings** and adjust settings if needed

## Success Criteria

- [ ] At least 1 media file successfully downloaded
- [ ] File visible in DigitalOcean Spaces `production/actris/` folder
- [ ] Database shows `local_url` populated for downloaded files
- [ ] No 429 errors in logs for 10+ consecutive downloads
- [ ] Steady progress toward 18,404 total files

## Contact Information

If rate limiting persists beyond 2 hours:
- Consider contacting MLS Grid support
- May need to request rate limit increase
- Alternative: implement much slower download schedule (1 image per 30s = 2,880 per day)

---

**Last Updated**: 2025-11-08 18:01 CST
**Status**: Waiting for rate limit reset (1-2 hours)
**Local ETL**: Stopped to prevent conflicts
**Production ETL**: Running with conservative settings