package com.networth.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
@Builder
public class AuthResponse {
    private boolean success;
    private UserDto user;
    private String token;
    private String error;
    private String message;
    private Boolean requiresVerification;
    private String identifier;
    private String devOtp;
    private Integer expiresInSeconds;

    // Advanced admin control & security flags
    private Boolean unregistered;
    @JsonProperty("isLocked")
    private Boolean isLocked;
    private String lockType;
    private String lockUntil;
    private String lockReason;
    private Boolean isMaintenance;
    private String maintenanceMessage;
    private String maintenanceEnd;

    // Temporary password & mandatory reset
    private Boolean mustChangePassword;
    private Boolean isTemporaryPassword;
}
