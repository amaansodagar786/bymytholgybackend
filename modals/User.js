// models/User.js
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
      required: true 
    },
    mobile: { 
      type: String,
      default: "",
      trim: true
      // You can add regex validation for Indian numbers: match: [/^[6-9]\d{9}$/, 'Please enter valid mobile number']
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
    }
  },
  { timestamps: true }
);

// Index for faster queries
userSchema.index({ email: 1 });
userSchema.index({ userId: 1 });

module.exports = mongoose.model("User", userSchema);