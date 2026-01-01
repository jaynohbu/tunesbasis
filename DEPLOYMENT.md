# Frontend Deployment Guide

## 📁 Deployment Scripts

### 1. **deploy-frontend.sh** (Full Deployment with Checks)
Complete deployment with backups, verification, and nginx setup.

```bash
./deploy-frontend.sh
```

Features:
- ✅ Validates SSH key and connection
- ✅ Creates backup of existing deployment
- ✅ Configures nginx automatically
- ✅ Shows detailed deployment info
- ✅ Keeps last 3 backups

### 2. **deploy-dev-quick.sh** (Quick Dev Deployment)
Fast deployment for development iterations.

```bash
./deploy-dev-quick.sh
```

Features:
- 🚀 Builds with dev configuration
- 🚀 Quick upload without backups
- 🚀 Restarts nginx

### 3. **deploy-prod.sh** (Production Deployment)
Production build with optimizations.

```bash
./deploy-prod.sh
```

Features:
- 🏭 Builds with production configuration
- 🏭 Full optimization and minification
- 🏭 Restarts nginx

---

## 🔧 Setup (First Time Only)

### 1. Place SSH Key

Ensure your SSH key is in the tunesbasis directory:

```bash
cp ~/path/to/blog-lecture.pem .
chmod 400 blog-lecture.pem
```

### 2. Update EC2 Host (if needed)

If your EC2 IP changes, edit the scripts:

```bash
# In all deploy scripts, change this line:
EC2_HOST="54.213.12.192"  # Change to your EC2 IP
```

---

## 📊 Environment Configurations

### Development (dev)
**File**: `src/environments/environment.dev.ts`
```typescript
{
  production: false,
  apiBaseUrl: 'https://bl18uj24nb.execute-api.us-west-2.amazonaws.com',
  cdnBaseUrl: 'https://dhqgiy9k3x870.cloudfront.net'
}
```

**Build**: `npm run build -- --configuration=dev`

### Production (production)
**File**: `src/environments/environment.prod.ts`
```typescript
{
  production: true,
  apiBaseUrl: 'https://bl18uj24nb.execute-api.us-west-2.amazonaws.com',
  cdnBaseUrl: 'https://dhqgiy9k3x870.cloudfront.net'
}
```

**Build**: `npm run build -- --configuration=production`

### Local Development
**File**: `src/environments/environment.ts`
```typescript
{
  production: false,
  apiBaseUrl: 'http://localhost:3000'  // Local backend
}
```

**Serve**: `npm start` or `ng serve`

---

## 🚀 Deployment Workflow

### Quick Development Iteration

```bash
# Make changes to code
npm run build -- --configuration=dev
./deploy-dev-quick.sh
```

### Full Deployment with Backups

```bash
./deploy-frontend.sh
```

### Production Release

```bash
./deploy-prod.sh
```

---

## 🌐 Deployed URLs

After deployment, your app is available at:

| Service | URL |
|---------|-----|
| **Frontend** | http://54.213.12.192 |
| **API** | https://bl18uj24nb.execute-api.us-west-2.amazonaws.com |
| **CDN** | https://dhqgiy9k3x870.cloudfront.net |

---

## 🔍 Troubleshooting

### SSH Connection Issues

```bash
# Check SSH key permissions
chmod 400 blog-lecture.pem

# Test SSH connection
ssh -i blog-lecture.pem ec2-user@54.213.12.192

# Check EC2 security group allows your IP
```

### Build Failures

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear Angular cache
rm -rf .angular dist
```

### Nginx Not Serving Files

```bash
# SSH to EC2
ssh -i blog-lecture.pem ec2-user@54.213.12.192

# Check nginx status
sudo systemctl status nginx

# View nginx error logs
sudo tail -f /var/log/nginx/error.log

# Restart nginx
sudo systemctl restart nginx

# Check file permissions
ls -la /home/ec2-user/tunesbasis
```

### API Connection Errors

Check browser console for CORS errors:

```bash
# If you see CORS errors, verify API endpoint in environment file
cat src/environments/environment.dev.ts

# Backend CORS should allow your EC2 IP
```

---

## 📦 Manual Deployment (Fallback)

If scripts fail, deploy manually:

```bash
# 1. Build
npm run build -- --configuration=dev

# 2. Upload
scp -i blog-lecture.pem -r dist/tunesbasis ec2-user@54.213.12.192:/home/ec2-user/

# 3. SSH and restart nginx
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo systemctl restart nginx
```

---

## 🎯 Best Practices

### 1. Use Quick Deploy for Dev

During active development:
```bash
./deploy-dev-quick.sh
```

### 2. Use Full Deploy for Testing

Before showing to others:
```bash
./deploy-frontend.sh
```

### 3. Use Production for Release

For production releases:
```bash
./deploy-prod.sh
```

### 4. Keep Backups

The full deployment script keeps last 3 backups:
```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
ls -la | grep backup
# tunesbasis-backup-20241231-210000
# tunesbasis-backup-20241231-180000
# tunesbasis-backup-20241231-150000
```

To restore a backup:
```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
mv tunesbasis tunesbasis-current
mv tunesbasis-backup-20241231-210000 tunesbasis
sudo systemctl restart nginx
```

---

## 🔄 CI/CD Integration (Future)

For automated deployment, you can integrate with GitHub Actions:

```yaml
# .github/workflows/deploy-dev.yml
name: Deploy Dev
on:
  push:
    branches: [develop]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm install
      - run: npm run build -- --configuration=dev
      - run: scp -i ${{ secrets.SSH_KEY }} -r dist/tunesbasis ...
```

---

## 📝 Notes

- **SSH Key**: Keep `blog-lecture.pem` secure and never commit to git
- **Backups**: Located in `/home/ec2-user/tunesbasis-backup-*`
- **Nginx Config**: Located in `/etc/nginx/conf.d/tunesbasis.conf`
- **Log Files**: `/var/log/nginx/error.log` and `/var/log/nginx/access.log`
