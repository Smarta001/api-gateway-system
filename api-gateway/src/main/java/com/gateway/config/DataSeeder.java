package com.gateway.config;

import com.gateway.model.User;
import com.gateway.repository.UserRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.boot.CommandLineRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Set;

@Slf4j
@Component
@RequiredArgsConstructor
public class DataSeeder implements CommandLineRunner {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;

    @Override
    public void run(String... args) {
        seedAdminUser();
        seedTestUsers();
    }

    private void seedAdminUser() {
        if (!userRepository.existsByUsername("admin")) {
            User admin = User.builder()
                    .username("admin")
                    .password(passwordEncoder.encode("admin123"))
                    .email("admin@gateway.com")
                    .roles(Set.of("ADMIN", "USER"))
                    .rateLimitAlgorithm(User.RateLimitAlgorithm.TOKEN_BUCKET)
                    .rateLimitCapacity(1000)
                    .rateLimitRefillRate(100)
                    .enabled(true)
                    .createdAt(Instant.now())
                    .build();
            userRepository.save(admin);
            log.info("✅ Admin user created → username=admin password=admin123");
        }
    }

    private void seedTestUsers() {
        // Token Bucket user
        if (!userRepository.existsByUsername("alice")) {
            User alice = User.builder()
                    .username("alice")
                    .password(passwordEncoder.encode("password123"))
                    .email("alice@test.com")
                    .roles(Set.of("USER"))
                    .rateLimitAlgorithm(User.RateLimitAlgorithm.TOKEN_BUCKET)
                    .rateLimitCapacity(10)
                    .rateLimitRefillRate(5)
                    .enabled(true)
                    .createdAt(Instant.now())
                    .build();
            userRepository.save(alice);
            log.info("✅ Test user created → username=alice (TOKEN_BUCKET: cap=10, refill=5/s)");
        }

        // Leaky Bucket user
        if (!userRepository.existsByUsername("bob")) {
            User bob = User.builder()
                    .username("bob")
                    .password(passwordEncoder.encode("password123"))
                    .email("bob@test.com")
                    .roles(Set.of("USER"))
                    .rateLimitAlgorithm(User.RateLimitAlgorithm.LEAKY_BUCKET)
                    .rateLimitCapacity(8)
                    .rateLimitRefillRate(2)
                    .enabled(true)
                    .createdAt(Instant.now())
                    .build();
            userRepository.save(bob);
            log.info("✅ Test user created → username=bob (LEAKY_BUCKET: cap=8, leak=2/s)");
        }
    }
}
