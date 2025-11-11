# Listing Detail API v2 - Documentation

## Overview

The new `/api/listings/{listing_key}` endpoint provides property details in a clean, organized JSON structure with calculated metrics and properly transformed data. This is a complete redesign of the original `/listings/{listing_key}` endpoint.

## Endpoint

```
GET /api/listings/{listing_key}
```

**Example:**
```bash
curl "http://localhost:3000/api/listings/ACT209777414"
```

---

## Key Improvements Over v1

| Feature | v1 (`/listings/{listing_key}`) | v2 (`/api/listings/{listing_key}`) |
|---------|-------------------------------|-----------------------------------|
| **Structure** | Flat with raw JSONB dump | Hierarchical, organized sections |
| **Calculated Fields** | None | Price/sqft, days on market, monthly costs, etc. |
| **Data Organization** | Mixed raw and processed | Clean, consistent structure |
| **Arrays** | Raw database arrays | Filtered, transformed, categorized |
| **Features** | Not exposed | Categorized (interior, exterior, construction, etc.) |
| **Media** | Simple array | Organized with dimensions and order |
| **Open Houses** | ISO timestamps | Separated date/time components |
| **Financial** | Scattered fields | Organized HOA and tax sections |

---

## Response Structure

The response follows the structure defined in [`property-details-field-mapping.md`](property-details-field-mapping.md).

### Top-Level Structure

```json
{
  "listing": {
    "ids": { ... },
    "status": { ... },
    "pricing": { ... },
    "property_details": { ... },
    "location": { ... },
    "size": { ... },
    "rooms": { ... },
    "room_list": [ ... ],
    "features": { ... },
    "systems": { ... },
    "financial": { ... },
    "schools": { ... },
    "community": { ... },
    "description": "...",
    "directions": "...",
    "disclosures": [ ... ],
    "listing_agent": { ... },
    "listing_office": { ... },
    "media": { ... },
    "syndication": { ... },
    "open_houses": [ ... ],
    "calculated_metrics": { ... }
  }
}
```

---

## Detailed Sections

### 1. IDs

```json
{
  "ids": {
    "listing_key": "ACT209777414",
    "listing_id": "ACT9743847",
    "mls": "actris"
  }
}
```

### 2. Status

```json
{
  "status": {
    "standard_status": "Active",
    "listing_date": "2025-10-27",
    "days_on_market": 14,
    "last_modified": "2025-11-08T23:04:12.962Z"
  }
}
```

**Calculated:**
- `days_on_market`: Automatically calculated from `listing_date` to current date

### 3. Pricing

```json
{
  "pricing": {
    "current_price": 530000,
    "original_price": 559990,
    "price_reduction": 29990,
    "price_reduction_percentage": 5.36,
    "price_per_sqft": 205.83,
    "last_price_change": "2025-11-03T17:26:57.000Z"
  }
}
```

**Calculated:**
- `price_reduction`: `original_price - current_price`
- `price_reduction_percentage`: `(price_reduction / original_price) * 100`
- `price_per_sqft`: `current_price / living_area_sqft`

### 4. Property Details

```json
{
  "property_details": {
    "type": "Single Family Residence",
    "category": "Residential",
    "condition": "New Construction",
    "year_built": 2025,
    "builder": "CastleRock Communities"
  }
}
```

### 5. Location

```json
{
  "location": {
    "address": "508  Echo Pass",
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
  }
}
```

### 6. Size

```json
{
  "size": {
    "living_area_sqft": 2575,
    "lot_size_acres": 0.1544,
    "lot_size_sqft": 6726,
    "stories": "Two"
  }
}
```

### 7. Rooms

```json
{
  "rooms": {
    "bedrooms": 4,
    "bedrooms_main_floor": 2,
    "bedrooms_upper_floor": "2",
    "bathrooms_full": 3,
    "bathrooms_half": 0,
    "bathrooms_total": 3,
    "garage_spaces": 2,
    "parking_total": 2
  }
}
```

### 8. Room List

```json
{
  "room_list": [
    {
      "type": "Bedroom",
      "level": "Main"
    },
    {
      "type": "Primary Bedroom",
      "level": "Main"
    }
  ]
}
```

**Transformation:**
- Excludes `RoomKey` from raw data
- Only includes `type` and `level`

### 9. Features

