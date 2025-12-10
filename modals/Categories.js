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
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Category", categorySchema);
