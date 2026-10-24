package com.networth.repository;

import com.networth.entity.UserNotificationSetting;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;

@Repository
public interface UserNotificationSettingRepository extends JpaRepository<UserNotificationSetting, Long> {
    Optional<UserNotificationSetting> findByUserId(Long userId);
    void deleteByUserId(Long userId);
}
