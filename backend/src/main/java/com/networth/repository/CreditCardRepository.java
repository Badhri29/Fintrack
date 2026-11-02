package com.networth.repository;

import com.networth.entity.CreditCard;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface CreditCardRepository extends JpaRepository<CreditCard, String> {
    List<CreditCard> findByUserIdOrderByCreatedAtAsc(Long userId);
    Optional<CreditCard> findByIdAndUserId(String id, Long userId);
    void deleteByUserId(Long userId);
}
