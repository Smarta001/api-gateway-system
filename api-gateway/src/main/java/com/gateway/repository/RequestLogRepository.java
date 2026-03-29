package com.gateway.repository;

import com.gateway.model.RequestLog;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.mongodb.repository.Aggregation;
import org.springframework.data.mongodb.repository.MongoRepository;
import org.springframework.data.mongodb.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface RequestLogRepository extends MongoRepository<RequestLog, String> {

    Page<RequestLog> findByUsername(String username, Pageable pageable);

    List<RequestLog> findByTimestampBetween(Instant from, Instant to);

    List<RequestLog> findByUsernameAndTimestampBetween(String username, Instant from, Instant to);

    long countByTimestampBetween(Instant from, Instant to);

    long countByRateLimitedTrueAndTimestampBetween(Instant from, Instant to);

    long countByStatusCodeGreaterThanEqualAndTimestampBetween(int statusCode, Instant from, Instant to);

    @Query("{'timestamp': {$gte: ?0, $lt: ?1}, 'targetService': ?2}")
    List<RequestLog> findByServiceAndTimeRange(Instant from, Instant to, String service);

    @Aggregation(pipeline = {
        "{ $match: { 'timestamp': { $gte: ?0, $lt: ?1 } } }",
        "{ $group: { _id: '$targetService', count: { $sum: 1 }, avgResponseTime: { $avg: '$responseTimeMs' }, errors: { $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] } } } }"
    })
    List<ServiceStats> getServiceStats(Instant from, Instant to);

    interface ServiceStats {
        String getId();
        long getCount();
        double getAvgResponseTime();
        long getErrors();
    }
}
