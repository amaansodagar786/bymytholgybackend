// routes/user.js - UPDATED WITH BILLING OPERATIONS
const express = require("express");
const router = express.Router();
const User = require("../modals/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const nodemailer = require("nodemailer");
const crypto = require("crypto");

// Store OTPs temporarily (in production use Redis)
const otpStore = new Map();


// Configure nodemailer
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});


// ==================== E-COMMERCE AUTH ROUTES (KEEP AS IS) ====================

// REGISTER USER (E-COMMERCE)
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, mobile } = req.body;

    // Check if user exists
    let exist = await User.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email already exists" });

    // Hash password
    const hashed = await bcrypt.hash(password, 10);

    // Create e-commerce user
    const user = await User.create({
      name,
      email,
      password: hashed,
      mobile: mobile || "",
      userType: "ecommerce",
      isPasswordSet: true
    });

    res.json({ 
      message: "User registered successfully", 
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// LOGIN USER (E-COMMERCE)
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    // Find user
    let user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: "No user found" });

    // Check if user can login (has password)
    if (!user.canLogin()) {
      return res.status(400).json({ 
        message: "This account doesn't have password set. Please use billing software for login." 
      });
    }

    // Verify password
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(400).json({ message: "Wrong password" });

    // Create JWT token
    const token = jwt.sign(
      {
        userId: user.userId,
        email: user.email,
        role: user.role,
        exp: Math.floor(Date.now() / 1000) + (7 * 24 * 60 * 60) // 7 days
      },
      process.env.JWT_SECRET || "SECRET123"
    );

    res.json({
      message: "Login Success",
      token,
      userId: user.userId,
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
        userType: user.userType,
        loyaltyCoins: user.loyaltyCoins || 0
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// 1. FORGOT PASSWORD - Send OTP
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    // Check if user exists
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "No account found with this email" 
      });
    }

    // Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Store OTP with email
    otpStore.set(email, { otp, expiresAt });

    // Send email
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset OTP - Ramayan Series",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #d4a017;">Password Reset Request</h2>
          <p>Your OTP for password reset is:</p>
          <h1 style="background: #f5f5f5; padding: 20px; text-align: center; 
              letter-spacing: 10px; font-size: 32px; color: #d4a017; border-radius: 8px;">
            ${otp}
          </h1>
          <p>This OTP is valid for 10 minutes.</p>
          <p>If you didn't request this, please ignore this email.</p>
          <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
          <p style="color: #666; font-size: 12px;">
            Ramayan Series - Illuminate Your Space
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);

    res.json({
      success: true,
      message: "OTP sent to your email",
      email: email,
    });
  } catch (error) {
    console.error("Forgot password error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Failed to send OTP. Please try again." 
    });
  }
});

// 2. VERIFY OTP
router.post("/verify-otp", async (req, res) => {
  try {
    const { email, otp } = req.body;

    const storedData = otpStore.get(email);
    
    if (!storedData) {
      return res.status(400).json({ 
        success: false, 
        message: "OTP expired or invalid" 
      });
    }

    if (Date.now() > storedData.expiresAt) {
      otpStore.delete(email);
      return res.status(400).json({ 
        success: false, 
        message: "OTP has expired" 
      });
    }

    if (storedData.otp !== otp) {
      return res.status(400).json({ 
        success: false, 
        message: "Invalid OTP" 
      });
    }

    // OTP verified successfully
    res.json({
      success: true,
      message: "OTP verified successfully",
      email: email,
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "OTP verification failed" 
    });
  }
});

// 3. RESET PASSWORD
router.post("/reset-password", async (req, res) => {
  try {
    const { email, newPassword } = req.body;

    // Verify OTP was used (optional additional check)
    if (!otpStore.has(email)) {
      return res.status(400).json({ 
        success: false, 
        message: "Please complete OTP verification first" 
      });
    }

    // Find user
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }

    // Hash new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update password
    user.password = hashedPassword;
    user.isPasswordSet = true;
    await user.save();

    // Clear OTP from store
    otpStore.delete(email);

    res.json({
      success: true,
      message: "Password reset successfully",
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: "Failed to reset password" 
    });
  }
});




