# Real Estate Search Endpoint Specification

## Overview
This endpoint provides a comprehensive search interface for browsing real estate listings with filtering, sorting, and pagination capabilities.

---

## Endpoint

```
GET /api/listings/search
```

---

## Response Structure

### Success Response (200 OK)

```json
{
  "data": [
    {
      "listing_key": "ACT210646980",
      "standard_status": "Active",
      "bathrooms_total": 3,
      "bedrooms_total": 3,
      "original_list_price": 650000,
      "list_price": 650000,
      "price_change_timestamp": null,
      "list_agent_key": "ACT115173416",
      "list_office_name": "Epique Realty LLC",
      "major_change_type": "New Listing",
      "major_change_timestamp": "2025-10-31T16:47:10.000Z",
      "new_construction": false,
      "original_entry_timestamp": "2025-10-31T16:47:10.000Z",
      "pool_private": false,
      "living_area": 2443,
      "lot_size_acres": 0.206,
      "property_type": "Residential",
      "property_sub_type": "Single Family Residence",
      "year_built": 2017,
      "levels": ["Three Or More"],
      "garage_spaces": 2,
      "parking_total": 2,
      "elementary_school": "Lake Travis",
      "high_school_district": "Lake Travis ISD",
      "subdivision_name": "Apache Shores Sec 02",
      "photos_count": 32,
      "primary_photo_url": "https://media.mlsgrid.com/token=.../84757e1b-204e-4b0c-ae69-7061f53d8c05.jpeg",
      "street_name": "Rain Water",
      "city": "Austin",
      "state_or_province": "TX",
      "postal_code": "78734",
      "county_or_parish": "Travis",
      "unparsed_address": "2302  Rain Water Dr",
      "latitude": 30.37677339,
      "longitude": -97.92382296,
      "open_houses": [
        {
          "start_time": "2025-11-09T18:00:00.000Z",
          "end_time": "2025-11-09T21:00:00.000Z"
        }
      ],
      "price_per_sqft": 266.11,
      "price_reduced": false,
      "price_reduction_amount": 0,
      "price_reduction_percentage": 0,
      "days_on_market": 9,
      "association_fee": 35,
      "association_fee_frequency": "Monthly",
      "tax_annual_amount": 9386.71,
      "virtual_tour_url": "https://book.boulevardrealestatemedia.com/sites/xxnajkg/unbranded",
      "waterfront": false,
      "fireplaces_total": 0
    }
  ],
  "metadata": {
    "total_listings_count": 15420,
    "filtered_listings_count": 847,
    "current_page": 1,
    "total_pages": 43,
    "items_per_page": 20,
    "sort_by": "list_price",
    "sort_direction": "desc"
  }
}
```

---

## Query Parameters

### Pagination

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `page` | integer | No | 1 | Current page number (1-indexed) |
| `items_per_page` | integer | No | 20 | Number of results per page (1-100) |

**Example:**
```
GET /api/listings/search?page=2&items_per_page=50
```

---

### Sorting

| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| `sort_by` | string | No | `original_entry_timestamp` | Field to sort by |
| `sort_direction` | string | No | `desc` | Sort direction: `asc` or `desc` |

**Valid `sort_by` values:**

| Value | Description | Maps to Field |
|-------|-------------|---------------|
| `list_date` | Original listing date | `OriginalEntryTimestamp` |
| `list_price` | Current price | `ListPrice` |
| `living_area` | Square footage | `LivingArea` |
| `price_per_sqft` | Price per square foot | Calculated: `ListPrice / LivingArea` |
| `status` | Listing status | `StandardStatus` (order: Active > Pending > Sold) |
| `bedrooms_total` | Number of bedrooms | `BedroomsTotal` |
| `bathrooms_total` | Number of bathrooms | `BathroomsTotalInteger` |

**Example:**
```
GET /api/listings/search?sort_by=list_price&sort_direction=asc
```

---

### Filters

#### **Geographic**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `min_latitude` | float | No* | Minimum latitude for bounding box |
| `max_latitude` | float | No* | Maximum latitude for bounding box |
| `min_longitude` | float | No* | Minimum longitude for bounding box |
| `max_longitude` | float | No* | Maximum longitude for bounding box |

*All four lat/long parameters must be provided together

