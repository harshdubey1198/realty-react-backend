const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const multer = require('multer');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

const MONGODB_URL = process.env.MONGODB_URL;
let db;

MongoClient.connect(MONGODB_URL, { useNewUrlParser: true, useUnifiedTopology: true })
    .then(client => {
        console.log('Connected to Database');
        db = client.db('RealtyShopee');
        db.createCollection('users', { strict: true }).catch(() => {});
        db.createCollection('properties', { strict: true }).catch(() => {});
    })
    .catch(error => console.error('Database Connection Error:', error));

app.use(helmet());
app.use(bodyParser.json());
app.use(cors({
    origin: function (origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = 'The CORS policy for this site does not allow access from the specified origin.';
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }, 
    credentials: true
}));

const storage = multer.memoryStorage();
const upload = multer({ storage });

app.post('/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (user) {
            return res.status(400).json({ message: 'User already exists' });
        }

        const hashedPassword = await bcrypt.hash(password, 12);
        const newUser = { name, email, password: hashedPassword, properties: [] };

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
    res.status(200).json({ message: 'Logout successful' });
});

app.post('/add-property', upload.array('propertyimages'), async (req, res) => {
    try {
        const { username, ...propertyData } = req.body;
        const propertyCollection = db.collection('properties');
        const userCollection = db.collection('users');

        // Insert the new property
        const result = await propertyCollection.insertOne(propertyData);
        const propertyId = result.insertedId;

        if (propertyId) {
            // Update the user's document with the new property ID
            await userCollection.updateOne(
                { name: username },
                { $push: { properties: propertyId } }
            );

            return res.status(200).json({ message: 'Property added successfully', propertyId });
        } else {
            console.error('Failed to insert property');
            return res.status(500).json({ message: 'Failed to add property' });
        }
    } catch (error) {
        console.error('Add Property Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});
app.get('/resale/:propertyid/:imagenumber', async (req, res) => {
    try {
        const propertyId = req.params.propertyid;
        const imageNumber = parseInt(req.params.imagenumber);

        // Ensure propertyId is a valid ObjectId
        if (!ObjectId.isValid(propertyId)) {
            return res.status(404).json({ message: 'Invalid property ID' });
        }

        const propertyCollection = db.collection('properties');
        const property = await propertyCollection.findOne({ _id: new ObjectId(propertyId) }); // Initialize ObjectId correctly

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        const propertyImages = property.propertyimages || [];
        const imageData = propertyImages[imageNumber];

        if (!imageData) {
            return res.status(404).json({ message: 'Image not found' });
        }

        // Extract the base64 data from the image data
        const base64Data = imageData.split(';base64,').pop();

        // Set the appropriate content type header 
        res.setHeader('Content-Type', 'image/png'); // Assuming images are PNG format

        // Send the image data as the response
        res.status(200).send(Buffer.from(base64Data, 'base64'));
    } catch (error) {
        console.error('Fetch Image Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.get('/resale/:propertyid', async (req, res) => {
    try {
        const propertyId = req.params.propertyid;

        // Ensure propertyId is a valid ObjectId
        if (!ObjectId.isValid(propertyId)) {
            return res.status(404).json({ message: 'Invalid property ID' });
        }

        const propertyCollection = db.collection('properties');
        const property = await propertyCollection.findOne({ _id: new ObjectId(propertyId) }); // Initialize ObjectId correctly

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        res.status(200).json({ property });
    } catch (error) {
        console.error('Fetch Property Detail Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


app.get('/resale', async (req, res) => {
    try {
        const propertyCollection = db.collection('properties');
        const properties = await propertyCollection.find().toArray();
        res.status(200).json({ properties });
    } catch (error) {
        console.error('Fetch Properties Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
