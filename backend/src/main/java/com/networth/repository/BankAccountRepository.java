package com.networth.repository;

import com.networth.entity.BankAccount;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface BankAccountRepository extends JpaRepository<BankAccount, String> {
    List<BankAccount> findByUserIdOrderByCreatedAtAsc(Long userId);
    Optional<BankAccount> findByIdAndUserId(String id, Long userId);
    void deleteByUserId(Long userId);
}
