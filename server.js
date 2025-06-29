import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import mongoose from "mongoose";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import { body, validationResult } from "express-validator";
import bcrypt from "bcrypt";

const app = express();
dotenv.config();

// ── 1.  Global middleware
app.use(
  cors({
    origin: function (origin, callback) {
      const allowedOrigins = [
        "https://leafy-centaur-370c2f.netlify.app",
        "http://localhost:5173",
        "http://localhost:5000",
      ];
      console.log("CORS origin:", origin);
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);
app.use(express.json());
app.use(helmet());
app.use(
  rateLimit({
    windowMs: 15 * 60 * 1000, // 15 min
    max: 100, // 100 requests / window / IP
  })
);

// ── 2.  DB & user model
await mongoose.connect(process.env.MONGO_URI);
console.log("✓MongoDB connected");

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true, minlength: 8 },
});
const User = mongoose.model("User", userSchema);

// ── 3.  Helper: create JWT
const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES,
  });

// ── 4.  Auth routes
app.post(
  "/signup",
  [
    body("email").isEmail().withMessage("Valid e-mail required"),
    body("password")
      .isLength({ min: 8 })
      .withMessage("Password ≥ 8 chars required"),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });
    // destructure input
    const { email, password } = req.body;
    // check if user already exists
    try {
      if (await User.findOne({ email }))
        return res.status(409).json({ message: "Email already used" });
      // hash password
      const hashed = await bcrypt.hash(password, 12);
      const user = await User.create({ email, password: hashed });

      // respond with JWT
      res.status(201).json({ token: signToken(user._id) });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

app.post(
  "/login",
  [body("email").isEmail(), body("password").notEmpty()],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty())
      return res.status(400).json({ errors: errors.array() });

    const { email, password } = req.body;

    try {
      const user = await User.findOne({ email });
      if (!user || !(await bcrypt.compare(password, user.password)))
        return res.status(401).json({ message: "Invalid credentials" });

      res.json({ token: signToken(user._id) });
    } catch (err) {
      res.status(500).json({ message: err.message });
    }
  }
);

// ── 5.  Auth-guard middleware & protected demo route
const protect = (req, res, next) => {
  const auth = req.headers.authorization || "";
  const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
  if (!token) return res.status(401).json({ message: "No token" });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

app.get("/profile", protect, async (req, res) => {
  const user = await User.findById(req.user.id).select("-password");
  res.json(user);
});

// ── 6.  Start server
app.listen(process.env.PORT, () =>
  console.log(`API running → http://localhost:${process.env.PORT}`)
);
