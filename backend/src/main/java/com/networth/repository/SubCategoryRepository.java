package com.networth.repository;

import com.networth.entity.SubCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface SubCategoryRepository extends JpaRepository<SubCategory, Long> {
    List<SubCategory> findByUserId(Long userId);
    List<SubCategory> findByUserIdAndCategoryId(Long userId, Long categoryId);
    boolean existsByUserIdAndCategoryIdAndName(Long userId, Long categoryId, String name);
    Optional<SubCategory> findByUserIdAndCategoryIdAndName(Long userId, Long categoryId, String name);
    Optional<SubCategory> findByIdAndUserId(Long id, Long userId);
}
