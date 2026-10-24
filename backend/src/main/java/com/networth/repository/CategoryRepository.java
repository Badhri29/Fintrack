package com.networth.repository;

import com.networth.entity.Category;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CategoryRepository extends JpaRepository<Category, Long> {
    List<Category> findByUserId(Long userId);
    List<Category> findByUserIdAndType(Long userId, String type);
    boolean existsByUserId(Long userId);
    boolean existsByUserIdAndTypeAndName(Long userId, String type, String name);
    Optional<Category> findByUserIdAndTypeAndName(Long userId, String type, String name);
    Optional<Category> findByIdAndUserId(Long id, Long userId);
    void deleteByUserId(Long userId);
}
