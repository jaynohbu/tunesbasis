# 🔒 HTTPS Setup Guide

## Problem: Can't Access HTTPS Anymore

If you previously had HTTPS working but it stopped, here's how to fix it.

---

## 🔍 Step 1: Check Current Status

Run the health check script:

```bash
./check-server.sh
```

This will show you:
- ✅ SSH connection status
- ✅ Nginx status
- ✅ SSL certificate status
- ✅ HTTP/HTTPS accessibility
- ✅ Recent error logs

---

## 🔧 Step 2: Fix HTTPS

### Option A: You Have a Domain Name

If you have a domain pointing to your EC2 instance:

```bash
./setup-https.sh
# Choose option 1
# Enter your domain: tunesbasis.com
# Enter your email: your@email.com
```

This will:
- Install Let's Encrypt (free SSL)
- Configure nginx with SSL
- Set up auto-renewal
- Redirect HTTP → HTTPS

### Option B: No Domain (Testing Only)

For development/testing without a domain:

```bash
./setup-https.sh
# Choose option 2
```

This will:
- Create self-signed certificate
- Configure nginx with SSL
- Redirect HTTP → HTTPS

**Note**: Browsers will show a security warning (normal for self-signed certs)

---

## 🚨 Common Issues & Fixes

### Issue 1: Port 443 Not Open

**Symptom**: `curl: (7) Failed to connect to 54.213.12.192 port 443`

**Fix**: Add HTTPS to EC2 security group

```bash
# AWS Console:
1. Go to EC2 → Security Groups
2. Find your security group
3. Add Inbound Rule:
   - Type: HTTPS
   - Protocol: TCP
   - Port: 443
   - Source: 0.0.0.0/0 (or your IP)
```

Or use AWS CLI:

```bash
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxxx \
  --protocol tcp \
  --port 443 \
  --cidr 0.0.0.0/0
```

### Issue 2: Nginx Not Running

**Symptom**: Connection refused

**Fix**:

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo systemctl start nginx
sudo systemctl enable nginx
```

### Issue 3: SSL Certificate Expired

**Symptom**: Certificate expired error

**Fix** (Let's Encrypt):

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo certbot renew
sudo systemctl restart nginx
```

**Fix** (Self-signed):

```bash
# Re-run setup script
./setup-https.sh
# Choose option 2
```

### Issue 4: Nginx Configuration Error

**Symptom**: Nginx won't start, shows config error

**Fix**:

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192

# Check configuration
sudo nginx -t

# View error log
sudo tail -f /var/log/nginx/error.log

# Reset configuration
./setup-https.sh
```

---

## 📊 Verify HTTPS is Working

### Test from Command Line

```bash
# Test HTTP (should redirect to HTTPS)
curl -I http://54.213.12.192

# Test HTTPS
curl -I https://54.213.12.192

# Test with domain (if you have one)
curl -I https://your-domain.com
```

### Test in Browser

1. Open: `https://54.213.12.192` (or your domain)
2. Check for:
   - 🔒 Lock icon in address bar
   - ✅ "Secure" label
   - ✅ Page loads correctly

**If using self-signed certificate**:
- Click "Advanced" when you see the warning
- Click "Proceed to 54.213.12.192 (unsafe)"

---

## 🔄 Certificate Auto-Renewal

### Let's Encrypt (Automatic)

Let's Encrypt certificates auto-renew every 60 days.

Check renewal status:

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo certbot certificates
sudo systemctl status certbot-renew.timer
```

Test renewal (dry run):

```bash
sudo certbot renew --dry-run
```

### Self-Signed (Manual)

Self-signed certificates expire after 1 year.

To renew:

```bash
./setup-https.sh
# Choose option 2
```

---

## 🎯 Quick Commands

```bash
# Check server status
./check-server.sh

# Setup HTTPS
./setup-https.sh

# View nginx logs
ssh -i blog-lecture.pem ec2-user@54.213.12.192 \
  'sudo tail -f /var/log/nginx/error.log'

# Restart nginx
ssh -i blog-lecture.pem ec2-user@54.213.12.192 \
  'sudo systemctl restart nginx'

# Check SSL certificate
ssh -i blog-lecture.pem ec2-user@54.213.12.192 \
  'sudo certbot certificates'

# Renew SSL certificate
ssh -i blog-lecture.pem ec2-user@54.213.12.192 \
  'sudo certbot renew && sudo systemctl restart nginx'
```

---

## 🌐 Update Frontend Environment

If you change from HTTP to HTTPS, update your environment:

### For Domain with Let's Encrypt

```typescript
// src/environments/environment.dev.ts
export const environment = {
  production: false,
  apiBaseUrl: 'https://bl18uj24nb.execute-api.us-west-2.amazonaws.com',
  cdnBaseUrl: 'https://dhqgiy9k3x870.cloudfront.net',
  frontendUrl: 'https://your-domain.com'  // Add this
};
```

### For IP with Self-Signed

```typescript
// src/environments/environment.dev.ts
export const environment = {
  production: false,
  apiBaseUrl: 'https://bl18uj24nb.execute-api.us-west-2.amazonaws.com',
  cdnBaseUrl: 'https://dhqgiy9k3x870.cloudfront.net',
  frontendUrl: 'https://54.213.12.192'  // Add this
};
```

Then redeploy:

```bash
npm run deploy:dev
```

---

## 🔐 Security Best Practices

### 1. Use a Real Domain

Self-signed certificates are for testing only. For production:

1. Register a domain (Namecheap, GoDaddy, etc.)
2. Point domain to EC2 IP
3. Run `./setup-https.sh` with option 1

### 2. Update Security Group

Allow only necessary traffic:

```
Inbound Rules:
- SSH (22): Your IP only
- HTTP (80): 0.0.0.0/0 (redirects to HTTPS)
- HTTPS (443): 0.0.0.0/0
```

### 3. Enable HTTP/2

Already enabled in the nginx config! Check:

```bash
curl -I --http2 https://54.213.12.192
# Should see: HTTP/2 200
```

### 4. Monitor Certificate Expiry

Set up monitoring for Let's Encrypt:

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192

# Add cron job to check expiry
(crontab -l 2>/dev/null; echo "0 0 * * * certbot renew --quiet") | crontab -
```

---

## 📞 Still Having Issues?

Run comprehensive diagnostic:

```bash
./check-server.sh > server-status.txt

# Send server-status.txt for review
cat server-status.txt
```

Common solutions:
1. **Certificate expired**: `./setup-https.sh`
2. **Port closed**: Open port 443 in security group
3. **Nginx stopped**: `sudo systemctl start nginx`
4. **Config broken**: `./setup-https.sh` to reset

---

## 🎓 Understanding HTTPS Flow

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ Request: https://54.213.12.192
       ▼
┌──────────────────┐
│  EC2 Instance    │
│  Port 443 (SSL)  │
└────────┬─────────┘
         │
    ┌────▼────┐
    │  Nginx  │ ← SSL Certificate
    └────┬────┘
         │
    ┌────▼────────┐
    │  Frontend   │
    │   Files     │
    └─────────────┘
```

**Requirements**:
- ✅ Port 443 open in security group
- ✅ SSL certificate installed
- ✅ Nginx configured with SSL
- ✅ Nginx running

All handled by `./setup-https.sh`!
