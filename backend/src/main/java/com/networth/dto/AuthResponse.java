package com.networth.dto;

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
}
