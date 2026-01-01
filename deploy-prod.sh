#!/bin/bash

set -e

# ====================================
# Production Deployment Script
# ====================================

SSH_KEY="blog-lecture.pem"
EC2_USER="ec2-user"
EC2_HOST="54.213.12.192"

echo "🚀 Deploying to PRODUCTION..."
echo ""

# Build for production
npm run build -- --configuration=production

# Deploy
scp -i "$SSH_KEY" -r dist/tunesbasis "${EC2_USER}@${EC2_HOST}:/home/ec2-user/"

# Restart nginx
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" "sudo systemctl restart nginx"

echo ""
echo "✅ Production deployment complete!"
echo "🌐 Access at: http://${EC2_HOST}"
