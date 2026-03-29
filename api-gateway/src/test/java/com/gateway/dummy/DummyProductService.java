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
 * Dummy Product Service — runs on port 8083
 */
@SpringBootApplication(exclude = {MongoAutoConfiguration.class, MongoDataAutoConfiguration.class})
@RestController
@RequestMapping("/")
public class DummyProductService {

    public static void main(String[] args) {
        System.setProperty("server.port", "8083");
        SpringApplication.run(DummyProductService.class, args);
    }

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(List.of(
                Map.of("id", "p1", "name", "Laptop Pro", "category", "Electronics", "price", 1299.99, "stock", 42),
                Map.of("id", "p2", "name", "Wireless Mouse", "category", "Accessories", "price", 29.99, "stock", 200),
                Map.of("id", "p3", "name", "Mechanical Keyboard", "category", "Accessories", "price", 89.99, "stock", 75),
                Map.of("id", "p4", "name", "4K Monitor", "category", "Electronics", "price", 499.99, "stock", 15)
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable String id) {
        return ResponseEntity.ok(Map.of(
                "id", id,
                "name", "Product_" + id,
                "category", "General",
                "price", 49.99,
                "stock", 100
        ));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        body.put("id", "prod_" + System.currentTimeMillis());
        body.put("stock", 0);
        return ResponseEntity.status(201).body(body);
    }

    @PutMapping("/{id}")
    public ResponseEntity<?> update(@PathVariable String id, @RequestBody Map<String, Object> body) {
        body.put("id", id);
        body.put("updated", true);
        return ResponseEntity.ok(body);
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<?> delete(@PathVariable String id) {
        return ResponseEntity.ok(Map.of("id", id, "deleted", true));
    }
}
