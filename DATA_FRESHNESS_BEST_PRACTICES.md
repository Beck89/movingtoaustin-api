# Data Freshness Best Practices

## Current Implementation ✅

Your system already implements most MLS data freshness best practices:

### 1. Delta Sync (Incremental Updates) ✅
**What it does**: Only syncs new/updated properties since last sync

**Implementation**:
- Uses `ModificationTimestamp` as high-water mark
- Stored in `mls.sync_state` table
- Filter: `ModificationTimestamp gt {last_sync_timestamp}`

**Benefits**:
- Fast syncs (seconds vs hours)
- Minimal API calls
- Low database load

**Current Status**: ✅ Implemented and working

### 2. Regular Sync Interval ✅
**What it does**: Runs ETL every 5 minutes by default

**Configuration**:
```env
ETL_INTERVAL_MINUTES=5  # Default: 5 minutes
```

**MLS Grid Recommendations**:
- **Active listings**: Every 5-15 minutes
- **Pending/Closed**: Every 30-60 minutes
- **Historical**: Daily

**Current Status**: ✅ Implemented (5-minute default)

### 3. Photo Change Detection ✅
**What it does**: Tracks when photos are updated

**Implementation**:
- Uses `PhotosChangeTimestamp` field
- Stored in database for comparison
- Triggers media re-download when changed

**Current Status**: ✅ Implemented

### 4. MlgCanView Compliance ✅
**What it does**: Immediately hides properties when `MlgCanView` becomes false

**Implementation**:
- Filtered at ETL: `MlgCanView eq true`
- Filtered at API: `mlg_can_view = true`
- Delta sync catches status changes

**Current Status**: ✅ Implemented

### 5. Automatic Retry Logic ✅
**What it does**: Retries failed operations

**Implementation**:
- Media downloads: 3 retries with exponential backoff
- ETL continues on individual property failures
- Logs errors for monitoring

**Current Status**: ✅ Implemented

## Recommended Enhancements 🔧

### 1. Separate Sync Schedules by Status
**Why**: Active listings change more frequently than closed ones

**Implementation**:
```typescript
// In etl/src/index.ts
async function syncByStatus(status: string, intervalMinutes: number) {
    const filters = [
        `OriginatingSystemName eq '${ORIGINATING_SYSTEM}'`,
        `MlgCanView eq true`,
        `StandardStatus eq '${status}'`,
    ];
    
    if (highWater) {
        filters.push(`ModificationTimestamp gt ${highWater}`);
    }
    // ... rest of sync logic
}

// Schedule different intervals
setInterval(() => syncByStatus('Active', 5), 5 * 60 * 1000);      // 5 min
setInterval(() => syncByStatus('Pending', 15), 15 * 60 * 1000);   // 15 min
setInterval(() => syncByStatus('Closed', 60), 60 * 60 * 1000);    // 60 min
```

**Benefits**:
- Reduces API calls
- Focuses on active inventory
- Better resource utilization

**Priority**: Medium (current 5-min sync works well)

### 2. Stale Data Detection
**Why**: Detect when ETL stops working

**Implementation**:
```typescript
// Add to status endpoint
const staleness = {
    is_stale: minutesSinceSync > syncInterval * 3,
    warning_threshold: syncInterval * 2,
    critical_threshold: syncInterval * 3,
};
```

**Benefits**:
- Early warning system
- Monitoring integration
- Automated alerts

**Priority**: High (easy to add to status endpoint)

### 3. Webhook Support (Future)
**Why**: Real-time updates instead of polling

**MLS Grid Support**: Some MLSs support webhooks for instant notifications

**Implementation**:
```typescript
// Webhook endpoint
app.post('/webhooks/mls', async (req, res) => {
    const { ListingKey, ChangeType } = req.body;
    
    if (ChangeType === 'Update' || ChangeType === 'New') {
        await syncSingleProperty(ListingKey);
    } else if (ChangeType === 'Delete') {
        await deleteProperty(ListingKey);
    }
    
    res.json({ received: true });
});
```

**Benefits**:
- Instant updates
- Reduced API calls
- Better user experience

**Priority**: Low (requires MLS support)

### 4. Partial Field Updates
**Why**: Only update changed fields, not entire property

**Implementation**:
```typescript
// Compare with existing property
const existing = await getProperty(ListingKey);
const changes = detectChanges(existing, newProperty);

if (changes.length > 0) {
    await updateFields(ListingKey, changes);
}
```

