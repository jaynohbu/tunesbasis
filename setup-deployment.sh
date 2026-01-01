#!/bin/bash

# ====================================
# Deployment Setup Script
# Run this once to set up deployment
# ====================================

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}🔧 TunesBasis Deployment Setup${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check if SSH key exists
if [ -f "blog-lecture.pem" ]; then
    echo -e "${GREEN}✅ SSH key found: blog-lecture.pem${NC}"
else
    echo -e "${YELLOW}⚠️  SSH key not found${NC}"
    echo -e "${BLUE}Please provide the path to your SSH key:${NC}"
    read -p "Path to SSH key: " SSH_KEY_PATH

    if [ -f "$SSH_KEY_PATH" ]; then
        cp "$SSH_KEY_PATH" blog-lecture.pem
        echo -e "${GREEN}✅ SSH key copied to blog-lecture.pem${NC}"
    else
        echo -e "${RED}❌ SSH key not found at: $SSH_KEY_PATH${NC}"
        exit 1
    fi
fi

# Set correct permissions
echo -e "${YELLOW}🔐 Setting SSH key permissions...${NC}"
chmod 400 blog-lecture.pem
echo -e "${GREEN}✅ SSH key permissions set to 400${NC}"
echo ""

# Make deployment scripts executable
echo -e "${YELLOW}🔧 Making deployment scripts executable...${NC}"
chmod +x deploy-frontend.sh deploy-dev-quick.sh deploy-prod.sh
echo -e "${GREEN}✅ Deployment scripts are executable${NC}"
echo ""

# Test SSH connection
echo -e "${YELLOW}🔗 Testing SSH connection...${NC}"
EC2_HOST="54.213.12.192"
if ssh -i blog-lecture.pem -o ConnectTimeout=5 -o StrictHostKeyChecking=no "ec2-user@${EC2_HOST}" "echo 'Connection successful'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect to EC2 instance${NC}"
    echo -e "${YELLOW}Please check:${NC}"
    echo -e "   - EC2 instance is running"
    echo -e "   - Security group allows SSH from your IP"
    echo -e "   - SSH key is correct"
    exit 1
fi
echo ""

# Install dependencies
echo -e "${YELLOW}📦 Installing dependencies...${NC}"
npm install
echo -e "${GREEN}✅ Dependencies installed${NC}"
echo ""

# Build once to verify
echo -e "${YELLOW}🔨 Running test build...${NC}"
npm run build:dev
echo -e "${GREEN}✅ Test build successful${NC}"
echo ""

# Summary
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN}✅ Setup Complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""
echo -e "${BLUE}📍 You're all set to deploy!${NC}"
echo ""
echo -e "${YELLOW}Quick Commands:${NC}"
echo -e "   Deploy to dev:     ${GREEN}npm run deploy:dev${NC}"
echo -e "   Deploy to prod:    ${GREEN}npm run deploy:prod${NC}"
echo -e "   Full deployment:   ${GREEN}npm run deploy:full${NC}"
echo ""
echo -e "${YELLOW}Access Points:${NC}"
echo -e "   Frontend:          ${GREEN}http://${EC2_HOST}${NC}"
echo -e "   API:               ${GREEN}https://bl18uj24nb.execute-api.us-west-2.amazonaws.com${NC}"
echo -e "   CDN:               ${GREEN}https://dhqgiy9k3x870.cloudfront.net${NC}"
echo ""
echo -e "${BLUE}📚 Documentation:${NC}"
echo -e "   Quick Reference:   ${GREEN}cat DEPLOYMENT-SUMMARY.md${NC}"
echo -e "   Full Guide:        ${GREEN}cat DEPLOYMENT.md${NC}"
echo ""
