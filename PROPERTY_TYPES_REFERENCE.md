# Property Types Reference - ACTRIS MLS Data

Complete list of all PropertyType and PropertySubType values in your production database.

---

## PropertyType Values (7 total)

Use these values for the `property_type` query parameter.

| PropertyType | Count | Description |
|--------------|-------|-------------|
| `Residential` | 19,015 | Residential properties for sale |
| `Residential Lease` | 8,864 | Residential properties for lease/rent |
| `Land` | 5,436 | Land and lots |
| `Farm` | 1,598 | Farm and ranch properties |
| `Commercial Sale` | 1,164 | Commercial properties for sale |
| `Commercial Lease` | 492 | Commercial properties for lease |
| `Residential Income` | 342 | Multi-family income properties |

**Total**: 36,911 properties

---

## PropertySubType Values by PropertyType

Use these values for the `property_sub_type` query parameter.

### Commercial Lease (492 total)

| PropertySubType | Count |
|-----------------|-------|
| Office | 181 |
| Mixed Use | 77 |
| Warehouse | 53 |
| Retail | 45 |
| Industrial | 44 |
| See Remarks | 38 |
| Business | 35 |
| Site Planned | 6 |
| Ranch | 5 |
| Agriculture | 2 |
| Apartment | 2 |
| Site-Pad | 2 |
| Mobile Home Park | 2 |

### Commercial Sale (1,164 total)

| PropertySubType | Count |
|-----------------|-------|
| See Remarks | 334 |
| Mixed Use | 235 |
| Office | 133 |
| Business | 120 |
| Industrial | 70 |
| Retail | 50 |
| Multi Family | 43 |
| Ranch | 42 |
| Agriculture | 38 |
| Warehouse | 32 |
| Site-Pad | 26 |
| Site Planned | 22 |
| Mobile Home Park | 7 |
| Apartment | 6 |
| Hotel/Motel | 4 |
| (empty) | 2 |

### Farm (1,598 total)

| PropertySubType | Count |
|-----------------|-------|
| Ranch | 884 |
| Single Family Residence | 538 |
| See Remarks | 118 |
| Manufactured Home | 36 |
| Mobile Home | 17 |
| Modular Home | 5 |

### Land (5,436 total)

| PropertySubType | Count |
|-----------------|-------|
| Unimproved Land | 4,452 |
| Multiple Lots (Adjacent) | 640 |
| See Remarks | 344 |

### Residential (19,015 total)

| PropertySubType | Count |
|-----------------|-------|
| Single Family Residence | 16,265 |
| Condominium | 1,816 |
| Townhouse | 350 |
| Manufactured Home | 272 |
| See Remarks | 157 |
| Mobile Home | 136 |
| Modular Home | 19 |

### Residential Income (342 total)

| PropertySubType | Count |
|-----------------|-------|
| Duplex | 243 |
| Quadruplex | 58 |
| Triplex | 26 |
| See Remarks | 15 |

### Residential Lease (8,864 total)

| PropertySubType | Count |
|-----------------|-------|
| Single Family Residence | 5,430 |
| Condominium | 1,467 |
| Duplex | 795 |
| Apartment | 529 |
| Townhouse | 263 |
| Quadruplex | 234 |
| See Remarks | 58 |
| Triplex | 32 |
| Manufactured Home | 29 |
| Mobile Home | 25 |
| Modular Home | 2 |

---

## Query Examples

### Filter by PropertyType

```bash
# All residential for sale
/api/listings/search?property_type=Residential

# All residential leases
/api/listings/search?property_type=Residential Lease

# Land only
/api/listings/search?property_type=Land

# Multiple types
/api/listings/search?property_type=Residential,Land
```

### Filter by PropertySubType

```bash
# Single family homes only
/api/listings/search?property_sub_type=Single Family Residence

# Condos only
/api/listings/search?property_sub_type=Condominium

# Multiple sub-types
/api/listings/search?property_sub_type=Single Family Residence,Condominium,Townhouse
```

### Combine Both Filters

```bash
# Single family homes for sale
/api/listings/search?property_type=Residential&property_sub_type=Single Family Residence

# Condos for lease
/api/listings/search?property_type=Residential Lease&property_sub_type=Condominium

# Land (unimproved)
/api/listings/search?property_type=Land&property_sub_type=Unimproved Land

# Commercial offices for lease
/api/listings/search?property_type=Commercial Lease&property_sub_type=Office
```

---

## Common Use Cases

### For Sale Properties

```bash
# All for sale (exclude leases)
/api/listings/search?property_type=Residential,Land,Farm,Commercial Sale,Residential Income

# Homes for sale
/api/listings/search?property_type=Residential&property_sub_type=Single Family Residence

# Condos for sale
/api/listings/search?property_type=Residential&property_sub_type=Condominium
```

### For Lease/Rent Properties

```bash
# All for lease
/api/listings/search?property_type=Residential Lease,Commercial Lease

# Homes for rent
/api/listings/search?property_type=Residential Lease&property_sub_type=Single Family Residence

# Apartments for rent
/api/listings/search?property_type=Residential Lease&property_sub_type=Apartment
```

### Investment Properties

```bash
# Multi-family income properties
/api/listings/search?property_type=Residential Income

# Duplexes
/api/listings/search?property_sub_type=Duplex

# All multi-family (for sale and income)
/api/listings/search?property_sub_type=Duplex,Triplex,Quadruplex,Multi Family
```

---

## Notes

- **"See Remarks"**: Properties where the type is specified in the remarks field
- **Empty values**: A few properties have no PropertySubType set
- **Case sensitive**: Use exact capitalization as shown
- **Comma-separated**: Multiple values can be combined with commas
- **URL encoding**: Spaces should be encoded as `%20` or `+` in URLs

---

## Frontend Dropdown Options

### Recommended UI Groupings

**For Sale/Lease Toggle**:
```typescript
const listingTypes = [
  { value: 'Residential,Land,Farm,Commercial Sale,Residential Income', label: 'For Sale' },
  { value: 'Residential Lease,Commercial Lease', label: 'For Rent' },
];
```

**Property Types** (when For Sale selected):
```typescript
const salePropertyTypes = [
  { value: 'Single Family Residence', label: 'Single Family Home', count: 16265 },
  { value: 'Condominium', label: 'Condo', count: 1816 },
  { value: 'Townhouse', label: 'Townhouse', count: 350 },
  { value: 'Unimproved Land', label: 'Land', count: 4452 },
  { value: 'Ranch', label: 'Ranch', count: 884 },
  { value: 'Duplex', label: 'Duplex', count: 243 },
];
```

**Property Types** (when For Rent selected):
```typescript
const leasePropertyTypes = [
  { value: 'Single Family Residence', label: 'Single Family Home', count: 5430 },
  { value: 'Condominium', label: 'Condo', count: 1467 },
  { value: 'Apartment', label: 'Apartment', count: 529 },
  { value: 'Townhouse', label: 'Townhouse', count: 263 },
  { value: 'Duplex', label: 'Duplex', count: 795 },
];
```

---

**Use this reference when building your frontend UI!**