**Benefits**:
- Faster updates
- Reduced database writes
- Better audit trail

**Priority**: Low (current full upsert works well)

### 5. Media Download Prioritization
**Why**: Download primary photos first, others later

**Implementation**:
```typescript
// Priority queue for media
const highPriorityQueue = new PQueue({ concurrency: 5 });
const lowPriorityQueue = new PQueue({ concurrency: 2 });

if (item.Order === 0) {
    highPriorityQueue.add(() => downloadMedia(item));
} else {
    lowPriorityQueue.add(() => downloadMedia(item));
}
```

**Benefits**:
- Faster listing display
- Better user experience
- Efficient bandwidth use

**Priority**: Medium (if media downloads are slow)

## Monitoring & Alerting

### Key Metrics to Track

1. **Sync Health**
   - Last sync timestamp
   - Time since last sync
   - Sync success rate

2. **Data Volume**
   - Total properties
   - New properties per sync
   - Updated properties per sync
   - Deleted properties per sync

3. **Performance**
   - Sync duration
   - API response time
   - Database query time
   - Media download time

4. **Errors**
   - Failed property imports
   - Failed media downloads
   - API errors
   - Database errors

### Status Endpoint Usage

```bash
# Check system health
curl https://mta-api.optimizedevops.com/status

# Monitor with watch
watch -n 60 'curl -s https://mta-api.optimizedevops.com/status | jq .sync'

# Alert if stale (example with cron)
*/15 * * * * curl -s https://mta-api.optimizedevops.com/status | jq -e '.sync.health == "healthy"' || echo "ETL is stale!" | mail -s "MLS ETL Alert" admin@example.com
```

## Data Retention Best Practices

### What to Keep

1. **Active Listings**: Forever (or until sold/expired)
2. **Pending Listings**: 90 days after status change
3. **Closed Listings**: 1-2 years (for market analysis)
4. **Expired Listings**: 30-90 days

### Implementation

```sql
-- Add retention policy (run monthly)
DELETE FROM mls.properties 
WHERE standard_status = 'Closed' 
  AND modification_timestamp < NOW() - INTERVAL '2 years';

DELETE FROM mls.properties 
WHERE standard_status = 'Expired' 
  AND modification_timestamp < NOW() - INTERVAL '90 days';
```

## Current Configuration Summary

| Feature | Status | Configuration |
|---------|--------|---------------|
| Delta Sync | ✅ Enabled | `ModificationTimestamp` high-water mark |
| Sync Interval | ✅ Enabled | 5 minutes (configurable) |
| Photo Tracking | ✅ Enabled | `PhotosChangeTimestamp` |
| MlgCanView Filter | ✅ Enabled | Both ETL and API |
| Retry Logic | ✅ Enabled | 3 retries for media |
| Error Handling | ✅ Enabled | Logs + continues |
| Status Endpoint | ✅ Enabled | `/status` |
| Stale Detection | ⚠️ Basic | Via status endpoint |
| Webhooks | ❌ Not Implemented | Future enhancement |
| Separate Schedules | ❌ Not Implemented | Optional enhancement |

## Recommendations Priority

### High Priority (Implement Now)
1. ✅ **Status Endpoint** - Just added!
2. ⚠️ **Stale Data Alerts** - Add to monitoring

### Medium Priority (Next Sprint)
1. **Separate Sync Schedules** - Optimize API usage
2. **Media Download Prioritization** - If downloads are slow

### Low Priority (Future)
1. **Webhook Support** - When MLS supports it
2. **Partial Field Updates** - If performance becomes an issue

## Testing Data Freshness

```bash
# 1. Check last sync time
curl https://mta-api.optimizedevops.com/status | jq '.sync'

# 2. Verify delta sync is working
# - Note the high_water_mark
# - Wait 5 minutes
# - Check again - should have new timestamp if properties updated

# 3. Test MlgCanView filtering
curl 'https://mta-api.optimizedevops.com/listings/search?limit=10' | jq '.results[].mlg_can_view'
# All should be true

# 4. Check sync health
curl https://mta-api.optimizedevops.com/status | jq '.sync.health'
# Should be "healthy"
```

## Conclusion

Your system already implements the core best practices for MLS data freshness:
- ✅ Delta sync (efficient)
- ✅ Regular intervals (5 minutes)
- ✅ Photo change detection
- ✅ Compliance filtering
- ✅ Error handling

The new status endpoint provides visibility into data freshness and system health. Consider implementing stale data alerts as the next enhancement.