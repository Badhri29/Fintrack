package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_notification_settings")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserNotificationSetting {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "userId", unique = true, nullable = false)
    private Long userId;

    @Column(name = "txSoftware")
    @Builder.Default
    private Boolean txSoftware = true;

    @Column(name = "txMail")
    @Builder.Default
    private Boolean txMail = false;

    @Column(name = "logoutMail")
    @Builder.Default
    private Boolean logoutMail = true;

    @Column(name = "pwdResetSoftware")
    @Builder.Default
    private Boolean pwdResetSoftware = true;

    @Column(name = "pwdResetMail")
    @Builder.Default
    private Boolean pwdResetMail = true;

    @Column(name = "eodMail")
    @Builder.Default
    private Boolean eodMail = true;

    @Column(name = "eodFrequency")
    @Builder.Default
    private String eodFrequency = "DAILY"; // DAILY, WEEKLY, MONTHLY, CUSTOM

    @Column(name = "eodTime")
    @Builder.Default
    private String eodTime = "20:00";

    @Column(name = "accessSoftware")
    @Builder.Default
    private Boolean accessSoftware = true;

    @Column(name = "accessMail")
    @Builder.Default
    private Boolean accessMail = true;

    @Column(name = "loginMail")
    @Builder.Default
    private Boolean loginMail = true;

    @Column(name = "maintenanceSoftware")
    @Builder.Default
    private Boolean maintenanceSoftware = true;

    @Column(name = "maintenanceMail")
    @Builder.Default
    private Boolean maintenanceMail = true;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
