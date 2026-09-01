package com.networth.repository;

import com.networth.entity.DefaultCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DefaultCategoryRepository extends JpaRepository<DefaultCategory, Long> {
    List<DefaultCategory> findByType(String type);
}
