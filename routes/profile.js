// routes/profile.js
const express = require("express");
const router = express.Router();
const User = require("../modals/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Address = require("../modals/Address");

// Middleware to authenticate user
const authenticateUser = async (req, res, next) => {
    try {
        const token = req.headers.authorization?.replace("Bearer ", "");

        if (!token) {
            return res.status(401).json({
                success: false,
                message: "Access denied. No token provided."
            });
        }

        const decoded = jwt.verify(token, "SECRET123");
        const user = await User.findOne({ email: decoded.email });

        if (!user) {
            return res.status(401).json({
                success: false,
                message: "User not found."
            });
        }

        req.user = user;
        req.token = token;
        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            message: "Invalid or expired token."
        });
    }
};

// ➤ GET USER PROFILE
router.get("/get", authenticateUser, async (req, res) => {
    try {
        const user = await User.findOne({ userId: req.user.userId })
            .select("-password -__v"); // Exclude sensitive fields

        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        res.json({
            success: true,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                age: user.age,
                gender: user.gender,
                role: user.role,
                profileCompleted: user.profileCompleted,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (err) {
        console.error("Get profile error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

// ➤ UPDATE USER PROFILE (name, email, mobile, age, gender)
router.put("/update", authenticateUser, async (req, res) => {
    try {
        const { name, email, mobile, age, gender } = req.body;
        const userId = req.user.userId;

        // Validate required fields
        if (!name || !email) {
            return res.status(400).json({
                success: false,
                message: "Name and email are required."
            });
        }

        // Check if email is being changed and if new email already exists
        if (email !== req.user.email) {
            const existingUser = await User.findOne({ email });
            if (existingUser && existingUser.userId !== userId) {
                return res.status(400).json({
                    success: false,
                    message: "Email already exists. Please use a different email."
                });
            }
        }

        // Validate age if provided
        if (age && (age < 1 || age > 120)) {
            return res.status(400).json({
                success: false,
                message: "Age must be between 1 and 120."
            });
        }

        // Validate gender if provided
        const validGenders = ["male", "female", "other", "prefer-not-to-say", ""];
        if (gender && !validGenders.includes(gender)) {
            return res.status(400).json({
                success: false,
                message: "Invalid gender value."
            });
        }

        // Validate mobile number (basic validation for Indian numbers)
        if (mobile && !/^[6-9]\d{9}$/.test(mobile)) {
            return res.status(400).json({
                success: false,
                message: "Please enter a valid 10-digit mobile number."
            });
        }

        // Update user
        const updatedUser = await User.findOneAndUpdate(
            { userId },
            {
                name: name.trim(),
                email: email.toLowerCase().trim(),
                mobile: mobile ? mobile.trim() : "",
                age: age || null,
                gender: gender || "",
                profileCompleted: true // Mark profile as completed
            },
            { new: true, runValidators: true }
        ).select("-password -__v");

        if (!updatedUser) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        // If email was changed, generate new token
        let newToken = req.token;
        if (email !== req.user.email) {
            newToken = jwt.sign(
                {
                    email: updatedUser.email,
                    role: updatedUser.role,
                    exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
                },
                "SECRET123"
            );
        }

        res.json({
            success: true,
            message: "Profile updated successfully.",
            user: {
                userId: updatedUser.userId,
                name: updatedUser.name,
                email: updatedUser.email,
                mobile: updatedUser.mobile,
                age: updatedUser.age,
                gender: updatedUser.gender,
                role: updatedUser.role,
                profileCompleted: updatedUser.profileCompleted
            },
            token: newToken // Send new token if email changed
        });

    } catch (err) {
        console.error("Update profile error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

// ➤ CHANGE PASSWORD
router.put("/change-password", authenticateUser, async (req, res) => {
    try {
        const { oldPassword, newPassword, confirmPassword } = req.body;
        const userId = req.user.userId;

        // Validate required fields
        if (!oldPassword || !newPassword || !confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "All password fields are required."
            });
        }

        // Check if new password matches confirmation
        if (newPassword !== confirmPassword) {
            return res.status(400).json({
                success: false,
                message: "New password and confirmation do not match."
            });
        }

        // Check new password length
        if (newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: "New password must be at least 6 characters long."
            });
        }

        // Verify old password
        const user = await User.findOne({ userId });
        if (!user) {
            return res.status(404).json({
                success: false,
                message: "User not found."
            });
        }

        const isPasswordValid = await bcrypt.compare(oldPassword, user.password);
        if (!isPasswordValid) {
            return res.status(400).json({
                success: false,
                message: "Old password is incorrect."
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 10);

        // Update password
        await User.findOneAndUpdate(
            { userId },
            { password: hashedPassword }
        );

        res.json({
            success: true,
            message: "Password changed successfully."
        });

    } catch (err) {
        console.error("Change password error:", err);
        res.status(500).json({
            success: false,
            message: "Server error",
            error: err.message
        });
    }
});

// ➤ UPDATE REGISTRATION TO INCLUDE NEW FIELDS
router.post("/register", async (req, res) => {
    try {
        const { name, email, password, mobile, age, gender } = req.body;

        // Validate required fields
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: "Name, email, and password are required."
            });
        }

        // Check if user already exists
        let existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: "Email already registered."
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 10);

        // Create user
        const user = await User.create({
            name: name.trim(),
            email: email.toLowerCase().trim(),
            password: hashedPassword,
            mobile: mobile ? mobile.trim() : "",
            age: age || null,
            gender: gender || "",
            profileCompleted: !!mobile || !!age || !!gender // Mark as completed if any additional info provided
        });

        // Generate JWT token
        const token = jwt.sign(
            {
                email: user.email,
                role: user.role,
                exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60)
            },
            "SECRET123"
        );

        res.status(201).json({
            success: true,
            message: "Registration successful!",
            token,
            userId: user.userId,
            user: {
                userId: user.userId,
                name: user.name,
                email: user.email,
                mobile: user.mobile,
                age: user.age,
                gender: user.gender,
                role: user.role,
                profileCompleted: user.profileCompleted
            }
        });

    } catch (err) {
        console.error("Registration error:", err);
        res.status(500).json({
            success: false,
            message: "Registration failed",
            error: err.message
        });
    }
});




// routes/profile.js - Add these routes after existing ones



// ==================== ADDRESS MANAGEMENT ROUTES ====================

// ➤ GET ALL ADDRESSES FOR USER
router.get("/addresses", authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;

        const addresses = await Address.find({
            userId,
            isActive: true
        }).sort({ isDefault: -1, updatedAt: -1 });

        res.json({
            success: true,
            addresses,
            count: addresses.length
        });
    } catch (err) {
        console.error("Get addresses error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch addresses",
            error: err.message
        });
    }
});

// ➤ GET SINGLE ADDRESS BY ID
router.get("/address/:addressId", authenticateUser, async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.userId;

        const address = await Address.findOne({
            addressId,
            userId,
            isActive: true
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        res.json({
            success: true,
            address
        });
    } catch (err) {
        console.error("Get address error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch address",
            error: err.message
        });
    }
});

