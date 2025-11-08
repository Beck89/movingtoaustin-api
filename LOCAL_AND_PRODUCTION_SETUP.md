# Local & Production Configuration Guide

## Strategy: Separate Folders in Same Space

We'll use **path prefixes** to keep local and production media completely separate:

```
mls-listing-media/
├── production/
│   └── actris/
│       ├── ACT123456/
│       │   ├── 0.jpg
│       │   └── 1.jpg
│       └── ...
└── local/
    └── actris/
        ├── ACT123456/
        │   ├── 0.jpg
        │   └── 1.jpg
        └── ...
```

## Configuration

### Production (Coolify)

Add these environment variables in Coolify:

```env
# DigitalOcean Spaces
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO801ACDJ89C7TJKHJ3M
S3_SECRET_ACCESS_KEY=7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com

# Environment identifier (IMPORTANT!)
STORAGE_PREFIX=production
```

### Local Development

Add to your local `.env` file:

```env
# DigitalOcean Spaces (same credentials)
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO801ACDJ89C7TJKHJ3M
S3_SECRET_ACCESS_KEY=7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com

# Environment identifier (IMPORTANT!)
STORAGE_PREFIX=local

# Optional: Limit properties for local testing
ETL_MAX_PROPERTIES=100
```

## Code Changes Required

We need to update the storage module to use the prefix. Let me show you the changes:

### File: `etl/src/storage.ts`

The current code needs to be updated to include the `STORAGE_PREFIX` environment variable in the file path.

**Current path format**:
```
actris/ACT123456/0.jpg
```

**New path format**:
```
production/actris/ACT123456/0.jpg  (production)
local/actris/ACT123456/0.jpg       (local)
```

This ensures:
- ✅ Local testing doesn't affect production
- ✅ Production data stays clean
- ✅ Same credentials work for both
- ✅ Easy to identify which environment uploaded what

## Benefits

### 1. No Conflicts
- Local uploads go to `local/` folder
- Production uploads go to `production/` folder
- Never overwrite each other

### 2. Easy Testing
- Test with real data locally
- Limit to 100 properties with `ETL_MAX_PROPERTIES=100`
- See exactly what local vs production looks like

### 3. Easy Cleanup
- Delete entire `local/` folder when done testing
- Production data untouched

### 4. Cost Efficient
- Use same Space for both environments
- Only pay $5/month total
- No need for separate Spaces

## Example URLs

### Production
```
https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/production/actris/ACT123456/0.jpg
```

### Local
```
https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/local/actris/ACT123456/0.jpg
```

## Testing the Setup

### 1. Test Local First

```bash
# In your local project
npm run dev:etl

# Check logs - should see:
# "S3/R2 storage configured - media will be downloaded"
# "Uploading to: local/actris/ACT123456/0.jpg"

# Verify in DigitalOcean Spaces
# Should see files under: local/actris/...
```

### 2. Deploy to Production

```bash
git push origin main

# Check production logs
# Should see:
# "Uploading to: production/actris/ACT123456/0.jpg"

# Verify in DigitalOcean Spaces
# Should see files under: production/actris/...
```

### 3. Verify Separation

```bash
# Check local status
curl http://localhost:3000/status | jq '.media'

# Check production status
curl https://mta-api.optimizedevops.com/status | jq '.media'

# Both should show different counts
```

## Cleanup

### Delete Local Test Data

When done testing locally:

1. Go to DigitalOcean Spaces
2. Navigate to `mls-listing-media`
3. Delete the `local/` folder
4. Production data remains untouched

Or use CLI:

```bash
# Install s3cmd
brew install s3cmd

# Configure
s3cmd --configure

# Delete local folder
s3cmd del --recursive s3://mls-listing-media/local/
```

## Security Note

⚠️ **IMPORTANT**: The credentials I see in your message should be treated as secrets!

1. **Never commit them to git**
2. **Add to .gitignore**:
   ```bash
   echo ".env" >> .gitignore
   ```
3. **Use environment variables only**
4. **Rotate keys if accidentally exposed**

## Next Steps

1. I'll update the storage code to use `STORAGE_PREFIX`
2. You add the environment variables (with `STORAGE_PREFIX`)
3. Test locally first
4. Deploy to production
5. Verify both work independently

Ready for me to update the code?