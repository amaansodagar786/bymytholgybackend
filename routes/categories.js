const express = require("express");
const router = express.Router();
const Category = require("../modals/Categories");
const {adminAuth} = require("../middleware/auth");

// ➤ GET ALL CATEGORIES
router.get("/get", async (req, res) => {
  try {
    const cats = await Category.find();
    res.json(cats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ ADD CATEGORY (ADMIN ONLY)
router.post("/add", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;

    const exist = await Category.findOne({ name });
    if (exist) return res.status(400).json({ message: "Category exists" });

    const cat = await Category.create({ name });

    res.json({ message: "Category added", cat });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ UPDATE CATEGORY
router.put("/update/:id", adminAuth, async (req, res) => {
  try {
    const { name } = req.body;

    const updated = await Category.findOneAndUpdate(
      { categoryId: req.params.id },
      { name },
      { new: true }
    );

    res.json({ message: "Category updated", updated });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ➤ DELETE CATEGORY
router.delete("/delete/:id", adminAuth, async (req, res) => {
  try {
    await Category.findOneAndDelete({ categoryId: req.params.id });
    res.json({ message: "Category deleted" });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