```json
{
  "features": {
    "interior": [
      "Ceiling Fan(s)",
      "Kitchen Island",
      "Open Floorplan",
      "Walk-In Closet(s)"
    ],
    "exterior": [
      "Rain Gutters",
      "Patio",
      "Rear Porch"
    ],
    "construction": [
      "Brick",
      "Cedar",
      "Stone"
    ],
    "roof": ["Shingle"],
    "foundation": ["Slab"],
    "flooring": ["Carpet", "Laminate", "Tile"],
    "windows": ["ENERGY STAR Qualified Windows"],
    "lot": [],
    "fencing": ["Back Yard", "Full", "Wood"],
    "parking": ["Driveway", "Garage Faces Front"],
    "security": ["Smoke Detector(s)"],
    "accessibility": ["None"],
    "pool": "None",
    "fireplace": false,
    "fireplaces_total": 0,
    "view": ["None"],
    "waterfront": false,
    "horse_property": false
  }
}
```

**Transformations:**
- `exterior`: Combines `ExteriorFeatures` + `PatioAndPorchFeatures`
- `flooring`: Filters out "See Remarks"
- `fireplace`: Boolean calculated from `fireplaces_total > 0`

### 10. Systems

```json
{
  "systems": {
    "cooling": ["Central Air"],
    "heating": ["Central", "Natural Gas"],
    "appliances": [
      "Built-In Gas Oven",
      "Dishwasher",
      "Gas Cooktop",
      "Microwave",
      "Range Hood"
    ],
    "utilities": [],
    "water": "Public",
    "sewer": "Public Sewer",
    "green_features": {
      "sustainability": ["None"],
      "energy_efficient": ["Appliances", "Construction", "Materials"]
    }
  }
}
```

**Transformations:**
- `appliances`: Converts "RNGHD" → "Range Hood"

### 11. Financial

```json
{
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
      "rate_percentage": "2.55",
      "legal_description": "S13273 - SANTA RITA RANCH PH 5 SEC 3C, BLOCK H, LOT 17",
      "parcel_number": "154633053C000H0017"
    }
  }
}
```

**Calculated:**
- `hoa.fee_annual`: `fee_monthly * 12`
- `taxes.monthly_estimate`: `annual_amount / 12`

### 12. Schools

```json
{
  "schools": {
    "district": "Liberty Hill ISD",
    "elementary": "Tierra Rosa",
    "middle": "Santa Rita Middle",
    "high": "Legacy Ranch"
  }
}
```

### 13. Community

```json
{
  "community": {
    "name": "Santa Rita Ranch",
    "amenities": [],
    "website": "https://www.c-rock.com/community-detail/Santa-Rita-Ranch-67715"
  }
}
```

### 14. Description & Directions

```json
{
  "description": "The well-designed Yuma plan includes four bedrooms...",
  "directions": "From Austin, take Highway 183...",
  "disclosures": ["MUD"]
}
```

### 15. Listing Agent

```json
{
  "listing_agent": {
    "name": "Ashley Yoder",
    "email": "newhome@c-rock.com",
    "phone": "(832) 582-0030",
    "mls_id": "ACT4749630",
    "key": "ACT201903162"
  }
}
```

### 16. Listing Office

```json
{
  "listing_office": {
    "name": "CastleRock Realty, LLC",
    "phone": "(832) 582-0030",
    "mls_id": "ACT704051",
    "key": "ACT115784292"
  }
}
```

### 17. Media

```json
{
  "media": {
    "photo_count": 30,
    "photos_last_updated": "2025-10-27T19:13:09.689Z",
    "virtual_tour": "https://discover.matterport.com/space/mJ8gmS4wvQt",
    "video_tour": "https://www.youtube.com/watch?v=Ji9QIL7VBXE",
    "listing_url": "https://www.c-rock.com/homes-detail/508-echo-pass",
    "photos": [
      {
        "order": 0,
        "url": "https://cdn.example.com/production/actris/ACT209777414/0.jpg",
        "width": 2048,
        "height": 1151
      }
    ]
  }
}
```

**Features:**
- Uses `local_url` (CDN) if available, falls back to `media_url`
- Only includes photos (filters out videos)
- Sorted by `order_sequence`

### 18. Syndication

```json
{
  "syndication": {
    "display_online": true,
    "allow_comments": false,
    "allow_avm": false,
    "syndicated_to": [
      "AustinHomeSearch.com",
      "Apartments.com Network",
      "HAR.com LH",
      "ListHub",
      "Realtor.com"
    ]
  }
}
```

### 19. Open Houses

```json
{
  "open_houses": [
    {
      "date": "2025-11-15",
      "start_time": "18:00:00",
      "end_time": "20:00:00",
      "timezone": "UTC"
    }
  ]
}
```

**Transformations:**
- Splits ISO timestamp into separate `date` and `time` components
- Only includes future open houses (`end_time > NOW()`)

### 20. Calculated Metrics

```json
{
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
```

**All Calculated:**
- `price_per_sqft`: `current_price / living_area_sqft`
- `price_per_acre`: `current_price / lot_size_acres`
- `hoa_per_sqft_annual`: `(hoa_fee_monthly * 12) / living_area_sqft`
- `taxes_per_sqft_annual`: `taxes_annual / living_area_sqft`
- `estimated_monthly_costs.total`: `hoa + taxes`

