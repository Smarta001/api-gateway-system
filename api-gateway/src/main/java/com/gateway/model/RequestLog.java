package com.gateway.model;

import lombok.Data;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.AllArgsConstructor;
import org.springframework.data.annotation.Id;
import org.springframework.data.mongodb.core.mapping.Document;
import org.springframework.data.mongodb.core.index.Indexed;

import java.time.Instant;

@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@Document(collection = "request_logs")
public class RequestLog {

    @Id
    private String id;

    @Indexed
    private String username;

    private String method;
    private String path;
    private String targetService;

    private int statusCode;
    private long responseTimeMs;

    private String clientIp;
    private String userAgent;

    private boolean rateLimited;
    private boolean authenticated;

    @Indexed
    private Instant timestamp;

    private String errorMessage;
}
