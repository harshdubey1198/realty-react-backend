const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient } = require('mongodb');
const bcrypt = require('bcrypt');
const session = require('express-session');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 10;
const allowedOrigins = [
    'http://localhost:3000',
    'https://realtyshopee.com',
    // Add other allowed origins here
  ];
const MONGODB_URL = process.env.MONGODB_URL;
let db;

MongoClient.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        console.log('Connected to Database');
        db = client.db('RealtyShopee');
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
app.use(session({
    secret: 'secret-key',
    resave: false,
    saveUninitialized: true,
    cookie: { secure: false }
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
        req.session.user = newUser;
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

        req.session.user = user;
        res.status(200).json({ message: 'Signin successful', user: { name: user.name } });
    } catch (error) {
        console.error('Signin Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.get('/session', (req, res) => {
    if (req.session.user) {
        res.status(200).json({ user: req.session.user });
    } else {
        res.status(401).json({ message: 'Not authenticated' });
    }
});

app.post('/logout', (req, res) => {
    req.session.destroy(err => {
        if (err) {
            return res.status(500).json({ message: 'Logout failed' });
        }
        res.status(200).json({ message: 'Logout successful' });
    });
});

app.post('/add-property', async (req, res) => {
    try {
        const { username, ...propertyData } = req.body;
        const userCollection = db.collection('users');
        const propertyCollection = db.collection('properties');

        const user = await userCollection.findOne({ name: username });

        if (!user) {
            console.error(`User not found: ${username}`);
            return res.status(404).json({ message: 'User not found' });
        }

        const result = await propertyCollection.insertOne({ ...propertyData, username });

        if (result.insertedId) {
            const updateResult = await userCollection.updateOne(
                { name: username },
                { $push: { properties: result.insertedId } }
            );

            if (updateResult.modifiedCount === 1) {
                return res.status(200).json({ message: 'Property added successfully', propertyId: result.insertedId });
            } else {
                console.error('Failed to update user properties');
                return res.status(500).json({ message: 'Failed to update user properties' });
            }
        } else {
            console.error('Failed to insert property');
            return res.status(500).json({ message: 'Failed to add property' });
        }
    } catch (error) {
        console.error('Add Property Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
