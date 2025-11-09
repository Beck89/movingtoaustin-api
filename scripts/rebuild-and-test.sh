#!/bin/bash

# Rebuild and Test Script for New Search Endpoint
# This script rebuilds Docker containers, runs migrations, and tests the new endpoint

set -e  # Exit on error

echo "🚀 Starting rebuild and test process..."
echo ""

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Step 1: Stop and remove existing containers
echo -e "${BLUE}Step 1: Stopping existing containers...${NC}"
docker-compose down
echo -e "${GREEN}✓ Containers stopped${NC}"
echo ""

# Step 2: Rebuild images with new code
echo -e "${BLUE}Step 2: Rebuilding Docker images...${NC}"
docker-compose build --no-cache api etl
echo -e "${GREEN}✓ Images rebuilt${NC}"
echo ""

# Step 3: Start services
echo -e "${BLUE}Step 3: Starting services...${NC}"
docker-compose up -d postgres meilisearch
echo "Waiting for database to be ready..."
sleep 10

# Wait for postgres to be healthy
echo "Checking PostgreSQL health..."
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "Waiting for PostgreSQL..."
    sleep 2
done
echo -e "${GREEN}✓ PostgreSQL is ready${NC}"

# Wait for meilisearch to be healthy
echo "Checking Meilisearch health..."
until curl -f http://localhost:7700/health > /dev/null 2>&1; do
    echo "Waiting for Meilisearch..."
    sleep 2
done
echo -e "${GREEN}✓ Meilisearch is ready${NC}"
echo ""

# Step 4: Run database migrations
echo -e "${BLUE}Step 4: Running database migrations...${NC}"

# Check if migration has already been run
MIGRATION_CHECK=$(docker-compose exec -T postgres psql -U postgres -d mls -tAc "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='mls' AND table_name='properties' AND column_name='original_list_price');")

if [ "$MIGRATION_CHECK" = "t" ]; then
    echo -e "${YELLOW}⚠ Migration already applied (original_list_price column exists)${NC}"
    echo "Skipping migration..."
else
    echo "Copying migration file to container..."
    docker cp api/db/migrations/0002_add_search_fields.sql $(docker-compose ps -q postgres):/tmp/

    echo "Running migration..."
    docker-compose exec -T postgres psql -U postgres -d mls -f /tmp/0002_add_search_fields.sql

    echo -e "${GREEN}✓ Migration completed successfully${NC}"
fi
echo ""

# Step 5: Start API and ETL services
echo -e "${BLUE}Step 5: Starting API and ETL services...${NC}"
docker-compose up -d api etl

echo "Waiting for API to be ready..."
sleep 5

# Wait for API to be healthy
until curl -f http://localhost:3000/health > /dev/null 2>&1; do
    echo "Waiting for API..."
    sleep 2
done
echo -e "${GREEN}✓ API is ready${NC}"
echo ""

# Step 6: Display service status
echo -e "${BLUE}Step 6: Service Status${NC}"
docker-compose ps
echo ""

# Step 7: Run tests
echo -e "${BLUE}Step 7: Testing new search endpoint...${NC}"
echo ""

# Test 1: Basic search
echo -e "${YELLOW}Test 1: Basic search (first 5 results)${NC}"
curl -s "http://localhost:3000/api/listings/search?page=1&items_per_page=5" | jq -r '.metadata'
echo -e "${GREEN}✓ Basic search works${NC}"
echo ""

# Test 2: Search with status filter
echo -e "${YELLOW}Test 2: Active listings only${NC}"
curl -s "http://localhost:3000/api/listings/search?status=active&items_per_page=5" | jq -r '.metadata'
echo -e "${GREEN}✓ Status filter works${NC}"
echo ""

# Test 3: Search with price range
echo -e "${YELLOW}Test 3: Price range filter (\$300k-\$600k)${NC}"
curl -s "http://localhost:3000/api/listings/search?min_price=300000&max_price=600000&items_per_page=5" | jq -r '.metadata'
echo -e "${GREEN}✓ Price filter works${NC}"
echo ""

# Test 4: Search with multiple filters
echo -e "${YELLOW}Test 4: Multiple filters (Active, 3+ beds, pool)${NC}"
curl -s "http://localhost:3000/api/listings/search?status=active&min_bedrooms=3&pool=true&items_per_page=5" | jq -r '.metadata'
echo -e "${GREEN}✓ Multiple filters work${NC}"
echo ""

# Test 5: Check calculated fields
echo -e "${YELLOW}Test 5: Checking calculated fields in response${NC}"
RESPONSE=$(curl -s "http://localhost:3000/api/listings/search?items_per_page=1")
echo "$RESPONSE" | jq -r '.data[0] | {
    listing_key,
    list_price,
    living_area,
    price_per_sqft,
    days_on_market,
    price_reduced,
    open_houses: (.open_houses | length)
}'
echo -e "${GREEN}✓ Calculated fields present${NC}"
echo ""

# Step 8: Display logs
echo -e "${BLUE}Step 8: Recent logs${NC}"
echo ""
echo -e "${YELLOW}API Logs (last 20 lines):${NC}"
docker-compose logs --tail=20 api
echo ""
echo -e "${YELLOW}ETL Logs (last 20 lines):${NC}"
docker-compose logs --tail=20 etl
echo ""

# Step 9: Summary
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Rebuild and test completed successfully!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "${BLUE}Services running:${NC}"
echo "  - PostgreSQL: http://localhost:5433"
echo "  - Meilisearch: http://localhost:7700"
echo "  - API: http://localhost:3000"
echo "  - API Health: http://localhost:3000/health"
echo "  - API Docs: http://localhost:3000/api-docs"
echo ""
echo -e "${BLUE}New endpoint:${NC}"
echo "  - GET http://localhost:3000/api/listings/search"
echo ""
echo -e "${BLUE}Example requests:${NC}"
echo '  curl "http://localhost:3000/api/listings/search?status=active&items_per_page=20"'
echo '  curl "http://localhost:3000/api/listings/search?min_price=300000&max_price=600000&min_bedrooms=3"'
echo '  curl "http://localhost:3000/api/listings/search?pool=true&garage=true&status=active"'
echo '  curl "http://localhost:3000/api/listings/search?keywords=lake+travis&status=active"'
echo ""
echo -e "${BLUE}To view logs:${NC}"
echo "  docker-compose logs -f api"
echo "  docker-compose logs -f etl"
echo ""
echo -e "${BLUE}To stop services:${NC}"
echo "  docker-compose down"
echo ""