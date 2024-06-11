const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcryptjs');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10;
const allowedOrigins = [
    'http://localhost:3000',
    'https://www.realtyshopee.com',
    'https://www.realtyshopee.in',
    'https://realtyshopee.in',
    'https://realtyshopee.com',
];
const MONGODB_URL = process.env.MONGODB_URL;
let db;

MongoClient.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        console.log('Connected to Database');
        db = client.db('RealtyShopee');
        db.createCollection('users'); // Ensure the collection is created
        db.createCollection('properties'); // Ensure the collection is created
    })
    .catch(error => console.error('Database Connection Error:', error));

app.use(bodyParser.json());
app.use(cors({
    origin: function (origin, callback) {
        // Allow requests with no origin (like mobile apps or curl requests)
        if (!origin) return callback(null, true);

        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified origin.';
            return callback(new Error(msg), false);
        }

        return callback(null, true);
    },
    credentials: true
}));

app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const newUser = { name, email, password: hashedPassword };

        await userCollection.insertOne(newUser);
        res.status(200).json({ message: 'Signup successful' });
    } catch (error) {
        console.error('Signup Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.post('/signin', async (req, res) => {
    try {
        const { email, password } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            return res.status(400).json({ message: 'User not found' });
        }

        const validPassword = await bcrypt.compare(password, user.password);

        if (!validPassword) {
            return res.status(400).json({ message: 'Invalid password' });
        }

        res.status(200).json({ message: 'Signin successful', user: { name: user.name } });
    } catch (error) {
        console.error('Signin Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.post('/logout', (req, res) => {
    // Since session management is removed, no need for logout endpoint logic
    res.status(200).json({ message: 'Logout successful' });
});

app.post('/add-property', async (req, res) => {
    try {
        const { ...propertyData } = req.body;
        const propertyCollection = db.collection('properties');

        const result = await propertyCollection.insertOne(propertyData);

        if (result.insertedId) {
            return res.status(200).json({ message: 'Property added successfully', propertyId: result.insertedId });
        } else {
            console.error('Failed to insert property');
            return res.status(500).json({ message: 'Failed to add property' });
        }
    } catch (error) {
        console.error('Add Property Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
    console.log("Request Body:", req.body); // Log the request body
});

app.listen(PORT, () => { 
    console.log(`Server running on http://localhost:${PORT}`);
});
