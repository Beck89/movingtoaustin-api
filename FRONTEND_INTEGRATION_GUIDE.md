# Frontend Integration Guide
## New Search Endpoint Implementation

This guide shows you how to integrate the new comprehensive search endpoint (`/api/listings/search`) into your frontend application.

---

## Quick Start

### Basic Search Request

```typescript
const response = await fetch('https://your-api.com/api/listings/search?page=1&items_per_page=20');
const data = await response.json();

console.log(data.metadata.total_listings_count); // Total listings in database
console.log(data.metadata.filtered_listings_count); // Listings matching filters
console.log(data.data); // Array of listing objects
```

---

## Response Structure

### Complete Response Format

```typescript
interface SearchResponse {
  data: Listing[];
  metadata: {
    total_listings_count: number;
    filtered_listings_count: number;
    current_page: number;
    total_pages: number;
    items_per_page: number;
    sort_by: string;
    sort_direction: 'asc' | 'desc';
  };
}

interface Listing {
  // Core Info
  listing_key: string;
  standard_status: string;
  property_type: string;
  property_sub_type: string;
  
  // Pricing
  list_price: string;
  original_list_price: string;
  price_change_timestamp: string | null;
  
  // Calculated Price Fields
  price_per_sqft: string | null;
  price_reduced: boolean;
  price_reduction_amount: string;
  price_reduction_percentage: string;
  
  // Property Details
  bedrooms_total: number;
  bathrooms_total: number;
  living_area: number | null;
  lot_size_acres: string | null;
  year_built: number | null;
  levels: string[] | null;
  
  // Amenities
  pool_private: boolean;
  garage_spaces: number | null;
  parking_total: number | null;
  waterfront: boolean;
  fireplaces_total: number | null;
  new_construction: boolean | null;
  
  // Location
  street_name: string | null;
  city: string;
  state_or_province: string;
  postal_code: string;
  county_or_parish: string | null;
  unparsed_address: string;
  latitude: number;
  longitude: number;
  
  // Schools
  elementary_school: string | null;
  high_school_district: string | null;
  subdivision_name: string | null;
  
  // Media
  photos_count: number;
  primary_photo_url: string | null;
  virtual_tour_url: string | null;
  
  // Open Houses
  open_houses: Array<{
    start_time: string;
    end_time: string;
  }>;
  
  // Financial
  association_fee: string | null;
  association_fee_frequency: string | null;
  tax_annual_amount: string | null;
  
  // Timing
  days_on_market: number | null;
  original_entry_timestamp: string;
  major_change_type: string | null;
  major_change_timestamp: string | null;
  
  // Agent/Office
  list_agent_key: string | null;
  list_office_name: string | null;
}
```

---

## Building Search Queries

### 1. Pagination

```typescript
// Page 1, 20 results per page
const url = '/api/listings/search?page=1&items_per_page=20';

// Page 2, 50 results per page
const url = '/api/listings/search?page=2&items_per_page=50';
```

### 2. Sorting

```typescript
// Sort by price (low to high)
const url = '/api/listings/search?sort_by=list_price&sort_direction=asc';

// Sort by newest listings
const url = '/api/listings/search?sort_by=list_date&sort_direction=desc';

// Sort by price per sqft
const url = '/api/listings/search?sort_by=price_per_sqft&sort_direction=asc';
```

**Available sort fields**:
- `list_date` - Original listing date
- `list_price` - Current price
- `living_area` - Square footage
- `price_per_sqft` - Price per square foot
- `status` - Listing status
- `bedrooms_total` - Number of bedrooms
- `bathrooms_total` - Number of bathrooms

### 3. Property Filters

```typescript
// Price range
const url = '/api/listings/search?min_price=300000&max_price=600000';

// Bedrooms and bathrooms
const url = '/api/listings/search?min_bedrooms=3&min_bathrooms=2';

// Square footage
const url = '/api/listings/search?min_sqft=2000&max_sqft=3500';

// Property type (simplified types)
const url = '/api/listings/search?property_type=home,condo';
```

