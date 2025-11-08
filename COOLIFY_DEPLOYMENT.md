# Coolify Deployment Guide - Simplified

Deploy the entire MLS Grid v2 Backend stack with a single Docker Compose file in Coolify.

## 🚀 Quick Deploy (3 Steps)

### Step 1: Push to GitHub

```bash
git add .
git commit -m "Ready for Coolify deployment"
git push origin main
```

### Step 2: Create Service in Coolify

1. Log into Coolify
2. Click **"+ New Resource"** → **"Service"** → **"Docker Compose"**
3. Configure:
   - **Name**: `mls-grid-backend`
   - **Source**: GitHub
   - **Repository**: Select your repo
   - **Branch**: `main`
   - **Docker Compose Location**: `docker-compose.yml` (root)

### Step 3: Set Environment Variables

In Coolify, add these environment variables:

```env
# Required - MLS Grid API
MLS_ACCESS_TOKEN=your_actual_bearer_token_here
ORIGINATING_SYSTEM=actris

# Required - Security (change these!)
POSTGRES_PASSWORD=YourSecureDBPassword123!
MEILI_MASTER_KEY=YourSecureMeilisearchKey123!

# Optional - Customize if needed
POSTGRES_USER=postgres
POSTGRES_DB=mls
MEILI_INDEX=listings_actris_v1
ETL_INTERVAL_MINUTES=5
```

Click **"Deploy"** and you're done! 🎉

## 📊 What Gets Deployed

Coolify will automatically deploy all 4 services:

```
┌─────────────────────────────────────┐
│  API Service                         │ ← Exposed on port 3000
│  - Automatic migrations              │
│  - Health checks                     │
│  - Auto-restart                      │
└─────────────────────────────────────┘
         ↓                    ↓
┌──────────────────┐  ┌──────────────────┐
│  PostgreSQL      │  │  Meilisearch     │
│  + PostGIS       │  │  + Web UI        │
│  + Auto backups  │  │  + Typo tolerance│
└──────────────────┘  └──────────────────┘
         ↑
┌─────────────────────────────────────┐
│  ETL Worker                          │
│  - Background sync every 5 min       │
│  - Automatic retries                 │
└─────────────────────────────────────┘
```

**All services communicate internally via Docker network** - no manual networking needed!

## 🔧 Post-Deployment Setup

### 1. Enable PostGIS Extension

After deployment, run once:

1. Go to your service in Coolify
2. Click on **"postgres"** container → **"Execute Command"**
3. Run:
   ```bash
   psql -U postgres -d mls -c "CREATE EXTENSION IF NOT EXISTS postgis;"
   ```

### 2. Configure Meilisearch Index

1. Click on **"api"** container → **"Execute Command"**
2. Run:
   ```bash
   npm run setup:meilisearch
   ```

### 3. Import Initial Data

1. Click on **"etl"** container → **"Execute Command"**
2. Run:
   ```bash
   npm run test:import
   ```

After this, the ETL worker will automatically sync every 5 minutes!

## 🌐 Expose API to Internet

### Option 1: Use Coolify Domain

1. Go to your service → **"api"** container
2. Click **"Domains"**
3. Add domain: `api.yourdomain.com`
4. Coolify automatically provisions SSL via Let's Encrypt
5. Your API is now available at: `https://api.yourdomain.com`

### Option 2: Use Coolify Subdomain

Coolify can provide a free subdomain:
- Format: `your-service.coolify.io`
- Automatic SSL included

## 📝 Environment Variables Reference

### Required Variables

| Variable | Description | Example |
|----------|-------------|---------|
| `MLS_ACCESS_TOKEN` | Your MLS Grid Bearer token | `abc123...` |
| `POSTGRES_PASSWORD` | Database password | `SecurePass123!` |
| `MEILI_MASTER_KEY` | Meilisearch API key | `SecureKey123!` |

### Optional Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `ORIGINATING_SYSTEM` | `actris` | MLS system name |
| `POSTGRES_USER` | `postgres` | Database username |
| `POSTGRES_DB` | `mls` | Database name |
| `MEILI_INDEX` | `listings_actris_v1` | Search index name |
| `ETL_INTERVAL_MINUTES` | `5` | Sync frequency |
| `ETL_BATCH_SIZE` | `100` | Records per batch |
| `API_PORT` | `3000` | API port (internal) |

### Optional: S3/R2 Media Storage

If you want to host listing photos on your own CDN:

```env
S3_ENDPOINT=https://your-endpoint.com
S3_REGION=auto
S3_BUCKET=my-listing-media
S3_ACCESS_KEY_ID=your_key
S3_SECRET_ACCESS_KEY=your_secret
CDN_BASE_URL=https://cdn.yourdomain.com
```

## 🔍 Monitoring & Logs

### View Logs

In Coolify, click on any container to view real-time logs:

- **API logs**: See incoming requests and responses
- **ETL logs**: See sync progress and any errors
- **Postgres logs**: Database queries and connections
- **Meilisearch logs**: Search queries and indexing

### Check Sync Status

1. Go to **"postgres"** container → **"Execute Command"**
2. Run:
   ```sql
   psql -U postgres -d mls -c "SELECT * FROM mls.sync_state;"
   ```