// ==================== BILLING CUSTOMER ROUTES (ADDED) ====================

// CREATE CUSTOMER (BILLING - NO PASSWORD REQUIRED)
router.post("/create-customer", async (req, res) => {
  try {
    const { name, email, mobile, gstNumber, address } = req.body;

    // Check if email already exists
    if (email) {
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        // Update existing user with billing info
        existingUser.mobile = mobile || existingUser.mobile;
        existingUser.gstNumber = gstNumber || existingUser.gstNumber;
        existingUser.address = address || existingUser.address;
        existingUser.userType = existingUser.userType === "ecommerce" ? "both" : "billing";
        
        const updatedUser = await existingUser.save();
        
        return res.status(200).json({
          message: "Customer updated successfully (merged with existing user)",
          customer: updatedUser
        });
      }
    }

    // Check if mobile already exists
    if (mobile) {
      const existingByMobile = await User.findOne({ mobile });
      if (existingByMobile) {
        return res.status(400).json({
          message: "Customer with this mobile number already exists",
          field: "mobile"
        });
      }
    }

    // Create new billing customer (no password)
    const customer = await User.create({
      name,
      email: email || `${mobile}@billing.customer`, // Generate email if not provided
      mobile,
      gstNumber: gstNumber || "",
      address: address || "",
      userType: "billing",
      isPasswordSet: false,
      password: null
    });

    res.status(201).json({
      message: "Customer created successfully",
      customer: {
        userId: customer.userId,
        customerId: customer.userId, // Return as customerId for billing frontend
        customerName: customer.name,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
        contactNumber: customer.mobile, // For billing frontend compatibility
        gstNumber: customer.gstNumber,
        address: customer.address,
        loyaltyCoins: customer.loyaltyCoins || 0
      }
    });

  } catch (error) {
    console.error("Error creating customer:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      message: "Failed to create customer",
      error: error.message
    });
  }
});

// GET ALL CUSTOMERS/USERS (FOR BILLING)
router.get("/get-customers", async (req, res) => {
  try {
    // Get all users (both e-commerce and billing)
    const customers = await User.find({})
      .sort({ createdAt: -1 })
      .select('-password -__v'); // Exclude sensitive fields

    // Format for billing frontend
    const formattedCustomers = customers.map(customer => ({
      customerId: customer.userId, // Map userId to customerId
      customerName: customer.name,
      name: customer.name,
      email: customer.email,
      mobile: customer.mobile,
      contactNumber: customer.mobile, // For billing frontend
      gstNumber: customer.gstNumber || '',
      address: customer.address || '',
      loyaltyCoins: customer.loyaltyCoins || 0,
      userType: customer.userType,
      createdAt: customer.createdAt,
      updatedAt: customer.updatedAt
    }));

    res.status(200).json(formattedCustomers);
  } catch (error) {
    console.error("Error fetching customers:", error);
    res.status(500).json({
      message: "Failed to fetch customers",
      error: error.message
    });
  }
});

// UPDATE CUSTOMER (BILLING)
router.put("/update-customer/:id", async (req, res) => {
  try {
    const { name, email, mobile, gstNumber, address } = req.body;

    // Find user by userId
    const user = await User.findOne({ userId: req.params.id });
    
    if (!user) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    // Check if email is being changed and already exists
    if (email && email !== user.email) {
      const existingEmail = await User.findOne({ email });
      if (existingEmail) {
        return res.status(400).json({
          message: "Email already exists",
          field: "email"
        });
      }
    }

    // Check if mobile is being changed and already exists
    if (mobile && mobile !== user.mobile) {
      const existingMobile = await User.findOne({ mobile });
      if (existingMobile) {
        return res.status(400).json({
          message: "Mobile number already exists",
          field: "mobile"
        });
      }
    }

    // Update fields
    user.name = name || user.name;
    user.email = email || user.email;
    user.mobile = mobile || user.mobile;
    user.gstNumber = gstNumber || user.gstNumber;
    user.address = address || user.address;
    user.userType = user.userType === "ecommerce" ? "both" : user.userType;

    const updatedUser = await user.save();

    res.status(200).json({
      message: "Customer updated successfully",
      customer: {
        customerId: updatedUser.userId,
        customerName: updatedUser.name,
        name: updatedUser.name,
        email: updatedUser.email,
        mobile: updatedUser.mobile,
        contactNumber: updatedUser.mobile,
        gstNumber: updatedUser.gstNumber,
        address: updatedUser.address,
        loyaltyCoins: updatedUser.loyaltyCoins || 0
      }
    });
  } catch (error) {
    console.error("Error updating customer:", error);
    
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        message: "Validation error",
        error: error.message
      });
    }

    res.status(500).json({
      message: "Failed to update customer",
      error: error.message
    });
  }
});

