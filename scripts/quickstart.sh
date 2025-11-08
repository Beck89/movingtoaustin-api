#!/bin/bash

# Quick start script for MLS Grid Backend

set -e

echo "🚀 MLS Grid Backend - Quick Start"
echo "=================================="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "⚠️  No .env file found. Creating from .env.example..."
    cp .env.example .env
    echo "✅ Created .env file. Please edit it with your credentials before continuing."
    echo ""
    echo "Required configuration:"
    echo "  - MLS_CLIENT_ID"
    echo "  - MLS_CLIENT_SECRET"
    echo "  - S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY"
    echo ""
    read -p "Press Enter after you've configured .env, or Ctrl+C to exit..."
fi

echo "📦 Installing dependencies..."
npm install

echo ""
echo "🐳 Starting Docker services (Postgres + OpenSearch)..."
docker-compose up -d postgres opensearch

echo ""
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Wait for Postgres
until docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; do
    echo "   Waiting for Postgres..."
    sleep 2
done
echo "✅ Postgres is ready"

# Wait for OpenSearch
until curl -s http://localhost:9200/_cluster/health > /dev/null 2>&1; do
    echo "   Waiting for OpenSearch..."
    sleep 2
done
echo "✅ OpenSearch is ready"

echo ""
echo "🗄️  Running database migrations..."
npm run db:migrate

echo ""
echo "🔍 Creating OpenSearch index..."
bash scripts/setup-index.sh

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "  1. Start the API:  npm run dev:api"
echo "  2. Start the ETL:  npm run dev:etl"
echo ""
echo "Or use Docker:"
echo "  docker-compose up -d api etl"
echo ""
echo "API will be available at: http://localhost:3000"
echo "Health check: http://localhost:3000/health"