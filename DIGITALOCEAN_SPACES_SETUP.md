# DigitalOcean Spaces Setup for Media Storage

DigitalOcean Spaces is **100% S3-compatible**, so your existing code works without any changes! Just configure the environment variables.

## Why DigitalOcean Spaces?

✅ **S3-Compatible** - Works with existing AWS SDK code
✅ **Simple Pricing** - $5/month for 250GB storage + 1TB transfer
✅ **Built-in CDN** - Free CDN included with every Space
✅ **Easy Setup** - Create in minutes
✅ **Great Performance** - Fast global delivery

## Step 1: Create a Space

1. **Log into DigitalOcean**
   - Go to https://cloud.digitalocean.com/spaces

2. **Create New Space**
   - Click "Create" → "Spaces"
   - Choose a datacenter region (e.g., `nyc3`, `sfo3`, `ams3`)
   - Choose a unique name (e.g., `mls-listing-media`)
   - Enable CDN (recommended)
   - Set File Listing to "Private" (recommended)
   - Click "Create Space"

3. **Note Your Space Details**
   ```
   Space Name: mls-listing-media
   Region: nyc3
   Endpoint: nyc3.digitaloceanspaces.com
   CDN Endpoint: mls-listing-media.nyc3.cdn.digitaloceanspaces.com
   ```

## Step 2: Create API Keys

