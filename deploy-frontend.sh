#!/bin/bash

set -e  # Exit on error

# ====================================
# Frontend Deployment Script
# ====================================

# Configuration
SSH_KEY="blog-lecture.pem"
EC2_USER="ec2-user"
EC2_HOST="54.213.12.192"
BUILD_CONFIG="dev"  # Options: dev, production
DIST_PATH="dist/tunesbasis"

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}🚀 TunesBasis Frontend Deployment${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Validate SSH key exists
if [ ! -f "$SSH_KEY" ]; then
    echo -e "${RED}❌ SSH key not found: $SSH_KEY${NC}"
    echo -e "${YELLOW}💡 Please ensure your SSH key is in the current directory${NC}"
    exit 1
fi

# Step 1: Clean previous build
echo -e "${YELLOW}🧹 Cleaning previous build...${NC}"
rm -rf $DIST_PATH
echo -e "${GREEN}✅ Clean complete${NC}"
echo ""

# Step 2: Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Step 3: Build for specified environment
echo -e "${YELLOW}🔨 Building frontend (configuration: ${BUILD_CONFIG})...${NC}"
if [ "$BUILD_CONFIG" = "production" ]; then
    npm run build -- --configuration=production
elif [ "$BUILD_CONFIG" = "dev" ]; then
    npm run build -- --configuration=dev
else
    npm run build
fi

# Verify build output exists
if [ ! -d "$DIST_PATH" ]; then
    echo -e "${RED}❌ Build failed - output directory not found: $DIST_PATH${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build complete${NC}"
echo ""

# Step 4: Display build info
BUILD_SIZE=$(du -sh $DIST_PATH | cut -f1)
FILE_COUNT=$(find $DIST_PATH -type f | wc -l | tr -d ' ')
echo -e "${BLUE}📊 Build Info:${NC}"
echo -e "   Size: ${BUILD_SIZE}"
echo -e "   Files: ${FILE_COUNT}"
echo ""

# Step 5: Test SSH connection
echo -e "${YELLOW}🔗 Testing SSH connection to ${EC2_HOST}...${NC}"
if ! ssh -i "$SSH_KEY" -o ConnectTimeout=5 -o StrictHostKeyChecking=no "${EC2_USER}@${EC2_HOST}" "echo 'SSH connection successful'" > /dev/null 2>&1; then
    echo -e "${RED}❌ Cannot connect to EC2 instance${NC}"
    echo -e "${YELLOW}💡 Please check:${NC}"
    echo -e "   - SSH key permissions: chmod 400 $SSH_KEY"
    echo -e "   - EC2 instance is running"
    echo -e "   - Security group allows SSH from your IP"
    exit 1
fi
echo -e "${GREEN}✅ SSH connection verified${NC}"
echo ""

# Step 6: Backup existing deployment (optional)
echo -e "${YELLOW}💾 Creating backup of existing deployment...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" "
    if [ -d /home/ec2-user/tunesbasis ]; then
        BACKUP_NAME=tunesbasis-backup-\$(date +%Y%m%d-%H%M%S)
        mv /home/ec2-user/tunesbasis /home/ec2-user/\$BACKUP_NAME
        echo 'Backup created: '\$BACKUP_NAME
        # Keep only last 3 backups
        cd /home/ec2-user
        ls -t | grep tunesbasis-backup | tail -n +4 | xargs -r rm -rf
    else
        echo 'No existing deployment to backup'
    fi
"
echo -e "${GREEN}✅ Backup complete${NC}"
echo ""

# Step 7: Upload files to EC2
echo -e "${YELLOW}📤 Uploading files to EC2...${NC}"
scp -i "$SSH_KEY" -r "$DIST_PATH" "${EC2_USER}@${EC2_HOST}:/home/ec2-user/"
echo -e "${GREEN}✅ Upload complete${NC}"
echo ""

# Step 8: Set up nginx/web server (if needed)
echo -e "${YELLOW}⚙️  Configuring web server...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" "
    # Check if nginx is installed
    if ! command -v nginx &> /dev/null; then
        echo 'Installing nginx...'
        sudo yum install -y nginx
    fi

    # Create nginx config for Angular app
    sudo tee /etc/nginx/conf.d/tunesbasis.conf > /dev/null <<'EOF'
server {
    listen 80;
    server_name _;
    root /home/ec2-user/tunesbasis;
    index index.html;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control \"public, immutable\";
    }

    # Angular routing - always serve index.html for app routes
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options \"SAMEORIGIN\" always;
    add_header X-Content-Type-Options \"nosniff\" always;
    add_header X-XSS-Protection \"1; mode=block\" always;
}
EOF

    # Start and enable nginx
    sudo systemctl enable nginx
    sudo systemctl restart nginx

    echo 'Nginx configured and started'
"
echo -e "${GREEN}✅ Web server configured${NC}"
echo ""

# Step 9: Display deployment summary
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}📍 Deployment Info:${NC}"
echo -e "   Environment: ${BUILD_CONFIG}"
echo -e "   Build Size: ${BUILD_SIZE}"
echo -e "   Files Deployed: ${FILE_COUNT}"
echo ""
echo -e "${BLUE}🌐 Access Points:${NC}"
echo -e "   Frontend URL: http://${EC2_HOST}"
echo -e "   API Endpoint: https://bl18uj24nb.execute-api.us-west-2.amazonaws.com"
echo -e "   CloudFront CDN: https://dhqgiy9k3x870.cloudfront.net"
echo ""
echo -e "${YELLOW}💡 Next Steps:${NC}"
echo -e "   1. Open http://${EC2_HOST} in your browser"
echo -e "   2. Test the application"
echo -e "   3. Check browser console for any errors"
echo ""
echo -e "${YELLOW}🔧 Useful Commands:${NC}"
echo -e "   View nginx logs:    ssh -i $SSH_KEY ${EC2_USER}@${EC2_HOST} 'sudo tail -f /var/log/nginx/error.log'"
echo -e "   Restart nginx:      ssh -i $SSH_KEY ${EC2_USER}@${EC2_HOST} 'sudo systemctl restart nginx'"
echo -e "   SSH to server:      ssh -i $SSH_KEY ${EC2_USER}@${EC2_HOST}"
echo ""
