const express = require("express");
const router = express.Router();
const Category = require("../modals/Categories");
const { adminAuth } = require("../middleware/auth");

// ➤ GET ALL CATEGORIES
router.get("/get", async (req, res) => {
  try {
    const cats = await Category.find().sort({ createdAt: -1 });
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ ADD CATEGORY (ADMIN ONLY) - TEXT ONLY
router.post("/add", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;

    // Check if category exists
    const exist = await Category.findOne({ name: name.trim() });
    if (exist) {
      return res.status(409).json({ message: "Category already exists" });
    }

    // Create category
    const cat = await Category.create({ 
      name: name.trim() 
    });

    res.status(201).json({
      message: "Category added successfully",
      category: cat
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ UPDATE CATEGORY (ADMIN ONLY) - TEXT ONLY
router.put("/update/:id", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;
    const categoryId = req.params.id;

    // Find existing category
    const existingCategory = await Category.findOne({ categoryId });
    if (!existingCategory) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Check if new name already exists (excluding current category)
    if (name && name.trim() !== existingCategory.name) {
      const duplicate = await Category.findOne({ 
        name: name.trim(),
        categoryId: { $ne: categoryId }
      });
      
      if (duplicate) {
        return res.status(409).json({ message: "Category name already exists" });
      }
    }

    // Update category
    const updated = await Category.findOneAndUpdate(
      { categoryId },
      { 
        name: name.trim(),
        updatedAt: new Date()
      },
      { new: true }
    );

    res.json({
      message: "Category updated successfully",
      category: updated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ DELETE CATEGORY (ADMIN ONLY)
router.delete("/delete/:id", adminAuth, async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Find category first
    const category = await Category.findOne({ categoryId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Delete from database
    await Category.findOneAndDelete({ categoryId });

    res.json({ 
      message: "Category deleted successfully" 
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;