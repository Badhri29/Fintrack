package com.networth.repository;

import com.networth.entity.Loan;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface LoanRepository extends JpaRepository<Loan, String> {
    List<Loan> findByUserIdOrderByCreatedAtAsc(Long userId);
    Optional<Loan> findByIdAndUserId(String id, Long userId);
    void deleteByUserId(Long userId);
}
