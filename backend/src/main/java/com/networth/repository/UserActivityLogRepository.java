package com.networth.repository;

import com.networth.entity.UserActivityLog;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface UserActivityLogRepository extends JpaRepository<UserActivityLog, Long> {
    List<UserActivityLog> findByUserIdOrderByCreatedAtDesc(Long userId, Pageable pageable);
    List<UserActivityLog> findByUserIdOrderByCreatedAtDesc(Long userId);
    List<UserActivityLog> findAllByOrderByCreatedAtDesc(Pageable pageable);
    List<UserActivityLog> findAllByOrderByCreatedAtDesc();
    void deleteByUserId(Long userId);
}
