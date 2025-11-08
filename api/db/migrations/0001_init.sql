-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create schema
CREATE SCHEMA IF NOT EXISTS mls;

-- Sync high-water marks
CREATE TABLE IF NOT EXISTS mls.sync_state (
  resource                text PRIMARY KEY,             -- 'Property', 'Lookup', etc.
  originating_system_name text NOT NULL,                -- 'ACTRIS' etc.
  last_modification_ts    timestamptz NOT NULL,
  last_run_at             timestamptz NOT NULL DEFAULT now()
);

-- Canonical properties (IDX surface)
CREATE TABLE IF NOT EXISTS mls.properties (
  listing_key               text PRIMARY KEY,           -- RESO ListingKey
  listing_id                text,
  originating_system_name   text NOT NULL,
  standard_status           text,
  property_type             text,
  property_sub_type         text,
  mlg_can_view              boolean NOT NULL DEFAULT false,
  mlg_can_use               text[] NOT NULL DEFAULT '{}', -- e.g. {IDX,VOW}
  modification_timestamp    timestamptz NOT NULL,
  photos_change_timestamp   timestamptz,
  list_price                numeric(14,2),
  close_price               numeric(14,2),
  bedrooms_total            integer,
  bathrooms_full            integer,
  bathrooms_half            integer,
  living_area               integer,
  year_built                integer,
  lot_size_acres            numeric(12,4),
  latitude                  double precision,
  longitude                 double precision,
  geog                      geography(Point, 4326),
  city                      text,
  state_or_province         text,
  postal_code               text,
  county_or_parish          text,
  subdivision_name          text,
  address_full              text,
  days_on_market            integer,
  remarks_public            text,
  virtual_tour_url_branded  text,
  virtual_tour_url_unbranded text,
  primary_photo_url         text,                       -- source URL (pre-download)
  photo_count               integer,
  listing_office_mui        text,
  listing_agent_mui         text,
  raw                       jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now()
);

-- Auto-derive geography + touch updated_at
CREATE OR REPLACE FUNCTION mls._set_geog()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
    NEW.geog := ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_properties_geog ON mls.properties;
CREATE TRIGGER trg_properties_geog
BEFORE INSERT OR UPDATE OF latitude, longitude
ON mls.properties
FOR EACH ROW EXECUTE FUNCTION mls._set_geog();

-- Media (download and host locally; no hotlinking in UI)
CREATE TABLE IF NOT EXISTS mls.media (
  media_key               text PRIMARY KEY,
  listing_key             text NOT NULL REFERENCES mls.properties(listing_key) ON DELETE CASCADE,
  media_modification_ts   timestamptz NOT NULL,
  media_category          text,               -- 'Photo', 'Video'
  order_sequence          integer,
  media_url               text,               -- source (download-from) URL
  local_url               text,               -- your CDN URL after ingest
  caption                 text,
  width                   integer,
  height                  integer,
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Rooms (optional)
CREATE TABLE IF NOT EXISTS mls.rooms (
  id                      bigserial PRIMARY KEY,
  listing_key             text NOT NULL REFERENCES mls.properties(listing_key) ON DELETE CASCADE,
  room_type               text,
  room_level              text,
  room_length             numeric(8,2),
  room_width              numeric(8,2),
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- UnitTypes (optional, for multi-unit)
CREATE TABLE IF NOT EXISTS mls.unit_types (
  id                      bigserial PRIMARY KEY,
  listing_key             text NOT NULL REFERENCES mls.properties(listing_key) ON DELETE CASCADE,
  bedrooms                integer,
  bathrooms               numeric(4,1),
  rent_min                numeric(14,2),
  rent_max                numeric(14,2),
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Lookups cache
CREATE TABLE IF NOT EXISTS mls.lookups (
  lookup_name             text NOT NULL,
  code_value              text NOT NULL,
  long_value              text,
  short_value             text,
  originating_system_name text NOT NULL,
  PRIMARY KEY (lookup_name, code_value, originating_system_name),
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Offices
CREATE TABLE IF NOT EXISTS mls.offices (
  office_key              text PRIMARY KEY,
  office_name             text,
  originating_system_name text NOT NULL,
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Members
CREATE TABLE IF NOT EXISTS mls.members (
  member_key              text PRIMARY KEY,
  member_full_name        text,
  originating_system_name text NOT NULL,
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at              timestamptz NOT NULL DEFAULT now()
);

-- Open Houses
CREATE TABLE IF NOT EXISTS mls.open_houses (
  id                      bigserial PRIMARY KEY,
  listing_key             text NOT NULL REFERENCES mls.properties(listing_key) ON DELETE CASCADE,
  start_time              timestamptz NOT NULL,
  end_time                timestamptz NOT NULL,
  remarks                 text,
  raw                     jsonb NOT NULL DEFAULT '{}'::jsonb
);

-- Indexes for properties
CREATE INDEX IF NOT EXISTS idx_properties_origin ON mls.properties (originating_system_name);
CREATE INDEX IF NOT EXISTS idx_properties_status ON mls.properties (standard_status);
CREATE INDEX IF NOT EXISTS idx_properties_price  ON mls.properties (list_price);
CREATE INDEX IF NOT EXISTS idx_properties_beds_baths ON mls.properties (bedrooms_total, bathrooms_full);
CREATE INDEX IF NOT EXISTS idx_properties_modified ON mls.properties (modification_timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_properties_geog ON mls.properties USING GIST (geog);
CREATE INDEX IF NOT EXISTS idx_properties_mlg_can_view ON mls.properties (mlg_can_view);
CREATE INDEX IF NOT EXISTS idx_properties_city ON mls.properties (city);
CREATE INDEX IF NOT EXISTS idx_properties_postal ON mls.properties (postal_code);

-- Index for media
CREATE INDEX IF NOT EXISTS idx_media_listing ON mls.media (listing_key);
CREATE INDEX IF NOT EXISTS idx_media_order ON mls.media (listing_key, order_sequence);

-- Index for open houses
CREATE INDEX IF NOT EXISTS idx_open_houses_listing ON mls.open_houses (listing_key);
CREATE INDEX IF NOT EXISTS idx_open_houses_time ON mls.open_houses (start_time, end_time);