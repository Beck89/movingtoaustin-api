# MLS Listing Data Field Mapping

This document shows how each field in the clean JSON structure maps to the original raw MLS data.

## Table of Contents
- [IDs](#ids)
- [Status](#status)
- [Pricing](#pricing)
- [Property Details](#property-details)
- [Location](#location)
- [Size](#size)
- [Rooms](#rooms)
- [Features](#features)
- [Systems](#systems)
- [Financial](#financial)
- [Schools](#schools)
- [Community](#community)
- [Description & Directions](#description--directions)
- [Listing Agent & Office](#listing-agent--office)
- [Media](#media)
- [Syndication](#syndication)
- [Open Houses](#open-houses)
- [Calculated Metrics](#calculated-metrics)

---

## IDs

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.ids.listing_key` | `property.listing_key` | "ACT209777414" |
| `listing.ids.listing_id` | `property.listing_id` | "ACT9743847" |
| `listing.ids.mls` | `property.originating_system_name` | "actris" |

---

## Status

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.status.standard_status` | `property.standard_status` | "Active" |
| `listing.status.listing_date` | `property.raw.ListingContractDate` | "2025-10-27" |
| `listing.status.days_on_market` | **CALCULATED** | 14 (from listing_date to current date) |
| `listing.status.last_modified` | `property.modification_timestamp` | "2025-11-08T23:04:12.962Z" |

---

## Pricing

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.pricing.current_price` | `property.list_price` | "530000.00" |
| `listing.pricing.original_price` | `property.original_list_price` | "559990.00" |
| `listing.pricing.price_reduction` | **CALCULATED** | 29990 (original - current) |
| `listing.pricing.price_reduction_percentage` | **CALCULATED** | 5.36 ((reduction / original) * 100) |
| `listing.pricing.price_per_sqft` | **CALCULATED** | 205.83 (current_price / living_area) |
| `listing.pricing.last_price_change` | `property.major_change_timestamp` | "2025-11-03T17:26:57.000Z" |

---

## Property Details

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.property_details.type` | `property.property_sub_type` | "Single Family Residence" |
| `listing.property_details.category` | `property.property_type` | "Residential" |
| `listing.property_details.condition` | `property.raw.PropertyCondition[0]` | "New Construction" |
| `listing.property_details.year_built` | `property.year_built` | 2025 |
| `listing.property_details.builder` | `property.raw.BuilderName` | "CastleRock Communities" |

---

## Location

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.location.address` | `property.address_full` | "508  Echo Pass" |
| `listing.location.city` | `property.city` | "Liberty Hill" |
| `listing.location.state` | `property.state_or_province` | "TX" |
| `listing.location.zip` | `property.postal_code` | "78642" |
| `listing.location.county` | `property.county_or_parish` | "Williamson" |
| `listing.location.subdivision` | `property.subdivision_name` | "Santa Rita Ranch" |
| `listing.location.direction_faces` | `property.raw.DirectionFaces` | "East" |
| `listing.location.coordinates.latitude` | `property.latitude` | 30.65768844 |
| `listing.location.coordinates.longitude` | `property.longitude` | -97.82743594 |

---

## Size

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.size.living_area_sqft` | `property.living_area` | 2575 |
| `listing.size.lot_size_acres` | `property.lot_size_acres` | "0.1544" |
| `listing.size.lot_size_sqft` | `property.raw.LotSizeSquareFeet` | 6725.66 (rounded to 6726) |
| `listing.size.stories` | `property.raw.Levels[0]` | "Two" |

---

## Rooms

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.rooms.bedrooms` | `property.bedrooms_total` | 4 |
| `listing.rooms.bedrooms_main_floor` | `property.raw.MainLevelBedrooms` | 2 |
| `listing.rooms.bedrooms_upper_floor` | `property.raw.ACT_NumOtherLevelBeds` | "2" |
| `listing.rooms.bathrooms_full` | `property.bathrooms_full` | 3 |
| `listing.rooms.bathrooms_half` | `property.bathrooms_half` | 0 |
| `listing.rooms.bathrooms_total` | `property.raw.BathroomsTotalInteger` | 3 |
| `listing.rooms.garage_spaces` | `property.raw.GarageSpaces` | 2 |
| `listing.rooms.parking_total` | `property.raw.ParkingTotal` | 2 |

### Room List

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.room_list[]` | `property.raw.Rooms[]` |
| `listing.room_list[].type` | `property.raw.Rooms[].RoomType` |
| `listing.room_list[].level` | `property.raw.Rooms[].RoomLevel` |

**Example:**
```json
{
  "type": "Bedroom",
  "level": "Main"
}
```
Maps from:
```json
{
  "RoomKey": "ACT209777415",
  "RoomType": "Bedroom",
  "RoomLevel": "Main"
}
```

---

## Features

### Interior Features

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.features.interior[]` | `property.raw.InteriorFeatures[]` |

**Values:** "Ceiling Fan(s)", "Entrance Foyer", "Kitchen Island", "Open Floorplan", "Pantry", "Primary Bedroom on Main", "Recessed Lighting", "Soaking Tub", "Walk-In Closet(s)", "Wired for Sound"

### Exterior Features

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.features.exterior[]` | `property.raw.ExteriorFeatures[]` and `property.raw.PatioAndPorchFeatures[]` |

**Values from ExteriorFeatures:** "Rain Gutters"
**Values from PatioAndPorchFeatures:** "Patio", "Rear Porch"

### Construction Materials

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.features.construction[]` | `property.raw.ConstructionMaterials[]` |

**Values:** "Brick", "Cedar", "Concrete", "Frame", "Glass", "HardiPlank Type", "Masonry – All Sides", "Stone"

### Other Feature Fields

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.features.roof[]` | `property.raw.Roof[]` | ["Shingle"] |
| `listing.features.foundation[]` | `property.raw.FoundationDetails[]` | ["Slab"] |
| `listing.features.flooring[]` | `property.raw.Flooring[]` | ["Carpet", "Laminate", "Tile"] (excluding "See Remarks") |
| `listing.features.windows[]` | `property.raw.WindowFeatures[]` | ["ENERGY STAR Qualified Windows"] |
| `listing.features.lot[]` | `property.raw.LotFeatures[]` | (all values) |
| `listing.features.fencing[]` | `property.raw.Fencing[]` | ["Back Yard", "Full", "Wood"] |
| `listing.features.parking[]` | `property.raw.ParkingFeatures[]` | ["Driveway", "Garage Faces Front"] |
| `listing.features.security[]` | `property.raw.SecurityFeatures[]` | ["Smoke Detector(s)"] |
| `listing.features.accessibility[]` | `property.raw.AccessibilityFeatures[]` | ["None"] |
| `listing.features.pool` | `property.raw.PoolFeatures[0]` | "None" |
| `listing.features.fireplace` | **CALCULATED** | false (from fireplaces_total == 0) |
| `listing.features.fireplaces_total` | `property.raw.FireplacesTotal` | 0 |
| `listing.features.view[]` | `property.raw.View[]` | ["None"] |
| `listing.features.waterfront` | `property.raw.WaterfrontYN` | false |
| `listing.features.horse_property` | `property.raw.HorseYN` | false |

---

## Systems

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.systems.cooling[]` | `property.raw.Cooling[]` | ["Central Air"] |
| `listing.systems.heating[]` | `property.raw.Heating[]` | ["Central", "Natural Gas"] |
| `listing.systems.appliances[]` | `property.raw.Appliances[]` | ["Built-In Gas Oven", "Dishwasher", "Gas Cooktop", "Microwave", "RNGHD" → "Range Hood"] |
| `listing.systems.utilities[]` | `property.raw.Utilities[]` | (all values) |
| `listing.systems.water` | `property.raw.WaterSource[0]` | "Public" |
| `listing.systems.sewer` | `property.raw.Sewer[0]` | "Public Sewer" |
| `listing.systems.green_features.sustainability[]` | `property.raw.GreenSustainability[]` | ["None"] |
| `listing.systems.green_features.energy_efficient[]` | `property.raw.GreenEnergyEfficient[]` | ["Appliances", "Construction", "Materials"] |

---

## Financial

### HOA

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.financial.hoa.required` | `property.raw.AssociationYN` | true |
| `listing.financial.hoa.name` | `property.raw.AssociationName` | "Santa Rita Ranch HOA" |
| `listing.financial.hoa.fee_monthly` | `property.raw.AssociationFee` | 106 |
| `listing.financial.hoa.fee_annual` | **CALCULATED** | 1272 (fee_monthly * 12) |
| `listing.financial.hoa.frequency` | `property.raw.AssociationFeeFrequency` | "Monthly" |
| `listing.financial.hoa.includes[]` | `property.raw.AssociationFeeIncludes[]` | ["Common Area Maintenance"] |

### Taxes

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.financial.taxes.year` | `property.raw.TaxYear` | 2024 |
| `listing.financial.taxes.annual_amount` | `property.raw.TaxAnnualAmount` | 2169.07 |
| `listing.financial.taxes.monthly_estimate` | **CALCULATED** | 180.76 (annual / 12) |
| `listing.financial.taxes.assessed_value` | `property.raw.TaxAssessedValue` | 85000 |
| `listing.financial.taxes.rate_percentage` | `property.raw.ACT_EstimatedTaxes` | "2.55" |
| `listing.financial.taxes.legal_description` | `property.raw.TaxLegalDescription` | "S13273 - SANTA RITA RANCH PH 5 SEC 3C, BLOCK H, LOT 17" |
| `listing.financial.taxes.parcel_number` | `property.raw.ParcelNumber` | "154633053C000H0017" |

---

## Schools

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.schools.district` | `property.raw.HighSchoolDistrict` | "Liberty Hill ISD" |
| `listing.schools.elementary` | `property.raw.ElementarySchool` | "Tierra Rosa" |
| `listing.schools.middle` | `property.raw.MiddleOrJuniorSchool` | "Santa Rita Middle" |
| `listing.schools.high` | `property.raw.HighSchool` | "Legacy Ranch" |

---

## Community

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.community.name` | `property.subdivision_name` | "Santa Rita Ranch" |
| `listing.community.amenities[]` | `property.raw.CommunityFeatures[]` | (all values) |
| `listing.community.website` | `property.raw.ACT_CommunityWebSite` | "https://www.c-rock.com/community-detail/Santa-Rita-Ranch-67715" |

---

## Description & Directions

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.description` | `property.remarks_public` | "The well-designed Yuma plan includes four bedrooms, three bathrooms, and an upstairs game room!" |
| `listing.directions` | `property.raw.Directions` | (full directions text) |
| `listing.disclosures[]` | `property.raw.Disclosures[]` | ["MUD"] |

---

## Listing Agent & Office

### Agent

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.listing_agent.name` | `property.raw.ListAgentFullName` | "Ashley Yoder" |
| `listing.listing_agent.email` | `property.raw.ListAgentEmail` | "newhome@c-rock.com" |
| `listing.listing_agent.phone` | `property.raw.ListAgentDirectPhone` | "(832) 582-0030" |
| `listing.listing_agent.mls_id` | `property.raw.ListAgentMlsId` | "ACT4749630" |
| `listing.listing_agent.key` | `property.raw.ListAgentKey` | "ACT201903162" |

### Office

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.listing_office.name` | `property.raw.ListOfficeName` | "CastleRock Realty, LLC" |
| `listing.listing_office.phone` | `property.raw.ListOfficePhone` | "(832) 582-0030" |
| `listing.listing_office.mls_id` | `property.raw.ListOfficeMlsId` | "ACT704051" |
| `listing.listing_office.key` | `property.raw.ListOfficeKey` | "ACT115784292" |

---

## Media

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.media.photo_count` | `property.photo_count` | 30 |
| `listing.media.photos_last_updated` | `property.photos_change_timestamp` | "2025-10-27T19:13:09.689Z" |
| `listing.media.virtual_tour` | `property.virtual_tour_url_branded` | "https://discover.matterport.com/space/mJ8gmS4wvQt" |
| `listing.media.video_tour` | `property.raw.ACT_VideoTourLinkBranded` | "https://www.youtube.com/watch?v=Ji9QIL7VBXE" |
| `listing.media.listing_url` | `property.raw.ACT_ListingDetailURL` | "https://www.c-rock.com/homes-detail/508-echo-pass" |

### Photos Array

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.media.photos[]` | `media[]` |
| `listing.media.photos[].order` | `media[].order_sequence` |
| `listing.media.photos[].url` | `media[].media_url` |
| `listing.media.photos[].width` | `media[].width` |
| `listing.media.photos[].height` | `media[].height` |

**Example:**
```json
{
  "order": 0,
  "url": "https://media.mlsgrid.com/...",
  "width": 2048,
  "height": 1151
}
```

---

## Syndication

| Clean Structure Field | Raw Data Path | Raw Value |
|----------------------|---------------|-----------|
| `listing.syndication.display_online` | `property.raw.InternetAddressDisplayYN` | true |
| `listing.syndication.allow_comments` | `property.raw.InternetConsumerCommentYN` | false |
| `listing.syndication.allow_avm` | `property.raw.InternetAutomatedValuationDisplayYN` | false |
| `listing.syndication.syndicated_to[]` | `property.raw.SyndicateTo[]` | ["AustinHomeSearch.com", "Apartments.com Network", "HAR.com LH", "ListHub", "Realtor.com"] |

---

## Open Houses

| Clean Structure Field | Raw Data Path |
|----------------------|---------------|
| `listing.open_houses[]` | `open_houses[]` |
| `listing.open_houses[].date` | **CALCULATED** from `open_houses[].start_time` (ISO date extracted) |
| `listing.open_houses[].start_time` | **CALCULATED** from `open_houses[].start_time` (time portion) |
| `listing.open_houses[].end_time` | **CALCULATED** from `open_houses[].end_time` (time portion) |
| `listing.open_houses[].timezone` | "UTC" (static) |

**Example transformation:**
```
Raw: "start_time": "2025-11-15T18:00:00.000Z"
Clean:
  "date": "2025-11-15"
  "start_time": "18:00:00"
  "timezone": "UTC"
```

---

## Calculated Metrics

All fields in this section are **CALCULATED** from other listing data:

| Clean Structure Field | Calculation | Source Fields |
|----------------------|-------------|---------------|
| `listing.calculated_metrics.price_per_sqft` | `current_price / living_area_sqft` | $530,000 / 2,575 = $205.83 |
| `listing.calculated_metrics.price_per_acre` | `current_price / lot_size_acres` | $530,000 / 0.1544 = $3,432,624.19 |
| `listing.calculated_metrics.hoa_per_sqft_annual` | `(hoa_fee_monthly * 12) / living_area_sqft` | (106 * 12) / 2,575 = $0.49 |
| `listing.calculated_metrics.taxes_per_sqft_annual` | `taxes_annual / living_area_sqft` | 2,169.07 / 2,575 = $0.84 |
| `listing.calculated_metrics.estimated_monthly_costs.hoa` | Direct from listing | $106 |
| `listing.calculated_metrics.estimated_monthly_costs.taxes` | `taxes_annual / 12` | 2,169.07 / 12 = $180.76 |
| `listing.calculated_metrics.estimated_monthly_costs.total` | `hoa + taxes` | 106 + 180.76 = $286.76 |

---

## Notes

### Data Transformations

1. **RNGHD → Range Hood**: The appliance code "RNGHD" in raw data is expanded to "Range Hood"
2. **Flooring**: "See Remarks" is excluded from the flooring array
3. **Room List**: RoomKey is excluded; only RoomType and RoomLevel are kept
4. **Open Houses**: ISO timestamps are split into date, start_time, and end_time components
5. **Boolean Values**: String values like "0" and "1" are converted to proper booleans where appropriate

### Missing/Null Fields in Raw Data

These fields exist in the raw schema but have null values:
- `property.close_price`
- `property.days_on_market` (null in raw, calculated in clean structure)
- `property.primary_photo_url`
- `property.virtual_tour_url_unbranded`
- `property.listing_office_mui`
- `property.listing_agent_mui`
- All `room_length` and `room_width` values in rooms array

### Data Quality Notes

- Lot size appears in two places with slight differences:
  - `lot_size_acres`: 0.1544
  - `LotSizeSquareFeet`: 6725.66 (which equals 0.1544 acres when converted)
- Address has extra spacing: "508  Echo Pass" (two spaces)
- Tax assessed value ($85,000) is significantly lower than list price ($530,000) - typical for new construction
