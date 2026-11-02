package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "loans")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class Loan {

    @Id
    @Column(length = 100)
    private String id;

    @Column(name = "userId", nullable = false)
    private Long userId;

    @Column(nullable = false)
    private String name;

    private String loanNumber;

    @Column(nullable = false)
    private String lender;

    @Column(nullable = false)
    private Double principal;

    @Column(nullable = false)
    private Double emiAmount;

    @Column(nullable = false)
    private Double remainingAmount;

    @Column(nullable = false, length = 50)
    private String startDate;

    @Column(nullable = false, length = 50)
    private String endDate;

    @Builder.Default
    private Boolean includeInNetWorth = true;

    private String type;

    @Builder.Default
    private Double interestRate = 0.0;

    @Builder.Default
    private Integer tenureMonths = 12;

    @Builder.Default
    private Integer paidMonths = 0;

    @Column(columnDefinition = "TEXT")
    private String paidScheduleIndicesJson;

    @Builder.Default
    private Integer dueDay = 5;

    @Column(columnDefinition = "TEXT")
    private String description;

    @Builder.Default
    private String status = "active";

    @Builder.Default
    private String repaymentSource = "bank";

    private String linkedCardId;

    private String linkedCardName;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
