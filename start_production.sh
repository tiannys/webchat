#!/bin/bash
echo "🚀 Starting WebChat in Production Mode"

# Stop existing services
./stop.sh 2>/dev/null || true

# Start database
docker-compose up -d postgres redis 2>/dev/null || true

# Start backend
echo "🔧 Starting backend..."
cd backend
nohup npm start > ../backend.log 2>&1 &
echo $! > ../backend.pid
echo "✅ Backend started"
cd ..

# Build and start frontend
echo "🎨 Building and starting frontend..."
cd frontend

# Build if build folder doesn't exist or is old
if [ ! -d "build" ] || [ $(find . -name "*.js" -newer build -print -quit) ]; then
    echo "📦 Building frontend..."
    npm run build
fi

# Start production server
nohup serve -s build -l 3000 > ../frontend.log 2>&1 &
echo $! > ../frontend.pid
echo "✅ Frontend started (production mode)"
cd ..

echo ""
echo "🎉 Production services started!"
echo "📍 Frontend: http://192.168.1.137:3000"
echo "📍 Backend:  http://192.168.1.137:3001"
echo "🌐 Public Frontend: http://winwin2home.3bbddns.com:53630"
echo "🌐 Public Backend:  http://winwin2home.3bbddns.com:53632"