**Property type values**:
- `home` - Single family homes
- `condo` - Condominiums
- `townhouse` - Townhouses
- `lot` - Land/lots
- `farm_ranch` - Farms and ranches
- `multi_family` - Multi-family properties
- `commercial` - Commercial properties

### 4. Amenity Filters

```typescript
// Pool and garage
const url = '/api/listings/search?pool=true&garage=true';

// Minimum garage spaces
const url = '/api/listings/search?min_garage_spaces=2';

// Waterfront properties
const url = '/api/listings/search?waterfront=true';

// New construction
const url = '/api/listings/search?new_construction=true';
```

### 5. Status and Timing Filters

```typescript
// Active listings only
const url = '/api/listings/search?status=active';

// Multiple statuses
const url = '/api/listings/search?status=active,pending';

// New listings (last 30 days)
const url = '/api/listings/search?days_on_market=30';

// Price reductions
const url = '/api/listings/search?price_reduction=last_7_days';

// Open houses this weekend
const url = '/api/listings/search?open_house=this_weekend';
```

**Price reduction values**:
- `any` - Any price reduction
- `last_day`, `last_3_days`, `last_7_days`, `last_14_days`, `last_30_days`
- `over_1_month`, `over_2_months`, `over_3_months`

**Open house values**:
- `this_weekend` - This Saturday/Sunday
- `next_weekend` - Next Saturday/Sunday
- `all` - Any future open house

### 6. Geographic Search

```typescript
// Bounding box (all 4 required together)
const url = '/api/listings/search?' +
  'min_latitude=30.2&max_latitude=30.5&' +
  'min_longitude=-98.0&max_longitude=-97.7';
```

### 7. Text Search

```typescript
// Search by keywords
const url = '/api/listings/search?keywords=lake+travis';

// Combine with filters
const url = '/api/listings/search?keywords=downtown&status=active&min_price=400000';
```

---

## React/TypeScript Example

### Complete Search Component

```typescript
import { useState, useEffect } from 'react';

interface SearchFilters {
  page?: number;
  items_per_page?: number;
  sort_by?: string;
  sort_direction?: 'asc' | 'desc';
  
  // Property filters
  property_type?: string;
  min_price?: number;
  max_price?: number;
  min_bedrooms?: number;
  min_bathrooms?: number;
  min_sqft?: number;
  max_sqft?: number;
  
  // Amenities
  pool?: boolean;
  garage?: boolean;
  waterfront?: boolean;
  new_construction?: boolean;
  
  // Status
  status?: string;
  days_on_market?: number;
  price_reduction?: string;
  open_house?: string;
  
  // Search
  keywords?: string;
  
  // Geographic
  min_latitude?: number;
  max_latitude?: number;
  min_longitude?: number;
  max_longitude?: number;
}

function useListingSearch(filters: SearchFilters) {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchListings = async () => {
      setLoading(true);
      setError(null);

      try {
        // Build query string
        const params = new URLSearchParams();
        
        Object.entries(filters).forEach(([key, value]) => {
          if (value !== undefined && value !== null && value !== '') {
            params.append(key, String(value));
          }
        });

        const response = await fetch(
          `https://your-api.com/api/listings/search?${params.toString()}`
        );

        if (!response.ok) {
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const result = await response.json();
        setData(result);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'An error occurred');
      } finally {
        setLoading(false);
      }
    };

    fetchListings();
  }, [filters]);

  return { data, loading, error };
}

