# Testing with Resource Limits

This document explains how to use the ETL resource limits for local testing without burning through your MLS Grid rate limits.

## Available Limits

You can control exactly how much data is synced for each resource type:

```bash
# In your .env file or docker-compose.yml:
ETL_MAX_PROPERTIES=100    # Limit property sync
ETL_MAX_MEMBERS=50        # Limit member (agent/broker) sync
ETL_MAX_OFFICES=25        # Limit office (brokerage) sync
ETL_MAX_OPENHOUSES=10     # Limit open house sync
```

## How Limits Work

### Property Limit (`ETL_MAX_PROPERTIES`)
- **Applies to**: Property resource sync only
- **Behavior**: Stops syncing after N properties are processed
- **Use case**: Test the core listing functionality without syncing thousands of properties
- **Example**: Set to 100 to test with a small dataset

### Member Limit (`ETL_MAX_MEMBERS`)
- **Applies to**: Member (agent/broker) resource sync only
- **Behavior**: Stops syncing after N members are processed
- **Use case**: Get enough agent data to test attribution without syncing all agents
- **Example**: Set to 50 to get a representative sample of agents

### Office Limit (`ETL_MAX_OFFICES`)
- **Applies to**: Office (brokerage) resource sync only
- **Behavior**: Stops syncing after N offices are processed
- **Use case**: Get enough office data to test brokerage information without syncing all offices
- **Example**: Set to 25 to get a representative sample of brokerages

### OpenHouse Limit (`ETL_MAX_OPENHOUSES`)
- **Applies to**: OpenHouse resource sync only
- **Behavior**: Stops syncing after N open houses are processed
- **Use case**: Test open house functionality without syncing all scheduled viewings
- **Example**: Set to 10 to test the open house feature

## Why Separate Limits?

Each resource type serves a different purpose:

1. **Properties** - The main data (listings)
2. **Members** - Lookup table for agent/broker information
3. **Offices** - Lookup table for brokerage information
4. **OpenHouses** - Related data for scheduled property viewings

By having separate limits, you can:
- Test with 100 properties but only 50 agents (not all agents have listings)
- Test with 100 properties but only 10 open houses (not all properties have open houses)
- Control your rate limit usage precisely for each resource type

## Rate Limit Impact

MLS Grid enforces these limits:
- **2 requests per second** (RPS)
- **7,200 requests per hour**
- **40,000 requests per day**

### Request Count by Resource

Each resource type makes different numbers of requests:

```
Properties (with $expand=Media,Rooms,UnitTypes):
- 1 request per 100 properties (BATCH_SIZE=100)
- 100 properties = ~1 request
- 1,000 properties = ~10 requests

Members:
- 1 request per 100 members
- 50 members = ~1 request
- 500 members = ~5 requests

Offices:
- 1 request per 100 offices
- 25 offices = ~1 request
- 250 offices = ~3 requests

OpenHouses:
- 1 request per 100 open houses
- 10 open houses = ~1 request
- 100 open houses = ~1 request
```

### Example: Conservative Local Testing

```bash
# .env for local testing
ETL_MAX_PROPERTIES=100     # ~1 request
ETL_MAX_MEMBERS=50         # ~1 request
ETL_MAX_OFFICES=25         # ~1 request
ETL_MAX_OPENHOUSES=10      # ~1 request
# Total: ~4 requests per sync cycle
```

This configuration:
- Uses only ~4 requests per sync cycle
- Allows 1,800 sync cycles per hour (well within limits)
- Provides enough data to test all features
- Leaves plenty of rate limit headroom

## Production Configuration

In production, **remove all limits** to sync complete data:

```bash
# .env for production - NO LIMITS
# ETL_MAX_PROPERTIES=     # Commented out or removed
# ETL_MAX_MEMBERS=        # Commented out or removed
# ETL_MAX_OFFICES=        # Commented out or removed
# ETL_MAX_OPENHOUSES=     # Commented out or removed
```

When limits are not set (or set to empty string), the ETL will:
- Sync all available properties
- Sync all available members
- Sync all available offices
- Sync all available open houses