// ==================== ADDRESS MANAGEMENT ROUTES ====================

// ➤ ADD NEW ADDRESS (UPDATED)
router.post("/address/add", authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;
        const {
            fullName,
            mobile,
            email,
            addressLine1,
            addressLine2,
            landmark,
            city,
            state,
            pincode,
            country,
            addressType,
            isDefault,
            instructions
        } = req.body;

        // Validate required fields
        const requiredFields = [
            "fullName", "mobile", "addressLine1", "city", "state", "pincode"
        ];

        for (const field of requiredFields) {
            if (!req.body[field] || req.body[field].trim() === "") {
                return res.status(400).json({
                    success: false,
                    message: `${field.replace(/([A-Z])/g, ' $1').toLowerCase()} is required`
                });
            }
        }

        // Check if user wants to set this as default
        let shouldSetDefault = isDefault;

        // If not specified, set as default if this is first address
        if (shouldSetDefault === undefined || shouldSetDefault === null) {
            const existingAddresses = await Address.countDocuments({ userId, isActive: true });
            shouldSetDefault = existingAddresses === 0;
        }

        // IMPORTANT: If setting as default, unset existing default address
        if (shouldSetDefault === true) {
            await Address.updateMany(
                {
                    userId,
                    isDefault: true,
                    isActive: true
                },
                { isDefault: false }
            );
        }

        // Create new address
        const newAddress = await Address.create({
            userId,
            fullName: fullName.trim(),
            mobile: mobile.trim(),
            email: email ? email.trim().toLowerCase() : req.user.email,
            addressLine1: addressLine1.trim(),
            addressLine2: addressLine2 ? addressLine2.trim() : "",
            landmark: landmark ? landmark.trim() : "",
            city: city.trim(),
            state: state.trim(),
            pincode: pincode.trim(),
            country: country ? country.trim() : "India",
            addressType: addressType || "home",
            isDefault: shouldSetDefault,
            instructions: instructions ? instructions.trim() : ""
        });

        res.status(201).json({
            success: true,
            message: "Address added successfully",
            address: newAddress
        });
    } catch (err) {
        console.error("Add address error:", err);

        // Handle validation errors
        if (err.name === "ValidationError") {
            const errors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to add address",
            error: err.message
        });
    }
});

