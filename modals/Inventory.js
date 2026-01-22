const mongoose = require("mongoose");
const { v4: uuidv4 } = require('uuid');

const StockHistorySchema = new mongoose.Schema({
  historyId: {
    type: String,
    default: () => uuidv4(),
  },
  date: {
    type: Date,
    default: Date.now,
    required: true
  },
  type: {
    type: String,
    enum: ["added", "deducted", "adjusted", "initial", "sold", "returned"],
    required: true
  },
  quantity: {
    type: Number,
    required: true
  },
  previousStock: {
    type: Number,
    required: true
  },
  newStock: {
    type: Number,
    required: true
  },
  reason: {
    type: String,
    default: ""
  },
  notes: {
    type: String,
    default: ""
  },
  addedBy: {
    type: String,
    default: "admin"
  }
}, { _id: true });

const InventorySchema = new mongoose.Schema({
  inventoryId: {
    type: String,
    unique: true,
    default: () => uuidv4(),
  },
  productId: {
    type: String,
    required: true,
    index: true,
  },
  productName: {
    type: String,
    required: true,
  },
  modelName: {
    type: String,
    default: "Default",
  },
  variableModelName: {
    type: String,
  },
  variableModelId: {
    type: String,
  },
  colorId: {
    type: String,
    required: true,
  },
  colorName: {
    type: String,
    required: true,
  },
  fragrance: {  // NEW FIELD: Added for fragrance tracking
    type: String,
    required: true,
    default: "Default"
  },
  
  // Current stock
  stock: {
    type: Number,
    default: 0,
    min: 0,
  },
  
  // Stock threshold for alerts
  threshold: {
    type: Number,
    default: 10,
    min: 0,
  },
  
  // Stock history tracking
  stockHistory: {
    type: [StockHistorySchema],
    default: []
  },
  
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

// Compound index for unique combination - UPDATED with fragrance
InventorySchema.index(
  {
    productId: 1,
    variableModelId: 1,
    colorId: 1,
    fragrance: 1  // Added fragrance to unique index
  },
  { unique: true, sparse: true }
);

// Method to add stock
InventorySchema.methods.addStock = function(quantity, reason = "", notes = "", addedBy = "admin") {
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }
  
  const previousStock = this.stock;
  const newStock = previousStock + quantity;
  
  this.stockHistory.push({
    type: "added",
    quantity: quantity,
    previousStock: previousStock,
    newStock: newStock,
    reason: reason,
    notes: notes,
    addedBy: addedBy
  });
  
  this.stock = newStock;
  this.updatedAt = new Date();
  
  return this;
};

// Method to deduct stock
InventorySchema.methods.deductStock = function(quantity, reason = "", notes = "", addedBy = "admin") {
  if (quantity <= 0) {
    throw new Error("Quantity must be greater than 0");
  }
  
  const previousStock = this.stock;
  const newStock = Math.max(0, previousStock - quantity);
  
  this.stockHistory.push({
    type: "deducted",
    quantity: quantity,
    previousStock: previousStock,
    newStock: newStock,
    reason: reason,
    notes: notes,
    addedBy: addedBy
  });
  
  this.stock = newStock;
  this.updatedAt = new Date();
  
  return this;
};

// Method to set stock to specific value
InventorySchema.methods.setStock = function(newStockValue, reason = "", notes = "", addedBy = "admin") {
  if (newStockValue < 0) {
    throw new Error("Stock cannot be negative");
  }
  
  const previousStock = this.stock;
  const difference = newStockValue - previousStock;
  
  this.stockHistory.push({
    type: difference >= 0 ? "added" : "deducted",
    quantity: Math.abs(difference),
    previousStock: previousStock,
    newStock: newStockValue,
    reason: reason,
    notes: notes,
    addedBy: addedBy
  });
  
  this.stock = newStockValue;
  this.updatedAt = new Date();
  
  return this;
};

// Update timestamp on save
InventorySchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  if (typeof next === 'function') {
    next();
  }
});

module.exports = mongoose.model("Inventory", InventorySchema);