// DELETE CUSTOMER (SOFT DELETE - JUST CHANGE USER TYPE)
router.delete("/delete-customer/:id", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.id });
    
    if (!user) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    // Don't delete, just mark as inactive or change userType
    if (user.userType === "both") {
      user.userType = "ecommerce"; // Remove billing access
    } else if (user.userType === "billing") {
      user.userType = "inactive"; // Mark as inactive
    } else {
      // For e-commerce users, don't allow deletion via billing
      return res.status(400).json({
        message: "Cannot delete e-commerce user via billing software"
      });
    }

    await user.save();

    res.status(200).json({
      message: "Customer removed from billing system successfully",
      note: "User account still exists in system"
    });
  } catch (error) {
    console.error("Error deleting customer:", error);
    res.status(500).json({
      message: "Failed to delete customer",
      error: error.message
    });
  }
});

// GET CUSTOMER BY ID (FOR BILLING)
router.get("/get-customer/:id", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.id })
      .select('-password -__v');
    
    if (!user) {
      return res.status(404).json({
        message: "Customer not found"
      });
    }

    res.status(200).json({
      customerId: user.userId,
      customerName: user.name,
      name: user.name,
      email: user.email,
      mobile: user.mobile,
      contactNumber: user.mobile,
      gstNumber: user.gstNumber || '',
      address: user.address || '',
      loyaltyCoins: user.loyaltyCoins || 0,
      userType: user.userType,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt
    });
  } catch (error) {
    console.error("Error fetching customer:", error);
    res.status(500).json({
      message: "Failed to fetch customer",
      error: error.message
    });
  }
});

// BULK CREATE CUSTOMERS (FROM EXCEL)
router.post("/bulk-create-customers", async (req, res) => {
  try {
    const { customers } = req.body;

    if (!customers || !Array.isArray(customers) || customers.length === 0) {
      return res.status(400).json({
        message: "No customer data provided"
      });
    }

    const results = {
      successful: [],
      failed: []
    };

    for (const customerData of customers) {
      try {
        const { name, email, mobile, gstNumber, address } = customerData;

        // Validate required fields
        if (!name || !mobile) {
          results.failed.push({
            customer: customerData,
            error: "Customer name and mobile number are required"
          });
          continue;
        }

        // Validate mobile number format
        if (!/^[6-9]\d{9}$/.test(mobile)) {
          results.failed.push({
            customer: customerData,
            error: "Mobile number must be valid 10-digit Indian number"
          });
          continue;
        }

        // Validate email format if provided
        if (email && !/^[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}$/i.test(email)) {
          results.failed.push({
            customer: customerData,
            error: "Invalid email format"
          });
          continue;
        }

        // Check for existing mobile number
        const existingByMobile = await User.findOne({ mobile });
        if (existingByMobile) {
          results.failed.push({
            customer: customerData,
            error: "Customer with this mobile number already exists"
          });
          continue;
        }

        // Check for existing email if provided
        if (email) {
          const existingByEmail = await User.findOne({ email });
          if (existingByEmail) {
            // Merge with existing user
            existingByEmail.mobile = mobile;
            existingByEmail.gstNumber = gstNumber || existingByEmail.gstNumber;
            existingByEmail.address = address || existingByEmail.address;
            existingByEmail.userType = existingByEmail.userType === "ecommerce" ? "both" : "billing";
            
            await existingByEmail.save();
            results.successful.push({
              ...customerData,
              note: "Merged with existing user",
              userId: existingByEmail.userId
            });
            continue;
          }
        }

        // Create new billing customer
        const customer = await User.create({
          name,
          email: email || `${mobile}@billing.customer`,
          mobile,
          gstNumber: gstNumber || "",
          address: address || "",
          userType: "billing",
          isPasswordSet: false,
          password: null
        });

        results.successful.push({
          ...customerData,
          userId: customer.userId
        });

      } catch (error) {
        results.failed.push({
          customer: customerData,
          error: error.message
        });
      }
    }

    res.status(200).json({
      message: `Bulk import completed: ${results.successful.length} successful, ${results.failed.length} failed`,
      results
    });

  } catch (error) {
    console.error("Error in bulk customer creation:", error);
    res.status(500).json({
      message: "Failed to process bulk customer import",
      error: error.message
    });
  }
});

