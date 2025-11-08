# Production Deployment Plan - Fresh Data with Media Downloads

## Current Production Status
- **26,680 properties** (old data from before the fix)
- **628,039 media files** with **0% downloaded** (media downloads weren't working)
- Need to clear and re-sync with working media downloads

## Step-by-Step Deployment Plan

### Phase 1: Prepare for Deployment (Do This First)

1. **Update Coolify Environment Variables**
   
   Add/Update these variables in Coolify:
   ```bash
   # Storage Configuration
   STORAGE_PREFIX=production
   S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
   S3_REGION=nyc3
   S3_BUCKET=movingtoaustin
   S3_ACCESS_KEY_ID=DO801ACDJ89C7TJKHJ3M
   S3_SECRET_ACCESS_KEY=7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
   CDN_BASE_URL=https://movingtoaustin.nyc3.cdn.digitaloceanspaces.com
   
   # ETL Configuration (remove or leave empty for full sync)
   ETL_MAX_PROPERTIES=
   ETL_INTERVAL_MINUTES=5
   ETL_BATCH_SIZE=100
   ```

2. **Commit and Push Code Changes**
   ```bash
   git add .
   git commit -m "Fix: Media downloads + property limit + auto-index creation"
   git push origin main
   ```

3. **Wait for Coolify Auto-Deploy**
   - Coolify will detect the push and rebuild containers
   - This will deploy the fixed code

### Phase 2: Clear Old Data (After Deployment)

**Option A: Via Coolify Terminal (Recommended)**

1. Open Coolify → Your App → Terminal (for postgres container)
2. Run:
   ```bash
   psql -U postgres -d mls -c "TRUNCATE TABLE mls.properties CASCADE; TRUNCATE TABLE mls.sync_state CASCADE;"
   ```

**Option B: Via Database Client**

Connect to your production database and run:
```sql
TRUNCATE TABLE mls.properties CASCADE;
TRUNCATE TABLE mls.sync_state CASCADE;
```

### Phase 3: Restart ETL Worker

1. In Coolify, restart the ETL container
2. Monitor logs to see sync starting
3. You should see:
   ```
   Starting ETL worker (interval: 5 minutes)
   🔧 Configuring Meilisearch index...
   ✅ Meilisearch index already configured
   [timestamp] Starting property sync for actris
   Processing batch of 100 properties
   ...
   ```

### Phase 4: Monitor Progress

**Check Status Endpoint:**
```bash
curl https://your-domain.com/status | jq '.media'
```

**Expected Progress:**
- Initial sync: ~26,000 properties (takes ~45-60 minutes with 100 per batch)
- Media downloads: 628,000+ files (processes in background, may take 2-4 hours)
- Download percentage will gradually increase from 0% → 100%

### Phase 5: Verify Success

1. **Check a few properties have CDN URLs:**
   ```sql
   SELECT media_key, local_url 
   FROM mls.media 
   WHERE local_url IS NOT NULL 
   LIMIT 5;
   ```

2. **Verify CDN URLs work:**
   - URLs should be: `https://movingtoaustin.nyc3.cdn.digitaloceanspaces.com/production/actris/...`
   - Test a few URLs in browser to confirm images load

3. **Monitor status endpoint:**
   ```bash
   # Should show increasing download_percentage
   watch -n 30 'curl -s https://your-domain.com/status | jq .media'
   ```

## Important Notes

### Media Download Speed
- **Concurrency**: 5 simultaneous downloads (configured in code)
- **Retries**: 3 attempts per file with exponential backoff
- **Expected Time**: ~2-4 hours for 628,000 files
- Downloads happen in background, won't block property sync

### Storage Costs
- **628,000 images** × ~200KB average = ~125GB
- DigitalOcean Spaces: $5/month for 250GB + $0.01/GB transfer
- Estimated cost: ~$5-10/month

### If Something Goes Wrong

**Media downloads failing?**
```bash
# Check ETL logs for errors
docker logs <etl-container-name> | grep -i "failed\|error"
```

**Want to re-download specific media?**
```sql
-- Clear local_url for specific properties
UPDATE mls.media 
SET local_url = NULL 
WHERE listing_key = 'ACT123456';

-- Then restart ETL to re-queue downloads
```

**Need to start over?**
```sql
-- Clear everything and start fresh
TRUNCATE TABLE mls.properties CASCADE;
TRUNCATE TABLE mls.sync_state CASCADE;
-- Restart ETL container
```

## Timeline Estimate

| Phase | Duration | Notes |
|-------|----------|-------|
| Code deployment | 5-10 min | Coolify auto-deploy |
| Clear old data | 1 min | SQL truncate |
| Initial property sync | 45-60 min | ~26,000 properties |
| Media downloads | 2-4 hours | Background process |
| **Total** | **3-5 hours** | Fully operational after |

## Post-Deployment Checklist

- [ ] Code deployed to Coolify
- [ ] Environment variables updated
- [ ] Old data cleared
- [ ] ETL worker restarted
- [ ] Properties syncing (check logs)
- [ ] Media downloads starting (check status endpoint)
- [ ] CDN URLs working (test in browser)
- [ ] Monitor download percentage reaching 100%

## Maintenance

**Daily Monitoring:**
- Check `/status` endpoint for sync health
- Verify `download_percentage` stays at 100%
- Monitor for any failed downloads in logs

**Weekly:**
- Check DigitalOcean Spaces usage/costs
- Verify delta syncs are working (new properties get media)

**Monthly:**
- Review storage costs
- Consider cleanup of old/deleted property media