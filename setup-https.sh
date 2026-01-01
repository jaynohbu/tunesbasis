#!/bin/bash

set -e

# ====================================
# HTTPS Setup Script for EC2
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
echo -e "${BLUE}🔒 HTTPS Setup for TunesBasis${NC}"
echo -e "${BLUE}=====================================${NC}"
echo ""

echo -e "${YELLOW}Do you have a domain name pointing to this server?${NC}"
echo -e "${BLUE}1) Yes - I have a domain (e.g., tunesbasis.com)${NC}"
echo -e "${BLUE}2) No - Use self-signed certificate (for testing)${NC}"
echo ""
read -p "Enter choice (1 or 2): " CHOICE

if [ "$CHOICE" = "1" ]; then
    # Let's Encrypt with domain
    read -p "Enter your domain name (e.g., tunesbasis.com): " DOMAIN
    read -p "Enter your email for Let's Encrypt: " EMAIL

    echo ""
    echo -e "${YELLOW}📦 Setting up Let's Encrypt SSL...${NC}"

    ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<EOF
set -e

echo "Installing certbot..."
sudo yum install -y certbot python3-certbot-nginx

echo "Stopping nginx temporarily..."
sudo systemctl stop nginx

echo "Obtaining SSL certificate..."
sudo certbot certonly --standalone \
  --non-interactive \
  --agree-tos \
  --email ${EMAIL} \
  -d ${DOMAIN}

echo "Configuring nginx with SSL..."
sudo tee /etc/nginx/conf.d/tunesbasis.conf > /dev/null <<'NGINX_EOF'
# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name ${DOMAIN};
    return 301 https://\$server_name\$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name ${DOMAIN};

    root /home/ec2-user/tunesbasis;
    index index.html;

    # SSL Configuration
    ssl_certificate /etc/letsencrypt/live/${DOMAIN}/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/${DOMAIN}/privkey.pem;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Angular routing
    location / {
        try_files \$uri \$uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
}
NGINX_EOF

echo "Setting up auto-renewal..."
sudo systemctl enable certbot-renew.timer
sudo systemctl start certbot-renew.timer

echo "Starting nginx..."
sudo systemctl start nginx
sudo systemctl enable nginx

echo "Testing nginx configuration..."
sudo nginx -t
EOF

    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}✅ HTTPS Setup Complete!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo -e "   Frontend (HTTPS): ${GREEN}https://${DOMAIN}${NC}"
    echo -e "   Frontend (HTTP):  ${YELLOW}http://${DOMAIN}${NC} ${BLUE}(redirects to HTTPS)${NC}"
    echo ""
    echo -e "${YELLOW}💡 SSL Certificate auto-renews every 60 days${NC}"

elif [ "$CHOICE" = "2" ]; then
    # Self-signed certificate
    echo ""
    echo -e "${YELLOW}📦 Setting up self-signed SSL certificate...${NC}"
    echo -e "${YELLOW}⚠️  This is for TESTING only - browsers will show a warning${NC}"

    ssh -i "$SSH_KEY" "${EC2_USER}@${EC2_HOST}" bash <<'EOF'
set -e

echo "Creating self-signed certificate..."
sudo mkdir -p /etc/nginx/ssl
sudo openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
  -keyout /etc/nginx/ssl/tunesbasis.key \
  -out /etc/nginx/ssl/tunesbasis.crt \
  -subj "/C=US/ST=State/L=City/O=TunesBasis/CN=54.213.12.192"

echo "Configuring nginx with SSL..."
sudo tee /etc/nginx/conf.d/tunesbasis.conf > /dev/null <<'NGINX_EOF'
# HTTP - Redirect to HTTPS
server {
    listen 80;
    server_name _;
    return 301 https://$host$request_uri;
}

# HTTPS
server {
    listen 443 ssl http2;
    server_name _;

    root /home/ec2-user/tunesbasis;
    index index.html;

    # SSL Configuration (Self-Signed)
    ssl_certificate /etc/nginx/ssl/tunesbasis.crt;
    ssl_certificate_key /etc/nginx/ssl/tunesbasis.key;

    # SSL Security
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    # Gzip compression
    gzip on;
    gzip_types text/css application/javascript application/json;
    gzip_min_length 1000;

    # Cache static assets
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # Angular routing
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
}
NGINX_EOF

echo "Restarting nginx..."
sudo systemctl restart nginx
sudo systemctl enable nginx

echo "Testing nginx configuration..."
sudo nginx -t
EOF

    echo ""
    echo -e "${GREEN}=====================================${NC}"
    echo -e "${GREEN}✅ Self-Signed HTTPS Setup Complete!${NC}"
    echo -e "${GREEN}=====================================${NC}"
    echo ""
    echo -e "${BLUE}🌐 Access Points:${NC}"
    echo -e "   Frontend (HTTPS): ${GREEN}https://${EC2_HOST}${NC}"
    echo -e "   Frontend (HTTP):  ${YELLOW}http://${EC2_HOST}${NC} ${BLUE}(redirects to HTTPS)${NC}"
    echo ""
    echo -e "${YELLOW}⚠️  Browser Warning:${NC}"
    echo -e "   Your browser will show a security warning"
    echo -e "   This is normal for self-signed certificates"
    echo -e "   ${BLUE}Click 'Advanced' → 'Proceed anyway'${NC}"
    echo ""
    echo -e "${YELLOW}💡 For production, use option 1 with a real domain${NC}"

else
    echo -e "${RED}Invalid choice${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}🔧 Troubleshooting:${NC}"
echo -e "   View nginx logs:   ${GREEN}ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'sudo tail -f /var/log/nginx/error.log'${NC}"
echo -e "   Restart nginx:     ${GREEN}ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'sudo systemctl restart nginx'${NC}"
echo -e "   Check SSL:         ${GREEN}ssh -i ${SSH_KEY} ${EC2_USER}@${EC2_HOST} 'sudo nginx -t'${NC}"
echo ""
