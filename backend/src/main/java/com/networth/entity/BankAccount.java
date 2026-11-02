package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "bank_accounts")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class BankAccount {

    @Id
    @Column(length = 100)
    private String id;

    @Column(name = "userId", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String bankName;

    @Column(nullable = false)
    private String accountType;

    @Column(nullable = false)
    private String accountNumberLast4;

    private String holderName;

    private String ifscCode;

    private String branch;

    @Builder.Default
    private Double balance = 0.0;

    @Builder.Default
    private Boolean isPrimary = false;

    @Column(columnDefinition = "LONGTEXT")
    private String debitCardsJson;

    @Column(columnDefinition = "LONGTEXT")
    private String creditCardsJson;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
