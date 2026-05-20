#!/bin/bash
# Run this once on a fresh DigitalOcean droplet
set -e

echo "=== minicli DO setup ==="

# Install PM2 globally
npm install -g pm2

# Install project dependencies
npm install

# Build TypeScript
npm run build

# Copy env template
if [ ! -f .env ]; then
  cp .env.example .env
  echo ""
  echo "Created .env from template."
  echo "Edit .env with your credentials, then run:"
  echo "  pm2 start ecosystem.config.cjs"
  echo "  pm2 save && pm2 startup"
else
  echo ".env already exists."
fi

echo ""
echo "Setup complete!"
