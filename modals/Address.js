// models/Address.js
const mongoose = require("mongoose");
const { v4: uuidv4 } = require("uuid");

const addressSchema = new mongoose.Schema(
    {
        addressId: {
            type: String,
            unique: true,
            default: uuidv4,
        },
        userId: {
            type: String,
            required: true,
            ref: "User" // Reference to User model
        },
        // Personal Details
        fullName: {
            type: String,
            required: true,
            trim: true
        },
        mobile: {
            type: String,
            required: true,
            trim: true,
            validate: {
                validator: function (v) {
                    return /^[6-9]\d{9}$/.test(v);
                },
                message: "Please enter a valid 10-digit mobile number"
            }
        },
        email: {
            type: String,
            trim: true,
            lowercase: true
        },

        // Address Details
        addressLine1: {
            type: String,
            required: true,
            trim: true
        },
        addressLine2: {
            type: String,
            trim: true
        },
        landmark: {
            type: String,
            trim: true
        },
        city: {
            type: String,
            required: true,
            trim: true
        },
        state: {
            type: String,
            required: true,
            trim: true
        },
        pincode: {
            type: String,
            required: true,
            trim: true,
            validate: {
                validator: function (v) {
                    return /^\d{6}$/.test(v);
                },
                message: "Please enter a valid 6-digit pincode"
            }
        },
        country: {
            type: String,
            required: true,
            default: "India",
            trim: true
        },

        // Address Type
        addressType: {
            type: String,
            enum: ["home", "work", "other"],
            default: "home"
        },

        // Flags
        isDefault: {
            type: Boolean,
            default: false
        },
        isActive: {
            type: Boolean,
            default: true
        },

        // Additional Info
        instructions: {
            type: String,
            trim: true
        }
    },
    { timestamps: true }
);

// Index for faster queries
addressSchema.index({ userId: 1 });
addressSchema.index({ addressId: 1 });
addressSchema.index({ userId: 1, isDefault: 1 });

// Before saving, if this is set as default, unset other defaults for this user
addressSchema.pre("save", async function (next) {
    if (this.isModified("isDefault") && this.isDefault === true) {
        await this.constructor.updateMany(
            { userId: this.userId, addressId: { $ne: this.addressId } },
            { isDefault: false }
        );
    }
    if (typeof next === 'function') {
        next();
    }
});

module.exports = mongoose.model("Address", addressSchema);