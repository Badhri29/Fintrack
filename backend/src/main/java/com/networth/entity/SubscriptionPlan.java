package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "subscription_plans")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class SubscriptionPlan {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "planCode", unique = true, nullable = false, length = 50)
    private String planCode;

    @Column(name = "planName", nullable = false, length = 100)
    private String planName;

    @Builder.Default
    private Double price = 0.0;

    @Builder.Default
    @Column(length = 10)
    private String currency = "INR";

    @Builder.Default
    @Column(name = "billingPeriod", length = 20)
    private String billingPeriod = "MONTHLY";

    @Column(name = "maxCreditCards")
    @Builder.Default
    private Integer maxCreditCards = 2;

    @Column(name = "canAccessDashboard")
    @Builder.Default
    private Boolean canAccessDashboard = true;

    @Column(name = "canAccessReports")
    @Builder.Default
    private Boolean canAccessReports = false;

    @Column(name = "canAccessLoans")
    @Builder.Default
    private Boolean canAccessLoans = true;

    @Column(name = "canAccessBudget")
    @Builder.Default
    private Boolean canAccessBudget = true;

    @Column(name = "canExportData")
    @Builder.Default
    private Boolean canExportData = false;

    @Column(name = "canUseEodDigest")
    @Builder.Default
    private Boolean canUseEodDigest = false;

    @Column(length = 500)
    private String description;

    @Column(name = "isActive")
    @Builder.Default
    private Boolean isActive = true;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
