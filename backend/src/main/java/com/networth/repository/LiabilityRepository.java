package com.networth.repository;

import com.networth.entity.Liability;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LiabilityRepository extends JpaRepository<Liability, Long> {
    List<Liability> findByUserId(Long userId);
    Optional<Liability> findByIdAndUserId(Long id, Long userId);
    void deleteByIdAndUserId(Long id, Long userId);
    void deleteByUserId(Long userId);
}
