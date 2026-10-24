package com.networth.security;

import com.networth.entity.User;
import lombok.Getter;
import org.springframework.security.core.GrantedAuthority;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.UserDetails;

import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;

@Getter
public class UserPrincipal implements UserDetails {

    private final Long id;
    private final String email;
    private final String password;
    private final User user;

    public UserPrincipal(User user) {
        this.id = user.getId();
        this.email = user.getEmail();
        this.password = user.getPassword();
        this.user = user;
    }

    @Override
    public Collection<? extends GrantedAuthority> getAuthorities() {
        List<GrantedAuthority> authorities = new ArrayList<>();
        authorities.add(new SimpleGrantedAuthority("ROLE_USER"));
        String r = user.getRole();
        if (r != null) {
            String roleUpper = r.trim().toUpperCase();
            if ("ADMIN".equals(roleUpper) || "SUPER_ADMIN".equals(roleUpper)) {
                authorities.add(new SimpleGrantedAuthority("ROLE_ADMIN"));
                if ("SUPER_ADMIN".equals(roleUpper)) {
                    authorities.add(new SimpleGrantedAuthority("ROLE_SUPER_ADMIN"));
                }
            }
        }
        return authorities;
    }

    public boolean isAdmin() {
        String r = user.getRole();
        return r != null && (r.equalsIgnoreCase("ADMIN") || r.equalsIgnoreCase("SUPER_ADMIN"));
    }

    @Override
    public String getPassword() {
        return password;
    }

    @Override
    public String getUsername() {
        return email != null ? email : (user.getPhone() != null ? user.getPhone() : String.valueOf(id));
    }

    @Override
    public boolean isAccountNonExpired() {
        return true;
    }

    @Override
    public boolean isAccountNonLocked() {
        if ("FULL".equalsIgnoreCase(user.getLockType()) || "PERMANENT".equalsIgnoreCase(user.getLockType())) {
            return false;
        }
        if ("TEMP".equalsIgnoreCase(user.getLockType()) && user.getLockUntil() != null) {
            return LocalDateTime.now().isAfter(user.getLockUntil());
        }
        return true;
    }

    @Override
    public boolean isCredentialsNonExpired() {
        return true;
    }

    @Override
    public boolean isEnabled() {
        return !"INACTIVE".equalsIgnoreCase(user.getStatus());
    }
}
