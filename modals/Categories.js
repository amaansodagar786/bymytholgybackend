// modals/Categories.js
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const categorySchema = new mongoose.Schema(
  {
    categoryId: {
      type: String,
      unique: true,
      default: uuidv4,
    },
    name: {
      type: String,
      required: true,
      unique: true,
    },
    image: {
      type: String, // Store image URL
      default: ""
    },
    imageFilename: {
      type: String, // Store the actual filename for deletion if needed
      default: ""
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);