package com.networth.dto;

import com.networth.entity.User;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

import java.time.LocalDateTime;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class UserDto {
    private Long id;
    private String email;
    private String name;
    private String phone;
    private String photo;
    private Boolean isVerified;
    private String role;
    private String status;
    private String lockType;
    private LocalDateTime lockUntil;
    private String lockReason;
    private String subscriptionTier;
    private Integer cardLimit;
    private Boolean canAccessDashboard;
    private Boolean canAccessReports;
    private Boolean canEditSettings;
    private Boolean isReadOnly;
    private LocalDateTime lastLoginAt;
    private LocalDateTime lastLogoutAt;
    private Integer loginCount;
    private Boolean mustChangePassword;
    private Boolean isTemporaryPassword;
    private LocalDateTime temporaryPasswordExpiresAt;
    private LocalDateTime lastActivityAt;
    private Boolean isOnline;

    public static UserDto fromEntity(User user) {
        if (user == null) return null;

        LocalDateTime now = LocalDateTime.now();
        boolean isOnline = false;
        if (user.getLastActivityAt() != null) {
            long diffSec = Math.abs(java.time.temporal.ChronoUnit.SECONDS.between(user.getLastActivityAt(), now));
            isOnline = diffSec <= 180;
        } else if (user.getLastLoginAt() != null) {
            boolean noLogout = user.getLastLogoutAt() == null || user.getLastLogoutAt().isBefore(user.getLastLoginAt());
            long diffMin = Math.abs(java.time.temporal.ChronoUnit.MINUTES.between(user.getLastLoginAt(), now));
            isOnline = noLogout && diffMin < 10;
        }

        return UserDto.builder()
                .id(user.getId())
                .email(user.getEmail())
                .name(user.getName())
                .phone(user.getPhone())
                .photo(user.getPhoto())
                .isVerified(user.getIsVerified())
                .role(user.getRole() != null ? user.getRole() : "USER")
                .status(user.getStatus() != null ? user.getStatus() : "ACTIVE")
                .lockType(user.getLockType() != null ? user.getLockType() : "NONE")
                .lockUntil(user.getLockUntil())
                .lockReason(user.getLockReason())
                .subscriptionTier(user.getSubscriptionTier() != null ? user.getSubscriptionTier() : "FREE")
                .cardLimit(user.getCardLimit() != null ? user.getCardLimit() : 2)
                .canAccessDashboard(user.getCanAccessDashboard() != null ? user.getCanAccessDashboard() : true)
                .canAccessReports(user.getCanAccessReports() != null ? user.getCanAccessReports() : true)
                .canEditSettings(user.getCanEditSettings() != null ? user.getCanEditSettings() : true)
                .isReadOnly(user.getIsReadOnly() != null ? user.getIsReadOnly() : false)
                .lastLoginAt(user.getLastLoginAt())
                .lastLogoutAt(user.getLastLogoutAt())
                .lastActivityAt(user.getLastActivityAt())
                .isOnline(isOnline)
                .loginCount(user.getLoginCount() != null ? user.getLoginCount() : 0)
                .mustChangePassword(user.getMustChangePassword() != null ? user.getMustChangePassword() : false)
                .isTemporaryPassword(user.getIsTemporaryPassword() != null ? user.getIsTemporaryPassword() : false)
                .temporaryPasswordExpiresAt(user.getTemporaryPasswordExpiresAt())
                .build();
    }
}
