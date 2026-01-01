# 🚀 TunesBasis Deployment - Quick Reference

## ✅ What's Been Set Up

### 1. Environment Files Created
- `src/environments/environment.dev.ts` - Dev environment with AWS endpoints
- `src/environments/environment.prod.ts` - Production environment (updated)
- `src/environments/environment.ts` - Local development (unchanged)

### 2. Build Configurations Added
- **dev**: Optimized build with dev API endpoints
- **production**: Fully optimized build with production API endpoints
- **development**: Local development with hot reload

### 3. Deployment Scripts Created
- **deploy-frontend.sh** - Full deployment with backups and nginx setup
- **deploy-dev-quick.sh** - Quick dev deployment
- **deploy-prod.sh** - Production deployment

### 4. NPM Scripts Added
```json
{
  "build:dev": "ng build --configuration=dev",
  "build:prod": "ng build --configuration=production",
  "deploy:dev": "./deploy-dev-quick.sh",
  "deploy:prod": "./deploy-prod.sh",
  "deploy:full": "./deploy-frontend.sh"
}
```

---

## 🎯 Your Deployed Endpoints

| Service | URL |
|---------|-----|
| **Frontend (EC2)** | http://54.213.12.192 |
| **Backend API** | https://bl18uj24nb.execute-api.us-west-2.amazonaws.com |
| **CloudFront CDN** | https://dhqgiy9k3x870.cloudfront.net |

---

## 🚀 How to Deploy

### Option 1: Quick Deploy (Recommended for dev)

```bash
npm run deploy:dev
```

This will:
1. Build with dev configuration
2. Upload to EC2
3. Restart nginx

**Time**: ~1-2 minutes

### Option 2: Full Deploy (with backups)

```bash
npm run deploy:full
```

or

```bash
./deploy-frontend.sh
```

This will:
1. Clean previous build
2. Install dependencies
3. Build with dev configuration
4. Validate SSH connection
5. Backup existing deployment
6. Upload to EC2
7. Configure nginx
8. Show deployment summary

**Time**: ~3-5 minutes

### Option 3: Production Deploy

```bash
npm run deploy:prod
```

This will:
1. Build with production configuration (fully optimized)
2. Upload to EC2
3. Restart nginx

**Time**: ~2-3 minutes

---

## 📋 Prerequisites

### SSH Key Setup (One-time)

```bash
# 1. Place SSH key in project root
cp ~/path/to/blog-lecture.pem /Users/jiyoungnoh/Documents/GitHub/sorituh/tunesbasis/

# 2. Set correct permissions
chmod 400 blog-lecture.pem
```

### Verify SSH Access

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
```

---

## 🔧 Common Tasks

### Deploy Latest Changes

```bash
# Make your code changes
# Then deploy:
npm run deploy:dev
```

### Switch Between Environments

```bash
# Build for dev (uses dev API)
npm run build:dev

# Build for prod (uses prod API)
npm run build:prod

# Run locally (uses localhost:3000 API)
npm start
```

### View Deployment Logs

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo tail -f /var/log/nginx/error.log
```

### Restart Nginx

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192
sudo systemctl restart nginx
```

### Rollback to Previous Version

```bash
ssh -i blog-lecture.pem ec2-user@54.213.12.192

# List backups
ls -la | grep backup

# Restore backup
mv tunesbasis tunesbasis-broken
mv tunesbasis-backup-20241231-210000 tunesbasis
sudo systemctl restart nginx
```

---

## 🎨 Development Workflow

### 1. Local Development

```bash
npm start
# App runs at http://localhost:4200
# Uses local backend at http://localhost:3000
```

### 2. Test with Dev Backend

```bash
# Build and deploy to EC2
npm run deploy:dev

# Access at http://54.213.12.192
# Uses AWS backend at https://bl18uj24nb.execute-api.us-west-2.amazonaws.com
```

### 3. Production Release

```bash
npm run deploy:prod
# Fully optimized build
```

---

## 🐛 Troubleshooting

### "SSH key not found" Error

```bash
# Ensure key is in project root
ls -la blog-lecture.pem

# Set permissions
chmod 400 blog-lecture.pem
```

### "Build failed" Error

```bash
# Clear caches
rm -rf node_modules .angular dist package-lock.json

# Reinstall
npm install

# Try again
npm run deploy:dev
```

### "Cannot connect to EC2" Error

```bash
# Check EC2 instance is running in AWS Console

# Check security group allows SSH from your IP

# Test connection
ssh -i blog-lecture.pem ec2-user@54.213.12.192
```

### App Shows "Cannot connect to server" Error

```bash
# Check browser console for actual error

# Verify API endpoint in environment file
cat src/environments/environment.dev.ts

# Check backend is running
curl https://bl18uj24nb.execute-api.us-west-2.amazonaws.com/songs
```

---

## 📊 Environment Comparison

| Environment | API Endpoint | Use Case |
|-------------|-------------|----------|
| **Local** | http://localhost:3000 | Development with local backend |
| **Dev** | https://bl18uj24nb... | Testing with AWS backend |
| **Prod** | https://bl18uj24nb... | Production release |

---

## ✨ What's Next?

Now that deployment is set up, you can:

1. **Deploy your app**:
   ```bash
   npm run deploy:dev
   ```

2. **Access your app**:
   Open http://54.213.12.192 in your browser

3. **Continue development**:
   - Make code changes
   - Run `npm run deploy:dev` to deploy
   - Test at http://54.213.12.192

4. **Check the recording feature** we discussed earlier - it's ready to implement!

---

## 📚 Full Documentation

See [DEPLOYMENT.md](DEPLOYMENT.md) for complete deployment guide.