// Usage in component
function ListingSearchPage() {
  const [filters, setFilters] = useState<SearchFilters>({
    page: 1,
    items_per_page: 20,
    status: 'active',
    sort_by: 'list_price',
    sort_direction: 'asc',
  });

  const { data, loading, error } = useListingSearch(filters);

  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  if (!data) return null;

  return (
    <div>
      <h1>Search Results</h1>
      <p>
        Showing {data.data.length} of {data.metadata.filtered_listings_count} listings
      </p>
      
      {data.data.map((listing: any) => (
        <ListingCard key={listing.listing_key} listing={listing} />
      ))}
      
      <Pagination
        currentPage={data.metadata.current_page}
        totalPages={data.metadata.total_pages}
        onPageChange={(page) => setFilters({ ...filters, page })}
      />
    </div>
  );
}
```

---

## Common UI Patterns

### 1. Price Range Slider

```typescript
function PriceRangeFilter({ onChange }: { onChange: (min: number, max: number) => void }) {
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(1000000);

  const handleApply = () => {
    onChange(minPrice, maxPrice);
  };

  return (
    <div>
      <input
        type="range"
        min={0}
        max={2000000}
        step={50000}
        value={minPrice}
        onChange={(e) => setMinPrice(Number(e.target.value))}
      />
      <input
        type="range"
        min={0}
        max={2000000}
        step={50000}
        value={maxPrice}
        onChange={(e) => setMaxPrice(Number(e.target.value))}
      />
      <button onClick={handleApply}>Apply</button>
      <p>${minPrice.toLocaleString()} - ${maxPrice.toLocaleString()}</p>
    </div>
  );
}
```

### 2. Property Type Selector

```typescript
function PropertyTypeFilter({ onChange }: { onChange: (types: string[]) => void }) {
  const [selected, setSelected] = useState<string[]>([]);

  const types = [
    { value: 'home', label: 'Single Family Home' },
    { value: 'condo', label: 'Condo' },
    { value: 'townhouse', label: 'Townhouse' },
    { value: 'lot', label: 'Land/Lot' },
    { value: 'multi_family', label: 'Multi-Family' },
  ];

  const toggleType = (type: string) => {
    const newSelected = selected.includes(type)
      ? selected.filter(t => t !== type)
      : [...selected, type];
    
    setSelected(newSelected);
    onChange(newSelected);
  };

  return (
    <div>
      {types.map(type => (
        <label key={type.value}>
          <input
            type="checkbox"
            checked={selected.includes(type.value)}
            onChange={() => toggleType(type.value)}
          />
          {type.label}
        </label>
      ))}
    </div>
  );
}
```

### 3. Amenity Checkboxes

```typescript
function AmenityFilters({ onChange }: { onChange: (amenities: any) => void }) {
  const [amenities, setAmenities] = useState({
    pool: false,
    garage: false,
    waterfront: false,
    new_construction: false,
    fireplace: false,
  });

  const handleChange = (key: string, value: boolean) => {
    const updated = { ...amenities, [key]: value };
    setAmenities(updated);
    onChange(updated);
  };

  return (
    <div>
      <label>
        <input
          type="checkbox"
          checked={amenities.pool}
          onChange={(e) => handleChange('pool', e.target.checked)}
        />
        Pool
      </label>
      <label>
        <input
          type="checkbox"
          checked={amenities.garage}
          onChange={(e) => handleChange('garage', e.target.checked)}
        />
        Garage
      </label>
      <label>
        <input
          type="checkbox"
          checked={amenities.waterfront}
          onChange={(e) => handleChange('waterfront', e.target.checked)}
        />
        Waterfront
      </label>
      <label>
        <input
          type="checkbox"
          checked={amenities.new_construction}
          onChange={(e) => handleChange('new_construction', e.target.checked)}
        />
        New Construction
      </label>
    </div>
  );
}
```

### 4. Map Integration (Geographic Search)

```typescript
function MapSearch({ onBoundsChange }: { onBoundsChange: (bounds: any) => void }) {
  const handleMapMove = (map: any) => {
    const bounds = map.getBounds();
    
    onBoundsChange({
      min_latitude: bounds.getSouth(),
      max_latitude: bounds.getNorth(),
      min_longitude: bounds.getWest(),
      max_longitude: bounds.getEast(),
    });
  };

  return (
    <Map onMoveEnd={handleMapMove}>
      {/* Your map markers */}
    </Map>
  );
}
```

### 5. Listing Card Component

```typescript
function ListingCard({ listing }: { listing: Listing }) {
  return (
    <div className="listing-card">
      {/* Photo */}
      {listing.primary_photo_url && (
        <img src={listing.primary_photo_url} alt={listing.unparsed_address} />
      )}
      
      {/* Price */}
      <div className="price">
        <h3>${Number(listing.list_price).toLocaleString()}</h3>
        {listing.price_reduced && (
          <span className="price-reduced">
            Reduced ${Number(listing.price_reduction_amount).toLocaleString()} 
            ({listing.price_reduction_percentage}%)
          </span>
        )}
      </div>
      
      {/* Details */}
      <div className="details">
        <span>{listing.bedrooms_total} beds</span>
        <span>{listing.bathrooms_total} baths</span>
        {listing.living_area && (
          <span>{listing.living_area.toLocaleString()} sqft</span>
        )}
        {listing.price_per_sqft && (
          <span>${listing.price_per_sqft}/sqft</span>
        )}
      </div>
      
      {/* Address */}
      <p className="address">{listing.unparsed_address}</p>
      <p className="city">{listing.city}, {listing.state_or_province} {listing.postal_code}</p>
      
      {/* Amenities */}
      <div className="amenities">
        {listing.pool_private && <span>🏊 Pool</span>}
        {listing.garage_spaces && <span>🚗 {listing.garage_spaces} Car Garage</span>}
        {listing.waterfront && <span>🌊 Waterfront</span>}
        {listing.new_construction && <span>🏗️ New Construction</span>}
      </div>
      
      {/* Open Houses */}
      {listing.open_houses.length > 0 && (
        <div className="open-houses">
          <strong>Open House:</strong>
          {listing.open_houses.map((oh, i) => (
            <div key={i}>
              {new Date(oh.start_time).toLocaleDateString()} 
              {' '}
              {new Date(oh.start_time).toLocaleTimeString()} - 
              {new Date(oh.end_time).toLocaleTimeString()}
            </div>
          ))}
        </div>
      )}
      
      {/* Days on Market */}
      {listing.days_on_market !== null && (
        <p className="dom">Listed {listing.days_on_market} days ago</p>
      )}
    </div>
  );
}
```

---

## Advanced Examples

### Complete Search Form

```typescript
function SearchForm({ onSearch }: { onSearch: (filters: SearchFilters) => void }) {
  const [filters, setFilters] = useState<SearchFilters>({
    status: 'active',
    sort_by: 'list_date',
    sort_direction: 'desc',
  });

  const updateFilter = (key: string, value: any) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSearch(filters);
  };

  return (
    <form onSubmit={handleSubmit}>
      {/* Price Range */}
      <div>
        <label>Min Price</label>
        <input
          type="number"
          value={filters.min_price || ''}
          onChange={(e) => updateFilter('min_price', e.target.value)}
        />
        <label>Max Price</label>
        <input
          type="number"
          value={filters.max_price || ''}
          onChange={(e) => updateFilter('max_price', e.target.value)}
        />
      </div>

      {/* Beds/Baths */}
      <div>
        <label>Min Beds</label>
        <select
          value={filters.min_bedrooms || ''}
          onChange={(e) => updateFilter('min_bedrooms', e.target.value)}
        >
          <option value="">Any</option>
          <option value="1">1+</option>
          <option value="2">2+</option>
          <option value="3">3+</option>
          <option value="4">4+</option>
          <option value="5">5+</option>
        </select>

        <label>Min Baths</label>
        <select
          value={filters.min_bathrooms || ''}
          onChange={(e) => updateFilter('min_bathrooms', e.target.value)}
        >
          <option value="">Any</option>
          <option value="1">1+</option>
          <option value="1.5">1.5+</option>
          <option value="2">2+</option>
          <option value="2.5">2.5+</option>
          <option value="3">3+</option>
        </select>
      </div>

      {/* Amenities */}
      <div>
        <label>
          <input
            type="checkbox"
            checked={filters.pool || false}
            onChange={(e) => updateFilter('pool', e.target.checked)}
          />
          Pool
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.garage || false}
            onChange={(e) => updateFilter('garage', e.target.checked)}
          />
          Garage
        </label>
        <label>
          <input
            type="checkbox"
            checked={filters.waterfront || false}
            onChange={(e) => updateFilter('waterfront', e.target.checked)}
          />
          Waterfront
        </label>
      </div>

      {/* Keywords */}
      <div>
        <label>Search</label>
        <input
          type="text"
          placeholder="Address, city, school, etc."
          value={filters.keywords || ''}
          onChange={(e) => updateFilter('keywords', e.target.value)}
        />
      </div>

      <button type="submit">Search</button>
    </form>
  );
}
```

### URL State Management

```typescript
import { useSearchParams } from 'react-router-dom';

function SearchPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  // Read filters from URL
  const filters: SearchFilters = {
    page: Number(searchParams.get('page')) || 1,
    items_per_page: Number(searchParams.get('items_per_page')) || 20,
    min_price: searchParams.get('min_price') ? Number(searchParams.get('min_price')) : undefined,
    max_price: searchParams.get('max_price') ? Number(searchParams.get('max_price')) : undefined,
    status: searchParams.get('status') || undefined,
    keywords: searchParams.get('keywords') || undefined,
    // ... etc
  };

  // Update URL when filters change
  const handleSearch = (newFilters: SearchFilters) => {
    const params = new URLSearchParams();
    
    Object.entries(newFilters).forEach(([key, value]) => {
      if (value !== undefined && value !== null && value !== '') {
        params.set(key, String(value));
      }
    });
    
    setSearchParams(params);
  };

  const { data, loading, error } = useListingSearch(filters);

  return (
    <div>
      <SearchForm onSearch={handleSearch} />
      {/* Results */}
    </div>
  );
}
```

---

## Performance Tips

### 1. Debounce Text Search

```typescript
import { useMemo } from 'react';
import debounce from 'lodash/debounce';

function SearchInput({ onSearch }: { onSearch: (keywords: string) => void }) {
  const debouncedSearch = useMemo(
    () => debounce((value: string) => onSearch(value), 500),
    [onSearch]
  );

  return (
    <input
      type="text"
      placeholder="Search..."
      onChange={(e) => debouncedSearch(e.target.value)}
    />
  );
}
```

### 2. Cache Results

```typescript
import { useQuery } from '@tanstack/react-query';

