const jwt = require("jsonwebtoken");

// ADMIN MIDDLEWARE
function adminAuth(req, res, next) {
  const authHeader = req.header("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "No or invalid token" });
  }

  const token = authHeader.replace("Bearer ", "");

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Only admin allowed" });
    }

    req.admin = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid token" });
  }
}


// USER AUTH MIDDLEWARE
const auth = (req, res, next) => {
  try {
    const authHeader = req.header("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({ message: "Invalid or missing token" });
    }

    const token = authHeader.replace("Bearer ", "");

    const decoded = jwt.verify(token, process.env.JWT_SECRET);


    req.auth = {
      email: decoded.email,
      role: decoded.role
    };

    next();
  } catch (err) {
    console.error("JWT error:", err.message);
    res.status(401).json({ message: "Authentication failed" });
  }
};



module.exports = { adminAuth, auth };
