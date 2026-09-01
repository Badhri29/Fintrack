package com.networth.repository;

import com.networth.entity.DefaultSubCategory;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.List;

@Repository
public interface DefaultSubCategoryRepository extends JpaRepository<DefaultSubCategory, Long> {
    List<DefaultSubCategory> findByCategoryId(Long categoryId);
}
