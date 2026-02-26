# MLS Listings API - Endpoint Documentation

Complete reference for all API endpoints, query parameters, and response formats.

**Base URL**: `https://mta-api.optimizedevops.com` (Production) or `http://localhost:3000` (Development)

**Interactive Documentation**: Visit `/api-docs` for Swagger UI

---

## Table of Contents

1. [Search Listings (Primary)](#1-search-listings-primary)
2. [Search Listings (Legacy)](#2-search-listings-legacy)
3. [Get Property Details (V2)](#3-get-property-details-v2)
4. [Batch Property Details](#4-batch-property-details)
5. [Get Search Suggestions](#5-get-search-suggestions)
6. [Public Listing Statistics](#6-public-listing-statistics)
7. [System Status](#7-system-status)
8. [System Dashboard (HTML)](#8-system-dashboard-html)
9. [Media Delay Settings](#9-media-delay-settings)
10. [Health Check](#10-health-check)
11. [API Documentation Endpoints](#11-api-documentation-endpoints)

---

## 1. Search Listings (Primary)

Comprehensive property search with advanced filtering, sorting, pagination, and text search. This is the **primary search endpoint** used by the frontend.

### Endpoint
```
GET /api/listings/search
```

**Source**: [`listings-search.ts`](../api/src/routes/listings-search.ts)

### Query Parameters

#### Pagination

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `page` | integer | `1` | Current page number (1-indexed) | `2` |
| `items_per_page` | integer or `"all"` | `20` | Results per page (1-10000) or `"all"` for all results (capped at 10000) | `50` |

#### Sorting

| Parameter | Type | Default | Description | Example |
|-----------|------|---------|-------------|---------|
| `sort_by` | string | `list_date` | Sort field. Values: `list_date`, `list_price`, `living_area`, `price_per_sqft`, `status`, `bedrooms_total`, `bathrooms_total` | `list_price` |
| `sort_direction` | string | `desc` | Sort direction: `asc` or `desc` | `asc` |

#### Geographic Filters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `min_latitude` | number | No* | Minimum latitude for bounding box | `30.2` |
| `max_latitude` | number | No* | Maximum latitude for bounding box | `30.4` |
| `min_longitude` | number | No* | Minimum longitude for bounding box | `-97.8` |
| `max_longitude` | number | No* | Maximum longitude for bounding box | `-97.6` |
| `city` | string | No | City name (case-insensitive exact match) | `Austin` |

\* All 4 lat/long parameters are required together for bounding box filtering.

#### Property Characteristics

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `property_type` | string | No | MLS PropertyType (comma-separated). Values: `Residential`, `Residential Lease`, `Land`, `Farm`, `Commercial Sale`, `Commercial Lease`, `Residential Income` | `Residential,Land` |
| `property_sub_type` | string | No | MLS PropertySubType (comma-separated, or `"all"` to skip). Values: `Single Family Residence`, `Condominium`, `Townhouse`, `Unimproved Land`, `Ranch`, `Duplex`, `Office`, etc. | `Single Family Residence,Condominium` |
| `min_price` | integer | No | Minimum list price | `200000` |
| `max_price` | integer | No | Maximum list price | `500000` |
| `min_bedrooms` | integer | No | Minimum bedrooms | `3` |
| `max_bedrooms` | integer | No | Maximum bedrooms | `5` |
| `min_bathrooms` | number | No | Minimum bathrooms (supports 0.5 increments) | `2` |
| `max_bathrooms` | number | No | Maximum bathrooms | `4` |
| `min_sqft` | integer | No | Minimum living area (square feet) | `1500` |
| `max_sqft` | integer | No | Maximum living area | `3000` |
| `min_lot_size` | number | No | Minimum lot size (acres) | `0.25` |
| `max_lot_size` | number | No | Maximum lot size (acres) | `5` |
| `min_year_built` | integer | No | Minimum year built | `2010` |
| `max_year_built` | integer | No | Maximum year built | `2025` |
| `min_price_per_sqft` | number | No | Minimum price per square foot | `100` |
| `max_price_per_sqft` | number | No | Maximum price per square foot | `300` |

#### Amenities & Features

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `pool` | boolean | No | Has private pool | `true` |
| `garage` | boolean | No | Has garage | `true` |
| `min_garage_spaces` | integer | No | Minimum garage spaces | `2` |
| `max_garage_spaces` | integer | No | Maximum garage spaces | `3` |
| `min_parking_spaces` | integer | No | Minimum parking spaces | `2` |
| `max_parking_spaces` | integer | No | Maximum parking spaces | `4` |
| `waterfront` | boolean | No | Waterfront property | `true` |
| `fireplace` | boolean | No | Has fireplace | `true` |
| `new_construction` | boolean | No | New construction | `true` |

#### Status & Timing

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `status` | string | No | Listing status (comma-separated). Values: `active`, `pending`, `sold` | `active,pending` |
| `days_on_market` | integer | No | Maximum days on market | `30` |
| `price_reduction` | string | No | Price reduction timeframe. Values: `any`, `last_day`, `last_3_days`, `last_7_days`, `last_14_days`, `last_30_days`, `over_1_month`, `over_2_months`, `over_3_months` | `last_7_days` |
| `open_house` | string | No | Open house filter. Values: `this_weekend`, `next_weekend`, `all` | `this_weekend` |

#### Text Search

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `keywords` | string | No | Text search across address, city, subdivision, remarks, schools (uses Meilisearch) | `lake travis` |

### Response Format

```json
{
  "data": [
    {
      "listing_key": "ACT123456",
      "standard_status": "Active",
      "list_price": "450000",
      "original_list_price": "475000",
      "bedrooms_total": 3,
      "bathrooms_total": 2,
      "living_area": 2000,
      "price_per_sqft": "225.00",
      "days_on_market": 15,
      "price_reduced": true,
      "price_reduction_amount": 25000,
      "price_reduction_percentage": "5.26",
      "pool_private": false,
      "garage_spaces": 2,
      "parking_total": 2,
      "new_construction": false,
      "property_type": "Residential",
      "property_sub_type": "Single Family Residence",
      "year_built": 2015,
      "lot_size_acres": 0.25,
      "photo_count": 25,
      "primary_photo_url": "https://cdn.example.com/photo.jpg",
      "street_name": "Main St",
      "city": "AUSTIN",
      "state_or_province": "TX",
      "postal_code": "78704",
      "county_or_parish": "Travis",
      "unparsed_address": "123 Main St",
      "latitude": 30.2672,
      "longitude": -97.7431,
      "subdivision_name": "South Congress",
      "elementary_school": "Becker Elementary",
      "high_school_district": "Austin ISD",
      "association_fee": 150,
      "association_fee_frequency": "Monthly",
      "tax_annual_amount": 8500,
      "virtual_tour_url": "https://tour.example.com/tour",
      "waterfront": false,
      "fireplaces_total": 1,
      "list_agent_key": "AGT456",
      "list_office_name": "Realty Office",
      "major_change_type": "Price Decrease",
      "major_change_timestamp": "2024-01-10T10:00:00Z",
      "original_entry_timestamp": "2024-01-01T08:00:00Z",
      "price_change_timestamp": "2024-01-10T10:00:00Z",
      "levels": "Two",
      "open_houses": [
        {
          "start_time": "2024-01-20T14:00:00Z",
          "end_time": "2024-01-20T16:00:00Z"
        }
      ]
    }
  ],
  "metadata": {
    "total_listings_count": 15000,
    "filtered_listings_count": 150,
    "current_page": 1,
    "total_pages": 8,
    "items_per_page": 20,
    "sort_by": "list_date",
    "sort_direction": "desc"
  }
}
```

### Example Requests

**Active homes in Austin with 3+ beds, sorted by price:**
```bash
GET /api/listings/search?city=Austin&status=active&min_bedrooms=3&sort_by=list_price&sort_direction=asc
```

**Map bounding box search:**
```bash
GET /api/listings/search?min_latitude=30.2&max_latitude=30.4&min_longitude=-97.8&max_longitude=-97.6&status=active
```

**Residential properties with pool, price reduced in last 7 days:**
```bash
GET /api/listings/search?property_type=Residential&pool=true&price_reduction=last_7_days
```

**Keyword search with filters:**
```bash
GET /api/listings/search?keywords=lake+travis&min_price=500000&property_type=Residential
```

**Get all results (no pagination):**
```bash
GET /api/listings/search?status=active&city=Austin&items_per_page=all
```

### Error Response

```json
{
  "error": {
    "code": "SEARCH_ERROR",
    "message": "An error occurred while searching listings",
    "details": "Error description"
  }
}
```

---

## 2. Search Listings (Legacy)

Legacy search endpoint using Meilisearch with faceted search. Kept for backward compatibility. **New integrations should use `/api/listings/search` instead.**

### Endpoint
```
GET /listings/search
```

**Source**: [`search.ts`](../api/src/routes/search.ts)

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `bounds` | string | No | Geographic bounding box as `lat1,lon1,lat2,lon2` | `30.2,-97.8,30.3,-97.7` |
| `minPrice` | integer | No | Minimum list price in dollars | `200000` |
| `maxPrice` | integer | No | Maximum list price in dollars | `500000` |
| `beds` | integer | No | Minimum number of bedrooms | `3` |
| `baths` | integer | No | Minimum number of full bathrooms | `2` |
| `status` | string | No | Property status (Active, Pending, Sold, etc.) | `Active` |
| `city` | string | No | City name (auto-uppercased for MLS data) | `Austin` |
| `propertyType` | string | No | Filter by property type (single or comma-separated). Values: `Residential`, `Land`, `Farm`, `Commercial Sale`, `Residential Income`, `Residential Lease`, `Commercial Lease` | `Residential,Land` |
| `features` | string | No | Comma-separated list of features | `Pool,View` |
| `text` | string | No | Full-text search query | `downtown condo` |
| `page` | integer | No | Page number for pagination (default: 1) | `1` |
| `limit` | integer | No | Results per page (default: 20) | `20` |

### Response Format

```json
{
  "total": 150,
  "page": 1,
  "limit": 20,
  "results": [
    {
      "listing_key": "ACT123456",
      "listing_id": "123456",
      "standard_status": "Active",
      "property_type": "Residential",
      "property_sub_type": "Single Family Residence",
      "list_price": 450000,
      "bedrooms_total": 3,
      "bathrooms_full": 2,
      "bathrooms_half": 1,
      "living_area": 2000,
      "year_built": 2015,
      "lot_size_acres": 0.25,
      "latitude": 30.2672,
      "longitude": -97.7431,
      "city": "AUSTIN",
      "state_or_province": "TX",
      "postal_code": "78704",
      "county_or_parish": "Travis",
      "subdivision_name": "South Congress",
      "address_full": "123 Main St",
      "days_on_market": 15,
      "photo_count": 25,
      "primary_photo_url": "https://cdn.example.com/photo.jpg",
      "remarks_public": "Beautiful home in desirable neighborhood...",
      "modification_timestamp": "2024-01-15T10:30:00Z"
    }
  ],
  "facets": {
    "status_counts": {
      "Active": 120,
      "Pending": 20,
      "Sold": 10
    },
    "city_counts": {
      "AUSTIN": 85,
      "ROUND ROCK": 35,
      "PFLUGERVILLE": 30
    },
    "property_type_counts": {
      "Residential": 140,
      "Land": 10
    },
    "beds_counts": {
      "2": 30,
      "3": 60,
      "4": 40,
      "5": 20
    },
    "price_ranges": [
      { "label": "Under $200k", "from": 0, "to": 200000, "count": 0 },
      { "label": "$200k-$400k", "from": 200000, "to": 400000, "count": 0 },
      { "label": "$400k-$600k", "from": 400000, "to": 600000, "count": 0 },
      { "label": "$600k-$800k", "from": 600000, "to": 800000, "count": 0 },
      { "label": "$800k-$1M", "from": 800000, "to": 1000000, "count": 0 },
      { "label": "Over $1M", "from": 1000000, "to": null, "count": 0 }
    ]
  }
}
```

### Example Requests

**Search by location and price:**
```bash
GET /listings/search?bounds=30.2,-97.8,30.3,-97.7&minPrice=300000&maxPrice=600000
```

**Full-text search with filters:**
```bash
GET /listings/search?text=pool&beds=4&minPrice=500000
```

---

## 3. Get Property Details (V2)

Retrieve complete property details in a clean, organized JSON structure with calculated metrics. Supports lookup by `listing_id` (listing key) or by `address` + `city` combination.

### Endpoint
```
GET /api/listings
```

**Source**: [`listing-detail-v2.ts`](../api/src/routes/listing-detail-v2.ts)

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `listing_id` | string | Conditional* | Listing key (e.g., ACT123456) | `ACT209777414` |
| `address` | string | Conditional* | Property address with spaces replaced by hyphens | `508-echo-pass` |
| `city` | string | Conditional* | City name with spaces replaced by hyphens | `liberty-hill` |

\* Must provide either `listing_id` OR both `address` and `city`.

### Response Format

```json
{
  "listing": {
    "ids": {
      "listing_key": "ACT209777414",
      "listing_id": "ACT9743847",
      "mls": "actris"
    },
    "status": {
      "standard_status": "Active",
      "listing_date": "2025-10-27",
      "days_on_market": 14,
      "last_modified": "2025-01-15T10:30:00Z"
    },
    "pricing": {
      "current_price": 530000,
      "original_price": 559990,
      "price_reduction": 29990,
      "price_reduction_percentage": 5.36,
      "price_per_sqft": 205.83,
      "last_price_change": "2025-01-10T10:00:00Z"
    },
    "property_details": {
      "type": "Single Family Residence",
      "category": "Residential",
      "condition": "New Construction",
      "year_built": 2025,
      "builder": "CastleRock Communities"
    },
    "location": {
      "address": "508 Echo Pass",
      "city": "Liberty Hill",
      "state": "TX",
      "zip": "78642",
      "county": "Williamson",
      "subdivision": "Santa Rita Ranch",
      "direction_faces": "East",
      "coordinates": {
        "latitude": 30.65768844,
        "longitude": -97.82743594
      }
    },
    "size": {
      "living_area_sqft": 2575,
      "lot_size_acres": 0.1544,
      "lot_size_sqft": 6726,
      "stories": "Two"
    },
    "rooms": {
      "bedrooms": 4,
      "bedrooms_main_floor": 2,
      "bedrooms_upper_floor": "2",
      "bathrooms_full": 3,
      "bathrooms_half": 0,
      "bathrooms_total": 3,
      "garage_spaces": 2,
      "parking_total": 2
    },
    "room_list": [
      { "type": "Bedroom", "level": "Main" },
      { "type": "Kitchen", "level": "Main" },
      { "type": "Living Room", "level": "Main" }
    ],
    "features": {
      "interior": ["Breakfast Bar", "Ceiling Fan(s)", "Open Floorplan"],
      "exterior": ["Covered Patio", "Rain Gutters"],
      "construction": ["Frame", "HardiPlank Type"],
      "roof": ["Composition"],
      "foundation": ["Slab"],
      "flooring": ["Carpet", "Tile", "Vinyl"],
      "windows": ["Double Pane Windows"],
      "lot": ["Corner Lot", "Sprinklers Automatic"],
      "fencing": ["Privacy", "Wood"],
      "parking": ["Attached", "Garage Door Opener"],
      "security": [],
      "accessibility": [],
      "pool": null,
      "fireplace": false,
      "fireplaces_total": 0,
      "view": ["Neighborhood"],
      "waterfront": false,
      "horse_property": false
    },
    "systems": {
      "cooling": ["Central Air"],
      "heating": ["Central", "Natural Gas"],
      "appliances": ["Dishwasher", "Disposal", "Microwave", "Range Hood"],
      "utilities": ["Electricity Connected", "Natural Gas Connected"],
      "water": "Public",
      "sewer": "Public Sewer",
      "green_features": {
        "sustainability": [],
        "energy_efficient": ["Appliances", "HVAC", "Windows"]
      }
    },
    "financial": {
      "hoa": {
        "required": true,
        "name": "Santa Rita Ranch HOA",
        "fee_monthly": 106,
        "fee_annual": 1272,
        "frequency": "Monthly",
        "includes": ["Common Area Maintenance"]
      },
      "taxes": {
        "year": 2024,
        "annual_amount": 2169.07,
        "monthly_estimate": 180.76,
        "assessed_value": 85000,
        "rate_percentage": null,
        "legal_description": "LOT 1 BLK A SANTA RITA RANCH",
        "parcel_number": "R123456"
      }
    },
    "schools": {
      "district": "Leander ISD",
      "elementary": "Rutledge Elementary",
      "middle": "Running Brushy Middle",
      "high": "Glenn High School"
    },
    "community": {
      "name": "Santa Rita Ranch",
      "amenities": ["Clubhouse", "Pool", "Trails"],
      "website": "https://santaritaranch.com"
    },
    "description": "Beautiful new construction home in Santa Rita Ranch...",
    "directions": "From US 183, head west on CR 175...",
    "disclosures": ["Seller Disclosure"],
    "listing_agent": {
      "name": "Jane Smith",
      "email": "jane@realty.com",
      "phone": "512-555-0100",
      "mls_id": "AGT123",
      "key": "AGT123KEY"
    },
    "listing_office": {
      "name": "Austin Realty Group",
      "phone": "512-555-0200",
      "mls_id": "OFF456",
      "key": "OFF456KEY"
    },
    "media": {
      "photo_count": 30,
      "photos_last_updated": "2025-01-14T15:20:00Z",
      "virtual_tour": "https://tour.example.com/branded",
      "video_tour": "https://video.example.com/tour",
      "listing_url": "https://mls.example.com/listing/123",
      "photos": [
        {
          "order": 0,
          "url": "https://cdn.example.com/actris/ACT209777414/0.jpg",
          "width": 2048,
          "height": 1151
        },
        {
          "order": 1,
          "url": "https://cdn.example.com/actris/ACT209777414/1.jpg",
          "width": 2048,
          "height": 1365
        }
      ]
    },
    "syndication": {
      "display_online": true,
      "allow_comments": true,
      "allow_avm": false,
      "syndicated_to": ["Zillow", "Realtor.com"]
    },
    "open_houses": [
      {
        "date": "2025-01-20",
        "start_time": "14:00:00",
        "end_time": "16:00:00",
        "timezone": "UTC"
      }
    ],
    "calculated_metrics": {
      "price_per_sqft": 205.83,
      "price_per_acre": 3432624.19,
      "hoa_per_sqft_annual": 0.49,
      "taxes_per_sqft_annual": 0.84,
      "estimated_monthly_costs": {
        "hoa": 106,
        "taxes": 180.76,
        "total": 286.76
      }
    }
  }
}
```

### Example Requests

**By listing key:**
```bash
GET /api/listings?listing_id=ACT209777414
```

**By address and city:**
```bash
GET /api/listings?address=508-echo-pass&city=liberty-hill
```

### Error Responses

**400 Bad Request** - Invalid parameters:
```json
{
  "error": "Invalid parameters. Must provide either listing_id or both address and city."
}
```

**404 Not Found** - Listing doesn't exist or is not viewable:
```json
{
  "error": "Listing not found"
}
```

---

## 4. Batch Property Details

Retrieve complete property details for multiple listings in a single request. Returns the same V2 clean structure as the single detail endpoint.

### Endpoint
```
GET /api/listings/batch
```

**Source**: [`listing-detail-v2.ts`](../api/src/routes/listing-detail-v2.ts)

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `ids` | string | Yes | Comma-separated list of listing keys (max 50) | `ACT118922373,ACT118922374,ACT118922375` |

### Response Format

```json
{
  "listings": [
    {
      "ids": { "listing_key": "ACT118922373", "listing_id": "...", "mls": "actris" },
      "status": { "..." : "..." },
      "pricing": { "..." : "..." },
      "...": "Same structure as single listing detail (see Section 3)"
    },
    {
      "ids": { "listing_key": "ACT118922374", "listing_id": "...", "mls": "actris" },
      "...": "..."
    }
  ],
  "found": ["ACT118922373", "ACT118922374"],
  "not_found": ["ACT118922375"]
}
```

### Example Request

```bash
GET /api/listings/batch?ids=ACT118922373,ACT118922374,ACT118922375
```

### Error Responses

**400 Bad Request** - Missing or invalid IDs:
```json
{
  "error": "Invalid parameters. Must provide ids query parameter with comma-separated listing IDs."
}
```

**400 Bad Request** - No valid IDs:
```json
{
  "error": "No valid listing IDs provided."
}
```

**400 Bad Request** - Too many IDs:
```json
{
  "error": "Batch size exceeds maximum of 50 listings."
}
```

---

## 5. Get Search Suggestions

Typeahead/autocomplete suggestions for property search based on address, city, postal code, or listing ID.

### Endpoint
```
GET /suggest
```

**Source**: [`suggest.ts`](../api/src/routes/suggest.ts)

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `q` | string | Yes | Search query for suggestions | `78704` |

### Response Format

```json
{
  "suggestions": [
    {
      "listing_key": "ACT123456",
      "listing_id": "123456",
      "label": "123 Main St, Austin, TX 78704",
      "city": "AUSTIN",
      "state": "TX",
      "postal_code": "78704",
      "location": {
        "lat": 30.2672,
        "lng": -97.7431
      }
    }
  ]
}
```

### Search Fields

The suggestion engine searches across:
- `address_full` - Full property address
- `postal_code` - ZIP code
- `subdivision_name` - Neighborhood/subdivision
- `listing_id` - MLS listing number
- `city` - City name

### Features

- **Typo Tolerance**: Handles misspellings automatically
- **Prefix Search**: Matches partial words (e.g., "aus" matches "Austin")
- **Fast**: Returns results in <50ms
- **Limit**: Returns top 10 matches
- **Filtered**: Only returns viewable listings (`mlg_can_view = true`)

### Example Requests

**Search by ZIP code:**
```bash
GET /suggest?q=78704
```

**Search by address:**
```bash
GET /suggest?q=123+Main
```

**Search by city:**
```bash
GET /suggest?q=Austin
```

### Error Response

**400 Bad Request** - Missing query:
```json
{
  "error": "Query parameter \"q\" is required"
}
```

---

## 6. Public Listing Statistics

Returns aggregate statistics about listings including homes for sale, homes for rent, and new listings in the last 30 days.

### Endpoint
```
GET /api/stats
```

**Source**: [`stats.ts`](../api/src/routes/stats.ts)

### Query Parameters

None.

### Response Format

```json
{
  "homes_for_sale": 1250,
  "homes_for_rent": 340,
  "new_listings_30_days": 425,
  "timestamp": "2025-01-15T10:30:00Z"
}
```

### Field Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `homes_for_sale` | integer | Count of active Residential properties with `mlg_can_view = true` |
| `homes_for_rent` | integer | Count of active Residential Lease properties with `mlg_can_view = true` |
| `new_listings_30_days` | integer | Count of active, viewable listings added in the last 30 days |
| `timestamp` | string | When the stats were generated |

### Example Request

```bash
GET /api/stats
```

---

## 7. System Status

Retrieve comprehensive system status including database stats, sync health, media stats, and search index information.

### Endpoint
```
GET /status
```

**Source**: [`status.ts`](../api/src/routes/status.ts)

### Query Parameters

None.

### Response Format

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z",
  "sync": {
    "health": "healthy",
    "last_sync": "2025-01-15T10:25:00Z",
    "minutes_since_last_sync": 5,
    "sync_interval_minutes": 5,
    "high_water_mark": "2025-01-15T10:20:00Z",
    "originating_system": "ACTRIS"
  },
  "database": {
    "total_properties": 1250,
    "active_properties": 980,
    "pending_properties": 150,
    "closed_properties": 120,
    "viewable_properties": 1200,
    "latest_property_update": "2025-01-15T10:20:00Z",
    "oldest_property_update": "2024-06-01T08:00:00Z",
    "unique_cities": 45,
    "price_stats": {
      "average": 425000.50,
      "max": 2500000.00,
      "min": 150000.00
    }
  },
  "media": {
    "total_media": 15000,
    "total_photos": 14500,
    "downloaded_media": 14800,
    "properties_with_media": 1180,
    "download_percentage": 99
  },
  "search": {
    "index_name": "listings_actris_v1",
    "total_documents": 1200,
    "is_indexing": false,
    "filterable_attributes_configured": true,
    "sortable_attributes_configured": true
  },
  "breakdown": {
    "property_types": [
      {
        "property_type": "Residential",
        "count": "1100"
      },
      {
        "property_type": "Land",
        "count": "100"
      }
    ],
    "top_cities": [
      {
        "city": "AUSTIN",
        "count": 650,
        "avg_price": 485000.00
      },
      {
        "city": "ROUND ROCK",
        "count": 200,
        "avg_price": 375000.00
      }
    ]
  }
}
```

### Health Indicators

**Sync Health:**
- `healthy` - Last sync within 2x the configured interval
- `warning` - Last sync exceeded 2x the configured interval

**Media Download:**
- Percentage of media files successfully downloaded to CDN
- Should be >95% for healthy system

### Example Request

```bash
GET /status
```

---

## 8. System Dashboard (HTML)

Mobile-friendly HTML dashboard showing system status with auto-refresh. Displays sync status, media download progress, property counts, resource sync times, progress history, and rate limit tracking.

### Endpoint
```
GET /status/dashboard
```

**Source**: [`status.ts`](../api/src/routes/status.ts)

### Query Parameters

None.

### Response

Returns an HTML page (Content-Type: `text/html`). The dashboard auto-refreshes every 60 seconds.

### Features

- Sync health status (healthy/warning)
- Media download progress bar with percentage
- Property counts (total, active, pending)
- Resource sync times for all MLS resources
- Progress history table (last 24 hours)
- Rate limit event tracking
- Problematic properties list
- Adjustable media download delay slider (500-5000ms)

### Example Request

```bash
GET /status/dashboard
```

Open in a browser for the best experience.

---

## 9. Media Delay Settings

Get or update the delay between media downloads. Used by the dashboard to control ETL download speed.

### Get Current Delay

```
GET /status/media-delay
```

**Source**: [`status.ts`](../api/src/routes/status.ts)

#### Response Format

```json
{
  "delayMs": 1500,
  "minDelay": 500,
  "maxDelay": 5000
}
```

### Update Delay

```
POST /status/media-delay
```

#### Request Body

```json
{
  "delayMs": 1000
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `delayMs` | integer | Yes | Delay in milliseconds (500-5000) |

#### Response Format

**200 OK:**
```json
{
  "success": true,
  "delayMs": 1000,
  "message": "ETL will pick up this change within 10 seconds"
}
```

**400 Bad Request:**
```json
{
  "error": "Invalid delay value. Must be between 500 and 5000 ms."
}
```

---

## 10. Health Check

Simple health check endpoint for load balancers and monitoring.

### Endpoint
```
GET /health
```

**Source**: [`index.ts`](../api/src/index.ts) (inline)

### Query Parameters

None.

### Response Format

```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00Z"
}
```

---

## 11. API Documentation Endpoints

### Swagger UI

Interactive API documentation with a web-based testing interface.

```
GET /api-docs
```

### Swagger JSON

Raw OpenAPI 3.0 specification in JSON format.

```
GET /api-docs.json
```

---

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Endpoint Summary Table

| # | Method | Path | Description | Source File |
|---|--------|------|-------------|-------------|
| 1 | GET | `/api/listings/search` | Primary property search with advanced filtering | `listings-search.ts` |
| 2 | GET | `/listings/search` | Legacy Meilisearch-based search (backward compat) | `search.ts` |
| 3 | GET | `/api/listings` | Property detail (V2) by listing_id or address+city | `listing-detail-v2.ts` |
| 4 | GET | `/api/listings/batch` | Batch property details (up to 50) | `listing-detail-v2.ts` |
| 5 | GET | `/suggest` | Search suggestions / typeahead | `suggest.ts` |
| 6 | GET | `/api/stats` | Public listing statistics | `stats.ts` |
| 7 | GET | `/status` | System status (JSON) | `status.ts` |
| 8 | GET | `/status/dashboard` | System dashboard (HTML) | `status.ts` |
| 9 | GET | `/status/media-delay` | Get media download delay setting | `status.ts` |
| 10 | POST | `/status/media-delay` | Update media download delay setting | `status.ts` |
| 11 | GET | `/health` | Health check | `index.ts` |
| 12 | GET | `/api-docs` | Swagger UI | `index.ts` |
| 13 | GET | `/api-docs.json` | OpenAPI spec (JSON) | `index.ts` |

---

## Unused Route Files

> **Note**: [`detail.ts`](../api/src/routes/detail.ts) exists in the codebase but is **not registered** in [`index.ts`](../api/src/index.ts). The `GET /listings/{listing_key}` endpoint documented in previous versions of this file does not exist as a live route. It has been superseded by the V2 detail endpoint at `GET /api/listings`.

---

## Rate Limits

The API does not currently enforce rate limits, but please be respectful:
- **Recommended**: Max 10 requests/second
- **Search queries**: Cache results when possible
- **Status endpoint**: Poll no more than once per minute

---

## Best Practices

### Search Performance

1. **Use bounding box for map searches**: Always include lat/long parameters when displaying results on a map
2. **Limit results**: Use reasonable `items_per_page` values (20-50) for better performance
3. **Combine filters**: Use multiple filters together for more precise results
4. **Use keywords sparingly**: Text search hits Meilisearch first, then filters via PostgreSQL

### Property Details

1. **Prefer V2 endpoint**: Use `GET /api/listings` over the legacy detail endpoint
2. **Use address lookup**: For SEO-friendly URLs, use `address` + `city` parameters
3. **Batch when possible**: Use `GET /api/listings/batch` to reduce HTTP requests
4. **Check photo URLs**: Always use the `url` field from the `photos` array (S3/CDN URLs)

### Suggestions

1. **Debounce input**: Wait 300ms after user stops typing before querying
2. **Minimum query length**: Only search when query is 2+ characters
3. **Show location context**: Display city/state with each suggestion

---

## Support

For API issues or questions:
- Check `/status` endpoint for system health
- Review Swagger UI at `/api-docs` for interactive testing
- View the dashboard at `/status/dashboard` for real-time monitoring

---

**Last Updated**: February 2026
**API Version**: 2.0.0