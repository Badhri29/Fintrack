package com.networth.repository;

import com.networth.entity.Budget;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BudgetRepository extends JpaRepository<Budget, Long> {
    List<Budget> findByUserIdAndYear(Long userId, Integer year);
    Optional<Budget> findByUserIdAndYearAndCategoryKey(Long userId, Integer year, String categoryKey);
    void deleteByUserIdAndYear(Long userId, Integer year);
    void deleteByUserIdAndYearAndCategoryKey(Long userId, Integer year, String categoryKey);
}