// ➤ UPDATE ADDRESS (UPDATED)
router.put("/address/update/:addressId", authenticateUser, async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.userId;
        const updateData = req.body;

        // Check if address exists and belongs to user
        const existingAddress = await Address.findOne({
            addressId,
            userId,
            isActive: true
        });

        if (!existingAddress) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        // IMPORTANT: If setting as default, unset existing default address first
        if (updateData.isDefault === true) {
            await Address.updateMany(
                {
                    userId,
                    addressId: { $ne: addressId }, // Exclude current address
                    isDefault: true,
                    isActive: true
                },
                { isDefault: false }
            );
        }

        // IMPORTANT: If unsetting default, make sure at least one address remains default
        if (updateData.isDefault === false && existingAddress.isDefault === true) {
            const otherAddresses = await Address.find({
                userId,
                addressId: { $ne: addressId },
                isActive: true
            });

            // If no other addresses, keep this as default (can't have no default)
            if (otherAddresses.length === 0) {
                return res.status(400).json({
                    success: false,
                    message: "Cannot remove default status. Add another address first."
                });
            }

            // Auto-set first other address as default
            await Address.findOneAndUpdate(
                { addressId: otherAddresses[0].addressId },
                { isDefault: true }
            );
        }

        // Trim string fields
        const stringFields = [
            "fullName", "mobile", "email", "addressLine1", "addressLine2",
            "landmark", "city", "state", "pincode", "country", "instructions"
        ];

        stringFields.forEach(field => {
            if (updateData[field] !== undefined) {
                updateData[field] = updateData[field].toString().trim();
            }
        });

        // Update address
        const updatedAddress = await Address.findOneAndUpdate(
            { addressId, userId },
            updateData,
            { new: true, runValidators: true }
        );

        res.json({
            success: true,
            message: "Address updated successfully",
            address: updatedAddress
        });
    } catch (err) {
        console.error("Update address error:", err);

        if (err.name === "ValidationError") {
            const errors = Object.values(err.errors).map(e => e.message);
            return res.status(400).json({
                success: false,
                message: "Validation failed",
                errors
            });
        }

        res.status(500).json({
            success: false,
            message: "Failed to update address",
            error: err.message
        });
    }
});

// ➤ SET DEFAULT ADDRESS (UPDATED - More robust)
router.put("/address/set-default/:addressId", authenticateUser, async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.userId;

        // Check if address exists
        const address = await Address.findOne({
            addressId,
            userId,
            isActive: true
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        // If already default, return success
        if (address.isDefault) {
            return res.json({
                success: true,
                message: "Address is already default",
                address
            });
        }

        // Set all addresses to non-default
        await Address.updateMany(
            { userId, isActive: true },
            { isDefault: false }
        );

        // Set this address as default
        const updatedAddress = await Address.findOneAndUpdate(
            { addressId, userId },
            { isDefault: true },
            { new: true }
        );

        res.json({
            success: true,
            message: "Default address updated successfully",
            address: updatedAddress
        });
    } catch (err) {
        console.error("Set default address error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to set default address",
            error: err.message
        });
    }
});

// ➤ DELETE ADDRESS (UPDATED - Better default handling)
router.delete("/address/delete/:addressId", authenticateUser, async (req, res) => {
    try {
        const { addressId } = req.params;
        const userId = req.user.userId;

        // Check if address exists
        const address = await Address.findOne({
            addressId,
            userId,
            isActive: true
        });

        if (!address) {
            return res.status(404).json({
                success: false,
                message: "Address not found"
            });
        }

        const isDeletingDefault = address.isDefault;
        const totalAddresses = await Address.countDocuments({ userId, isActive: true });

        // If deleting the only address
        if (totalAddresses === 1) {
            await Address.findOneAndUpdate(
                { addressId, userId },
                { isActive: false }
            );

            return res.json({
                success: true,
                message: "Address deleted successfully"
            });
        }

        // If deleting default address, set another address as default
        if (isDeletingDefault) {
            const otherAddress = await Address.findOne({
                userId,
                addressId: { $ne: addressId },
                isActive: true
            }).sort({ updatedAt: -1 }); // Get most recent address

            if (otherAddress) {
                await Address.findOneAndUpdate(
                    { addressId: otherAddress.addressId },
                    { isDefault: true }
                );
            }
        }

        // Soft delete by setting isActive to false
        await Address.findOneAndUpdate(
            { addressId, userId },
            { isActive: false }
        );

        res.json({
            success: true,
            message: "Address deleted successfully"
        });
    } catch (err) {
        console.error("Delete address error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to delete address",
            error: err.message
        });
    }
});

// ➤ GET DEFAULT ADDRESS
router.get("/address/default", authenticateUser, async (req, res) => {
    try {
        const userId = req.user.userId;

        const defaultAddress = await Address.findOne({
            userId,
            isDefault: true,
            isActive: true
        });

        res.json({
            success: true,
            address: defaultAddress || null
        });
    } catch (err) {
        console.error("Get default address error:", err);
        res.status(500).json({
            success: false,
            message: "Failed to fetch default address",
            error: err.message
        });
    }
});



module.exports = router;