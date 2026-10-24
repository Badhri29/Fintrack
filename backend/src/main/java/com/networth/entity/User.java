package com.networth.entity;

import com.fasterxml.jackson.annotation.JsonIgnore;
import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;
import org.hibernate.annotations.UpdateTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "users")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class User {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(unique = true, nullable = true)
    private String email;

    @JsonIgnore
    @Column(nullable = false)
    private String password;

    private String name;

    private Integer age;

    private String gender;

    @Column(unique = true, nullable = true)
    private String phone;

    @Column(name = "isVerified")
    @Builder.Default
    private Boolean isVerified = false;

    @Column(columnDefinition = "TEXT")
    private String photo;

    @Builder.Default
    private String role = "USER";

    @Builder.Default
    private String status = "ACTIVE";

    @Column(name = "lockType")
    @Builder.Default
    private String lockType = "NONE";

    @Column(name = "lockUntil")
    private LocalDateTime lockUntil;

    @Column(name = "lockReason")
    private String lockReason;

    @Column(name = "subscriptionTier")
    @Builder.Default
    private String subscriptionTier = "FREE";

    @Column(name = "cardLimit")
    @Builder.Default
    private Integer cardLimit = 2;

    @Column(name = "canAccessDashboard")
    @Builder.Default
    private Boolean canAccessDashboard = true;

    @Column(name = "canAccessReports")
    @Builder.Default
    private Boolean canAccessReports = true;

    @Column(name = "canEditSettings")
    @Builder.Default
    private Boolean canEditSettings = true;

    @Column(name = "isReadOnly")
    @Builder.Default
    private Boolean isReadOnly = false;

    @Column(name = "lastLoginAt")
    private LocalDateTime lastLoginAt;

    @Column(name = "lastLogoutAt")
    private LocalDateTime lastLogoutAt;

    @Column(name = "lastActivityAt")
    private LocalDateTime lastActivityAt;

    @Column(name = "loginCount")
    @Builder.Default
    private Integer loginCount = 0;

    @Column(name = "isTemporaryPassword")
    @Builder.Default
    private Boolean isTemporaryPassword = false;

    @Column(name = "temporaryPasswordExpiresAt")
    private LocalDateTime temporaryPasswordExpiresAt;

    @Column(name = "mustChangePassword")
    @Builder.Default
    private Boolean mustChangePassword = false;

    @Column(name = "parentUserId")
    private Long parentUserId;

    @Column(name = "memberPermission")
    private String memberPermission;

    @Column(name = "memberId", unique = true)
    private String memberId;

    @Column(name = "memberExpiresAt")
    private LocalDateTime memberExpiresAt;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;

    @UpdateTimestamp
    @Column(name = "updatedAt")
    private LocalDateTime updatedAt;
}
