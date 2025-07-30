#!/bin/bash
echo "🚀 Starting WebChat services..."

# Start database
docker-compose up -d postgres redis

# Wait for database
sleep 5

# Start backend
cd backend && npm start &
echo $! > ../backend.pid
echo "✅ Backend started"

# Start frontend  
cd ../frontend && npm start &
echo $! > ../frontend.pid
echo "✅ Frontend started"

echo ""
echo "🌐 Services running:"
echo "   Frontend: http://192.168.1.137:3000"
echo "   Backend:  http://192.168.1.137:3001"
echo "   PgAdmin:  http://192.168.1.137:8080"
echo ""
echo "🔧 Public URLs:"
echo "   Frontend: http://winwin2home.3bbddns.com:53630"
echo "   Backend:  http://winwin2home.3bbddns.com:53631"
