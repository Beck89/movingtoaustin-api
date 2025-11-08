# Quick Setup Guide

## ✅ Your DigitalOcean Spaces Credentials

```
Endpoint: https://nyc3.digitaloceanspaces.com
Access Key: DO801ACDJ89C7TJKHJ3M
Secret Key: 7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
Bucket: mls-listing-media (you need to create this)
```

## Step 1: Create the Space

1. Go to https://cloud.digitalocean.com/spaces
2. Click "Create" → "Spaces"
3. **Region**: Choose `nyc3` (New York 3)
4. **Space Name**: `mls-listing-media`
5. **Enable CDN**: ✅ Yes
6. **File Listing**: Private (recommended)
7. Click "Create Space"

Your CDN URL will be: `https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com`

## Step 2: Configure Local Development

Create a `.env` file in your project root:

```bash
# Copy from example
cp .env.example .env
```

Then add these lines to your `.env`:

```env
# DigitalOcean Spaces
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO801ACDJ89C7TJKHJ3M
S3_SECRET_ACCESS_KEY=7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com

# Local environment (keeps data separate from production)
STORAGE_PREFIX=local

# Limit properties for local testing
ETL_MAX_PROPERTIES=100
```

## Step 3: Configure Production (Coolify)

Add these environment variables in Coolify:

```env
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO801ACDJ89C7TJKHJ3M
S3_SECRET_ACCESS_KEY=7VLFL4ThZXNhMBoAbGd01G8NtVAokWlRH7pXIuao04o
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com
STORAGE_PREFIX=production
```

**Important**: Don't set `ETL_MAX_PROPERTIES` in production!

## Step 4: Test Locally

```bash
# Start local development
npm run dev:etl

# In another terminal, check status
curl http://localhost:3000/status | jq '.media'

# Should show media being downloaded to local/ folder
```

## Step 5: Deploy to Production

```bash
git add .
git commit -m "Add DigitalOcean Spaces configuration with environment separation"
git push origin main
```

Coolify will auto-deploy with production configuration.

## Verify It's Working

### Check Local
```bash
# Media should be in local/ folder
curl http://localhost:3000/status | jq '.media'
```

### Check Production
```bash
# Media should be in production/ folder
curl https://mta-api.optimizedevops.com/status | jq '.media'
```

### Check DigitalOcean Spaces
1. Go to your Space in DigitalOcean
2. You should see two folders:
   - `local/` - Your local test data
   - `production/` - Your production data

## File Structure in Space

```
mls-listing-media/
├── production/
│   └── actris/
│       ├── ACT123456/
│       │   ├── 0.jpg  (primary photo)
│       │   ├── 1.jpg
│       │   └── 2.jpg
│       └── ACT123457/
│           └── ...
└── local/
    └── actris/
        └── ACT123456/
            └── ...
```

## Example URLs

### Production
```
https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/production/actris/ACT123456/0.jpg
```

### Local
```
https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/local/actris/ACT123456/0.jpg
```

## Troubleshooting

### "Access Denied" Error
- Verify the Space name is exactly `mls-listing-media`
- Check credentials are correct
- Ensure Space is in `nyc3` region

### Media Not Downloading
- Check ETL logs: `docker logs etl-container`
- Should see: "S3/R2 storage configured - media will be downloaded"
- If not, verify all S3_* environment variables are set

### Wrong Folder
- Check `STORAGE_PREFIX` environment variable
- Local should be `local`
- Production should be `production`

## Cost Estimate

**DigitalOcean Spaces**: $5/month includes:
- 250 GB storage
- 1 TB transfer
- Built-in CDN

**Estimated usage** (10,000 properties):
- Storage: ~50 GB (5 photos × 1MB each)
- Transfer: ~500 GB/month
- **Total**: $5/month (well within limits!)

## Security Checklist

- ✅ `.env` is in `.gitignore`
- ✅ Credentials not committed to git
- ✅ Different `STORAGE_PREFIX` for local/production
- ✅ Space set to Private (not public listing)
- ✅ CDN enabled for fast delivery

## Next Steps

1. ✅ Create Space in DigitalOcean
2. ✅ Configure local `.env`
3. ✅ Test locally
4. ✅ Configure Coolify environment variables
5. ✅ Deploy to production
6. ✅ Verify both environments work independently

Done! Your media will now be hosted on DigitalOcean Spaces with CDN delivery.