---

## Data Transformations

### Array Filtering

The endpoint automatically filters out placeholder values:
- Removes "See Remarks" from flooring arrays
- Filters null/empty values from all arrays

### Code Expansions

- `RNGHD` → `Range Hood`

### Boolean Conversions

- String "0"/"1" → `false`/`true`
- Null → `false` for boolean fields

### Date/Time Splitting

ISO timestamps like `"2025-11-15T18:00:00.000Z"` are split into:
- `date`: `"2025-11-15"`
- `start_time`: `"18:00:00"`
- `timezone`: `"UTC"`

---

## Error Responses

### 404 - Not Found

```json
{
  "error": "Listing not found"
}
```

**Causes:**
- Invalid `listing_key`
- Listing has `mlg_can_view = false`

### 500 - Server Error

```json
{
  "error": "Failed to fetch listing details"
}
```

---

## Implementation Details

### File Location

[`api/src/routes/listing-detail-v2.ts`](api/src/routes/listing-detail-v2.ts)

### Database Queries

The endpoint performs 4 database queries:
1. **Properties**: Main listing data from `mls.properties`
2. **Media**: Photos/videos from `mls.media`
3. **Rooms**: Room details from `mls.rooms`
4. **Open Houses**: Future open houses from `mls.open_houses`

### Performance Considerations

- All queries use indexed fields
- Media query sorted by `order_sequence` (indexed)
- Open houses filtered by `end_time > NOW()` (indexed)
- Single transformation pass after data retrieval

---

## Migration from v1

### Old Endpoint (v1)
```bash
GET /listings/ACT209777414
```

**Response:**
```json
{
  "property": { /* raw database fields */ },
  "media": [ /* array */ ],
  "rooms": [ /* array */ ],
  "unit_types": [ /* array */ ],
  "open_houses": [ /* array */ ]
}
```

### New Endpoint (v2)
```bash
GET /api/listings/ACT209777414
```

**Response:**
```json
{
  "listing": {
    "ids": { /* organized */ },
    "status": { /* organized */ },
    "pricing": { /* with calculations */ },
    /* ... 17 more organized sections ... */
  }
}
```

### Key Mapping Changes

| v1 Field | v2 Location |
|----------|-------------|
| `property.listing_key` | `listing.ids.listing_key` |
| `property.list_price` | `listing.pricing.current_price` |
| `property.bedrooms_total` | `listing.rooms.bedrooms` |
| `property.raw.InteriorFeatures` | `listing.features.interior` |
| `media[]` | `listing.media.photos[]` |
| `rooms[]` | `listing.room_list[]` |

---

## Testing

### Test with curl

```bash
# Get listing details
curl "http://localhost:3000/api/listings/ACT209777414" | jq

# Check specific sections
curl "http://localhost:3000/api/listings/ACT209777414" | jq '.listing.pricing'
curl "http://localhost:3000/api/listings/ACT209777414" | jq '.listing.calculated_metrics'
curl "http://localhost:3000/api/listings/ACT209777414" | jq '.listing.features'
```

### Test with TypeScript

```typescript
interface ListingDetailResponse {
  listing: {
    ids: { listing_key: string; listing_id: string; mls: string };
    pricing: { current_price: number; price_per_sqft: number | null };
    // ... other sections
  };
}

const response = await fetch('http://localhost:3000/api/listings/ACT209777414');
const data: ListingDetailResponse = await response.json();

console.log(data.listing.pricing.current_price);
console.log(data.listing.calculated_metrics.price_per_sqft);
```

---

## Backward Compatibility

The old v1 endpoint remains available at `/listings/{listing_key}` for backward compatibility. Both endpoints can run simultaneously:

- **v1 (Legacy)**: `GET /listings/{listing_key}` - Raw structure
- **v2 (New)**: `GET /api/listings/{listing_key}` - Clean structure

---

## Future Enhancements

Potential improvements for future versions:

1. **Caching**: Add Redis caching for frequently accessed listings
2. **Field Selection**: Allow clients to request specific sections only
3. **Image Optimization**: Add query parameters for image sizes
4. **Localization**: Support for multiple languages
5. **Historical Data**: Include price history and status changes
6. **Nearby Listings**: Add similar/nearby properties

---

## Support

For issues or questions:
1. Check the field mapping: [`property-details-field-mapping.md`](property-details-field-mapping.md)
2. Review the implementation: [`api/src/routes/listing-detail-v2.ts`](api/src/routes/listing-detail-v2.ts)
3. Test with the Swagger UI: `http://localhost:3000/api-docs`