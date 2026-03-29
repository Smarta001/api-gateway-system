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
 * Dummy User Service — runs on port 8081
 * Start with: java -jar dummy-user-service.jar
 * Or set server.port=8081 in its properties
 */
@SpringBootApplication(exclude = {MongoAutoConfiguration.class, MongoDataAutoConfiguration.class})
@RestController
@RequestMapping("/")
public class DummyUserService {

    public static void main(String[] args) {
        System.setProperty("server.port", "8081");
        SpringApplication.run(DummyUserService.class, args);
    }

    @GetMapping
    public ResponseEntity<?> list() {
        return ResponseEntity.ok(List.of(
                Map.of("id", "u1", "username", "alice", "email", "alice@test.com"),
                Map.of("id", "u2", "username", "bob", "email", "bob@test.com"),
                Map.of("id", "u3", "username", "charlie", "email", "charlie@test.com")
        ));
    }

    @GetMapping("/{id}")
    public ResponseEntity<?> getById(@PathVariable String id) {
        return ResponseEntity.ok(Map.of(
                "id", id,
                "username", "user_" + id,
                "email", "user_" + id + "@example.com",
                "createdAt", "2024-01-01T00:00:00Z"
        ));
    }

    @PostMapping
    public ResponseEntity<?> create(@RequestBody Map<String, Object> body) {
        body.put("id", "generated_" + System.currentTimeMillis());
        body.put("created", true);
        return ResponseEntity.status(201).body(body);
    }
}
