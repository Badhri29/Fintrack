package com.networth.repository;

import com.networth.entity.OtpVerification;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface OtpVerificationRepository extends JpaRepository<OtpVerification, Long> {
    Optional<OtpVerification> findTopByTargetAndPurposeAndVerifiedFalseOrderByCreatedAtDesc(String target, String purpose);
    void deleteByTarget(String target);
}