**Example:**
```
GET /api/listings/search?min_latitude=30.2&max_latitude=30.5&min_longitude=-98.0&max_longitude=-97.7
```

**Data Mapping:**
- Uses `Latitude` and `Longitude` fields
- May use `geog` PostGIS field for efficient spatial queries

---

#### **Property Characteristics**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `property_type` | string[] | No | Property types (comma-separated) |
| `min_price` | integer | No | Minimum list price |
| `max_price` | integer | No | Maximum list price |
| `min_bedrooms` | integer | No | Minimum bedrooms |
| `max_bedrooms` | integer | No | Maximum bedrooms |
| `min_bathrooms` | float | No | Minimum bathrooms (supports 0.5 increments) |
| `max_bathrooms` | float | No | Maximum bathrooms |
| `min_sqft` | integer | No | Minimum living area (square feet) |
| `max_sqft` | integer | No | Maximum living area |
| `min_lot_size` | float | No | Minimum lot size (acres) |
| `max_lot_size` | float | No | Maximum lot size (acres) |
| `min_year_built` | integer | No | Minimum year built |
| `max_year_built` | integer | No | Maximum year built |
| `min_stories` | integer | No | Minimum number of stories |
| `max_stories` | integer | No | Maximum number of stories |
| `min_price_per_sqft` | float | No | Minimum price per square foot |
| `max_price_per_sqft` | float | No | Maximum price per square foot |

**Property Type Values & Mapping:**

| Filter Value | Maps to `PropertySubType` |
|-------------|---------------------------|
| `home` | "Single Family Residence", "Residential" |
| `condo` | "Condominium", "Condo" |
| `townhouse` | "Townhouse", "Townhome" |
| `lot` | "Lots/Land", "Land", "Residential Lots/Land" |
| `farm_ranch` | "Farm", "Ranch", "Farm/Ranch" |
| `multi_family` | "Multi-Family", "Duplex", "Triplex", "Fourplex" |
| `commercial` | "Commercial" |

**Example:**
```
GET /api/listings/search?property_type=home,condo&min_price=500000&max_price=800000&min_bedrooms=3&min_bathrooms=2
```

**Data Mapping:**
- `min_price` / `max_price` → `ListPrice`
- `min_bedrooms` / `max_bedrooms` → `BedroomsTotal`
- `min_bathrooms` / `max_bathrooms` → `BathroomsTotalInteger`
- `min_sqft` / `max_sqft` → `LivingArea`
- `min_lot_size` / `max_lot_size` → `LotSizeAcres`
- `min_year_built` / `max_year_built` → `YearBuilt`
- `min_stories` / `max_stories` → `Levels` (parse array to extract number)
- `min_price_per_sqft` / `max_price_per_sqft` → Calculated: `ListPrice / LivingArea`

---

#### **Amenities & Features**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `pool` | boolean | No | Has private pool |
| `garage` | boolean | No | Has garage |
| `min_garage_spaces` | integer | No | Minimum garage spaces |
| `max_garage_spaces` | integer | No | Maximum garage spaces |
| `min_parking_spaces` | integer | No | Minimum total parking spaces |
| `max_parking_spaces` | integer | No | Maximum total parking spaces |
| `waterfront` | boolean | No | Waterfront property |
| `fireplace` | boolean | No | Has fireplace |
| `new_construction` | boolean | No | New construction |

**Example:**
```
GET /api/listings/search?pool=true&garage=true&min_garage_spaces=2&waterfront=true
```

**Data Mapping:**
- `pool` → `PoolPrivateYN`
- `garage` → `GarageSpaces > 0`
- `min_garage_spaces` / `max_garage_spaces` → `GarageSpaces`
- `min_parking_spaces` / `max_parking_spaces` → `ParkingTotal`
- `waterfront` → `WaterfrontYN`
- `fireplace` → `FireplacesTotal > 0`
- `new_construction` → `NewConstructionYN`

---

#### **Status & Timing**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `status` | string[] | No | Listing status (comma-separated) |
| `days_on_market` | integer | No | Maximum days on market |
| `price_reduction` | string | No | Price reduction timeframe |
| `open_house` | string | No | Open house filter |

**Status Values:**

| Value | Maps to |
|-------|---------|
| `active` | `StandardStatus` = "Active" |
| `pending` | `StandardStatus` = "Pending" |
| `sold` | `StandardStatus` = "Closed" or "Sold" |

