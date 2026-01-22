const mongoose = require("mongoose");

const SpecificationSchema = new mongoose.Schema({
  key: String,
  value: String,
});

const ColorSpecificationSchema = new mongoose.Schema({
  key: String,
  value: String,
});

const ColorSchema = new mongoose.Schema({
  colorId: {
    type: String,
    required: true,
    default: () => require('uuid').v4(),
  },
  colorName: {
    type: String,
    required: true,
  },
  fragrances: [String], // Changed from sizes to fragrances
  images: [String], // Array of image URLs
  originalPrice: {
    type: Number,
    default: 0,
    min: 0,
  },
  currentPrice: {
    type: Number,
    required: true,
    min: 0,
  },
  colorSpecifications: [ColorSpecificationSchema],
});

const ModelSchema = new mongoose.Schema({
  modelName: {
    type: String,
    required: true,
  },
  description: String,
  SKU: {
    type: String,
    required: true,
    unique: true,
    sparse: true,
  },
  modelSpecifications: [SpecificationSchema],
  colors: [ColorSchema],
});

const ProductSchema = new mongoose.Schema({
  productId: {
    type: String,
    required: true,
    unique: true,
    default: () => require('uuid').v4(),
  },
  productName: {
    type: String,
    required: true,
    trim: true,
  },
  description: String,
  categoryId: {
    type: String,
    required: true,
  },
  categoryName: String,
  hsnCode: String,
  type: {
    type: String,
    enum: ["simple", "variable"],
    default: "simple",
  },

  // Simple product fields
  modelName: String,
  SKU: {
    type: String,
    unique: true,
    sparse: true,
  },
  specifications: [SpecificationSchema],
  colors: [ColorSchema], // Only one color with "Default" name

  // Variable product fields (keeping for future)
  models: [ModelSchema],

  // Common fields
  thumbnailImage: String,
  originalPrice: Number,
  currentPrice: Number,
  isActive: {
    type: Boolean,
    default: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

ProductSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  // Only call next() if it's a function
  if (typeof next === 'function') {
    next();
  }
})

module.exports = mongoose.model("Product", ProductSchema);