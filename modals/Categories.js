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
      trim: true
    },
    image: {
      type: String,
      default: ""
    },
    imageFilename: {
      type: String,
      default: ""
    }
    // Note: Keeping image fields in schema for backward compatibility
    // but they won't be used anymore
  },
  { 
    timestamps: true 
  }
);

module.exports = mongoose.model("Category", categorySchema);