function useListingSearch(filters: SearchFilters) {
  return useQuery({
    queryKey: ['listings', filters],
    queryFn: async () => {
      const params = new URLSearchParams(
        Object.entries(filters)
          .filter(([_, v]) => v !== undefined)
          .map(([k, v]) => [k, String(v)])
      );
      
      const response = await fetch(`/api/listings/search?${params}`);
      return response.json();
    },
    staleTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}
```

### 3. Infinite Scroll

```typescript
function InfiniteListings({ filters }: { filters: SearchFilters }) {
  const [page, setPage] = useState(1);
  const [allListings, setAllListings] = useState<any[]>([]);

  const { data } = useListingSearch({ ...filters, page });

  useEffect(() => {
    if (data?.data) {
      setAllListings(prev => [...prev, ...data.data]);
    }
  }, [data]);

  const loadMore = () => {
    if (page < data?.metadata.total_pages) {
      setPage(prev => prev + 1);
    }
  };

  return (
    <div>
      {allListings.map(listing => (
        <ListingCard key={listing.listing_key} listing={listing} />
      ))}
      {page < data?.metadata.total_pages && (
        <button onClick={loadMore}>Load More</button>
      )}
    </div>
  );
}
```

---

## Error Handling

```typescript
async function searchListings(filters: SearchFilters) {
  try {
    const params = new URLSearchParams(
      Object.entries(filters)
        .filter(([_, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => [k, String(v)])
    );

    const response = await fetch(`/api/listings/search?${params}`);

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || 'Search failed');
    }

    return await response.json();
  } catch (error) {
    console.error('Search error:', error);
    throw error;
  }
}
```

---

## Migration from Old Endpoint

### Side-by-Side Comparison

**Old Endpoint** (`/listings/search`):
```typescript
// Limited filters
const url = '/listings/search?bounds=30.2,-97.8,30.3,-97.7&minPrice=300000&status=Active';
```

**New Endpoint** (`/api/listings/search`):
```typescript
// Comprehensive filters + calculated fields
const url = '/api/listings/search?' +
  'min_latitude=30.2&max_latitude=30.3&' +
  'min_longitude=-97.8&max_longitude=-97.7&' +
  'min_price=300000&status=active&' +
  'pool=true&open_house=this_weekend';
```

### Gradual Migration Strategy

1. **Phase 1**: Add new endpoint calls alongside old ones
2. **Phase 2**: Test new endpoint thoroughly
3. **Phase 3**: Switch UI to use new endpoint
4. **Phase 4**: Remove old endpoint calls

---

## Testing Checklist

- [ ] Basic search (no filters)
- [ ] Price range filtering
- [ ] Bedroom/bathroom filtering
- [ ] Property type filtering
- [ ] Amenity filtering (pool, garage, etc.)
- [ ] Status filtering (active, pending, sold)
- [ ] Text search with keywords
- [ ] Geographic bounding box
- [ ] Sorting (price, date, sqft, etc.)
- [ ] Pagination
- [ ] Price reduction filtering
- [ ] Open house filtering
- [ ] Calculated fields display correctly
- [ ] Photo fallback working
- [ ] Error handling

---

## Support

For issues or questions:
1. Check API response in browser DevTools
2. Verify query parameters are correctly formatted
3. Check [`real-estate-search-endpoint-spec.md`](real-estate-search-endpoint-spec.md) for parameter details
4. Review [`IMPLEMENTATION_GUIDE.md`](IMPLEMENTATION_GUIDE.md) for backend details

---

## Example: Complete Search Page

```typescript
import { useState } from 'react';

export default function ListingSearchPage() {
  const [filters, setFilters] = useState({
    page: 1,
    items_per_page: 20,
    status: 'active',
    sort_by: 'list_date',
    sort_direction: 'desc' as const,
  });

  const { data, loading, error } = useListingSearch(filters);

  return (
    <div className="search-page">
      <aside className="filters">
        <SearchForm
          filters={filters}
          onChange={setFilters}
        />
      </aside>

      <main className="results">
        {loading && <LoadingSpinner />}
        {error && <ErrorMessage error={error} />}
        
        {data && (
          <>
            <div className="results-header">
              <h2>
                {data.metadata.filtered_listings_count.toLocaleString()} Properties
              </h2>
              <SortDropdown
                value={filters.sort_by}
                onChange={(sort_by) => setFilters({ ...filters, sort_by })}
              />
            </div>

            <div className="listings-grid">
              {data.data.map(listing => (
                <ListingCard key={listing.listing_key} listing={listing} />
              ))}
            </div>

            <Pagination
              currentPage={data.metadata.current_page}
              totalPages={data.metadata.total_pages}
              onPageChange={(page) => setFilters({ ...filters, page })}
            />
          </>
        )}
      </main>
    </div>
  );
}
```

---

**Your new search endpoint is ready to integrate into your frontend!** 🚀