## Testing Workflow

### 1. Initial Local Test (Minimal Data)
```bash
# docker-compose.yml or .env
ETL_MAX_PROPERTIES=10
ETL_MAX_MEMBERS=5
ETL_MAX_OFFICES=5
ETL_MAX_OPENHOUSES=2
```

**Purpose**: Verify the ETL works end-to-end with minimal API usage

### 2. Feature Testing (Representative Data)
```bash
ETL_MAX_PROPERTIES=100
ETL_MAX_MEMBERS=50
ETL_MAX_OFFICES=25
ETL_MAX_OPENHOUSES=10
```

**Purpose**: Test all features with enough data to be realistic

### 3. Performance Testing (Larger Dataset)
```bash
ETL_MAX_PROPERTIES=500
ETL_MAX_MEMBERS=200
ETL_MAX_OFFICES=100
ETL_MAX_OPENHOUSES=50
```

**Purpose**: Test search performance and UI with more data

### 4. Production Deployment (No Limits)
```bash
# Remove all limits
```

**Purpose**: Sync complete MLS data

## Monitoring During Testing

Watch the ETL logs to see when limits are hit:

```bash
docker-compose logs -f etl
```

You'll see messages like:
```
⚠️  MAX_PROPERTIES limit set to 100 (for testing)
Processing batch of 100 properties
Reached MAX_PROPERTIES limit of 100. Stopping sync.
Sync complete. Processed 100 properties

⚠️  MAX_MEMBERS limit set to 50 (for testing)
Processing batch of 50 members
Reached MAX_MEMBERS limit of 50. Stopping sync.
Member sync complete. Processed 50 members
```

## High-Water Marks with Limits

**Important**: When using limits, high-water marks still advance!

This means:
- First sync: Gets properties 1-100 (if MAX_PROPERTIES=100)
- Second sync: Gets properties 101-200 (next 100 after the high-water mark)
- Third sync: Gets properties 201-300 (and so on)

To reset and start over:
```sql
-- Reset high-water marks to start from beginning
DELETE FROM mls.sync_state WHERE originating_system_name = 'ACTRIS';
```

## Best Practices

1. **Start Small**: Begin with limits of 10-50 to verify everything works
2. **Increase Gradually**: Bump up limits as you test more features
3. **Monitor Rate Limits**: Watch for 429 errors in logs
4. **Reset Between Tests**: Clear high-water marks if you want to re-test with the same data
5. **Remove for Production**: Always remove limits before production deployment

## Example: Complete Local Testing Setup

```yaml
# docker-compose.yml
services:
  etl:
    environment:
      # MLS Grid credentials
      MLS_BASE: https://api.mlsgrid.com/v2
      MLS_TOKEN_URL: https://api.mlsgrid.com/oauth2/token
      MLS_CLIENT_ID: ${MLS_CLIENT_ID}
      MLS_CLIENT_SECRET: ${MLS_CLIENT_SECRET}
      ORIGINATING_SYSTEM: ACTRIS
      
      # Testing limits (remove for production)
      ETL_MAX_PROPERTIES: 100
      ETL_MAX_MEMBERS: 50
      ETL_MAX_OFFICES: 25
      ETL_MAX_OPENHOUSES: 10
      
      # Sync interval (5 minutes for testing, 2-5 for production)
      ETL_INTERVAL_MINUTES: 5
      
      # Storage (optional for testing)
      STORAGE_PREFIX: local
      S3_ENDPOINT: ${S3_ENDPOINT}
      S3_BUCKET: ${S3_BUCKET}
      S3_ACCESS_KEY_ID: ${S3_ACCESS_KEY_ID}
      S3_SECRET_ACCESS_KEY: ${S3_SECRET_ACCESS_KEY}
```

This setup gives you:
- ✅ Complete feature testing capability
- ✅ Minimal rate limit usage (~4 requests per cycle)
- ✅ Fast iteration (small dataset loads quickly)
- ✅ Easy transition to production (just remove limits)