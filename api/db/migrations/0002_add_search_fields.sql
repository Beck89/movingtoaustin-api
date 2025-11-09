-- Migration: Add fields required for comprehensive search endpoint
-- This migration is NON-DESTRUCTIVE and can be run on live database

-- Add new columns to mls.properties
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS original_list_price numeric(14,2);
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS price_change_timestamp timestamptz;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS list_agent_key text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS list_office_name text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS major_change_type text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS major_change_timestamp timestamptz;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS new_construction_yn boolean;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS pool_private_yn boolean;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS waterfront_yn boolean;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS levels text[];
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS garage_spaces integer;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS parking_total integer;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS elementary_school text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS high_school_district text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS association_fee numeric(10,2);
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS association_fee_frequency text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS tax_annual_amount numeric(12,2);
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS fireplaces_total integer;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS street_name text;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS bathrooms_total_integer integer;
ALTER TABLE mls.properties ADD COLUMN IF NOT EXISTS original_entry_timestamp timestamptz;

-- Backfill data from raw JSONB column where possible
UPDATE mls.properties 
SET 
  original_list_price = COALESCE(original_list_price, (raw->>'OriginalListPrice')::numeric),
  price_change_timestamp = COALESCE(price_change_timestamp, (raw->>'PriceChangeTimestamp')::timestamptz),
  list_agent_key = COALESCE(list_agent_key, raw->>'ListAgentKey'),
  list_office_name = COALESCE(list_office_name, raw->>'ListOfficeName'),
  major_change_type = COALESCE(major_change_type, raw->>'MajorChangeType'),
  major_change_timestamp = COALESCE(major_change_timestamp, (raw->>'MajorChangeTimestamp')::timestamptz),
  new_construction_yn = COALESCE(new_construction_yn, (raw->>'NewConstructionYN')::boolean),
  pool_private_yn = COALESCE(pool_private_yn, (raw->>'PoolPrivateYN')::boolean),
  waterfront_yn = COALESCE(waterfront_yn, (raw->>'WaterfrontYN')::boolean),
  garage_spaces = COALESCE(garage_spaces, (raw->>'GarageSpaces')::integer),
  parking_total = COALESCE(parking_total, (raw->>'ParkingTotal')::integer),
  elementary_school = COALESCE(elementary_school, raw->>'ElementarySchool'),
  high_school_district = COALESCE(high_school_district, raw->>'HighSchoolDistrict'),
  association_fee = COALESCE(association_fee, (raw->>'AssociationFee')::numeric),
  association_fee_frequency = COALESCE(association_fee_frequency, raw->>'AssociationFeeFrequency'),
  tax_annual_amount = COALESCE(tax_annual_amount, (raw->>'TaxAnnualAmount')::numeric),
  fireplaces_total = COALESCE(fireplaces_total, (raw->>'FireplacesTotal')::integer),
  street_name = COALESCE(street_name, raw->>'StreetName'),
  bathrooms_total_integer = COALESCE(bathrooms_total_integer, (raw->>'BathroomsTotalInteger')::integer),
  original_entry_timestamp = COALESCE(original_entry_timestamp, (raw->>'OriginalEntryTimestamp')::timestamptz)
WHERE raw IS NOT NULL;

-- Backfill Levels array field (requires special handling)
UPDATE mls.properties 
SET levels = ARRAY(
  SELECT jsonb_array_elements_text(raw->'Levels')
)
WHERE raw IS NOT NULL 
  AND raw->'Levels' IS NOT NULL 
  AND jsonb_typeof(raw->'Levels') = 'array'
  AND levels IS NULL;

-- Create indexes for new filterable fields
CREATE INDEX IF NOT EXISTS idx_properties_original_list_price
  ON mls.properties(original_list_price);

CREATE INDEX IF NOT EXISTS idx_properties_property_sub_type
  ON mls.properties(property_sub_type);

CREATE INDEX IF NOT EXISTS idx_properties_garage_spaces
  ON mls.properties(garage_spaces);

CREATE INDEX IF NOT EXISTS idx_properties_parking_total
  ON mls.properties(parking_total);

CREATE INDEX IF NOT EXISTS idx_properties_new_construction
  ON mls.properties(new_construction_yn) WHERE new_construction_yn = true;

CREATE INDEX IF NOT EXISTS idx_properties_pool_private
  ON mls.properties(pool_private_yn) WHERE pool_private_yn = true;

CREATE INDEX IF NOT EXISTS idx_properties_waterfront
  ON mls.properties(waterfront_yn) WHERE waterfront_yn = true;

CREATE INDEX IF NOT EXISTS idx_properties_major_change
  ON mls.properties(major_change_type, major_change_timestamp);

CREATE INDEX IF NOT EXISTS idx_properties_original_entry
  ON mls.properties(original_entry_timestamp DESC);

CREATE INDEX IF NOT EXISTS idx_properties_lot_size
  ON mls.properties(lot_size_acres);

-- Composite index for common filter combinations
CREATE INDEX IF NOT EXISTS idx_properties_type_status_price
  ON mls.properties(property_sub_type, standard_status, list_price);

CREATE INDEX IF NOT EXISTS idx_properties_beds_baths_price
  ON mls.properties(bedrooms_total, bathrooms_total_integer, list_price);

-- Index for open houses time-based queries
CREATE INDEX IF NOT EXISTS idx_open_houses_time_range
  ON mls.open_houses(listing_key, start_time, end_time);

-- Add comment for documentation
COMMENT ON COLUMN mls.properties.original_list_price IS 'Original listing price when first listed';
COMMENT ON COLUMN mls.properties.price_change_timestamp IS 'Timestamp of most recent price change';
COMMENT ON COLUMN mls.properties.major_change_type IS 'Type of major change (New Listing, Price Change, etc.)';
COMMENT ON COLUMN mls.properties.bathrooms_total_integer IS 'Total bathrooms as integer (includes full + half)';