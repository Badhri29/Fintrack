package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_preferences")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserPreference {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "userId", unique = true, nullable = false)
    private Long userId;

    @Column(name = "currency")
    @Builder.Default
    private String currency = "INR";

    @Column(name = "currencyFormat")
    @Builder.Default
    private String currencyFormat = "indian";

    @Column(name = "theme")
    @Builder.Default
    private String theme = "dark";

    @Column(name = "defaultType")
    @Builder.Default
    private String defaultType = "expense";

    @Column(name = "defaultPaymentMode")
    @Builder.Default
    private String defaultPaymentMode = "upi";

    @Column(name = "defaultCategory")
    @Builder.Default
    private String defaultCategory = "Food & Groceries";

    @Column(name = "defaultCard")
    @Builder.Default
    private String defaultCard = "";

    @Column(name = "defaultNote")
    @Builder.Default
    private String defaultNote = "";

    @Column(name = "autoFocusAmount")
    @Builder.Default
    private Boolean autoFocusAmount = true;

    @Column(name = "soundEffects")
    @Builder.Default
    private Boolean soundEffects = true;

    @Column(name = "soundTone")
    @Builder.Default
    private String soundTone = "chime";

    @Column(name = "soundVolume")
    @Builder.Default
    private Integer soundVolume = 80;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
