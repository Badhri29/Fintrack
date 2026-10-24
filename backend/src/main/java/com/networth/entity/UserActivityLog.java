package com.networth.entity;

import jakarta.persistence.*;
import lombok.*;
import org.hibernate.annotations.CreationTimestamp;

import java.time.LocalDateTime;

@Entity
@Table(name = "user_activity_logs")
@Getter
@Setter
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserActivityLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "userId", nullable = false)
    private Long userId;

    @Column(name = "userEmail", nullable = false)
    private String userEmail;

    @Column(nullable = false)
    private String action; // LOGIN, LOGOUT, PASSWORD_RESET, ACCESS_REQUEST, PROFILE_UPDATE, DATA_RESET

    @Column(columnDefinition = "TEXT")
    private String details;

    @Column(name = "ipAddress")
    private String ipAddress;

    @Column(name = "userAgent", columnDefinition = "TEXT")
    private String userAgent;

    @CreationTimestamp
    @Column(name = "createdAt", updatable = false)
    private LocalDateTime createdAt;
}
