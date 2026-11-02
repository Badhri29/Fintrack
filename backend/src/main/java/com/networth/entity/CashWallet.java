package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;

import java.time.LocalDateTime;

@Entity
@Table(name = "cash_wallets")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CashWallet {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "userId", nullable = false, unique = true)
    private Long userId;

    @Builder.Default
    private Double balance = 0.0;

    @Column(columnDefinition = "TEXT")
    private String notes;

    private LocalDateTime lastUpdated;
}