### View Recent Listings

```sql
psql -U postgres -d mls -c "
  SELECT listing_key, list_price, city, standard_status 
  FROM mls.properties 
  ORDER BY modification_timestamp DESC 
  LIMIT 10;
"
```

### Test API Endpoints

```bash
# Health check
curl https://your-api-domain.com/health

# Search listings
curl "https://your-api-domain.com/listings/search?status=Active&limit=5"

# Get specific listing
curl "https://your-api-domain.com/listings/ACT210348090"

# Typeahead suggestions
curl "https://your-api-domain.com/suggest?q=Austin"
```

## 🔄 Updates & Redeployment

### Automatic Deployments

Enable GitHub webhook in Coolify:

1. Go to your service → **"Source"**
2. Enable **"Automatic Deployment"**
3. Now every push to `main` branch auto-deploys!

### Manual Deployment

Click **"Deploy"** button in Coolify dashboard.

### Zero-Downtime Updates

Coolify automatically:
1. Builds new containers
2. Waits for health checks to pass
3. Switches traffic to new containers
4. Stops old containers

## 🛡️ Security Checklist

Before going live:

- [ ] Changed `POSTGRES_PASSWORD` from default
- [ ] Changed `MEILI_MASTER_KEY` from default
- [ ] Set `MEILI_ENV=production`
- [ ] Verified `MLS_ACCESS_TOKEN` is correct
- [ ] Enabled SSL via Coolify domain
- [ ] Configured firewall (if needed)
- [ ] Set up database backups in Coolify
- [ ] Tested all API endpoints
- [ ] Verified ETL worker is syncing

## 📦 Resource Requirements

Recommended for production:

| Service | Memory | CPU | Storage |
|---------|--------|-----|---------|
| API | 512MB | 0.5 | - |
| ETL | 512MB | 0.5 | - |
| PostgreSQL | 1GB | 1.0 | 10GB |
| Meilisearch | 512MB | 0.5 | 5GB |

**Total**: ~2.5GB RAM, 2.5 CPU, 15GB storage

## 🔧 Troubleshooting

### Services Won't Start

**Check logs** in Coolify for each container.

**Common issues**:
- Missing `MLS_ACCESS_TOKEN` - Add in environment variables
- Database connection failed - Verify `POSTGRES_PASSWORD`
- Meilisearch connection failed - Verify `MEILI_MASTER_KEY`

### API Returns 500 Errors

1. Check API logs for errors
2. Verify database is healthy
3. Verify Meilisearch is healthy
4. Check if migrations ran successfully

### ETL Not Syncing

1. Check ETL logs
2. Verify `MLS_ACCESS_TOKEN` is valid
3. Check database connection
4. Verify Meilisearch index is configured

### Database Migration Failed

Run manually:

1. Go to **"postgres"** container → **"Execute Command"**
2. Copy contents of `api/db/migrations/0001_init.sql`
3. Run:
   ```bash
   psql -U postgres -d mls
   # Paste SQL and execute
   ```

## 🎯 Production Checklist

- [ ] All services deployed and healthy
- [ ] PostGIS extension enabled
- [ ] Database migrations completed
- [ ] Meilisearch index configured
- [ ] Initial data imported
- [ ] API health check passing
- [ ] ETL worker syncing (check logs)
- [ ] Domain configured with SSL
- [ ] Automatic deployments enabled
- [ ] Backups configured
- [ ] All passwords changed from defaults
- [ ] API endpoints tested
- [ ] Search functionality verified

## 💡 Pro Tips

### 1. Access Meilisearch Web UI

Add a domain to the `meilisearch` container:
- Domain: `search.yourdomain.com`
- Access at: `https://search.yourdomain.com`
- Login with your `MEILI_MASTER_KEY`

### 2. Scale API for High Traffic

In Coolify:
1. Go to **"api"** container
2. Increase **"Replicas"** to 2 or more
3. Coolify automatically load balances

### 3. Reduce Sync Frequency

If you don't need real-time updates:
```env
ETL_INTERVAL_MINUTES=15  # Instead of 5
```

### 4. Enable Database Backups

In Coolify:
1. Go to **"postgres"** container
2. Click **"Backups"**
3. Configure schedule (e.g., daily at 2 AM)
4. Set retention (e.g., 7 days)

## 📚 Additional Resources

- **Coolify Docs**: https://coolify.io/docs
- **Meilisearch Docs**: https://www.meilisearch.com/docs
- **PostGIS Docs**: https://postgis.net/documentation
- **Project README**: [README.md](README.md)
- **Migration Guide**: [MEILISEARCH_MIGRATION.md](MEILISEARCH_MIGRATION.md)

## 🎉 You're Done!

Your MLS Grid v2 Backend is now running on Coolify with:

✅ **All 4 services** deployed from one Docker Compose file
✅ **Internal networking** - services communicate automatically
✅ **Auto-restart** - services restart on failure
✅ **Health checks** - Coolify monitors service health
✅ **SSL/TLS** - Automatic via Let's Encrypt
✅ **Zero-downtime** - Rolling updates
✅ **Auto-deployments** - Push to GitHub = auto-deploy

Your API is ready at: `https://your-domain.com` 🚀