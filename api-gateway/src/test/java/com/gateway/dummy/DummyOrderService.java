package com.gateway.dummy;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.data.mongo.MongoDataAutoConfiguration;
import org.springframework.boot.autoconfigure.mongo.MongoAutoConfiguration;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

/**
 * Dummy Order Service — runs on port 8082
 */
@SpringBootApplication(exclude = {MongoAutoConfiguration.class, MongoDataAutoConfiguration.class})
@RestController
@RequestMapping("/")
public class DummyOrderService {

    public static void main(String[] args) {
        System.setProperty("server.port", "8082");
        SpringApplication.run(DummyOrderService.class, args);
    }

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(List.of(
                Map.of("id", "o1", "userId", "u1", "product", "Laptop", "amount", 1200.00, "status", "DELIVERED"),
                Map.of("id", "o2", "userId", "u2", "product", "Phone", "amount", 699.99, "status", "SHIPPED"),
                Map.of("id", "o3", "userId", "u1", "product", "Headphones", "amount", 149.99, "status", "PROCESSING")
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable String id) {
        return ResponseEntity.ok(Map.of(
                "id", id,
                "userId", "u1",
                "product", "Product_" + id,
                "amount", 99.99,
                "status", "PROCESSING",
                "createdAt", "2024-03-01T10:00:00Z"
        ));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        body.put("id", "ord_" + System.currentTimeMillis());
        body.put("status", "CREATED");
        return ResponseEntity.status(201).body(body);
    }

    @PatchMapping("/{id}/status")
    public ResponseEntity<?> updateStatus(@PathVariable String id, @RequestBody Map<String, Object> body) {
        return ResponseEntity.ok(Map.of(
                "id", id,
                "status", body.getOrDefault("status", "UNKNOWN"),
                "updated", true
        ));
    }
}
