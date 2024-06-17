const express = require('express');
const bcrypt = require('bcryptjs');
const { ObjectId } = require('mongodb');
const nodemailer = require('nodemailer');
require('dotenv').config();

const router = express.Router();
let db;
let transporter;

MongoClient.connect(process.env.MONGODB_URL)
    .then(client => {
        db = client.db('RealtyShopee');
    })
    .catch(error => console.error('Database Connection Error:', error));

transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.EMAIL,
        pass: process.env.EMAIL_PASSWORD
    }
});

const generateTemporaryPassword = () => {
    const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let password = '';
    for (let i = 0; i < 8; i++) {
        password += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return password;
};

router.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userCollection = db.collection('users');
        const userExists = await userCollection.findOne({ email });

        if (userExists) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        await userCollection.insertOne({ name, email, password: hashedPassword });
        res.status(201).json({ message: 'User created successfully' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

router.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            return res.status(400).json({ message: 'Invalid credentials' });
        }

        res.status(200).json({ message: 'Login successful', user });
    } catch (error) {
        console.error('Signin Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

router.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const temporaryPassword = generateTemporaryPassword();
        const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

        await userCollection.updateOne({ email }, { $set: { password: hashedPassword } });

        const mailOptions = {
            from: process.env.EMAIL,
            to: email,
            subject: 'Password Reset',
            text: `Your temporary password is: ${temporaryPassword}. Please use this password to login and reset your password immediately.`
        };

        transporter.sendMail(mailOptions, (error, info) => {
            if (error) {
                console.error('Error sending email:', error);
                return res.status(500).json({ message: 'An error occurred while sending the email.' });
            }
            res.status(200).json({ message: 'Temporary password sent to your email.' });
        });
    } catch (error) {
        console.error('Forgot Password Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

router.post('/reset-password', async (req, res) => {
    try {
        const { email, temporaryPassword, newPassword } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const validPassword = await bcrypt.compare(temporaryPassword, user.password);

        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid temporary password' });
        }

        const hashedNewPassword = await bcrypt.hash(newPassword, 12);

        await userCollection.updateOne({ email }, { $set: { password: hashedNewPassword } });

        res.status(200).json({ message: 'Password reset successful' });
    } catch (error) {
        console.error('Reset Password Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

module.exports = router;
