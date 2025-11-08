# MLS Grid v2 Backend

A production-ready backend system for powering a Zillow-style real estate listing search with fast map/facet queries, clean image hosting, and MLS compliance.

## Architecture

```
MLS Grid v2 API → ETL Worker → Postgres (+PostGIS) → API (/search, /detail, /suggest)
                      ↓              ↓
                   Media         Meilisearch
                  Storage      (facets, text, geo)
```

### Core Components

- **Database**: PostgreSQL 16+ with PostGIS for geospatial queries
- **Search Engine**: Meilisearch v1.10 for instant search with typo tolerance
- **ETL Worker**: Node.js TypeScript worker for MLS Grid v2 data replication
- **API**: Express REST API for frontend consumption
- **Storage**: Optional S3/R2 for media hosting (can be added later)

### Why Meilisearch?

- **10-35x faster** search responses (1-5ms vs 20-100ms)
- **Built-in typo tolerance** for better user experience
- **90% less memory** usage (~100MB vs 1GB+)
- **Simpler operations** - single binary, zero config
- **Better developer experience** with built-in web UI

See [MEILISEARCH_MIGRATION.md](MEILISEARCH_MIGRATION.md) for migration details.

## Quick Start

### Prerequisites

- Docker Desktop
- Node.js 18+
- npm or yarn

### 1. Clone and Install

```bash
git clone <your-repo>
cd movingtoaustin-mls
npm install
```

### 2. Configure Environment

Create a `.env` file (see `.env.example`):

```env
# MLS Grid API
MLS_BASE=https://api.mlsgrid.com/v2
MLS_ACCESS_TOKEN=your_bearer_token_here
ORIGINATING_SYSTEM=actris

# Database
PG_URL=postgres://postgres:example@localhost:5433/mls

# Meilisearch
MEILI_HOST=http://localhost:7700
MEILI_MASTER_KEY=MySecureMasterKey123!
MEILI_INDEX=listings_actris_v1

# API
API_PORT=3000
API_HOST=0.0.0.0

# ETL
ETL_INTERVAL_MINUTES=5
ETL_BATCH_SIZE=100
ETL_MAX_RETRIES=3
```

### 3. Start Infrastructure

```bash
docker-compose up -d
```

This starts:
- PostgreSQL with PostGIS on port 5433
- Meilisearch on port 7700

### 4. Run Database Migrations

```bash
# Copy migration file to container
docker cp api/db/migrations/0001_init.sql mls-postgres:/tmp/init.sql

# Run migration
docker exec mls-postgres psql -U postgres -d mls -f /tmp/init.sql
```

### 5. Configure Meilisearch Index

```bash
npm run setup:meilisearch
```

This configures:
- Filterable attributes (for facets)
- Sortable attributes (for sorting)
- Searchable attributes (with ranking)
- Typo tolerance settings
- Geo search capabilities

### 6. Import Test Data

```bash
npm run test:import
```

This fetches 10 Active listings from MLS Grid and stores them in both Postgres and Meilisearch.

### 7. Start API Server

```bash
npm run dev:api
```

API will be available at `http://localhost:3000`

### 8. Start ETL Worker (Optional)

For continuous syncing:

```bash
npm run dev:etl
```

## API Endpoints

### Search Listings

```bash
GET /listings/search?bounds=30.1,-97.9,30.5,-97.5&minPrice=200000&maxPrice=500000&beds=3&status=Active
```

Query Parameters:
- `bounds`: lat1,lon1,lat2,lon2 (geo bounding box)
- `minPrice`, `maxPrice`: Price range
- `beds`, `baths`: Bedroom/bathroom counts
- `status`: StandardStatus (Active, Pending, Closed, etc.)
- `propertyType`: Property type filter
- `city`: City name
- `text`: Full-text search on address and remarks

Response includes:
- Matching listings
- Facet aggregations (status, city, type, price buckets)
- Total count

### Get Listing Detail

```bash
GET /listings/:listing_key
```

Returns:
- Full property details
- Media (photos, videos)
- Rooms
- Unit types (for multi-unit)
- Open houses

### Typeahead Suggestions

```bash
GET /suggest?q=78704
```

Returns suggestions for:
- Addresses
- Postal codes
- Subdivision names
- Listing IDs

## Database Schema

### Core Tables

- **`mls.properties`**: Main listing table with PostGIS geography column
- **`mls.media`**: Photos and videos linked to listings
- **`mls.rooms`**: Room details
- **`mls.unit_types`**: Multi-unit property details
- **`mls.open_houses`**: Open house schedules
- **`mls.lookups`**: MLS lookup values (cached)
- **`mls.offices`**: Listing offices
- **`mls.members`**: Agents/members
- **`mls.sync_state`**: High-water marks for delta sync

### Key Features

- **PostGIS Geography**: Efficient geo queries with `ST_DWithin`, `ST_Contains`
- **JSONB Storage**: All raw MLS data preserved in `raw` column
- **Automatic Triggers**: Geography column auto-updated from lat/lon
- **Cascading Deletes**: Media/rooms deleted when property deleted

## ETL Worker

### How It Works

1. **Delta Sync**: Tracks `ModificationTimestamp` per resource
2. **Batch Processing**: Fetches 100 records at a time
3. **Upsert Logic**: Updates existing, inserts new
4. **Media Download**: Optional S3/R2 upload (configurable)
5. **Search Index**: Syncs to Meilisearch after DB write

### Running Modes

**One-time Import**:
```bash
npm run test:import
```

