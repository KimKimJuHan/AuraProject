#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

echo "====================================="
echo " Starting Deployment Pipeline..."
echo "====================================="

echo "[1/4] Pulling latest code from main branch..."
git fetch origin main
git reset --hard origin/main

echo "[2/4] Building Docker images..."
# backend/frontend 이미지 빌드
docker compose build

echo "[3/4] Restarting containers in detached mode..."
docker compose up -d

echo "[4/4] Pruning unused Docker images to save space..."
docker image prune -f

echo "====================================="
echo " Deployment Successful! 🚀"
echo "====================================="