// UPDATE LOYALTY COINS (BILLING)
router.put("/update-loyalty-coins/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const { coinsEarned, coinsUsed } = req.body;

    const user = await User.findOne({ userId });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Customer not found"
      });
    }

    const previousBalance = user.loyaltyCoins || 0;
    
    // Update loyalty coins using model method
    await user.updateLoyaltyCoins(coinsEarned || 0, coinsUsed || 0);

    res.status(200).json({
      success: true,
      message: "Loyalty coins updated successfully",
      data: {
        customerId: user.userId,
        loyaltyCoins: user.loyaltyCoins,
        coinsEarned: coinsEarned || 0,
        coinsUsed: coinsUsed || 0,
        previousBalance: previousBalance
      }
    });

  } catch (error) {
    console.error("Error updating loyalty coins:", error);
    res.status(500).json({
      success: false,
      message: "Failed to update loyalty coins",
      error: error.message
    });
  }
});

// ==================== UTILITY ROUTES ====================

// GET USER PROFILE (FOR BOTH SYSTEMS)
router.get("/profile/:userId", async (req, res) => {
  try {
    const user = await User.findOne({ userId: req.params.userId })
      .select('-password -__v');
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        gstNumber: user.gstNumber,
        address: user.address,
        loyaltyCoins: user.loyaltyCoins,
        age: user.age,
        gender: user.gender,
        role: user.role,
        userType: user.userType,
        profileCompleted: user.profileCompleted,
        createdAt: user.createdAt
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// UPDATE USER PROFILE (FOR BOTH SYSTEMS)
router.put("/profile/:userId", async (req, res) => {
  try {
    const { name, mobile, age, gender, gstNumber, address } = req.body;
    
    const user = await User.findOne({ userId: req.params.userId });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    // Update fields
    if (name) user.name = name;
    if (mobile) user.mobile = mobile;
    if (age) user.age = age;
    if (gender) user.gender = gender;
    if (gstNumber !== undefined) user.gstNumber = gstNumber;
    if (address !== undefined) user.address = address;
    
    user.profileCompleted = true;
    
    await user.save();

    res.json({
      message: "Profile updated successfully",
      user: {
        userId: user.userId,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        gstNumber: user.gstNumber,
        address: user.address,
        loyaltyCoins: user.loyaltyCoins,
        age: user.age,
        gender: user.gender,
        profileCompleted: user.profileCompleted
      }
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// SET PASSWORD FOR BILLING CUSTOMER (IF THEY WANT TO LOGIN TO E-COMMERCE)
router.post("/set-password/:userId", async (req, res) => {
  try {
    const { password } = req.body;
    
    const user = await User.findOne({ userId: req.params.userId });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.isPasswordSet) {
      return res.status(400).json({ message: "Password already set for this account" });
    }

    // Hash and set password
    const hashed = await bcrypt.hash(password, 10);
    user.password = hashed;
    user.isPasswordSet = true;
    
    // Update user type if was billing only
    if (user.userType === "billing") {
      user.userType = "both";
    }
    
    await user.save();

    res.json({
      message: "Password set successfully. You can now login to e-commerce.",
      note: "Use your email and new password to login"
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;