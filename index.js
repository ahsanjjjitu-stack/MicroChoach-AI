require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const { OAuth2Client } = require('google-auth-library');
const jwt = require('jsonwebtoken');
const dns = require('dns');
const User = require('./models/User');

// 1. Initialize Express app ONLY ONCE
const app = express();

// Set DNS servers to avoid resolution issues
dns.setServers(['8.8.8.8', '8.8.4.4']);

// 2. Middlewares (Must be before routes)
app.use(express.json()); 
app.use(express.urlencoded({ extended: true }));

// Google Auth Client Setup (Fixed spelling: GOOGLE_CLIENT_ID)
const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

// MongoDB Connection
mongoose.connect(process.env.MONGO_URI || process.env.MONGO_URL)
    .then(() => console.log('MongoDB Connected 🚀'))
    .catch(err => console.error('MongoDB Connection Error:', err));

// Google Login / Signup Endpoint
app.post('/api/auth/google-login', async (req, res) => {
    try {
        console.log("Received Body:", req.body);
        const { idToken } = req.body;

        if (!idToken) {
            return res.status(400).json({ success: false, message: "idToken is required" });
        }

        // Verify idToken
        const ticket = await client.verifyIdToken({
            idToken: idToken,
            audience: process.env.GOOGLE_CLIENT_ID
        });

        const payload = ticket.getPayload();
        const { sub: googleId, email } = payload;

        // Find or Create User in MongoDB
        let user = await User.findOne({ googleId });
        if (!user) {
            user = new User({ googleId, email });
            await user.save();
        }

        // Generate JWT
        const token = jwt.sign(
            { userId: user._id }, 
            process.env.JWT_SECRET || 'secretkey'
        );

        res.status(200).json({
            success: true,
            message: "Login successful",
            userId: user._id,
            token: token
        });

    } catch (error) {
        console.error("Auth Error:", error);
        res.status(401).json({
            success: false,
            message: "Invalid Google Token",
            error: error.message
        });
    }
});

// Port declaration fixed syntax
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT} ⚡`);
});