**Price Reduction Values:**

| Value | Description | Logic |
|-------|-------------|-------|
| `any` | Any price reduction | `OriginalListPrice > ListPrice` |
| `last_day` | Reduced in last 24 hours | + `MajorChangeType` = "Price Change" AND `MajorChangeTimestamp` within 1 day |
| `last_3_days` | Reduced in last 3 days | + within 3 days |
| `last_7_days` | Reduced in last 7 days | + within 7 days |
| `last_14_days` | Reduced in last 14 days | + within 14 days |
| `last_30_days` | Reduced in last 30 days | + within 30 days |
| `over_1_month` | Reduced over 1 month ago | + older than 30 days |
| `over_2_months` | Reduced over 2 months ago | + older than 60 days |
| `over_3_months` | Reduced over 3 months ago | + older than 90 days |

**Open House Values:**

| Value | Description | Logic |
|-------|-------------|-------|
| `this_weekend` | Open house this Sat-Sun | `open_houses` array has entry with `start_time` falling on current weekend |
| `next_weekend` | Open house next Sat-Sun | `open_houses` array has entry with `start_time` falling on next weekend |
| `all` | Any future open house | `open_houses` array has entry with `start_time` >= current time |

**Example:**
```
GET /api/listings/search?status=active,pending&days_on_market=30&price_reduction=last_7_days&open_house=this_weekend
```

**Data Mapping:**
- `status` → `StandardStatus`
- `days_on_market` → Calculated: `current_date - OriginalEntryTimestamp`
- `price_reduction` → Uses `OriginalListPrice`, `ListPrice`, `MajorChangeType`, `MajorChangeTimestamp`
- `open_house` → Uses `open_houses` array from raw data

**⚠️ Price Reduction Filter Caveat:**
Time-based price reduction filters only work reliably when:
1. `MajorChangeType` = "Price Change", OR
2. `PriceChangeTimestamp` field exists in the data

If the most recent major change was something else (e.g., "Modification"), time-based filters may not accurately reflect when the price was reduced.

---

#### **Search**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `keywords` | string | No | Text search across multiple fields |

**Fields Searched:**
- `UnparsedAddress`
- `City`
- `SubdivisionName`
- `PublicRemarks`
- `ElementarySchool`
- `HighSchoolDistrict`
- `PostalCode`

**Example:**
```
GET /api/listings/search?keywords=lake+travis
```

---

## Field Mapping Reference

### Returned Fields → Source Data

