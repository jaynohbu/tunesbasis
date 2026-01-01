#!/bin/bash

set -e

# ====================================
# SSL Certificate Renewal Script
# ====================================

SSH_KEY="blog-lecture.pem"
EC2_USER="ec2-user"
EC2_HOST="54.213.12.192"

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}🔒 SSL Certificate Renewal${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check current certificate
echo -e "${YELLOW}📋 Current certificate status:${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" 'sudo certbot certificates'
echo ""

# Ask for confirmation
read -p "Do you want to renew the certificate now? (y/n): " CONFIRM
if [ "$CONFIRM" != "y" ]; then
    echo "Renewal cancelled"
    exit 0
fi

echo ""
echo -e "${YELLOW}🔄 Renewing SSL certificate...${NC}"

# Stop nginx, renew, start nginx
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
set -e

echo "Stopping nginx..."
sudo systemctl stop nginx

echo "Renewing certificate..."
sudo certbot certonly --standalone --force-renewal \
  -d tunesbasis.com -d www.tunesbasis.com \
  --non-interactive

echo "Starting nginx..."
sudo systemctl start nginx

echo "Verifying nginx is running..."
sudo systemctl status nginx --no-pager | head -10
EOF

echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ SSL Certificate Renewed!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

# Show new certificate info
echo -e "${BLUE}📋 New certificate info:${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" 'sudo certbot certificates'
echo ""

# Test HTTPS
echo -e "${YELLOW}🧪 Testing HTTPS...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "https://tunesbasis.com" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTPS working (200 OK)${NC}"
else
    echo -e "${RED}❌ HTTPS not working (${HTTP_CODE})${NC}"
fi
echo ""

echo -e "${BLUE}🌐 Your site: ${GREEN}https://tunesbasis.com${NC}"
echo ""
echo -e "${YELLOW}💡 Certificate will auto-renew in ~60 days${NC}"
echo -e "${YELLOW}   Run this script again if you see expiry warnings${NC}"
echo ""
