# Ghostfolio to Actual Budget Sync - Docker Setup

This directory contains Docker configuration files for running the Ghostfolio to Actual Budget sync on Unraid or any Docker environment.

## Quick Start

1. **Prepare directories:**
   ```bash
   mkdir -p config data
   ```

2. **Copy your configuration:**
   ```bash
   cp config.json config/
   ```

3. **Build and run:**
   ```bash
   # For one-time sync with dry-run
   docker-compose up --build

   # For actual sync (remove --dry-run from docker-compose.yml first)
   docker-compose up --build
   ```

## Unraid Setup

### Method 1: Docker Compose (Recommended)

1. **Enable Docker Compose Plugin** in Unraid (if not already enabled)

2. **Create app directory** on your Unraid server:
   ```bash
   mkdir -p /mnt/user/appdata/ghostfolio-actual-sync
   cd /mnt/user/appdata/ghostfolio-actual-sync
   ```

3. **Copy files** to the directory:
   - `Dockerfile`
   - `docker-compose.yml`
   - `package.json`
   - `sync.js`
   - `README-JS.md`
   - `config.json.template`
   - `ghostfolio-actual-sync.xml` (for Unraid template)

4. **Create config directory and copy your config:**
   ```bash
   mkdir config
   # Copy and customize the template
   cp config.json.template config/config.json
   # Edit config/config.json with your actual credentials and settings
   ```

5. **Run with Docker Compose:**
   ```bash
   docker-compose up -d --build
   ```

### Method 2: Unraid XML Template (Easy Setup)

1. **Copy the XML template** (`ghostfolio-actual-sync.xml`) to your Unraid server
2. **Import the template** in Unraid's Docker tab:
   - Go to Docker tab → Add Container
   - Template Repository: Browse and select the XML file
   - Or manually add template URL if hosted online

3. **Configure paths** in the template:
   - Config Directory: `/mnt/user/appdata/ghostfolio-actual-sync/config`
   - Data Directory: `/mnt/user/appdata/ghostfolio-actual-sync/data`
   - Timezone: Set to your local timezone

### Method 3: Manual Docker Template

1. **Go to Docker tab** in Unraid WebUI
2. **Click "Add Container"**
3. **Fill in the following:**

   - **Name:** `ghostfolio-actual-sync`
   - **Repository:** `ghostfolio-actual-sync:latest` (after building)
   - **Network Type:** `bridge`
   - **Console Shell Command:** `bash`

   **Volumes:**
   - **Container Path:** `/app/config` | **Host Path:** `/mnt/user/appdata/ghostfolio-actual-sync/config` | **Access Mode:** `Read Only`

   **Environment Variables:**
   - **Key:** `NODE_ENV` | **Value:** `production`
   - **Key:** `TZ` | **Value:** `America/New_York` (or your timezone)

## Scheduling with Cron

This container is designed to run once and exit, making it perfect for cron scheduling.

### Option 1: System Cron Job (Recommended)
Set up a cron job on your Unraid server to run the container periodically:

```bash
# Edit crontab
crontab -e

# Add line to run daily at 2 AM
0 2 * * * cd /mnt/user/appdata/ghostfolio-actual-sync && docker-compose run --rm ghostfolio-actual-sync

# Or run twice daily (2 AM and 2 PM)
0 2,14 * * * cd /mnt/user/appdata/ghostfolio-actual-sync && docker-compose run --rm ghostfolio-actual-sync
```

### Option 2: User Scripts Plugin
Use Unraid's User Scripts plugin to create a scheduled script:

1. Install **User Scripts** plugin
2. Create new script: **Ghostfolio Actual Sync**
3. Add script content:
   ```bash
   #!/bin/bash
   cd /mnt/user/appdata/ghostfolio-actual-sync
   docker-compose run --rm ghostfolio-actual-sync
   ```
4. Set schedule (e.g., Daily at 2:00 AM)

## Configuration

### Required Files Structure
```
/mnt/user/appdata/ghostfolio-actual-sync/
├── config/
│   └── config.json          # Your configuration file
├── config.json.template     # Template file for easy setup
├── docker-compose.yml
├── Dockerfile
├── package.json
├── sync.js
├── ghostfolio-actual-sync.xml  # Unraid template
└── README-Docker.md
```

### Configuration Setup
Use the provided `config.json.template` as a starting point:

```bash
# Copy template to config directory
cp config.json.template config/config.json

# Edit with your actual values
nano config/config.json
```

The template includes all required fields with example values and helpful comments.

## Running Commands

### One-time Sync
```bash
docker-compose run --rm ghostfolio-actual-sync
```

### Dry Run (Test Mode)
```bash
docker-compose run --rm ghostfolio-actual-sync node sync.js --dry-run
```

### View Logs
```bash
docker-compose logs -f ghostfolio-actual-sync
```

## Troubleshooting

### Check Container Status
```bash
docker-compose ps
```

### Access Container Shell
```bash
docker-compose exec ghostfolio-actual-sync sh
```

### Rebuild Container
```bash
docker-compose down
docker-compose up --build -d
```

### Check Unraid Docker Logs
1. Go to Docker tab in Unraid WebUI
2. Click on the container
3. Click "Logs"

## Security Notes

- Config file is mounted read-only for security
- Container runs as non-root user
- Network access is limited to what's needed
- No sensitive data is stored in the Docker image

## Updates

To update the application:
1. Update your source files
2. Rebuild the container:
   ```bash
   docker-compose down
   docker-compose up --build -d
   ```