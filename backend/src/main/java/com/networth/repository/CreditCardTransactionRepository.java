package com.networth.repository;

import com.networth.entity.CreditCardTransaction;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface CreditCardTransactionRepository extends JpaRepository<CreditCardTransaction, String> {
    List<CreditCardTransaction> findByCardIdAndUserIdOrderByCreatedAtDesc(String cardId, Long userId);
    List<CreditCardTransaction> findByUserIdOrderByCreatedAtDesc(Long userId);
    void deleteByCardIdAndUserId(String cardId, Long userId);
}
