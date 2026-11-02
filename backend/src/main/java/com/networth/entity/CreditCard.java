package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "credit_cards")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class CreditCard {

    @Id
    @Column(length = 100)
    private String id;

    @Column(name = "userId", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    @Column(nullable = false)
    private String bank;

    @Column(nullable = false)
    private String network;

    private String cardNumber;

    @Column(nullable = false, length = 10)
    private String last4;

    private Integer expiryMonth;

    private Integer expiryYear;

    @Column(length = 10)
    private String cvv;

    @Column(name = "cardLimit", nullable = false)
    @Builder.Default
    private Double limit = 0.0;

    @Column(nullable = false)
    @Builder.Default
    private Integer billingDay = 1;

    @Column(nullable = false)
    @Builder.Default
    private Integer dueDay = 1;

    private String gradient;

    private String accent;

    @Builder.Default
    private Boolean isActive = true;

    @Builder.Default
    private Boolean isAddon = false;

    private String primaryCardId;

    private String holderName;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