| Response Field | Source Field(s) | Type | Calculated | Notes |
|----------------|-----------------|------|-----------|-------|
| `listing_key` | `ListingKey` | string | No | Unique identifier |
| `standard_status` | `StandardStatus` | string | No | Normalized status |
| `bathrooms_total` | `BathroomsTotalInteger` | integer | No | |
| `bedrooms_total` | `BedroomsTotal` | integer | No | |
| `original_list_price` | `OriginalListPrice` | float | No | |
| `list_price` | `ListPrice` | float | No | |
| `price_change_timestamp` | `PriceChangeTimestamp` | datetime | No | May be null |
| `list_agent_key` | `ListAgentKey` | string | No | |
| `list_office_name` | `ListOfficeName` | string | No | |
| `major_change_type` | `MajorChangeType` | string | No | e.g., "New Listing", "Price Change" |
| `major_change_timestamp` | `MajorChangeTimestamp` | datetime | No | |
| `new_construction` | `NewConstructionYN` | boolean | No | |
| `original_entry_timestamp` | `OriginalEntryTimestamp` | datetime | No | Original listing date |
| `pool_private` | `PoolPrivateYN` | boolean | No | |
| `living_area` | `LivingArea` | integer | No | Square feet |
| `lot_size_acres` | `LotSizeAcres` | float | No | |
| `property_type` | `PropertyType` | string | No | e.g., "Residential" |
| `property_sub_type` | `PropertySubType` | string | No | e.g., "Single Family Residence" |
| `year_built` | `YearBuilt` | integer | No | |
| `levels` | `Levels` | array | No | e.g., ["Three Or More"] |
| `garage_spaces` | `GarageSpaces` | integer | No | |
| `parking_total` | `ParkingTotal` | integer | No | |
| `elementary_school` | `ElementarySchool` | string | No | |
| `high_school_district` | `HighSchoolDistrict` | string | No | |
| `subdivision_name` | `SubdivisionName` | string | No | |
| `photos_count` | `PhotosCount` | integer | No | |
| `primary_photo_url` | `primary_photo_url` or `Media[0].MediaURL` | string | Partial | Uses first media URL if primary is null |
| `street_name` | `StreetName` | string | No | |
| `city` | `City` | string | No | |
| `state_or_province` | `StateOrProvince` | string | No | |
| `postal_code` | `PostalCode` | string | No | |
| `county_or_parish` | `CountyOrParish` | string | No | |
| `unparsed_address` | `UnparsedAddress` | string | No | Full address string |
| `latitude` | `Latitude` | float | No | |
| `longitude` | `Longitude` | float | No | |
| `open_houses` | `open_houses` array | array | Partial | Filtered/deduplicated from raw data |
| `open_houses[].start_time` | `open_houses[].start_time` | datetime | No | |
| `open_houses[].end_time` | `open_houses[].end_time` | datetime | No | |
| `price_per_sqft` | - | float | **Yes** | `ListPrice / LivingArea` |
| `price_reduced` | - | boolean | **Yes** | `OriginalListPrice > ListPrice` |
| `price_reduction_amount` | - | float | **Yes** | `OriginalListPrice - ListPrice` |
| `price_reduction_percentage` | - | float | **Yes** | `((OriginalListPrice - ListPrice) / OriginalListPrice) * 100` |
| `days_on_market` | - | integer | **Yes** | Days between `OriginalEntryTimestamp` and current date |
| `association_fee` | `AssociationFee` | float | No | HOA fee amount |
| `association_fee_frequency` | `AssociationFeeFrequency` | string | No | e.g., "Monthly" |
| `tax_annual_amount` | `TaxAnnualAmount` | float | No | Annual property taxes |
| `virtual_tour_url` | `VirtualTourURLUnbranded` | string | No | May be null |
| `waterfront` | `WaterfrontYN` | boolean | No | |
| `fireplaces_total` | `FireplacesTotal` | integer | No | |

---

## Calculated Fields Logic

### `price_per_sqft`
```javascript
if (list_price && living_area && living_area > 0) {
  price_per_sqft = Math.round((list_price / living_area) * 100) / 100;
} else {
  price_per_sqft = null;
}
```

### `price_reduced`
```javascript
price_reduced = (original_list_price > list_price);
```

### `price_reduction_amount`
```javascript
if (original_list_price > list_price) {
  price_reduction_amount = original_list_price - list_price;
} else {
  price_reduction_amount = 0;
}
```

### `price_reduction_percentage`
```javascript
if (original_list_price > list_price && original_list_price > 0) {
  price_reduction_percentage = Math.round(
    ((original_list_price - list_price) / original_list_price) * 100 * 100
  ) / 100;
} else {
  price_reduction_percentage = 0;
}
```

### `days_on_market`
```javascript
if (original_entry_timestamp) {
  const now = new Date();
  const listed = new Date(original_entry_timestamp);
  days_on_market = Math.floor((now - listed) / (1000 * 60 * 60 * 24));
} else {
  days_on_market = null;
}
```

---

## Special Handling

### Primary Photo URL
```javascript
if (primary_photo_url) {
  return primary_photo_url;
} else if (media && media.length > 0) {
  // Return first media item's URL
  return media[0].media_url;
} else {
  return null;
}
```

### Open Houses Array
- **Deduplicate:** Remove duplicate entries (same start_time and end_time)
- **Sort:** Order by start_time ascending
- **Filter:** Optionally exclude past open houses based on requirements

**Example from raw data:**
```json
// Raw data has 8 identical entries - should be reduced to 1
"open_houses": [
  {
    "end_time": "2025-11-09T21:00:00.000Z",
    "start_time": "2025-11-09T18:00:00.000Z"
  }
]
```

