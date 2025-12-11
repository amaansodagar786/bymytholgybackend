// middleware/uploadCategory.js
const multer = require("multer");
const path = require("path");

// Storage settings for categories (save in ROOT/categories folder)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "categories/");
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, "category-" + uniqueSuffix + path.extname(safeName));
  },
});

// File filter to accept only images
const fileFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png|gif|webp/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error("Only image files are allowed (jpeg, jpg, png, gif, webp)!"));
  }
};

const uploadCategory = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
    files: 1 // Only 1 file allowed
  },
});

module.exports = uploadCategory;