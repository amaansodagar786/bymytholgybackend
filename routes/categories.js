// routes/categories.js
const express = require("express");
const router = express.Router();
const Category = require("../modals/Categories");
const { adminAuth } = require("../middleware/auth");
const uploadCategory = require("../middleware/uploadCategory");
const fs = require("fs");
const path = require("path");

// Helper function to create image URL
const createCategoryImageUrl = (req, filename) => {
  return `${req.protocol}://${req.get("host")}/categories/${filename}`;
};

// ➤ GET ALL CATEGORIES
router.get("/get", async (req, res) => {
  try {
    const cats = await Category.find();
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ ADD CATEGORY WITH IMAGE (ADMIN ONLY)
router.post(
  "/add",
  adminAuth,
  uploadCategory.single("image"), // Accept single image with field name "image"
  async (req, res) => {
    try {
      const { name } = req.body;
      const imageFile = req.file;

      // Check if category exists
      const exist = await Category.findOne({ name });
      if (exist) {
        // Delete uploaded file if category already exists
        if (imageFile) {
          fs.unlinkSync(path.join(__dirname, "../categories", imageFile.filename));
        }
        return res.status(400).json({ message: "Category already exists" });
      }

      // Prepare category data
      const categoryData = { name };

      // If image uploaded, add image URL and filename
      if (imageFile) {
        categoryData.image = createCategoryImageUrl(req, imageFile.filename);
        categoryData.imageFilename = imageFile.filename;
      }

      // Create category
      const cat = await Category.create(categoryData);

      res.json({
        message: imageFile ? "Category added with image" : "Category added without image",
        cat,
      });
    } catch (err) {
      // Delete uploaded file if error occurs
      if (req.file) {
        fs.unlinkSync(path.join(__dirname, "../categories", req.file.filename));
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// ➤ UPDATE CATEGORY WITH OPTIONAL IMAGE UPDATE
router.put(
  "/update/:id",
  adminAuth,
  uploadCategory.single("image"), // Accept optional image update
  async (req, res) => {
    try {
      const { name } = req.body;
      const imageFile = req.file;
      const categoryId = req.params.id;

      // Find existing category
      const existingCategory = await Category.findOne({ categoryId });
      if (!existingCategory) {
        // Delete uploaded file if category doesn't exist
        if (imageFile) {
          fs.unlinkSync(path.join(__dirname, "../categories", imageFile.filename));
        }
        return res.status(404).json({ message: "Category not found" });
      }

      // Prepare update data
      const updateData = { name };

      // If new image uploaded
      if (imageFile) {
        // Delete old image file if exists
        if (existingCategory.imageFilename) {
          const oldImagePath = path.join(__dirname, "../categories", existingCategory.imageFilename);
          if (fs.existsSync(oldImagePath)) {
            fs.unlinkSync(oldImagePath);
          }
        }

        // Add new image data
        updateData.image = createCategoryImageUrl(req, imageFile.filename);
        updateData.imageFilename = imageFile.filename;
      }

      // Update category
      const updated = await Category.findOneAndUpdate(
        { categoryId },
        updateData,
        { new: true }
      );

      res.json({
        message: imageFile ? "Category updated with new image" : "Category updated",
        updated,
      });
    } catch (err) {
      // Delete uploaded file if error occurs
      if (req.file) {
        fs.unlinkSync(path.join(__dirname, "../categories", req.file.filename));
      }
      res.status(500).json({ error: err.message });
    }
  }
);

// ➤ DELETE CATEGORY (also delete image file)
router.delete("/delete/:id", adminAuth, async (req, res) => {
  try {
    const categoryId = req.params.id;

    // Find category first to get image filename
    const category = await Category.findOne({ categoryId });
    if (!category) {
      return res.status(404).json({ message: "Category not found" });
    }

    // Delete image file if exists
    if (category.imageFilename) {
      const imagePath = path.join(__dirname, "../categories", category.imageFilename);
      if (fs.existsSync(imagePath)) {
        fs.unlinkSync(imagePath);
      }
    }

    // Delete from database
    await Category.findOneAndDelete({ categoryId });

    res.json({ message: "Category deleted successfully" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;