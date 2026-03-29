#!/bin/bash
# run-all.sh — Start the gateway and all dummy downstream services

set -e

JAR="target/api-gateway-1.0.0.jar"

echo "🔨 Building project..."
mvn clean package -q -DskipTests

echo ""
echo "🚀 Starting services..."

# Start dummy services in background
java -jar $JAR --spring.main.sources=com.gateway.dummy.DummyUserService \
     --server.port=8081 \
     --spring.autoconfigure.exclude="org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration" \
     &> logs/user-service.log &
echo "  ✅ User Service     → http://localhost:8081"

java -jar $JAR --spring.main.sources=com.gateway.dummy.DummyOrderService \
     --server.port=8082 \
     --spring.autoconfigure.exclude="org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration" \
     &> logs/order-service.log &
echo "  ✅ Order Service    → http://localhost:8082"

java -jar $JAR --spring.main.sources=com.gateway.dummy.DummyProductService \
     --server.port=8083 \
     --spring.autoconfigure.exclude="org.springframework.boot.autoconfigure.security.servlet.SecurityAutoConfiguration" \
     &> logs/product-service.log &
echo "  ✅ Product Service  → http://localhost:8083"

sleep 2

# Start main gateway
java -jar $JAR &> logs/gateway.log &
echo "  ✅ API Gateway      → http://localhost:8080"

echo ""
echo "📋 Seeded users:"
echo "   admin / admin123  (ADMIN role, Token Bucket, cap=1000)"
echo "   alice / password123  (USER role, Token Bucket, cap=10, refill=5/s)"
echo "   bob   / password123  (USER role, Leaky Bucket, cap=8, leak=2/s)"
echo ""
echo "🔑 Login:  POST http://localhost:8080/auth/login"
echo "📊 Admin:  GET  http://localhost:8080/admin/dashboard  (admin token required)"
echo ""
echo "Press Ctrl+C to stop all services"
wait
