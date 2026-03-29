package com.gateway.model;

import lombok.Data;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import lombok.Builder;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.Instant;
import java.util.Set;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "users")
public class User {

    @Id
    private String id;

    @Indexed(unique = true)
    private String username;

    private String password;

    @Indexed(unique = true)
    private String email;

    private Set<String> roles;

    // Rate limit overrides (null = use defaults)
    private Integer rateLimitCapacity;
    private Integer rateLimitRefillRate;

    private RateLimitAlgorithm rateLimitAlgorithm;

    private boolean enabled;
    private Instant createdAt;
    private Instant lastLogin;

    public enum RateLimitAlgorithm {
        TOKEN_BUCKET, LEAKY_BUCKET
    }
}
