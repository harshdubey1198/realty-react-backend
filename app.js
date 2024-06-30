const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const { MongoClient, ObjectId } = require('mongodb');
const bcrypt = require('bcryptjs');
const helmet = require('helmet');
const multer = require('multer');
const nodemailer = require('nodemailer');
const moment = require('moment-timezone');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3009;
const allowedOrigins = process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [];

const MONGODB_URL = process.env.MONGODB_URL;
let db;
let transporter;

MongoClient.connect(MONGODB_URL)
    .then(client => {
        console.log('Connected to Database');
        db = client.db('RealtyShopee');
        db.createCollection('users', { strict: true }).catch(() => {});
        db.createCollection('properties', { strict: true }).catch(() => {});
        db.createCollection('blogs', { strict: true }).catch(() => {});
        db.createCollection('queryforms', { strict: true }).catch(() => {});
    })
    .catch(error => console.error('Database Connection Error:', error));

transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
        user: process.env.USER,
        pass: process.env.PASS
    }
});

app.use(helmet());
app.use(bodyParser.json({ limit: '50mb' }));
app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));
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
const upload = multer({
    storage: storage,
    limits: {
        fieldSize: 25 * 1024 * 1024
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

// Authentication routes
app.post('/signup', async (req, res) => {
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

app.post('/signin', async (req, res) => {
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

app.post('/forgot-password', async (req, res) => {
    try {
        const { email } = req.body;
        console.log('Received email:', email);
        const userCollection = db.collection('users');
        const user = await userCollection.findOne({ email });

        if (!user) {
            console.log('User not found for email:', email);
            return res.status(400).json({ message: 'User not found' });
        }

        const temporaryPassword = generateTemporaryPassword();
        console.log('Generated temporary password:', temporaryPassword);
        const hashedPassword = await bcrypt.hash(temporaryPassword, 12);

        await userCollection.updateOne({ email }, { $set: { password: hashedPassword } });

        const mailOptions = {
            from: process.env.USER,
            to: email,
            subject: 'Password Reset',
            text: `Your temporary password is: ${temporaryPassword}. Please use this password to login and reset your password immediately. https://www.realtyshopee.com/reset-password/:${temporaryPassword}.`
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

app.post('/reset-password', async (req, res) => {
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

// Property routes
app.post('/property/add', upload.array('propertyimages'), async (req, res) => {
    try {
        const { username, ...propertyData } = req.body;
        const propertyCollection = db.collection('properties');
        const userCollection = db.collection('users');

        const result = await propertyCollection.insertOne(propertyData);
        const propertyId = result.insertedId;

        if (propertyId) {
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

        if (!ObjectId.isValid(propertyId)) {
            return res.status(404).json({ message: 'Invalid property ID' });
        }

        const propertyCollection = db.collection('properties');
        const property = await propertyCollection.findOne({ _id: new ObjectId(propertyId) });

        if (!property) {
            return res.status(404).json({ message: 'Property not found' });
        }

        const propertyImages = property.propertyimages || [];
        const imageData = propertyImages[imageNumber];

        if (!imageData) {
            return res.status(404).json({ message: 'Image not found' });
        }

        const base64Data = imageData.split(';base64,').pop();
        res.setHeader('Content-Type', 'image/png');
        res.status(200).send(Buffer.from(base64Data, 'base64'));
    } catch (error) {
        console.error('Fetch Image Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.get('/resale/:propertyid', async (req, res) => {
    try {
        const propertyId = req.params.propertyid;

        if (!ObjectId.isValid(propertyId)) {
            return res.status(404).json({ message: 'Invalid property ID' });
        }

        const propertyCollection = db.collection('properties');
        const property = await propertyCollection.findOne({ _id: new ObjectId(propertyId) });

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

// Add blogs
app.post('/add-blogs', upload.none(), async (req, res) => {
    try {
        const { title, description, featureImage, descriptionImages, category, tags, username } = req.body;
        const blogCollection = db.collection('blogs');

        // Convert descriptionImages from JSON string to array
        const images = JSON.parse(descriptionImages);

        const newBlog = {
            title,
            description,
            featureImage,
            descriptionImages: images,
            category,
            tags: tags.split(','),
            username,
            createdAt: new Date()
        };

        await blogCollection.insertOne(newBlog);
        res.status(201).json({ message: 'Blog created successfully' });
    } catch (error) {
        console.error('Add Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


// Blog routes
app.get('/blogs', async (req, res) => {
    try {
        const blogCollection = db.collection('blogs');
        const blogs = await blogCollection.find().toArray();
        res.status(200).json(blogs);
    } catch (error) {
        console.error('Fetch Blogs Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});
app.get('/blogs/:blogTitle', async (req, res) => {
    try {
        const blogTitle = decodeURIComponent(req.params.blogTitle).replace(/-/g, ' ');
        const blogCollection = db.collection('blogs');
        const blog = await blogCollection.findOne({ title: { $regex: new RegExp(`^${blogTitle}$`, 'i') } });
        if (!blog) {
            res.status(404).json({ message: 'Blog not found' });
        } else {
            res.status(200).json(blog);
        }
    } catch (error) {
        console.error('Fetch Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


// Add CRUD routes for blogs
app.post('/blogs', upload.none(), async (req, res) => {
    try {
        const { title, description, featureImage, descriptionImages, category, tags, username } = req.body;
        const blogCollection = db.collection('blogs');

        const newBlog = {
            title,
            description,
            featureImage,
            descriptionImages: JSON.parse(descriptionImages),
            category,
            tags: tags.split(','),
            username,
            createdAt: new Date()
        };

        await blogCollection.insertOne(newBlog);
        res.status(201).json({ message: 'Blog created successfully' });
    } catch (error) {
        console.error('Add Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.get('/blogs', async (req, res) => {
    try {
        const blogCollection = db.collection('blogs');
        const blogs = await blogCollection.find().toArray();
        res.status(200).json(blogs);
    } catch (error) {
        console.error('Fetch Blogs Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.get('/blogs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const blogCollection = db.collection('blogs');
        const blog = await blogCollection.findOne({ _id: new ObjectId(id) });
        if (!blog) {
            res.status(404).json({ message: 'Blog not found' });
        } else {
            res.status(200).json(blog);
        }
    } catch (error) {
        console.error('Fetch Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.put('/blogs/:id', upload.none(), async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, featureImage, category, tags, username } = req.body;
        const blogCollection = db.collection('blogs');

        const updatedBlog = {
            title,
            description,
            featureImage,
            category,
            tags: Array.isArray(tags) ? tags : tags.split(',').map(tag => tag.trim()), // Ensure tags is an array
            username,
            updatedAt: new Date()
        };

        const result = await blogCollection.updateOne(
            { _id: new ObjectId(id) },
            { $set: updatedBlog }
        );

        if (result.matchedCount === 0) {
            res.status(404).json({ message: 'Blog not found' });
        } else {
            res.status(200).json({ message: 'Blog updated successfully' });
        }
    } catch (error) {
        console.error('Update Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});


app.delete('/blogs/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const blogCollection = db.collection('blogs');
        const result = await blogCollection.deleteOne({ _id: new ObjectId(id) });
        if (result.deletedCount === 0) {
            res.status(404).json({ message: 'Blog not found' });
        } else {
            res.status(200).json({ message: 'Blog deleted successfully' });
        }
    } catch (error) {
        console.error('Delete Blog Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

// Query routes
app.post('/query-form', async (req, res) => {
    try {
        const formData = req.body;
        const queryCollection = db.collection('queryforms');
        const newQuery = {
            ...formData,
            createdAt: moment().tz('Asia/Kolkata').format()
        };
        await queryCollection.insertOne(newQuery);
        res.status(200).json({ message: 'Query submitted successfully' });
    } catch (error) {
        console.error('Submit Query Error:', error);
        res.status(500).json({ message: 'An error occurred. Please try again.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
