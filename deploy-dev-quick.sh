#!/bin/bash

set -e

# ====================================
# Quick Dev Deployment Script
# ====================================

SSH_KEY="blog-lecture.pem"
EC2_USER="ec2-user"
EC2_HOST="54.213.12.192"

echo "🚀 Quick deployment to DEV..."
echo ""

# Build for dev
npm run build -- --configuration=dev

# Deploy
scp -i "$SSH_KEY" -r dist/tunesbasis "${EC2_USER}@${EC2_HOST}:/home/ec2-user/"

# Restart nginx
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" "sudo systemctl restart nginx"

echo ""
echo "✅ Dev deployment complete!"
echo "🌐 Frontend: https://tunesbasis.com"
echo "📍 API: https://bl18uj24nb.execute-api.us-west-2.amazonaws.com"
echo "☁️  CDN: https://dhqgiy9k3x870.cloudfront.net"
