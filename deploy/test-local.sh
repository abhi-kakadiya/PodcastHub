#!/bin/bash

# ========================================
# Local Development Testing Script
# ========================================
# This script helps test your application locally before deployment

set -e

echo "🧪 PodcastHub Local Testing Script"
echo "===================================="
echo ""

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Function to print test result
test_result() {
    if [ $1 -eq 0 ]; then
        echo -e "${GREEN}✓ PASS${NC}: $2"
        ((TESTS_PASSED++))
    else
        echo -e "${RED}✗ FAIL${NC}: $2"
        ((TESTS_FAILED++))
    fi
}

echo "Phase 1: Infrastructure Services"
echo "---------------------------------"

# Test Docker
echo -n "Checking Docker... "
if command -v docker &> /dev/null; then
    test_result 0 "Docker is installed"
else
    test_result 1 "Docker is not installed"
fi

# Test Docker Compose
echo -n "Checking Docker Compose... "
if command -v docker-compose &> /dev/null; then
    test_result 0 "Docker Compose is installed"
else
    test_result 1 "Docker Compose is not installed"
fi

# Check if services are running
echo -n "Checking RabbitMQ... "
if curl -s http://localhost:15672 > /dev/null 2>&1; then
    test_result 0 "RabbitMQ is running"
else
    test_result 1 "RabbitMQ is not accessible (start with: docker-compose up -d)"
fi

echo -n "Checking MinIO... "
if curl -s http://localhost:9000/minio/health/live > /dev/null 2>&1; then
    test_result 0 "MinIO is running"
else
    test_result 1 "MinIO is not accessible"
fi

echo -n "Checking PostgreSQL... "
if nc -z localhost 5432 2>&1 | grep -q succeeded || nc -z localhost 5432 > /dev/null 2>&1; then
    test_result 0 "PostgreSQL is running"
else
    test_result 1 "PostgreSQL is not accessible"
fi

echo -n "Checking Redis... "
if nc -z localhost 6379 2>&1 | grep -q succeeded || nc -z localhost 6379 > /dev/null 2>&1; then
    test_result 0 "Redis is running"
else
    test_result 1 "Redis is not accessible"
fi

echo ""
echo "Phase 2: Backend Service"
echo "------------------------"

echo -n "Checking Backend Health... "
HEALTH_RESPONSE=$(curl -s http://localhost:8001/health 2>&1)
if echo "$HEALTH_RESPONSE" | grep -q "healthy"; then
    test_result 0 "Backend is healthy"
else
    test_result 1 "Backend is not responding (start with: cd media-recording-service && python main.py)"
fi

echo -n "Checking WebSocket Endpoint... "
WS_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:8001/ws/test-session 2>&1)
if [ "$WS_RESPONSE" = "403" ] || [ "$WS_RESPONSE" = "400" ]; then
    test_result 0 "WebSocket endpoint exists"
else
    test_result 1 "WebSocket endpoint not accessible (got HTTP $WS_RESPONSE)"
fi

echo ""
echo "Phase 3: Frontend Service"
echo "-------------------------"

echo -n "Checking Node.js... "
if command -v node &> /dev/null; then
    NODE_VERSION=$(node --version)
    test_result 0 "Node.js is installed ($NODE_VERSION)"
else
    test_result 1 "Node.js is not installed"
fi

echo -n "Checking Frontend... "
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000 2>&1)
if [ "$FRONTEND_RESPONSE" = "200" ]; then
    test_result 0 "Frontend is accessible"
else
    test_result 1 "Frontend is not accessible (start with: cd podcast-frontend && npm run dev)"
fi

echo ""
echo "Phase 4: Environment Configuration"
echo "-----------------------------------"

echo -n "Checking Backend .env... "
if [ -f "media-recording-service/.env" ]; then
    test_result 0 "Backend .env file exists"
else
    test_result 1 "Backend .env file missing (copy from .env.example)"
fi

echo -n "Checking Frontend .env... "
if [ -f "podcast-frontend/.env.local" ]; then
    test_result 0 "Frontend .env.local file exists"
else
    test_result 1 "Frontend .env.local file missing (copy from .env.example)"
fi

echo ""
echo "========================================="
echo "Test Results"
echo "========================================="
echo -e "${GREEN}Passed: $TESTS_PASSED${NC}"
echo -e "${RED}Failed: $TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}🎉 All tests passed! Your local environment is ready.${NC}"
    echo ""
    echo "Next steps:"
    echo "1. Open http://localhost:3000 in your browser"
    echo "2. Create a new session"
    echo "3. Open http://localhost:3000 in an incognito window"
    echo "4. Join the session with the session ID"
    echo "5. Verify P2P connection works"
    exit 0
else
    echo -e "${RED}⚠️  Some tests failed. Please fix the issues above.${NC}"
    echo ""
    echo "Common fixes:"
    echo "- Start Docker services: docker-compose up -d"
    echo "- Start Backend: cd media-recording-service && python main.py"
    echo "- Start Frontend: cd podcast-frontend && npm run dev"
    echo "- Copy environment files:"
    echo "  cp media-recording-service/.env.example media-recording-service/.env"
    echo "  cp podcast-frontend/.env.example podcast-frontend/.env.local"
    exit 1
fi
