# MLS Listings API - Endpoint Documentation

Complete reference for all API endpoints, query parameters, and response formats.

**Base URL**: `https://mta-api.optimizedevops.com` (Production) or `http://localhost:3000` (Development)

**Interactive Documentation**: Visit `/api-docs` for Swagger UI

---

## Table of Contents

1. [Search Listings](#1-search-listings)
2. [Get Property Details](#2-get-property-details)
3. [Get Search Suggestions](#3-get-search-suggestions)
4. [System Status](#4-system-status)

---

## 1. Search Listings

Search and filter property listings with faceted search, geospatial filtering, and full-text search.

### Endpoint
```
GET /listings/search
```

### Query Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `bounds` | string | No | Geographic bounding box as `lat1,lon1,lat2,lon2` | `30.2,-97.8,30.3,-97.7` |
| `minPrice` | integer | No | Minimum list price in dollars | `200000` |
| `maxPrice` | integer | No | Maximum list price in dollars | `500000` |
| `beds` | integer | No | Minimum number of bedrooms | `3` |
| `baths` | integer | No | Minimum number of full bathrooms | `2` |
| `status` | string | No | Property status (Active, Pending, Sold, etc.) | `Active` |
| `city` | string | No | City name (case-insensitive) | `Austin` |
| `propertyType` | string | No | Filter by property type (single or comma-separated). See [Property Types](#property-types) | `Residential,Land` |
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

**Search active listings with 3+ beds in Austin:**
```bash
GET /listings/search?city=Austin&status=Active&beds=3
```

**Search for residential properties only:**
```bash
GET /listings/search?propertyType=Residential&status=Active
```

**Search for rental properties (residential + commercial leases):**
```bash
GET /listings/search?propertyType=Residential%20Lease,Commercial%20Lease&city=Austin
```

**Search for land:**
```bash
GET /listings/search?propertyType=Land
```

**Full-text search with filters:**
```bash
GET /listings/search?text=pool&beds=4&minPrice=500000
```

**Pagination:**
```bash
GET /listings/search?page=2&limit=50
```

---

## 2. Get Property Details

Retrieve complete details for a specific property including media, rooms, unit types, and open houses.

### Endpoint
```
GET /listings/{listing_key}
```

### Path Parameters

| Parameter | Type | Required | Description | Example |
|-----------|------|----------|-------------|---------|
| `listing_key` | string | Yes | Unique listing key from MLS | `ACT118922373` |

### Response Format

```json
{
  "property": {
    "listing_key": "ACT123456",
    "listing_id": "123456",
    "originating_system_name": "ACTRIS",
    "standard_status": "Active",
    "property_type": "Residential",
    "property_sub_type": "Single Family Residence",
    "mlg_can_view": true,
    "mlg_can_use": ["IDX", "VOW"],
    "modification_timestamp": "2024-01-15T10:30:00Z",
    "photos_change_timestamp": "2024-01-14T15:20:00Z",
    "list_price": 450000,
    "close_price": null,
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
    "address_full": "123 Main St, Austin, TX 78704",
    "days_on_market": 15,
    "remarks_public": "Beautiful home in desirable neighborhood with modern updates...",
    "virtual_tour_url_branded": "https://tour.example.com/branded",
    "virtual_tour_url_unbranded": "https://tour.example.com/unbranded",
    "primary_photo_url": "https://cdn.example.com/photo.jpg",
    "photo_count": 25,
    "listing_office_mui": "OFF123",
    "listing_agent_mui": "AGT456",
    "created_at": "2024-01-10T08:00:00Z",
    "updated_at": "2024-01-15T10:30:00Z"
  },
  "media": [
    {
      "media_key": "MED123",
      "media_category": "Photo",
      "order_sequence": 1,
      "local_url": "https://cdn.example.com/actris/ACT123456/1.jpg",
      "media_url": "https://mlsgrid.com/original/photo.jpg",
      "caption": "Front exterior",
      "width": 1920,
      "height": 1080
    }
  ],
  "rooms": [
    {
      "room_type": "Master Bedroom",
      "room_level": "Main",
      "room_length": 15.5,
      "room_width": 12.0
    }
  ],
  "unit_types": [
    {
      "bedrooms": 2,
      "bathrooms": 1.5,
      "rent_min": 1500,
      "rent_max": 1800
    }
  ],
  "open_houses": [
    {
      "start_time": "2024-01-20T14:00:00Z",
      "end_time": "2024-01-20T16:00:00Z",
      "remarks": "Open house this Saturday!"
    }
  ]
}
```

### Example Request

```bash
GET /listings/ACT118922373
```

### Error Responses

**404 Not Found** - Listing doesn't exist or is not viewable:
```json
{
  "error": "Listing not found"
}
```

---

## 3. Get Search Suggestions

Typeahead/autocomplete suggestions for property search based on address, city, postal code, or listing ID.

### Endpoint
```
GET /suggest
```

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

**Search by listing ID:**
```bash
GET /suggest?q=123456
```

---

## 4. System Status

Retrieve comprehensive system status including database stats, sync health, media stats, and search index information.

### Endpoint
```
GET /status
```

### Response Format

```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00Z",
  "sync": {
    "health": "healthy",
    "last_sync": "2024-01-15T10:25:00Z",
    "minutes_since_last_sync": 5,
    "sync_interval_minutes": 5,
    "high_water_mark": "2024-01-15T10:20:00Z",
    "originating_system": "ACTRIS"
  },
  "database": {
    "total_properties": 1250,
    "active_properties": 980,
    "pending_properties": 150,
    "closed_properties": 120,
    "viewable_properties": 1200,
    "latest_property_update": "2024-01-15T10:20:00Z",
    "oldest_property_update": "2023-06-01T08:00:00Z",
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

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid parameters |
| 404 | Not Found - Resource doesn't exist |
| 500 | Internal Server Error |

---

## Property Fields Reference

### Core Fields

| Field | Type | Description |
|-------|------|-------------|
| `listing_key` | string | Unique MLS listing identifier |
| `listing_id` | string | Human-readable listing number |
| `standard_status` | string | Active, Pending, Closed, Expired, etc. |
| `property_type` | string | Residential, Land, Commercial, etc. |
| `property_sub_type` | string | Single Family, Condo, Townhouse, etc. |

### Pricing

| Field | Type | Description |
|-------|------|-------------|
| `list_price` | number | Current listing price |
| `close_price` | number | Final sale price (if sold) |

### Physical Characteristics

| Field | Type | Description |
|-------|------|-------------|
| `bedrooms_total` | integer | Total number of bedrooms |
| `bathrooms_full` | integer | Number of full bathrooms |
| `bathrooms_half` | integer | Number of half bathrooms |
| `living_area` | integer | Square footage of living space |
| `year_built` | integer | Year property was built |
| `lot_size_acres` | number | Lot size in acres |

### Location

| Field | Type | Description |
|-------|------|-------------|
| `latitude` | number | Geographic latitude |
| `longitude` | number | Geographic longitude |
| `address_full` | string | Complete street address |
| `city` | string | City name (uppercase) |
| `state_or_province` | string | State abbreviation |
| `postal_code` | string | ZIP code |
| `county_or_parish` | string | County name |
| `subdivision_name` | string | Neighborhood/subdivision |

### Media

| Field | Type | Description |
|-------|------|-------------|
| `photo_count` | integer | Number of photos available |
| `primary_photo_url` | string | URL to main listing photo |
| `virtual_tour_url_branded` | string | Branded virtual tour link |
| `virtual_tour_url_unbranded` | string | Unbranded virtual tour link |

### Metadata

| Field | Type | Description |
|-------|------|-------------|
| `days_on_market` | integer | Days since listing became active |
| `modification_timestamp` | datetime | Last update timestamp |
| `photos_change_timestamp` | datetime | Last photo update timestamp |
| `mlg_can_view` | boolean | Whether listing can be displayed |
| `mlg_can_use` | array | Allowed use cases (IDX, VOW, etc.) |

### Descriptions

| Field | Type | Description |
|-------|------|-------------|
| `remarks_public` | text | Public listing description |

### Agent/Office

| Field | Type | Description |
|-------|------|-------------|
| `listing_office_mui` | string | Listing office identifier |
| `listing_agent_mui` | string | Listing agent identifier |

---

## Rate Limits

The API does not currently enforce rate limits, but please be respectful:
- **Recommended**: Max 10 requests/second
- **Search queries**: Cache results when possible
- **Status endpoint**: Poll no more than once per minute

---

## Best Practices

### Search Performance

1. **Use bounds for map searches**: Always include `bounds` parameter when displaying results on a map
2. **Limit results**: Use reasonable `limit` values (20-50) for better performance
3. **Cache facets**: Facet distributions change slowly, cache for 5-10 minutes
4. **Combine filters**: Use multiple filters together for more precise results

### Property Details

1. **Use local_url for media**: Always prefer `local_url` over `media_url` for images
2. **Check mlg_can_view**: Only display properties where `mlg_can_view = true`
3. **Respect mlg_can_use**: Honor the allowed use cases (IDX, VOW, etc.)

### Suggestions

1. **Debounce input**: Wait 300ms after user stops typing before querying
2. **Minimum query length**: Only search when query is 2+ characters
3. **Show location context**: Display city/state with each suggestion

---

## Support

For API issues or questions:
- Check `/status` endpoint for system health
- Review Swagger UI at `/api-docs` for interactive testing
- Contact: [Your support contact]

---

**Last Updated**: January 2024
**API Version**: 1.0.0