**Continuous Sync**:
```bash
npm run dev:etl
```

**Production**:
```bash
npm run build:etl
npm run start:etl
```

### Monitoring

Check sync state:
```sql
SELECT * FROM mls.sync_state;
```

View recent listings:
```sql
SELECT listing_key, list_price, city, standard_status, modification_timestamp
FROM mls.properties
ORDER BY modification_timestamp DESC
LIMIT 10;
```

## MLS Compliance

### Key Rules Enforced

1. **MlgCanView**: Only display listings where `MlgCanView = true`
2. **MlgCanUse**: Respect allowed use cases (IDX, VOW, etc.)
3. **Media Hosting**: Download and host photos (no hotlinking)
4. **Attribution**: Display office/agent info per MLS rules
5. **Refresh Frequency**: Delta sync every 2-5 minutes

### Compliance Checklist

- [ ] Verify MlgCanView filter in ETL and API
- [ ] Display required attribution fields
- [ ] Host media from your CDN (not MLS URLs)
- [ ] Implement proper disclaimers
- [ ] Follow broker agreement terms

## Development

### Project Structure

```
movingtoaustin-mls/
├── api/
│   ├── db/
│   │   ├── migrations/     # SQL migration files
│   │   └── migrate.ts      # Migration runner
│   └── src/
│       ├── routes/         # API endpoints
│       ├── db.ts           # Database client
│       ├── search.ts       # Meilisearch client
│       └── index.ts        # Express app
├── etl/
│   └── src/
│       ├── mls-client.ts   # MLS Grid API client
│       ├── storage.ts      # S3/R2 uploader
│       └── index.ts        # ETL worker
├── scripts/
│   ├── test-import.ts      # One-time import script
│   ├── setup-meilisearch.ts # Meilisearch configuration
│   └── setup-index.sh      # Legacy OpenSearch setup
├── docker-compose.yml      # Infrastructure
└── MEILISEARCH_MIGRATION.md # Migration guide
```

### Available Scripts

```bash
# Development
npm run dev:api          # Start API with hot reload
npm run dev:etl          # Start ETL worker with hot reload

# Database
npm run db:migrate       # Run migrations

# Search
npm run setup:meilisearch # Configure Meilisearch index

# Testing
npm run test:import      # Import 10 test listings

# Production
npm run build:api        # Build API
npm run build:etl        # Build ETL
npm run start:api        # Start API (production)
npm run start:etl        # Start ETL (production)
```

### Adding New Fields

1. Update database schema in `api/db/migrations/`
2. Update TypeScript interfaces in ETL and API
3. Update ETL mapping in `etl/src/index.ts`
4. Update Meilisearch settings via `scripts/setup-meilisearch.ts`
5. Add new fields to filterable/sortable/searchable attributes

## Deployment

### Docker Compose (Simple)

Already configured in `docker-compose.yml`. For production:

1. Update passwords in `.env`
2. Configure persistent volumes
3. Set up backups
4. Add monitoring

### Kubernetes (Advanced)

See `k8s/` directory for:
- Postgres StatefulSet
- Meilisearch StatefulSet
- API Deployment
- ETL CronJob
- Services and Ingress

### Environment Variables

**Required**:
- `MLS_ACCESS_TOKEN`: Bearer token for MLS Grid API
- `ORIGINATING_SYSTEM`: MLS system name (e.g., 'actris')
- `PG_URL`: PostgreSQL connection string
- `MEILI_HOST`: Meilisearch endpoint
- `MEILI_MASTER_KEY`: Meilisearch API key

**Optional**:
- `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`: For media hosting
- `ETL_INTERVAL_MINUTES`: Sync frequency (default: 5)
- `ETL_BATCH_SIZE`: Records per batch (default: 100)

## Troubleshooting

### Database Connection Issues

```bash
# Check if Postgres is running
docker ps | grep postgres

# Check logs
docker logs mls-postgres

# Test connection
docker exec mls-postgres psql -U postgres -d mls -c "SELECT 1;"
```

### Meilisearch Issues

```bash
# Check if Meilisearch is running
docker ps | grep meilisearch

# Check logs
docker logs mls-meilisearch

# Test connection
curl http://localhost:7700/health

# Access web UI
open http://localhost:7700
# Master Key: MySecureMasterKey123!
```

### ETL Worker Issues

```bash
# Check sync state
docker exec mls-postgres psql -U postgres -d mls -c "SELECT * FROM mls.sync_state;"

# View recent errors in logs
npm run dev:etl 2>&1 | grep ERROR
```

### API Issues

```bash
# Test health endpoint
curl http://localhost:3000/health

# Check API logs
npm run dev:api
```

## Performance Tuning

### Database

- Add indexes for frequently filtered fields
- Use connection pooling (already configured)
- Consider read replicas for high traffic

### Meilisearch

- Meilisearch auto-optimizes for datasets <10M documents
- Increase `maxTotalHits` if you need more than 10k results
- Monitor index size and memory usage
- Use facets sparingly for better performance

### ETL

- Adjust `ETL_BATCH_SIZE` based on API rate limits
- Use multiple workers for different MLS systems
- Implement exponential backoff for retries

## Security

- Keep MLS credentials server-side only
- Use environment variables for secrets
- Enable SSL/TLS for production
- Implement rate limiting on API
- Regular security updates for dependencies

## License

[Your License Here]

## Support

For issues or questions:
- GitHub Issues: [your-repo]/issues
- Email: [your-email]
- Documentation: [your-docs-url]