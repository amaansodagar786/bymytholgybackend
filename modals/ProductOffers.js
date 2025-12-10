const mongoose = require("mongoose");

const ProductOfferSchema = new mongoose.Schema({
  // Basic product info
  productId: {
    type: String,
    required: true,
    ref: 'Product'
  },
  productName: {
    type: String,
    required: true
  },
  
  // Color info (REQUIRED)
  colorId: {
    type: String,
    required: true
  },
  colorName: {
    type: String,
    required: true
  },
  
  // Model info (ALWAYS INCLUDED - for both simple and variable)
  modelName: {
    type: String,
    required: true,
    default: "Default"
  },
  
  // For variable products only - reference to model in models array
  variableModelId: {
    type: String,
    default: ""
  },
  
  // Offer details
  offerPercentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  offerLabel: {
    type: String,
    default: "Special Offer"
  },
  
  // Dates
  startDate: {
    type: Date,
    default: Date.now
  },
  endDate: {
    type: Date,
    default: null // null = no end date (offer runs forever)
  },
  
  // Status
  isActive: {
    type: Boolean,
    default: true
  },
  
  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Virtual field to check if offer is currently valid
ProductOfferSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  
  if (!this.isActive) return false;
  if (this.startDate > now) return false;
  if (!this.endDate) return true;
  
  return now >= this.startDate && now <= this.endDate;
});

// Helper to check if this is for a variable product
ProductOfferSchema.virtual('isForVariableProduct').get(function() {
  return this.variableModelId && this.variableModelId !== "";
});

// Compound index: Only one active offer per color in a model
ProductOfferSchema.index(
  { 
    productId: 1, 
    variableModelId: 1, 
    colorId: 1, 
    isActive: 1 
  },
  { 
    unique: true, 
    partialFilterExpression: { 
      isActive: true,
      variableModelId: { $ne: "" } // For variable products
    } 
  }
);

// Compound index: Only one active offer per color in simple product
ProductOfferSchema.index(
  { 
    productId: 1, 
    colorId: 1, 
    isActive: 1 
  },
  { 
    unique: true, 
    partialFilterExpression: { 
      isActive: true,
      variableModelId: "" // For simple products
    } 
  }
);

// Update timestamp
ProductOfferSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model("ProductOffer", ProductOfferSchema);