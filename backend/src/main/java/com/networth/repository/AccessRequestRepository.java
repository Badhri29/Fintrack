package com.networth.repository;

import com.networth.entity.AccessRequest;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface AccessRequestRepository extends JpaRepository<AccessRequest, Long> {
    List<AccessRequest> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<AccessRequest> findAllByOrderByCreatedAtDesc();
    List<AccessRequest> findByStatusOrderByCreatedAtDesc(String status);
    void deleteByUserId(Long userId);
}
