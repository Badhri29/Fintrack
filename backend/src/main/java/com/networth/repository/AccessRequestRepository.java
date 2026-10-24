package com.networth.repository;

import com.networth.entity.AccessRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface AccessRequestRepository extends JpaRepository<AccessRequest, Long> {
    List<AccessRequest> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<AccessRequest> findAllByOrderByCreatedAtDesc();
    List<AccessRequest> findByStatusOrderByCreatedAtDesc(String status);
    Optional<AccessRequest> findByActionToken(String actionToken);
    void deleteByUserId(Long userId);
}
