package com.networth.repository;

import com.networth.entity.CashWallet;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface CashWalletRepository extends JpaRepository<CashWallet, Long> {
    Optional<CashWallet> findByUserId(Long userId);
}
