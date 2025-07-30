#!/bin/bash
set -e

echo "🚀 WebChat Application Setup"
echo "=============================="

# ตรวจสอบ Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker not found. Installing..."
    curl -fsSL https://get.docker.com -o get-docker.sh
    sh get-docker.sh
    systemctl start docker
    systemctl enable docker
fi

# ตรวจสอบ Node.js
if ! command -v node &> /dev/null; then
    echo "❌ Node.js not found. Please install Node.js first."
    exit 1
fi

echo "📦 Installing dependencies..."
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

echo "🗄️ Starting database..."
docker-compose up -d postgres redis

echo "⏳ Waiting for database..."
sleep 15

echo "✅ Setup completed!"
echo "Run './start.sh' to start the application"
