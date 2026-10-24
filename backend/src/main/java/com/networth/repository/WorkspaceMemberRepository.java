package com.networth.repository;

import com.networth.entity.WorkspaceMember;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;
import java.util.Optional;

@Repository
public interface WorkspaceMemberRepository extends JpaRepository<WorkspaceMember, Long> {
    List<WorkspaceMember> findByOwnerIdOrderByCreatedAtDesc(Long ownerId);
    Optional<WorkspaceMember> findByIdAndOwnerId(Long id, Long ownerId);
    Optional<WorkspaceMember> findByOwnerIdAndEmail(Long ownerId, String email);
    Optional<WorkspaceMember> findByMemberUserId(Long memberUserId);
    Optional<WorkspaceMember> findByMemberId(String memberId);
    void deleteByMemberUserId(Long memberUserId);
}
