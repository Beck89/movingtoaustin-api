/**
 * MLS Grid Property interface
 */
export interface Property {
    ListingKey: string;
    ListingId?: string;
    OriginatingSystemName: string;
    StandardStatus?: string;
    PropertyType?: string;
    PropertySubType?: string;
    MlgCanView: boolean;
    MlgCanUse?: string[];
    ModificationTimestamp: string;
    PhotosChangeTimestamp?: string;
    ListPrice?: number;
    OriginalListPrice?: number;
    PriceChangeTimestamp?: string;
    ClosePrice?: number;
    BedroomsTotal?: number;
    BathroomsFull?: number;
    BathroomsHalf?: number;
    BathroomsTotalInteger?: number;
    LivingArea?: number;
    YearBuilt?: number;
    LotSizeAcres?: number;
    Latitude?: number;
    Longitude?: number;
    City?: string;
    StateOrProvince?: string;
    PostalCode?: string;
    CountyOrParish?: string;
    SubdivisionName?: string;
    UnparsedAddress?: string;
    StreetName?: string;
    DaysOnMarket?: number;
    PublicRemarks?: string;
    VirtualTourURLBranded?: string;
    VirtualTourURLUnbranded?: string;
    ListAgentKey?: string;
    ListOfficeName?: string;
    MajorChangeType?: string;
    MajorChangeTimestamp?: string;
    OriginalEntryTimestamp?: string;
    NewConstructionYN?: boolean;
    PoolPrivateYN?: boolean;
    WaterfrontYN?: boolean;
    Levels?: string[];
    GarageSpaces?: number;
    ParkingTotal?: number;
    ElementarySchool?: string;
    HighSchoolDistrict?: string;
    AssociationFee?: number;
    AssociationFeeFrequency?: string;
    TaxAnnualAmount?: number;
    FireplacesTotal?: number;
    Media?: Media[];
    Rooms?: Room[];
    UnitTypes?: UnitType[];
    [key: string]: any;
}

/**
 * MLS Grid Media interface
 */
export interface Media {
    MediaKey: string;
    MediaModificationTimestamp: string;
    MediaCategory?: string;
    Order?: number;
    MediaURL?: string;
    ShortDescription?: string;
    ImageWidth?: number;
    ImageHeight?: number;
}

/**
 * MLS Grid Room interface
 */
export interface Room {
    RoomType?: string;
    RoomLevel?: string;
    RoomLength?: number;
    RoomWidth?: number;
    [key: string]: any;
}

/**
 * MLS Grid UnitType interface
 */
export interface UnitType {
    BedroomsTotal?: number;
    BathroomsTotalInteger?: number;
    RentCurrent?: number;
    RentMinimum?: number;
    RentMaximum?: number;
    [key: string]: any;
}

/**
 * Media download statistics
 */
export interface MediaStats {
    totalSuccessful: number;
    totalRateLimits: number;
    lastRateLimitTime: Date | null;
    inCooldown: boolean;
}

/**
 * Failed media tracking info
 */
export interface FailedMediaInfo {
    attempts: number;
    lastAttempt: Date;
    permanentlyFailed: boolean;
}

/**
 * API rate limited property tracking
 */
export interface RateLimitedPropertyInfo {
    hitCount: number;
    lastHit: Date;
}
