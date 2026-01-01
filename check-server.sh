#!/bin/bash

# ====================================
# Server Health Check Script
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
echo -e "${BLUE}🔍 TunesBasis Server Health Check${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

# Check SSH connection
echo -e "${YELLOW}1. Checking SSH connection...${NC}"
if ssh -i "$SSH_KEY" -o ConnectTimeout=5 "${EC2_USER}@${EC2_HOST}" "echo 'Connected'" 2>/dev/null; then
    echo -e "${GREEN}✅ SSH connection successful${NC}"
else
    echo -e "${RED}❌ Cannot connect via SSH${NC}"
    exit 1
fi
echo ""

# Check server status
echo -e "${YELLOW}2. Checking server status...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
echo "Hostname: $(hostname)"
echo "Uptime: $(uptime)"
echo "Disk Usage:"
df -h | grep -E '^/dev/|Filesystem'
echo ""
EOF

# Check nginx status
echo -e "${YELLOW}3. Checking nginx status...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
if sudo systemctl is-active --quiet nginx; then
    echo -e "✅ Nginx is running"
    echo "Nginx version: $(nginx -v 2>&1)"
else
    echo -e "❌ Nginx is not running"
    echo "Trying to start nginx..."
    sudo systemctl start nginx
    if sudo systemctl is-active --quiet nginx; then
        echo "✅ Nginx started successfully"
    else
        echo "❌ Failed to start nginx"
        echo "Error logs:"
        sudo journalctl -u nginx -n 20 --no-pager
    fi
fi
echo ""
EOF

# Check nginx configuration
echo -e "${YELLOW}4. Checking nginx configuration...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
if sudo nginx -t 2>&1; then
    echo "✅ Nginx configuration is valid"
else
    echo "❌ Nginx configuration has errors"
fi
echo ""

echo "Current nginx config:"
sudo cat /etc/nginx/conf.d/tunesbasis.conf 2>/dev/null || echo "No tunesbasis config found"
echo ""
EOF

# Check SSL certificates
echo -e "${YELLOW}5. Checking SSL certificates...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
if [ -d "/etc/letsencrypt/live" ]; then
    echo "Let's Encrypt certificates:"
    sudo ls -la /etc/letsencrypt/live/
elif [ -f "/etc/nginx/ssl/tunesbasis.crt" ]; then
    echo "Self-signed certificate found"
    sudo openssl x509 -in /etc/nginx/ssl/tunesbasis.crt -noout -dates
else
    echo "❌ No SSL certificates found"
fi
echo ""
EOF

# Check deployed files
echo -e "${YELLOW}6. Checking deployed files...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
if [ -d "/home/ec2-user/tunesbasis" ]; then
    echo "✅ Frontend files found"
    echo "Files: $(find /home/ec2-user/tunesbasis -type f | wc -l)"
    echo "Size: $(du -sh /home/ec2-user/tunesbasis | cut -f1)"
    echo "Last modified: $(stat -c %y /home/ec2-user/tunesbasis/index.html 2>/dev/null || stat -f %Sm /home/ec2-user/tunesbasis/index.html 2>/dev/null)"
else
    echo "❌ No frontend files found"
fi
echo ""
EOF

# Check open ports
echo -e "${YELLOW}7. Checking open ports...${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
echo "Listening ports:"
sudo netstat -tlnp | grep nginx || sudo ss -tlnp | grep nginx
echo ""
EOF

# Test HTTP connection
echo -e "${YELLOW}8. Testing HTTP connection...${NC}"
HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" "http://${EC2_HOST}" 2>/dev/null || echo "000")
if [ "$HTTP_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTP working (200 OK)${NC}"
elif [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${YELLOW}⚠️  HTTP redirecting (${HTTP_CODE}) - probably to HTTPS${NC}"
else
    echo -e "${RED}❌ HTTP not working (${HTTP_CODE})${NC}"
fi
echo ""

# Test HTTPS connection
echo -e "${YELLOW}9. Testing HTTPS connection...${NC}"
HTTPS_CODE=$(curl -s -k -o /dev/null -w "%{http_code}" "https://${EC2_HOST}" 2>/dev/null || echo "000")
if [ "$HTTPS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ HTTPS working (200 OK)${NC}"
elif [ "$HTTPS_CODE" = "000" ]; then
    echo -e "${RED}❌ HTTPS not configured or not working${NC}"
else
    echo -e "${YELLOW}⚠️  HTTPS response: ${HTTPS_CODE}${NC}"
fi
echo ""

# Check nginx error logs
echo -e "${YELLOW}10. Recent nginx errors:${NC}"
ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
if [ -f "/var/log/nginx/error.log" ]; then
    echo "Last 10 error log entries:"
    sudo tail -n 10 /var/log/nginx/error.log
else
    echo "No error log found"
fi
EOF
echo ""

# Summary
echo -e "${BLUE}=====================================${NC}"
echo -e "${BLUE}📊 Summary${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""
echo -e "${BLUE}Access URLs:${NC}"
echo -e "   HTTP:  http://${EC2_HOST}  ${YELLOW}(Status: ${HTTP_CODE})${NC}"
echo -e "   HTTPS: https://${EC2_HOST} ${YELLOW}(Status: ${HTTPS_CODE})${NC}"
echo ""

if [ "$HTTP_CODE" = "200" ] || [ "$HTTPS_CODE" = "200" ]; then
    echo -e "${GREEN}✅ Server is accessible${NC}"
elif [ "$HTTP_CODE" = "301" ] || [ "$HTTP_CODE" = "302" ]; then
    echo -e "${YELLOW}⚠️  Server redirecting to HTTPS${NC}"
    if [ "$HTTPS_CODE" != "200" ]; then
        echo -e "${RED}   But HTTPS is not working!${NC}"
        echo -e "${YELLOW}   Run: ./setup-https.sh${NC}"
    fi
else
    echo -e "${RED}❌ Server is not accessible${NC}"
    echo -e "${YELLOW}💡 Suggestions:${NC}"
    echo -e "   1. Check EC2 security group allows ports 80 and 443"
    echo -e "   2. Check nginx is running: ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'sudo systemctl status nginx'"
    echo -e "   3. Check nginx logs: ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'sudo tail -f /var/log/nginx/error.log'"
fi
echo ""