### Weekend Detection (for open_house filter)
```javascript
// Based on property timezone (derived from state_or_province or postal_code)
function isThisWeekend(date) {
  const now = new Date();
  const day = date.getDay(); // 0 = Sunday, 6 = Saturday
  const weekStart = getStartOfWeek(now);
  const thisWeekend = [
    new Date(weekStart.getTime() + 6 * 24 * 60 * 60 * 1000), // Saturday
    new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000)  // Sunday
  ];
  return date >= thisWeekend[0] && date <= thisWeekend[1];
}
```

---

## Error Responses

### 400 Bad Request
```json
{
  "error": {
    "code": "INVALID_PARAMETERS",
    "message": "Invalid query parameters",
    "details": [
      {
        "field": "items_per_page",
        "message": "Must be between 1 and 100"
      }
    ]
  }
}
```

### 422 Unprocessable Entity
```json
{
  "error": {
    "code": "INVALID_FILTER_COMBINATION",
    "message": "Geographic filters require all four lat/long parameters",
    "details": [
      {
        "missing": ["max_latitude", "max_longitude"]
      }
    ]
  }
}
```

---

## Performance Considerations

### Database Indexes
Recommended indexes for optimal performance:

```sql
-- Primary lookup
CREATE INDEX idx_listings_standard_status ON listings(standard_status);
CREATE INDEX idx_listings_property_type ON listings(property_type);

-- Sorting
CREATE INDEX idx_listings_list_price ON listings(list_price);
CREATE INDEX idx_listings_original_entry ON listings(original_entry_timestamp);
CREATE INDEX idx_listings_living_area ON listings(living_area);

-- Filtering
CREATE INDEX idx_listings_bedrooms ON listings(bedrooms_total);
CREATE INDEX idx_listings_bathrooms ON listings(bathrooms_total);
CREATE INDEX idx_listings_year_built ON listings(year_built);

-- Geospatial (PostGIS)
CREATE INDEX idx_listings_geog ON listings USING GIST(geog);

-- Composite indexes for common queries
CREATE INDEX idx_listings_type_status_price 
  ON listings(property_type, standard_status, list_price);
```

### Caching Strategy
- Cache total counts for 15 minutes (changes infrequently)
- Cache popular search combinations for 5 minutes
- Invalidate cache on listing updates

### Query Optimization
- Limit keyword search to indexed fields
- Use geospatial indexes for lat/long bounding box queries
- Calculate `price_per_sqft` in database query, not application layer

---

## Example Requests

### Basic Search
```
GET /api/listings/search?page=1&items_per_page=20
```

### Homes in Austin under $750K
```
GET /api/listings/search
  ?property_type=home
  &max_price=750000
  &city=Austin
  &status=active
  &sort_by=list_price
  &sort_direction=asc
```

### New Construction with Pool
```
GET /api/listings/search
  ?new_construction=true
  &pool=true
  &min_bedrooms=3
  &min_bathrooms=2
  &status=active
```

### Price Reduced in Last Week
```
GET /api/listings/search
  ?price_reduction=last_7_days
  &status=active
  &sort_by=price_reduction_percentage
  &sort_direction=desc
```

### Open House This Weekend
```
GET /api/listings/search
  ?open_house=this_weekend
  &min_price=400000
  &max_price=600000
  &status=active
```

### Geographic Bounding Box (Downtown Austin)
```
GET /api/listings/search
  ?min_latitude=30.250
  &max_latitude=30.280
  &min_longitude=-97.760
  &max_longitude=-97.730
  &status=active
```

---

## Notes & Assumptions

1. **Timezone Handling:** All timestamps are in UTC. Weekend calculations for open houses should convert to property local timezone based on state/postal code.

2. **Null Handling:** Calculated fields return `null` when source data is missing (e.g., `price_per_sqft` is null if `living_area` is 0 or null).

3. **Price Reduction Accuracy:** Time-based price reduction filters depend on `MajorChangeType` = "Price Change". If the listing has had other modifications after the price change, the filter may not accurately capture when the price was reduced unless `PriceChangeTimestamp` is available.

4. **Property Type Mapping:** The mapping between simplified filter values (home, condo, etc.) and MLS `PropertySubType` values should be configurable and may need adjustment based on your specific MLS feed.

5. **Open House Deduplication:** Raw data may contain duplicate open house entries. These should be deduplicated based on matching `start_time` and `end_time`.

6. **Status Ordering:** When sorting by status, use this priority: Active (1) > Pending (2) > Sold (3).

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2025-11-09 | Initial specification |