1. **Generate Spaces Access Keys**
   - Go to API → Spaces Keys
   - Click "Generate New Key"
   - Name it: "MLS Media Upload"
   - Save the keys immediately (you can't view them again!)

2. **You'll Get**:
   ```
   Access Key: DO00ABC123XYZ456...
   Secret Key: abc123xyz456def789...
   ```

## Step 3: Configure Environment Variables

### For Coolify Deployment

Add these to your Coolify environment variables:

```env
# DigitalOcean Spaces Configuration
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO00ABC123XYZ456...
S3_SECRET_ACCESS_KEY=abc123xyz456def789...
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com
```

### For Local Development

Add to your `.env` file:

```env
# DigitalOcean Spaces Configuration
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=DO00ABC123XYZ456...
S3_SECRET_ACCESS_KEY=abc123xyz456def789...
CDN_BASE_URL=https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com
```

## Step 4: Update .env.example

```bash
# Add to .env.example for documentation
cat >> .env.example << 'EOF'

# DigitalOcean Spaces (S3-Compatible Object Storage)
# Get credentials from: https://cloud.digitalocean.com/account/api/spaces
S3_ENDPOINT=https://nyc3.digitaloceanspaces.com
S3_REGION=nyc3
S3_BUCKET=mls-listing-media
S3_ACCESS_KEY_ID=your_spaces_access_key
S3_SECRET_ACCESS_KEY=your_spaces_secret_key
CDN_BASE_URL=https://your-space.nyc3.cdn.digitaloceanspaces.com
EOF
```

## Step 5: Set CORS Policy (Optional)

If you want to serve images directly from Spaces to browsers:

1. **Go to your Space** → Settings → CORS Configurations
2. **Add CORS Rule**:
   ```json
   {
     "AllowedOrigins": ["*"],
     "AllowedMethods": ["GET", "HEAD"],
     "AllowedHeaders": ["*"],
     "MaxAgeSeconds": 3600
   }
   ```

## How It Works

### Media Upload Flow

1. **ETL downloads photo** from MLS Grid API
2. **Uploads to Spaces** using S3-compatible API
3. **Stores CDN URL** in database (`mls.media.local_url`)
4. **API returns CDN URL** to frontend
5. **Browser loads image** from CDN (fast!)

### File Structure in Spaces

```
mls-listing-media/
├── actris/
│   ├── ACT123456/
│   │   ├── 0.jpg          (primary photo)
│   │   ├── 1.jpg
│   │   ├── 2.jpg
│   │   └── ...
│   ├── ACT123457/
│   │   └── ...
```

### Example URLs

**Original MLS URL** (slow, may expire):
```
https://api.mlsgrid.com/v2/Media/ACT123456/Content
```

**Your CDN URL** (fast, permanent):
```
https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/actris/ACT123456/0.jpg
```

## Pricing Example

### DigitalOcean Spaces Pricing
- **$5/month** includes:
  - 250 GB storage
  - 1 TB outbound transfer
  - Built-in CDN

### Estimated Usage (10,000 properties)
- **Storage**: ~50 GB (5 photos per property, 1MB each)
- **Transfer**: ~500 GB/month (assuming 100k photo views)
- **Cost**: **$5/month** (well within limits)

### Compared to Alternatives
- **AWS S3 + CloudFront**: ~$15-30/month
- **Cloudflare R2**: $0.015/GB storage (no egress fees)
- **DigitalOcean Spaces**: **$5/month flat** (simplest!)

## Testing the Setup

### 1. Test Upload (Manual)

```bash
# Install s3cmd
brew install s3cmd  # macOS
# or
apt-get install s3cmd  # Linux

# Configure s3cmd
s3cmd --configure \
  --access_key=DO00ABC123XYZ456... \
  --secret_key=abc123xyz456def789... \
  --host=nyc3.digitaloceanspaces.com \
  --host-bucket='%(bucket)s.nyc3.digitaloceanspaces.com'

# Test upload
echo "test" > test.txt
s3cmd put test.txt s3://mls-listing-media/test.txt

# Test download
curl https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/test.txt
```

### 2. Test with Your App

```bash
# Deploy with Spaces configured
git push origin main

# Check ETL logs
# Should see: "S3/R2 storage configured - media will be downloaded"

# Wait for some properties to sync
# Check database for CDN URLs
docker exec postgres-container psql -U postgres -d mls -c \
  "SELECT local_url FROM mls.media WHERE local_url IS NOT NULL LIMIT 5;"

# Should show URLs like:
# https://mls-listing-media.nyc3.cdn.digitaloceanspaces.com/actris/ACT123456/0.jpg
```

## Monitoring

### Check Upload Progress

```bash
# Via status endpoint
curl https://mta-api.optimizedevops.com/status | jq '.media'

# Should show:
{
  "total_media": 45678,
  "downloaded_media": 12345,
  "download_percentage": 27
}
```

### Check Space Usage

1. Go to your Space in DigitalOcean dashboard
2. View "Space Usage" chart
3. Monitor storage and bandwidth

## Troubleshooting

### Issue: "Access Denied" Errors

**Solution**: Check your API keys
```bash
# Verify keys are correct in Coolify environment variables
# Regenerate keys if needed from DigitalOcean dashboard
```

### Issue: Slow Uploads

**Solution**: Choose a region closer to your server
```bash
# If server is in NYC, use nyc3
# If server is in SF, use sfo3
# If server is in EU, use ams3
```

### Issue: Images Not Loading

**Solution**: Check CORS settings
```bash
# Add CORS rule in Space settings (see Step 5)
# Or serve images through your API as proxy
```

## Security Best Practices

### 1. Private Space (Recommended)
- Set File Listing to "Private"
- Only allow access via CDN URLs
- Don't expose bucket listing

### 2. Separate Keys
- Use different keys for production vs development
- Rotate keys periodically
- Never commit keys to git

### 3. CDN Settings
- Enable CDN for all Spaces
- Use CDN URLs in API responses
- Cache images for 1 year (they don't change)

## Migration from Existing Storage

If you're already using another storage provider:

```bash
# 1. Keep old URLs working during migration
# 2. New uploads go to Spaces
# 3. Gradually migrate old images (optional)

# Example migration script
for listing in $(psql -t -c "SELECT listing_key FROM mls.properties LIMIT 100"); do
  # Download from old storage
  # Upload to Spaces
  # Update local_url in database
done
```

## Summary

✅ **DigitalOcean Spaces works perfectly** with your existing code
✅ **No code changes needed** - just configure environment variables
✅ **Simple pricing** - $5/month flat rate
✅ **Built-in CDN** - fast global delivery
✅ **Easy setup** - 5 minutes to configure

Just add the environment variables to Coolify and redeploy!