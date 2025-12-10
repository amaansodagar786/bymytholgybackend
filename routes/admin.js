const express = require("express");
const router = express.Router();
const Admin = require("../modals/Admin");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

// REGISTER ADMIN
router.post("/register", async (req, res) => {
  try {
    const { name, email, password } = req.body;

    let exist = await Admin.findOne({ email });
    if (exist) return res.status(400).json({ message: "Email already exists" });

    const hashed = await bcrypt.hash(password, 10);

    const admin = await Admin.create({
      name,
      email,
      password: hashed,
    });

    res.json({ message: "Admin registered", admin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// LOGIN ADMIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    let admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: "No admin found" });

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(400).json({ message: "Wrong password" });

    const token = jwt.sign(
      { id: admin._id, adminId: admin.adminId, role: admin.role },
      "SECRET123",
      { expiresIn: "7d" }
    );

    res.json({ message: "Login Success", token, admin });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
