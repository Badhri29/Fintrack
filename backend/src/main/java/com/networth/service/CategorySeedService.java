package com.networth.service;

import com.networth.entity.Category;
import com.networth.entity.DefaultCategory;
import com.networth.entity.DefaultSubCategory;
import com.networth.entity.SubCategory;
import com.networth.repository.CategoryRepository;
import com.networth.repository.DefaultCategoryRepository;
import com.networth.repository.DefaultSubCategoryRepository;
import com.networth.repository.SubCategoryRepository;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class CategorySeedService {

    @Autowired
    private DefaultCategoryRepository defaultCategoryRepository;

    @Autowired
    private DefaultSubCategoryRepository defaultSubCategoryRepository;

    @Autowired
    private CategoryRepository categoryRepository;

    @Autowired
    private SubCategoryRepository subCategoryRepository;

    @Transactional
    public void seedUserCategories(Long userId) {
        List<DefaultCategory> defaultCategories = defaultCategoryRepository.findAll();

        if (defaultCategories.isEmpty()) {
            // Seed standard fallback categories if default table is empty
            seedFallbackDefaults(userId);
            return;
        }

        for (DefaultCategory defaultCat : defaultCategories) {
            Category cat = categoryRepository.save(Category.builder()
                    .userId(userId)
                    .type(defaultCat.getType())
                    .name(defaultCat.getName())
                    .build());

            List<DefaultSubCategory> defaultSubs = defaultSubCategoryRepository.findByCategoryId(defaultCat.getId());
            for (DefaultSubCategory defaultSub : defaultSubs) {
                subCategoryRepository.save(SubCategory.builder()
                        .userId(userId)
                        .categoryId(cat.getId())
                        .name(defaultSub.getName())
                        .build());
            }
        }
    }

    private void seedFallbackDefaults(Long userId) {
        // Income categories
        Category salary = categoryRepository.save(Category.builder().userId(userId).type("income").name("Salary").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(salary.getId()).name("Monthly Salary").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(salary.getId()).name("Bonus").build());

        Category investments = categoryRepository.save(Category.builder().userId(userId).type("income").name("Investments").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(investments.getId()).name("Dividends").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(investments.getId()).name("Capital Gains").build());

        // Expense categories
        Category housing = categoryRepository.save(Category.builder().userId(userId).type("expense").name("Housing").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(housing.getId()).name("Rent/Mortgage").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(housing.getId()).name("Utilities").build());

        Category food = categoryRepository.save(Category.builder().userId(userId).type("expense").name("Food & Dining").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(food.getId()).name("Groceries").build());
        subCategoryRepository.save(SubCategory.builder().userId(userId).categoryId(food.getId()).name("Restaurants").build());
    }
}
