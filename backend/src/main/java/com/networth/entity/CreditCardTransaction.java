package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "credit_card_transactions")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditCardTransaction {

    @Id
    @Column(length = 100)
    private String id;

    @Column(name = "cardId", nullable = false, length = 100)
    private String cardId;

    @Column(name = "userId", nullable = false)
    private Long userId;

    @Column(nullable = false, length = 50)
    private String date;

    @Column(nullable = false)
    private String description;

    @Column(nullable = false)
    private Double amount;

    private String category;

    @Builder.Default
    private String type = "DEBIT";

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;
}
