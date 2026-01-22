// models/User.js - UPDATED WITH BILLING FIELDS (SINGLE CONTACT FIELD)
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const userSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      unique: true,
      default: uuidv4,
    },
    name: { 
      type: String, 
      required: true,
      trim: true
    },
    email: { 
      type: String, 
      required: true, 
      unique: true,
      lowercase: true,
      trim: true
    },
    password: { 
      type: String, 
      // Required only for e-commerce users, not for billing customers
      default: null
    },
    mobile: { 
      // USING SINGLE FIELD: Both e-commerce and billing will use this
      type: String,
      default: "",
      trim: true,
      // Validation for Indian mobile numbers (10 digits starting with 6-9)
      match: [/^[6-9]\d{9}$/, 'Please enter valid 10-digit mobile number starting with 6-9']
    },
    gstNumber: {
      // ADDED: From billing software
      type: String,
      default: "",
      trim: true,
      // GST validation regex (optional)
      match: [/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/, 'Invalid GST number format']
    },
    address: {
      // ADDED: From billing software
      type: String,
      default: "",
      trim: true,
      maxlength: 500
    },
    loyaltyCoins: {
      // ADDED: From billing software
      type: Number,
      default: 0,
      min: 0
    },
    age: {
      type: Number,
      min: 1,
      max: 120,
      default: null
    },
    gender: {
      type: String,
      enum: ["male", "female", "other", "prefer-not-to-say", ""],
      default: ""
    },
    role: {
      type: String,
      enum: ["user", "admin"],
      default: "user",
    },
    profileCompleted: {
      type: Boolean,
      default: false
    },
    // ADDED: To track source of user
    userType: {
      type: String,
      enum: ["ecommerce", "billing", "both"],
      default: "ecommerce"
    },
    // ADDED: For billing customers created without password
    isPasswordSet: {
      type: Boolean,
      default: false
    }
  },
  { 
    timestamps: true,
    indexes: [
      { email: 1 },
      { userId: 1 },
      { mobile: 1 },
      { userType: 1 }
    ]
  }
);

// Method to check if user can login (has password)
userSchema.methods.canLogin = function() {
  return this.isPasswordSet || this.password !== null;
};

// Method to update loyalty coins (from billing)
userSchema.methods.updateLoyaltyCoins = function(coinsEarned = 0, coinsUsed = 0) {
  let currentCoins = this.loyaltyCoins || 0;
  
  // First deduct used coins
  if (coinsUsed > 0) {
    currentCoins = Math.max(0, currentCoins - coinsUsed);
  }
  
  // Then add earned coins
  if (coinsEarned > 0) {
    currentCoins = currentCoins + coinsEarned;
  }
  
  this.loyaltyCoins = currentCoins;
  return this.save();
};

module.exports = mongoose.model("User", userSchema);