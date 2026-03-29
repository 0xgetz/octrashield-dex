#!/bin/bash
#
# Test Runner for Mock OctraShield SDK Packages
# 
# This script builds the mock packages and runs the test suite to verify
# everything works correctly.
#
# Usage:
#   ./scripts/test-mock.sh          # Build and run all tests
#   ./scripts/test-mock.sh --no-build  # Skip build, only run tests
#   ./scripts/test-mock.sh --examples  # Also run example scripts
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Script directory (project root)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Flags
BUILD=true
RUN_EXAMPLES=false

# Parse arguments
for arg in "$@"; do
  case $arg in
    --no-build)
      BUILD=false
      shift
      ;;
    --examples)
      RUN_EXAMPLES=true
      shift
      ;;
    --help|-h)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  --no-build    Skip building mock packages"
      echo "  --examples    Also run example scripts"
      echo "  --help, -h    Show this help message"
      exit 0
      ;;
  esac
done

# Print banner
echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║     OctraShield Mock SDK - Test Runner                      ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""

# Function to print section headers
print_header() {
  echo ""
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo -e "${BLUE} $1${NC}"
  echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
  echo ""
}

# Function to print success
print_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

# Function to print error
print_error() {
  echo -e "${RED}✗ $1${NC}"
}

# Function to print info
print_info() {
  echo -e "${YELLOW}→ $1${NC}"
}

# Check for required tools
print_info "Checking prerequisites..."

if ! command -v node &> /dev/null; then
  print_error "Node.js is not installed"
  exit 1
fi

if ! command -v pnpm &> /dev/null; then
  print_error "pnpm is not installed"
  echo "  Install with: npm install -g pnpm"
  exit 1
fi

if ! command -v npx &> /dev/null; then
  print_error "npx is not available"
  exit 1
fi

print_success "All prerequisites met"

# Build mock packages
if [ "$BUILD" = true ]; then
  print_header "Building Mock Packages"
  
  cd "$PROJECT_ROOT"
  
  print_info "Installing dependencies..."
  pnpm install --no-frozen-lockfile 2>&1 | tail -5
  
  print_info "Building mock-octra-hfhe..."
  cd "$PROJECT_ROOT/mock-octra-hfhe"
  pnpm build
  print_success "mock-octra-hfhe built successfully"
  
  print_info "Building mock-octra-sdk..."
  cd "$PROJECT_ROOT/mock-octra-sdk"
  pnpm build
  print_success "mock-octra-sdk built successfully"
  
  print_success "All mock packages built"
else
  print_info "Skipping build (--no-build flag set)"
fi

# Run comprehensive tests
print_header "Running Comprehensive Tests"

cd "$PROJECT_ROOT"

print_info "Running test-mock-implementation.ts..."
if npx tsx examples/test-mock-implementation.ts; then
  print_success "All tests passed"
else
  print_error "Tests failed"
  exit 1
fi

# Run example scripts if requested
if [ "$RUN_EXAMPLES" = true ]; then
  print_header "Running Example Scripts"
  
  print_info "Running swap-flow-example.ts..."
  if npx tsx examples/swap-flow-example.ts; then
    print_success "Swap flow example completed"
  else
    print_error "Swap flow example failed"
    exit 1
  fi
fi

# Summary
print_header "Test Summary"

echo -e "${GREEN}All tests completed successfully!${NC}"
echo ""
echo "Mock packages are ready for use:"
echo "  - mock-octra-hfhe: Homomorphic encryption mock"
echo "  - mock-octra-sdk:  Full SDK mock with all clients"
echo ""
echo "Quick start:"
echo "  import { generateKeyPair, encrypt, decrypt } from 'mock-octra-hfhe';"
echo "  import { MockTransactionBuilder, MockFactoryClient } from 'mock-octra-sdk';"
echo ""
echo "For more examples, see:"
echo "  - examples/test-mock-implementation.ts (comprehensive tests)"
echo "  - examples/swap-flow-example.ts (complete swap flow)"
echo "  - examples/mock-sdk-usage.ts (integration patterns)"
echo ""

exit 0
