const multer = require("multer");
const path = require("path");

// storage settings
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "productsimages/"); // save inside ROOT/products folder
  },

  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    const safeName = file.originalname.replace(/[^a-zA-Z0-9.]/g, "_");
    cb(null, "product-" + uniqueSuffix + path.extname(safeName));
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
    cb(new Error("Only image files are allowed!"));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit per file
    files: 100 // Maximum 100 files
  },
});

module.exports = upload;