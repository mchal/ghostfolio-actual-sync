#!/bin/bash

# Ghostfolio to Actual Budget Sync - Docker Helper Script
# This script helps manage the Docker container for Unraid

CONTAINER_NAME="ghostfolio-actual-sync"
APP_DIR="/mnt/user/appdata/ghostfolio-actual-sync"

case "$1" in
    "build")
        echo "Building Docker image..."
        cd "$APP_DIR"
        docker-compose build
        ;;
    "start")
        echo "Starting container..."
        cd "$APP_DIR"
        docker-compose up -d
        ;;
    "stop")
        echo "Stopping container..."
        cd "$APP_DIR"
        docker-compose down
        ;;
    "restart")
        echo "Restarting container..."
        cd "$APP_DIR"
        docker-compose restart
        ;;
    "logs")
        echo "Showing logs..."
        cd "$APP_DIR"
        docker-compose logs -f
        ;;
    "sync")
        echo "Running one-time sync..."
        cd "$APP_DIR"
        docker-compose run --rm ghostfolio-actual-sync
        ;;
    "dry-run")
        echo "Running dry-run..."
        cd "$APP_DIR"
        docker-compose run --rm ghostfolio-actual-sync node sync.js --dry-run
        ;;
    "shell")
        echo "Opening container shell..."
        cd "$APP_DIR"
        docker-compose exec ghostfolio-actual-sync sh
        ;;
    "status")
        echo "Container status:"
        docker ps | grep $CONTAINER_NAME
        ;;
    "update")
        echo "Updating container..."
        cd "$APP_DIR"
        docker-compose build --no-cache
        echo "Container updated and ready for cron scheduling"
        ;;
    *)
        echo "Ghostfolio to Actual Budget Sync - Docker Helper"
        echo ""
        echo "Usage: $0 {build|start|stop|restart|logs|sync|dry-run|shell|status|update}"
        echo ""
        echo "Commands:"
        echo "  build    - Build the Docker image"
        echo "  start    - Start the container"
        echo "  stop     - Stop the container"
        echo "  restart  - Restart the container"
        echo "  logs     - Show container logs"
        echo "  sync     - Run one-time sync"
        echo "  dry-run  - Run dry-run test"
        echo "  shell    - Open container shell"
        echo "  status   - Show container status"
        echo "  update   - Update and rebuild container"
        echo ""
        exit 1
        ;;
esac